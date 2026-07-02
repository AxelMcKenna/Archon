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

import itertools
import json
import logging
import os
import time
from collections.abc import Callable
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
from app.plans.reconcile import (
    ACTIVE_COORDINATION_PROMPT,
    COORDINATION_CATEGORY,
    reconcile_sets,
)
from app.plans.registration import build_comparison_sets, build_coordination_sets
from app.plans.views import ViewRecord, build_view_record, seed_hint
from app.plans.vote import dedup_cross_view, dedup_flags, vote_flags, vote_key
from app.taxonomy import get_taxonomy
from app.vision.core.prompts import fill, load_prompt
from app.vision.core.renderer import RenderedImage, RenderedSheet, caption_str, iter_sheets
from app.vision.plans.schema import ACTIVE_ANALYSIS_PROMPT
from app.vision.plans.vision_pass import run_single_vision_pass, verify_flags

log = logging.getLogger(__name__)

# Progress sink: called from analyse_plan (and its sheet worker threads) with a
# small dict per pipeline phase so a streaming caller can surface a live log.
# Must be cheap and thread-safe — it runs inside the per-sheet ThreadPoolExecutor.
ProgressFn = Callable[[dict[str, Any]], None]

ANALYSIS_VERSION = "2.4.0"
# Back-compat: routes/tests still import ANALYSER_VERSION.
ANALYSER_VERSION = ANALYSIS_VERSION

# Per-discipline focus hint appended to the analyser prompt for a sheet, so the
# model checks what actually drives RFIs on that discipline's drawings. Keyed on
# the discipline resolved from the sheet code / title (see plan_text.py).
_DISCIPLINE_FOCUS: dict[str, str] = {
    "fire": (
        "Discipline focus — this is a FIRE sheet. Prioritise means of escape "
        "(occupant load, travel/dead-end distances, exit and door widths, number "
        "of exits), fire compartmentation and fire resistance ratings (FRR), and "
        "fire safety systems (sprinklers, alarms, emergency lighting). For non-SH "
        "risk groups assess against C/AS2 or a C/VM2 alternative solution."
    ),
    "structural": (
        "Discipline focus — this is a STRUCTURAL sheet. Prioritise B1: load paths, "
        "foundation/geotech coordination, member sizes and connections, and "
        "importance-level design (seismic/wind) where IL2-IL4 applies. Expect "
        "PS1/PS4 from a CPEng and specific engineering design for higher IL."
    ),
    "mechanical": (
        "Discipline focus — this is a MECHANICAL sheet. Prioritise G4 ventilation: "
        "mechanical ventilation rates / air changes for the assessed occupancy, "
        "contaminant-space extract (kitchens, carparks), and a mechanical PS1."
    ),
    "electrical": (
        "Discipline focus — this is an ELECTRICAL sheet. Prioritise G9 and the fire "
        "systems shown here (emergency lighting F6, detection/alarm), plus H1.3.5 "
        "artificial-lighting energy efficiency for larger buildings."
    ),
    "hydraulic": (
        "Discipline focus — this is a HYDRAULIC / PLUMBING sheet. Prioritise G12 "
        "water supplies (backflow), G13 foul water / drainage, and G1 sanitary "
        "fixture provision sized by occupancy for commercial buildings."
    ),
    "civil": (
        "Discipline focus — this is a CIVIL sheet. Prioritise E1 surface water, site "
        "levels / datum, network-utility capacity and lawful stormwater outfall."
    ),
    "geotech": (
        "Discipline focus — this is a GEOTECH sheet. Prioritise B1 foundations, "
        "Canterbury TC1/TC2/TC3 zoning, liquefaction and the geotech PS1."
    ),
}


def analyse_plan(
    *,
    file_bytes: bytes,
    media_type: str,
    bca: str,
    project_type: str,
    project_description: str,
    risk_group: str = "",
    importance_level: str = "",
    progress: ProgressFn | None = None,
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

    # Monotonic step ids let the streaming client pair a "running" line with its
    # later "done" update (same id). next() on an itertools.count is atomic in
    # CPython, so it's safe to share across the per-sheet worker threads.
    step_seq = itertools.count(1)

    def emit(
        label: str,
        *,
        status: str = "done",
        detail: str | None = None,
        sid: int | None = None,
    ) -> int | None:
        if progress is None:
            return sid
        if sid is None:
            sid = next(step_seq)
        progress({"id": sid, "label": label, "status": status, "detail": detail})
        return sid

    # --- Phase A: deterministic text-layer extraction ---------------------
    if media_type == "application/pdf":
        extract_sid = emit("Extracting drawing text layer", status="running")
        text_extraction = extract_plan_text(file_bytes)
        rule_flags = run_doc_rules(text_extraction)
        emit(
            "Read drawing text layer",
            detail=f"{len(text_extraction.title_blocks)} sheet title block(s)",
            sid=extract_sid,
        )
        if rule_flags:
            emit("Document-rules pass", detail=f"{len(rule_flags)} rule flag(s)")
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
    dpi_breakdown: dict[str, Any] = {
        "standard_pages": 0,
        "high_detail_pages": 0,
        "tiled_pages": 0,
    }

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

    # Per-page render provenance (wiki/issues/0006): which DPI/tiling path each
    # page took, so a render-path change between runs (library bump, edited
    # source PDF) is auditable instead of looking like model noise. String
    # keys for JSON persistence.
    dpi_breakdown["by_page"] = {
        str(s.page): {
            "dpi": s.images[0].dpi if s.images else None,
            "tiled": len(s.images) > 1,
            "classification": s.classification,
        }
        for s in sheets
    }

    if cross_view_on:
        for s in sheets:
            seed_by_page[s.page] = seed_hint(*_sheet_meta(s.page))

    emit("Rendered drawing sheets", detail=f"{len(sheets)} sheet(s)")

    metrics = Metrics()
    t0 = time.monotonic()

    # --- Phase B/C: per-sheet vision + verify ----------------------------
    # Human-friendly sheet label per page for the live log (falls back to page
    # number when the title block has no sheet code).
    label_by_page = {s.page: (_sheet_meta(s.page)[0] or f"page {s.page}") for s in sheets}
    vision_sid = emit(
        "Reading drawings against NZ Building Code", status="running"
    )
    sheet_results = _run_sheets_parallel(
        sheets=sheets,
        prompt=flat_prompt,
        voting_n=n,
        voting_threshold=threshold,
        concurrency=concurrency,
        metrics=metrics,
        seed_by_page=seed_by_page if cross_view_on else None,
        risk_group=risk_group,
        discipline_by_page={
            p: str(m.get("discipline") or "")
            for p, m in text_extraction.page_metadata().items()
        },
        progress=progress,
        step_seq=step_seq,
        label_by_page=label_by_page,
        sheet_total=len(sheets),
    )

    # Aggregate across sheets.
    all_kept: list[dict[str, Any]] = []
    all_drops: list[dict[str, Any]] = []
    summaries: list[str] = []
    runs_debug: list[dict[str, Any]] = []
    llm_fallback_events: list[dict[str, Any]] = []
    verification_status_final = "verified"
    verification_version_final = ""

    for sr in sheet_results:
        all_kept.extend(sr["kept"])
        all_drops.extend(sr["drops"])
        if sr.get("summary"):
            summaries.append(sr["summary"])
        runs_debug.extend(sr.get("runs_debug", []))
        llm_fallback_events.extend(sr.get("fallback_events", []))
        if sr.get("verification_status") == "skipped":
            verification_status_final = "skipped"
        if not verification_version_final and sr.get("verification_version"):
            verification_version_final = sr["verification_version"]

    summary = max(summaries, key=lambda s: (len(s), s), default="")

    emit(
        "Read drawings against NZ Building Code",
        detail=f"{len(all_kept)} flag(s) after verification",
        sid=vision_sid,
    )

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

        # Cross-discipline coordination (Phase 6) — same-level sheets of
        # different disciplines. Gated off by default; reuses the cross-view
        # set caps, two-citation flag shape and dedup.
        if settings.plan_coordination_enabled:
            coordination_sets = build_coordination_sets(
                view_records,
                max_set_size=settings.plan_cross_view_max_set_size,
                max_sets=settings.plan_cross_view_max_sets,
            )
            coordination_flags = dedup_cross_view(
                reconcile_sets(
                    coordination_sets,
                    images_by_page=images_by_page,
                    metrics=metrics,
                    prompt_key=ACTIVE_COORDINATION_PROMPT,
                    category=COORDINATION_CATEGORY,
                )
            )
            cross_view_flags = cross_view_flags + coordination_flags
            log.info(
                "coordination: %d sets, %d flags",
                len(coordination_sets),
                len(coordination_flags),
            )

    if cross_view_on:
        emit(
            "Cross-view reconciliation",
            detail=f"{len(cross_view_flags)} cross-view flag(s)",
        )

    # --- Phase D: merge with rule flags ----------------------------------
    merged_flags = attach_page_bbox(rule_flags) + all_kept + cross_view_flags

    # Tag each flag with the discipline + sheet label of its page (from the
    # PDF text layer) so commercial multi-discipline sets can be filtered and
    # so the design-coordination pass has discipline context.
    page_meta = text_extraction.page_metadata()
    for flag in merged_flags:
        meta = page_meta.get(flag.get("page"))
        if meta:
            flag.setdefault("discipline", meta.get("discipline"))
            flag.setdefault("sheet_label", meta.get("sheet_label"))

    # --- Phase E: snap to PDF text layer ---------------------------------
    snap_sid = emit("Snapping flags to drawing geometry", status="running")
    merged_flags = refine_flag_bboxes(
        file_bytes=file_bytes, media_type=media_type, flags=merged_flags
    )

    # --- Phase F: OCR fallback -------------------------------------------
    merged_flags = refine_via_ocr(
        file_bytes=file_bytes, media_type=media_type, flags=merged_flags
    )
    emit("Snapped flags to drawing geometry", sid=snap_sid)

    metrics.processing_ms = int((time.monotonic() - t0) * 1000)

    image_count = sum(len(s.images) for s in sheets)
    pages_analysed = len({s.page for s in sheets})

    final_payload = {
        "flags": merged_flags,
        "summary": summary,
        "taxonomy_version": tx.get("schema_version", "1.0"),
        "pages_analysed": pages_analysed,
        # Persist the PDF text-layer extraction (schedules / register /
        # discipline-tagged title blocks) so the project coordination engine can
        # cross-reference this drawing against the spec without re-parsing.
        "text_extraction": text_extraction.to_prompt_block(),
        "truncated": False,
        "verification": verification_status_final,
        "_debug_runs": runs_debug,
        "_debug_voting_threshold": threshold,
        "cross_view_flag_count": len(cross_view_flags),
        # Provider fail-over provenance (wiki/issues/0002): non-empty means part
        # of this analysis was served by a different model than configured —
        # the run is auditable and a candidate for re-run, not silently mixed.
        "served_by_fallback": bool(llm_fallback_events),
        "llm_fallback_events": llm_fallback_events,
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
    discipline_by_page: dict[int, str] | None = None,
    progress: ProgressFn | None = None,
    step_seq: itertools.count[int] | None = None,
    label_by_page: dict[int, str] | None = None,
    sheet_total: int = 0,
) -> list[dict[str, Any]]:
    """Process sheets concurrently. Returns one result dict per sheet."""
    settings = get_settings()

    # Completed-sheet counter for the live log. itertools.count.__next__ is
    # atomic in CPython, so it's safe to call from the worker threads below.
    done_counter = itertools.count(1)

    def _emit_sheet_done(page: int, kept_count: int) -> None:
        if progress is None or step_seq is None:
            return
        n_done = next(done_counter)
        label = (label_by_page or {}).get(page) or f"page {page}"
        suffix = f"/{sheet_total}" if sheet_total else ""
        progress(
            {
                "id": next(step_seq),
                "label": f"Sheet {label}",
                "status": "done",
                "detail": f"{kept_count} flag(s) · {n_done}{suffix}",
            }
        )

    def _process(sheet: RenderedSheet) -> dict[str, Any]:
        captions = [caption_str(img) for img in sheet.images]
        image_pngs = [img.png for img in sheet.images]
        # Per-sheet prompt: append the deterministic view-type hint when
        # cross-view is on, then a discipline-focus hint so the model checks
        # what matters for this sheet's discipline (fire / structural / MEP).
        sheet_prompt = prompt
        if seed_by_page:
            hint = seed_by_page.get(sheet.page)
            if hint:
                sheet_prompt = sheet_prompt + "\n\n" + hint
        if discipline_by_page:
            focus = _DISCIPLINE_FOCUS.get(discipline_by_page.get(sheet.page, ""))
            if focus:
                sheet_prompt = sheet_prompt + "\n\n" + focus

        # N vision passes on this sheet (sequential within the sheet — the
        # cross-sheet ThreadPoolExecutor already gives us parallelism, and
        # provider rate limits are global). Drop to 1 pass for the rare
        # sheet that has zero images (degenerate guard).
        if not image_pngs:
            _emit_sheet_done(sheet.page, 0)
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
                "metrics": Metrics(),
                "fallback_events": [],
            }

        run_flag_lists: list[list[dict[str, Any]]] = []
        run_summaries: list[str] = []
        view_payloads: list[dict[str, Any] | None] = []
        # Tokens and fallback events accumulate on per-sheet locals and are
        # merged on the main thread after the pool joins — `obj.attr += x` on
        # the shared Metrics from worker threads is a read-modify-write race
        # that undercounts (wiki/issues/0010b).
        sheet_metrics = Metrics()
        fallback_events: list[dict[str, Any]] = []

        for pass_idx in range(voting_n):
            provenance: dict[str, Any] = {}
            try:
                payload, in_t, out_t = run_single_vision_pass(
                    settings=settings,
                    images=image_pngs,
                    captions=captions,
                    prompt=sheet_prompt,
                    temperature=settings.plan_analyser_temperature,
                    seed=pass_idx,
                    provenance=provenance,
                )
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "vision pass failed sheet=%s pass=%s: %s",
                    sheet.sheet_index,
                    pass_idx,
                    exc,
                )
                continue
            if provenance.get("fallback"):
                fallback_events.append(
                    {"stage": "analyser", "page": sheet.page, "pass": pass_idx, **provenance}
                )
            run_flag_lists.append(list(payload.get("flags") or []))
            if payload.get("summary"):
                run_summaries.append(str(payload["summary"]))
            if isinstance(payload.get("view"), dict):
                view_payloads.append(payload["view"])
            sheet_metrics.input_tokens += in_t
            sheet_metrics.output_tokens += out_t

        # Per-sheet voting. vote_key includes page, so within-sheet voting
        # is semantically identical to global voting for these buckets.
        threshold = max(1, min(voting_threshold, max(1, len(run_flag_lists))))
        voted = vote_flags(run_flag_lists, threshold=threshold)
        voted = dedup_flags(voted)
        voted = attach_page_bbox(voted)

        # Per-sheet verification: scoped to this sheet's images.
        kept, drops, v_status, v_version = verify_flags(
            images=sheet.images,
            flags=voted,
            metrics=sheet_metrics,
            risk_group=risk_group,
            fallback_events=fallback_events,
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

        _emit_sheet_done(sheet.page, len(kept))

        return {
            "sheet_index": sheet.sheet_index,
            "page": sheet.page,
            "kept": kept,
            "drops": drops,
            # Lexicographic tiebreak so an equal-length tie can't make the
            # chosen summary depend on pass order.
            "summary": max(run_summaries, key=lambda s: (len(s), s), default=""),
            "runs_debug": sheet_runs_debug,
            "verification_status": v_status,
            "verification_version": v_version,
            "view_payloads": view_payloads,
            "metrics": sheet_metrics,
            "fallback_events": fallback_events,
        }

    if len(sheets) == 1 or concurrency == 1:
        results = [_process(s) for s in sheets]
    else:
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            results = list(pool.map(_process, sheets))

    # Merge per-sheet token counts on the main thread (see the race note in
    # _process).
    for sr in results:
        sm: Metrics = sr["metrics"]
        metrics.input_tokens += sm.input_tokens
        metrics.output_tokens += sm.output_tokens
        metrics.verification_input_tokens += sm.verification_input_tokens
        metrics.verification_output_tokens += sm.verification_output_tokens
    return results
