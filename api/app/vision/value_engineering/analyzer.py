"""Top-level entry: ``analyse_value_engineering`` runs the VE pass.

Mirrors ``app.plans.analyzer.analyse_plan`` but with the VE prompt and
tool schema. Single-pass (no voting, no verifier).
"""

from __future__ import annotations

import time
from typing import Any

from app.config import get_settings
from app.extractors.metrics import Metrics
from app.taxonomy import get_taxonomy
from app.vision.core.prompts import fill, load_prompt
from app.vision.core.renderer import RenderedImage, caption_str, render_pages
from app.vision.value_engineering.schema import (
    ACTIVE_PROMPT,
    CAD_OPPORTUNITY_TOOL_SCHEMA,
    VALUE_ENGINEERING_VERSION,
)
from app.vision.value_engineering.vision_pass import run_value_engineering_pass

_EMPTY_DPI = {"standard_pages": 0, "high_detail_pages": 0, "tiled_pages": 0}
# Cap DXF layouts rendered into the VE pass — bound vision spend on
# multi-layout drawings (mirrors the spirit of render_pages' max_images).
_MAX_DXF_VIEWS = 8


def _ve_prompt(template: str, *, bca: str, project_type: str, project_description: str) -> str:
    tx = get_taxonomy()
    bca_meta = next((b for b in tx["bcas"] if b["id"] == bca), {"name": bca})
    return fill(
        template,
        bca=bca,
        bca_long=bca_meta.get("name", bca),
        project_type=project_type,
        project_description=project_description or "(none provided)",
    )


def analyse_value_engineering_from_images(
    *,
    images: list[bytes],
    captions: list[str],
    bca: str,
    project_type: str,
    project_description: str,
    dpi_breakdown: dict[str, Any] | None = None,
    pages_analysed: int | None = None,
    truncated: bool = False,
) -> tuple[dict[str, Any], str, Metrics, dict[str, Any]]:
    """Run the VE pass over already-rendered PNGs.

    Source-agnostic core: PDF callers render pages first, DXF callers
    rasterize layouts first (see ``app.cad.cad_render.render_view``).
    Returns (payload, prompt_version, metrics, extras).
    """
    template, prompt_version = load_prompt(ACTIVE_PROMPT)
    settings = get_settings()

    prompt = _ve_prompt(
        template,
        bca=bca,
        project_type=project_type,
        project_description=project_description,
    )

    metrics = Metrics()
    t0 = time.monotonic()

    payload, in_tokens, out_tokens = run_value_engineering_pass(
        settings=settings,
        images=images,
        captions=captions,
        prompt=prompt,
    )

    metrics.input_tokens = in_tokens
    metrics.output_tokens = out_tokens
    metrics.processing_ms = int((time.monotonic() - t0) * 1000)

    final_payload = {
        "opportunities": list(payload.get("opportunities") or []),
        "summary": str(payload.get("summary") or ""),
        "pages_analysed": pages_analysed if pages_analysed is not None else len(images),
        "truncated": truncated,
    }

    extras = {
        "analyser_version": VALUE_ENGINEERING_VERSION,
        "image_count": len(images),
        "dpi_breakdown": dpi_breakdown or dict(_EMPTY_DPI),
    }

    return final_payload, prompt_version, metrics, extras


def analyse_value_engineering(
    *,
    file_bytes: bytes,
    media_type: str,
    bca: str,
    project_type: str,
    project_description: str,
) -> tuple[dict[str, Any], str, Metrics, dict[str, Any]]:
    """Run the VE analyser on a PDF (or single raster image).

    Returns (payload, prompt_version, metrics, extras). ``extras`` carries
    DB-bound fields the service layer writes alongside the analysis:
        - analyser_version
        - image_count
        - dpi_breakdown
    """
    if media_type == "application/pdf":
        rendered, dpi_breakdown, truncated = render_pages(file_bytes)
    else:
        rendered = [RenderedImage(page=1, tile="full", png=file_bytes, dpi=0)]
        dpi_breakdown = {"standard_pages": 1, "high_detail_pages": 0, "tiled_pages": 0}
        truncated = False

    return analyse_value_engineering_from_images(
        images=[img.png for img in rendered],
        captions=[caption_str(img) for img in rendered],
        bca=bca,
        project_type=project_type,
        project_description=project_description,
        dpi_breakdown=dpi_breakdown,
        pages_analysed=len({img.page for img in rendered}),
        truncated=truncated,
    )


def analyse_value_engineering_cad(
    *,
    dxf_bytes: bytes,
    bca: str,
    project_type: str,
    project_description: str,
) -> tuple[dict[str, Any], str, Metrics, dict[str, Any]]:
    """Run the VE pass on a DXF, grounding opportunities to entity handles.

    Mirrors the RFI CAD path (``app.cad.cad_analyzer``): render every layout,
    hand the model the entity list, have it cite ``target_handles`` per
    opportunity, then project those handles into per-view ``image_bboxes`` with
    the shared ``app.cad.cad_grounding`` helpers so the UI can draw overlays.
    """
    from app.cad.cad_grounding import ground_item_handles, load_and_index_dxf

    grounded = load_and_index_dxf(
        dxf_bytes, max_views=_MAX_DXF_VIEWS, caption_suffix=" (DXF layout)"
    )
    if not grounded.rendered.images:
        raise ValueError("no renderable views found in DXF")

    template, prompt_version = load_prompt(ACTIVE_PROMPT)
    settings = get_settings()
    prompt = _ve_prompt(
        template,
        bca=bca,
        project_type=project_type,
        project_description=project_description,
    )
    prompt += (
        "\n\n## CAD mode\n\n"
        "You are viewing rendered DXF layouts, not PDF pages. For each "
        "opportunity, set `target_handles` to the handles of the DXF entities "
        "it refers to (from the entity list below) instead of a page/tile/bbox."
    )
    prompt += grounded.entity_list_block()

    metrics = Metrics()
    t0 = time.monotonic()
    payload, in_tokens, out_tokens = run_value_engineering_pass(
        settings=settings,
        images=grounded.rendered.images,
        captions=grounded.rendered.captions,
        prompt=prompt,
        schema=CAD_OPPORTUNITY_TOOL_SCHEMA,
        max_output_tokens=12000,
    )
    metrics.input_tokens = in_tokens
    metrics.output_tokens = out_tokens
    metrics.processing_ms = int((time.monotonic() - t0) * 1000)

    opportunities: list[dict[str, Any]] = []
    for o in list(payload.get("opportunities") or []):
        # Opportunities have no verbatim_quote; fall back to the cited spec.
        # Unlike RFI we keep un-grounded opportunities (the list is still
        # useful); they simply render without an overlay box.
        ground_item_handles(o, grounded, quote_fields=("current_spec", "area"))
        opportunities.append(o)

    final_payload = {
        "opportunities": opportunities,
        "summary": str(payload.get("summary") or ""),
        "views": grounded.rendered.views,
        "pages_analysed": len(grounded.rendered.views),
        "truncated": False,
    }
    extras = {
        "analyser_version": VALUE_ENGINEERING_VERSION,
        "image_count": len(grounded.rendered.images),
        "dpi_breakdown": dict(_EMPTY_DPI),
    }
    return final_payload, prompt_version, metrics, extras
