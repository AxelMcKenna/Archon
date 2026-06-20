"""Top-level entry: ``analyse_plan`` orchestrates the v2 pipeline.

Phases:
  A. Deterministic text-layer extraction + doc-rules prong
  B. Per-sheet vision pass with N-of-K self-consistency voting
  C. Per-sheet verification (drops ungrounded flags)
  D. Merge rule flags + verified flags across sheets
  E. Snap bboxes to PDF text layer where possible
  F. OCR fallback for flags the text layer didn't find

Per-sheet orchestration (since 2.3.0): each sheet is voted and verified
in isolation. vote_key already keys on `page`, so per-sheet voting is
semantically equivalent to global voting. Per-sheet verification scopes
the verifier's context to just that sheet's images — better grounding,
and crucially, removes the hard cap on document size.
"""

from __future__ import annotations

import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from app.config import get_settings
from app.extractors.doc_rules import run_doc_rules
from app.extractors.metrics import Metrics
from app.extractors.plan_text import PlanTextExtraction, extract_plan_text
from app.plans.bbox import attach_page_bbox
from app.plans.bbox_refiner import refine_flag_bboxes
from app.plans.ocr_refiner import refine_via_ocr
from app.plans.prompt import taxonomy_block
from app.plans.reconcile import reconcile_sets
from app.plans.registration import build_comparison_sets
from app.plans.views import ViewRecord, build_view_record, seed_hint
from app.plans.vote import dedup_cross_view, dedup_flags, vote_flags, vote_key
from app.taxonomy import get_taxonomy
from app.vision.core.prompts import fill, load_prompt
from app.vision.core.renderer import RenderedImage, RenderedSheet, caption_str, iter_sheets
from app.vision.plans.schema import ACTIVE_ANALYSIS_PROMPT
from app.vision.plans.vision_pass import run_single_vision_pass, verify_flags

log = logging.getLogger(__name__)

ANALYSIS_VERSION = "2.3.0"
# Back-compat: routes/tests still import ANALYSER_VERSION.
ANALYSER_VERSION = ANALYSIS_VERSION


def analyse_plan(
    *,
    file_bytes: bytes,
    media_type: str,
    bca: str,
    project_type: str,
    project_description: str,
    risk_group: str = "",
    importance_level: str = "",
) -> tuple[dict[str, Any], str, Metrics, dict[str, Any]]:
    """Run the v2 analyser.

    Returns (analysis_payload, prompt_version, metrics, extras).
    `extras` carries DB-bound side fields:
        - analysis_version
        - verification_prompt_version
        - verification_drops
        - image_count
        - dpi_breakdown
    """
    template, prompt_version = load_prompt(ACTIVE_ANALYSIS_PROMPT)
    settings = get_settings()

    # --- Phase A: deterministic text-layer extraction ---------------------
    if media_type == "application/pdf":
        text_extraction = extract_plan_text(file_bytes)
        rule_flags = run_doc_rules(text_extraction)
    else:
        text_extraction = PlanTextExtraction()
        rule_flags = []

    tx = get_taxonomy()
    bca_meta = next((b for b in tx["bcas"] if b["id"] == bca), {"name": bca})
    prompt = fill(
        template,
        bca=bca,
        bca_long=bca_meta.get("name", bca),
        project_type=project_type,
        risk_group=risk_group or "(not specified)",
        importance_level=importance_level or "(not specified)",
        project_description=project_description or "(none provided)",
        taxonomy=taxonomy_block(),
    )

    text_blocks: list[str] = []
    if text_extraction.title_blocks or text_extraction.drawing_register:
        text_blocks.append(
            "Structured PDF text-layer extraction (treat as ground truth):\n```json\n"
            + json.dumps(text_extraction.to_prompt_block(), indent=2)
            + "\n```"
        )
    text_blocks.append(prompt)
    flat_prompt = "\n\n".join(text_blocks)

    # Cross-view reconciliation ships dark: only PDFs, only when enabled. When
    # on, we ask the per-sheet pass for a `view` object (appended instruction)
    # and seed each sheet with a deterministic view-type hint.
    cross_view_on = settings.plan_cross_view_enabled and media_type == "application/pdf"
    tb_by_page = {tb.page: tb.sheet_number for tb in text_extraction.title_blocks}
    reg_by_sheet = {
        e.sheet_number: e.title for e in text_extraction.drawing_register
    }

    def _sheet_meta(page: int) -> tuple[str | None, str | None]:
        sheet_number = tb_by_page.get(page)
        return sheet_number, reg_by_sheet.get(sheet_number or "")

    seed_by_page: dict[int, str] = {}
    if cross_view_on:
        addendum, _ = load_prompt("plan_view_addendum.md")
        flat_prompt = flat_prompt + "\n\n" + addendum

    n = max(1, settings.plan_analyser_voting_n)
    threshold = max(1, min(settings.plan_analyser_voting_threshold, n))
    # PLAN_SHEET_CONCURRENCY tunes how many sheets are processed in parallel.
    # 5 keeps the effective in-flight provider calls below typical OpenRouter
    # per-route rate limits at ~30s/call.
    concurrency = max(1, int(os.getenv("PLAN_SHEET_CONCURRENCY", "5")))

    # --- Build sheet list (image-typed only) ------------------------------
    sheets: list[RenderedSheet] = []
    dpi_breakdown = {"standard_pages": 0, "high_detail_pages": 0, "tiled_pages": 0}

    if media_type == "application/pdf":
        for sheet, delta in iter_sheets(file_bytes):
            sheets.append(sheet)
            for k, v in delta.items():
                dpi_breakdown[k] += v
    else:
        sheets.append(
            RenderedSheet(
                page=1,
                sheet_index=0,
                images=[RenderedImage(page=1, tile="full", png=file_bytes, dpi=0)],
                classification="standard",
            )
        )
        dpi_breakdown["standard_pages"] = 1

    if cross_view_on:
        for s in sheets:
            seed_by_page[s.page] = seed_hint(*_sheet_meta(s.page))

    metrics = Metrics()
    t0 = time.monotonic()

    # --- Phase B/C: per-sheet vision + verify ----------------------------
    sheet_results = _run_sheets_parallel(
        sheets=sheets,
        prompt=flat_prompt,
        voting_n=n,
        voting_threshold=threshold,
        concurrency=concurrency,
        metrics=metrics,
        seed_by_page=seed_by_page if cross_view_on else None,
        risk_group=risk_group,
    )

    # Aggregate across sheets.
    all_kept: list[dict[str, Any]] = []
    all_drops: list[dict[str, Any]] = []
    summaries: list[str] = []
    runs_debug: list[dict[str, Any]] = []
    verification_status_final = "verified"
    verification_version_final = ""

    for sr in sheet_results:
        all_kept.extend(sr["kept"])
        all_drops.extend(sr["drops"])
        if sr.get("summary"):
            summaries.append(sr["summary"])
        runs_debug.extend(sr.get("runs_debug", []))
        if sr.get("verification_status") == "skipped":
            verification_status_final = "skipped"
        if not verification_version_final and sr.get("verification_version"):
            verification_version_final = sr["verification_version"]

    summary = max(summaries, key=len, default="")

    # --- Phase B2/G/H: cross-view reconciliation -------------------------
    # Build a ViewRecord per sheet, register views that describe the same
    # region, then reconcile each set into two-citation cross-view flags.
    cross_view_flags: list[dict[str, Any]] = []
    view_records: list[ViewRecord] = []
    if cross_view_on:
        for sr in sheet_results:
            page = sr.get("page")
            if not page:
                continue
            sheet_number, title = _sheet_meta(page)
            view_records.append(
                build_view_record(
                    page=page,
                    sheet_number=sheet_number,
                    title=title,
                    view_payloads=sr.get("view_payloads") or [],
                )
            )
        comparison_sets = build_comparison_sets(
            view_records,
            max_set_size=settings.plan_cross_view_max_set_size,
            max_sets=settings.plan_cross_view_max_sets,
        )
        images_by_page = {s.page: s.images for s in sheets}
        cross_view_flags = dedup_cross_view(
            reconcile_sets(
                comparison_sets, images_by_page=images_by_page, metrics=metrics
            )
        )
        log.info(
            "cross-view: %d views, %d comparison sets, %d flags",
            len(view_records),
            len(comparison_sets),
            len(cross_view_flags),
        )

    # --- Phase D: merge with rule flags ----------------------------------
    merged_flags = attach_page_bbox(rule_flags) + all_kept + cross_view_flags

    # --- Phase E: snap to PDF text layer ---------------------------------
    merged_flags = refine_flag_bboxes(
        file_bytes=file_bytes, media_type=media_type, flags=merged_flags
    )

    # --- Phase F: OCR fallback -------------------------------------------
    merged_flags = refine_via_ocr(
        file_bytes=file_bytes, media_type=media_type, flags=merged_flags
    )

    metrics.processing_ms = int((time.monotonic() - t0) * 1000)

    image_count = sum(len(s.images) for s in sheets)
    pages_analysed = len({s.page for s in sheets})

    final_payload = {
        "flags": merged_flags,
        "summary": summary,
        "taxonomy_version": tx.get("schema_version", "1.0"),
        "pages_analysed": pages_analysed,
        "truncated": False,
        "verification": verification_status_final,
        "_debug_runs": runs_debug,
        "_debug_voting_threshold": threshold,
        "cross_view_flag_count": len(cross_view_flags),
    }

    extras = {
        "analysis_version": ANALYSIS_VERSION,
        "verification_prompt_version": verification_version_final,
        "verification_drops": all_drops,
        "image_count": image_count,
        "dpi_breakdown": dpi_breakdown,
        "view_records": [v.to_debug() for v in view_records],
    }

    return final_payload, prompt_version, metrics, extras


def _run_sheets_parallel(
    *,
    sheets: list[RenderedSheet],
    prompt: str,
    voting_n: int,
    voting_threshold: int,
    concurrency: int,
    metrics: Metrics,
    seed_by_page: dict[int, str] | None = None,
    risk_group: str = "",
) -> list[dict[str, Any]]:
    """Process sheets concurrently. Returns one result dict per sheet."""
    settings = get_settings()

    def _process(sheet: RenderedSheet) -> dict[str, Any]:
        captions = [caption_str(img) for img in sheet.images]
        image_pngs = [img.png for img in sheet.images]
        # Per-sheet prompt: append the deterministic view-type hint when
        # cross-view is on (seed_by_page is None otherwise).
        sheet_prompt = prompt
        if seed_by_page:
            hint = seed_by_page.get(sheet.page)
            if hint:
                sheet_prompt = prompt + "\n\n" + hint

        # N vision passes on this sheet (sequential within the sheet — the
        # cross-sheet ThreadPoolExecutor already gives us parallelism, and
        # provider rate limits are global). Drop to 1 pass for the rare
        # sheet that has zero images (degenerate guard).
        if not image_pngs:
            return {
                "sheet_index": sheet.sheet_index,
                "page": sheet.page,
                "kept": [],
                "drops": [],
                "summary": "",
                "runs_debug": [],
                "verification_status": "verified",
                "verification_version": "",
                "view_payloads": [],
            }

        run_flag_lists: list[list[dict[str, Any]]] = []
        run_summaries: list[str] = []
        view_payloads: list[dict[str, Any] | None] = []
        sheet_in_tokens = 0
        sheet_out_tokens = 0

        for pass_idx in range(voting_n):
            try:
                payload, in_t, out_t = run_single_vision_pass(
                    settings=settings,
                    images=image_pngs,
                    captions=captions,
                    prompt=sheet_prompt,
                )
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "vision pass failed sheet=%s pass=%s: %s",
                    sheet.sheet_index,
                    pass_idx,
                    exc,
                )
                continue
            run_flag_lists.append(list(payload.get("flags") or []))
            if payload.get("summary"):
                run_summaries.append(str(payload["summary"]))
            if isinstance(payload.get("view"), dict):
                view_payloads.append(payload["view"])
            sheet_in_tokens += in_t
            sheet_out_tokens += out_t

        metrics.input_tokens += sheet_in_tokens
        metrics.output_tokens += sheet_out_tokens

        # Per-sheet voting. vote_key includes page, so within-sheet voting
        # is semantically identical to global voting for these buckets.
        threshold = max(1, min(voting_threshold, max(1, len(run_flag_lists))))
        voted = vote_flags(run_flag_lists, threshold=threshold)
        voted = dedup_flags(voted)
        voted = attach_page_bbox(voted)

        # Per-sheet verification: scoped to this sheet's images.
        kept, drops, v_status, v_version = verify_flags(
            images=sheet.images, flags=voted, metrics=metrics, risk_group=risk_group
        )

        sheet_runs_debug = [
            {
                "sheet_index": sheet.sheet_index,
                "run": idx,
                "flag_count": len(run),
                "flags": [
                    {
                        "page": f.get("page"),
                        "area": f.get("area"),
                        "category": f.get("category"),
                        "confidence": f.get("confidence"),
                        "verbatim_quote": f.get("verbatim_quote"),
                        "vote_key": list(vote_key(f)),
                    }
                    for f in run
                ],
            }
            for idx, run in enumerate(run_flag_lists)
        ]

        return {
            "sheet_index": sheet.sheet_index,
            "page": sheet.page,
            "kept": kept,
            "drops": drops,
            "summary": max(run_summaries, key=len, default=""),
            "runs_debug": sheet_runs_debug,
            "verification_status": v_status,
            "verification_version": v_version,
            "view_payloads": view_payloads,
        }

    if len(sheets) == 1 or concurrency == 1:
        return [_process(s) for s in sheets]

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        return list(pool.map(_process, sheets))
