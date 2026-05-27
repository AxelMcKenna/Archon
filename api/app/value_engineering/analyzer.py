"""Top-level entry: ``analyse_value_engineering`` runs the VE pass.

Mirrors ``app.plans.analyzer.analyse_plan`` but with the VE prompt and
tool schema. Single-pass (no voting, no verifier) — see plan doc.
"""

from __future__ import annotations

import time
from typing import Any

from app.config import get_settings
from app.extractors.metrics import Metrics
from app.plans.render import RenderedImage, caption_str, render_pages
from app.taxonomy import get_taxonomy
from app.value_engineering.prompt import ACTIVE_PROMPT, fill, load_prompt
from app.value_engineering.vision import run_value_engineering_pass

VALUE_ENGINEERING_VERSION = "1.0.0"


def analyse_value_engineering(
    *,
    file_bytes: bytes,
    media_type: str,
    bca: str,
    project_type: str,
    project_description: str,
) -> tuple[dict[str, Any], str, Metrics, dict[str, Any]]:
    """Run the VE analyser.

    Returns (payload, prompt_version, metrics, extras). ``extras`` carries
    DB-bound fields the service layer writes alongside the analysis:
        - analyser_version
        - image_count
        - dpi_breakdown
    """
    template, prompt_version = load_prompt(ACTIVE_PROMPT)
    settings = get_settings()

    if media_type == "application/pdf":
        images, dpi_breakdown, truncated = render_pages(file_bytes)
    else:
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
    )

    captions = [caption_str(img) for img in images]
    image_pngs = [img.png for img in images]

    metrics = Metrics()
    t0 = time.monotonic()

    payload, in_tokens, out_tokens = run_value_engineering_pass(
        settings=settings,
        images=image_pngs,
        captions=captions,
        prompt=prompt,
    )

    metrics.input_tokens = in_tokens
    metrics.output_tokens = out_tokens
    metrics.processing_ms = int((time.monotonic() - t0) * 1000)

    opportunities = list(payload.get("opportunities") or [])
    summary = str(payload.get("summary") or "")

    final_payload = {
        "opportunities": opportunities,
        "summary": summary,
        "pages_analysed": len({img.page for img in images}),
        "truncated": truncated,
    }

    extras = {
        "analyser_version": VALUE_ENGINEERING_VERSION,
        "image_count": len(images),
        "dpi_breakdown": dpi_breakdown,
    }

    return final_payload, prompt_version, metrics, extras
