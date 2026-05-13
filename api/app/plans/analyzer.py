"""Top-level entry: ``analyse_plan`` orchestrates the v2 pipeline.

Phases:
  A. Deterministic text-layer extraction + doc-rules prong
  B. Vision pass with N-of-K self-consistency voting
  C. Dedup + tile→page bbox attachment
  D. Verification pass (drops ungrounded flags)
  E. Merge rule flags + verified flags
  F. Snap bboxes to PDF text layer where possible
  G. OCR fallback for flags the text layer didn't find
"""

from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from app.config import get_settings
from app.extractors.doc_rules import run_doc_rules
from app.extractors.metrics import Metrics
from app.extractors.plan_text import PlanTextExtraction, extract_plan_text
from app.plan_bbox_refiner import refine_flag_bboxes
from app.plan_ocr_refiner import refine_via_ocr
from app.plans.bbox import attach_page_bbox
from app.plans.prompt import ACTIVE_PROMPT, fill, load_prompt, taxonomy_block
from app.plans.render import RenderedImage, caption_str, render_pages
from app.plans.vision import run_single_vision_pass, verify_flags
from app.plans.vote import dedup_flags, vote_flags, vote_key
from app.taxonomy import get_taxonomy

ANALYSIS_VERSION = "2.2.0"
# Back-compat: routes/tests still import ANALYSER_VERSION.
ANALYSER_VERSION = ANALYSIS_VERSION


def analyse_plan(
    *,
    file_bytes: bytes,
    media_type: str,
    bca: str,
    project_type: str,
    project_description: str,
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
    template, prompt_version = load_prompt(ACTIVE_PROMPT)
    settings = get_settings()

    # --- Phase A: deterministic text-layer extraction ---------------------
    if media_type == "application/pdf":
        text_extraction = extract_plan_text(file_bytes)
        rule_flags = run_doc_rules(text_extraction)
        images, dpi_breakdown, truncated = render_pages(file_bytes)
    else:
        text_extraction = PlanTextExtraction()
        rule_flags = []
        images = [RenderedImage(page=1, tile="full", png=file_bytes, dpi=0)]
        dpi_breakdown = {"standard_pages": 1, "high_detail_pages": 0, "tiled_pages": 0}
        truncated = False

    tx = get_taxonomy()
    bca_meta = next((b for b in tx["bcas"] if b["id"] == bca), {"name": bca})
    prompt = fill(
        template,
        bca=bca,
        bca_long=bca_meta.get("name", bca),
        project_type=project_type,
        project_description=project_description or "(none provided)",
        taxonomy=taxonomy_block(),
    )

    # --- Phase B: vision pass (with N-of-K self-consistency voting) -----
    captions = [caption_str(img) for img in images]
    text_blocks: list[str] = []
    if text_extraction.title_blocks or text_extraction.drawing_register:
        text_blocks.append(
            "Structured PDF text-layer extraction (treat as ground truth):\n```json\n"
            + json.dumps(text_extraction.to_prompt_block(), indent=2)
            + "\n```"
        )
    text_blocks.append(prompt)
    flat_prompt = "\n\n".join(text_blocks)
    image_pngs = [img.png for img in images]

    metrics = Metrics()
    t0 = time.monotonic()

    n = max(1, settings.plan_analyser_voting_n)
    threshold = max(1, min(settings.plan_analyser_voting_threshold, n))

    def _one_pass() -> tuple[dict[str, Any], int, int]:
        return run_single_vision_pass(
            settings=settings,
            images=image_pngs,
            captions=captions,
            prompt=flat_prompt,
        )

    if n == 1:
        results = [_one_pass()]
    else:
        with ThreadPoolExecutor(max_workers=n) as pool:
            results = list(pool.map(lambda _i: _one_pass(), range(n)))

    metrics.input_tokens = sum(r[1] for r in results)
    metrics.output_tokens = sum(r[2] for r in results)

    run_flag_lists = [list(r[0].get("flags") or []) for r in results]
    vision_flags = vote_flags(run_flag_lists, threshold=threshold)

    runs_debug = [
        {
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

    summary = max(
        (r[0].get("summary") or "" for r in results), key=len, default=""
    )

    # --- Phase C: dedup + bbox attachment -------------------------------
    vision_flags = dedup_flags(vision_flags)
    vision_flags = attach_page_bbox(vision_flags)

    # --- Phase D: verification ------------------------------------------
    kept, drops, verification_status, verification_version = verify_flags(
        images=images, flags=vision_flags, metrics=metrics
    )

    # --- Phase E: merge -------------------------------------------------
    merged_flags = attach_page_bbox(rule_flags) + kept

    # --- Phase F: snap to PDF text layer --------------------------------
    merged_flags = refine_flag_bboxes(
        file_bytes=file_bytes, media_type=media_type, flags=merged_flags
    )

    # --- Phase G: OCR fallback ------------------------------------------
    merged_flags = refine_via_ocr(
        file_bytes=file_bytes, media_type=media_type, flags=merged_flags
    )

    metrics.processing_ms = int((time.monotonic() - t0) * 1000)

    final_payload = {
        "flags": merged_flags,
        "summary": summary,
        "taxonomy_version": tx.get("schema_version", "1.0"),
        "pages_analysed": len({img.page for img in images}),
        "truncated": truncated,
        "verification": verification_status,
        "_debug_runs": runs_debug,
        "_debug_voting_threshold": threshold,
    }

    extras = {
        "analysis_version": ANALYSIS_VERSION,
        "verification_prompt_version": verification_version,
        "verification_drops": drops,
        "image_count": len(images),
        "dpi_breakdown": dpi_breakdown,
    }

    return final_payload, prompt_version, metrics, extras
