"""Pre-lodgement building-plan analyser (v2).

v2 changes vs v1:
- Adaptive DPI rendering (200/300) based on per-page content density
- Per-page tiling for high-detail pages that exceed the per-image size limit
- Grounding required: every flag must include a verbatim_quote
- Haiku verification pass drops flags whose quotes don't appear on the drawing
- Deterministic doc-rules prong (missing sheets, revision mismatches) runs
  before the vision pass and bypasses verification
"""

from __future__ import annotations

import base64
import io
import json
import logging
import re
import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import anthropic
import pdfplumber
from PIL import Image

from app.config import get_settings
from app.extractors.doc_rules import run_doc_rules
from app.extractors.metrics import Metrics
from app.extractors.plan_text import PlanTextExtraction, extract_plan_text
from app.llm.gemini import call_gemini_tool
from app.taxonomy import get_taxonomy

log = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
ACTIVE_PROMPT = "plan_analyser_v2.md"
ACTIVE_VERIFICATION_PROMPT = "plan_verification_v1.md"
ANALYSIS_VERSION = "2.0.0"
# Back-compat: routes/tests still import ANALYSER_VERSION.
ANALYSER_VERSION = ANALYSIS_VERSION

# Anthropic per-image size ceiling is ~5MB base64 encoded; raw PNG must
# stay under ~3.7MB to be safe. We use a slightly tighter threshold.
MAX_IMAGE_BYTES = 3_500_000
# Total image budget per analysis (pages + tiles). Beyond this, truncate
# and warn so we don't blow through the cost ceiling silently.
MAX_IMAGES = 25
# Page classification thresholds (FR-1.1).
HIGH_DETAIL_TEXT_OBJECTS = 500
HIGH_DETAIL_VECTOR_PATHS = 2000
DPI_STANDARD = 200
DPI_HIGH_DETAIL = 300

_ANALYSIS_TOOL_SCHEMA: dict[str, Any] = {
    "name": "record_plan_analysis",
    "description": "Record the structured analysis of a building plan.",
    "input_schema": {
        "type": "object",
        "required": ["flags", "summary"],
        "properties": {
            "summary": {"type": "string", "minLength": 20},
            "flags": {
                "type": "array",
                "maxItems": 50,
                "items": {
                    "type": "object",
                    "required": [
                        "page",
                        "area",
                        "category",
                        "severity",
                        "confidence",
                        "verbatim_quote",
                        "reason",
                        "recommended_action",
                    ],
                    "properties": {
                        "page": {"type": "integer", "minimum": 1},
                        "tile": {
                            "type": "string",
                            "enum": [
                                "top-left",
                                "top-right",
                                "bottom-left",
                                "bottom-right",
                                "full",
                            ],
                        },
                        "area": {"type": "string", "minLength": 4, "maxLength": 200},
                        "category": {"type": "string"},
                        "severity": {"enum": ["must_resolve", "nice_to_have"]},
                        "confidence": {"enum": ["high", "medium", "low"]},
                        "verbatim_quote": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 200,
                        },
                        "reason": {"type": "string", "minLength": 12, "maxLength": 500},
                        "recommended_action": {
                            "type": "string",
                            "minLength": 8,
                            "maxLength": 500,
                        },
                    },
                },
            },
        },
    },
}

_VERIFICATION_TOOL_SCHEMA: dict[str, Any] = {
    "name": "record_verification",
    "description": "Verify groundedness of each flag against the drawing.",
    "input_schema": {
        "type": "object",
        "required": ["verifications"],
        "properties": {
            "verifications": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["flag_id", "verified"],
                    "properties": {
                        "flag_id": {"type": "integer", "minimum": 0},
                        "verified": {"type": "boolean"},
                        "verification_note": {"type": "string", "maxLength": 200},
                    },
                },
            },
        },
    },
}


# ---------------------------------------------------------------------------
# Prompt loading
# ---------------------------------------------------------------------------


@lru_cache
def _load_prompt(filename: str) -> tuple[str, str]:
    raw = (PROMPTS_DIR / filename).read_text(encoding="utf-8")
    fm = re.match(r"---\n(.*?)\n---\n(.*)", raw, re.DOTALL)
    if not fm:
        raise ValueError(f"prompt {filename} missing frontmatter")
    body = fm.group(2)
    version = re.search(r'version:\s*"?([\d.]+)"?', fm.group(1))
    if not version:
        raise ValueError(f"prompt {filename} missing version")
    return body, version.group(1)


def _taxonomy_block() -> str:
    tx = get_taxonomy()
    rows = [
        {"id": c["id"], "label": c["label"], "weight": c.get("weight")}
        for c in tx["categories"]
    ]
    return json.dumps(rows, indent=2)


def _fill(template: str, **kwargs: str) -> str:
    out = template
    for k, v in kwargs.items():
        out = out.replace("{{" + k + "}}", v)
    return out


# ---------------------------------------------------------------------------
# Page classification + adaptive rendering + tiling (FR-1)
# ---------------------------------------------------------------------------


@dataclass
class RenderedImage:
    page: int
    tile: str  # "full" | "top-left" | "top-right" | "bottom-left" | "bottom-right"
    png: bytes
    dpi: int


def _classify_sheet(page: pdfplumber.page.Page) -> str:
    """High-detail (schedules, annotated details) vs standard sheet."""
    text_count = len(page.chars or [])
    vector_count = len(page.curves or []) + len(page.lines or [])
    if text_count > HIGH_DETAIL_TEXT_OBJECTS or vector_count > HIGH_DETAIL_VECTOR_PATHS:
        return "high_detail"
    return "standard"


def _png_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _tile_image(image: Image.Image, overlap: float = 0.10) -> dict[str, Image.Image]:
    """Split a PIL image into 2x2 with `overlap` fractional overlap on each side."""
    w, h = image.size
    ox = int(w * overlap / 2)
    oy = int(h * overlap / 2)
    mid_x = w // 2
    mid_y = h // 2

    # (left, upper, right, lower) crop boxes with the centre line shifted by
    # the overlap so adjacent tiles share content near the seam.
    boxes = {
        "top-left": (0, 0, min(w, mid_x + ox), min(h, mid_y + oy)),
        "top-right": (max(0, mid_x - ox), 0, w, min(h, mid_y + oy)),
        "bottom-left": (0, max(0, mid_y - oy), min(w, mid_x + ox), h),
        "bottom-right": (max(0, mid_x - ox), max(0, mid_y - oy), w, h),
    }
    return {name: image.crop(box) for name, box in boxes.items()}


def _render_page(
    page: pdfplumber.page.Page, dpi: int
) -> Image.Image:
    return page.to_image(resolution=dpi).original


def _render_pages(
    pdf_bytes: bytes,
    *,
    max_images: int = MAX_IMAGES,
) -> tuple[list[RenderedImage], dict[str, int], bool]:
    """Render PDF pages with adaptive DPI + tiling.

    Returns (images, dpi_breakdown, truncated).
    """
    images: list[RenderedImage] = []
    breakdown = {"standard_pages": 0, "high_detail_pages": 0, "tiled_pages": 0}
    truncated = False

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            classification = _classify_sheet(page)
            dpi = DPI_HIGH_DETAIL if classification == "high_detail" else DPI_STANDARD
            if classification == "high_detail":
                breakdown["high_detail_pages"] += 1
            else:
                breakdown["standard_pages"] += 1

            rendered = _render_page(page, dpi)
            png = _png_bytes(rendered)

            if len(png) <= MAX_IMAGE_BYTES:
                if len(images) >= max_images:
                    truncated = True
                    break
                images.append(
                    RenderedImage(page=idx, tile="full", png=png, dpi=dpi)
                )
                continue

            # Too big — tile it.
            breakdown["tiled_pages"] += 1
            tiles = _tile_image(rendered)
            for tile_name, tile_image in tiles.items():
                if len(images) >= max_images:
                    truncated = True
                    break
                tile_png = _png_bytes(tile_image)
                # If a single tile is still too big, downscale it once.
                if len(tile_png) > MAX_IMAGE_BYTES:
                    tile_image = tile_image.resize(
                        (tile_image.width // 2, tile_image.height // 2),
                        Image.LANCZOS,
                    )
                    tile_png = _png_bytes(tile_image)
                images.append(
                    RenderedImage(
                        page=idx, tile=tile_name, png=tile_png, dpi=dpi
                    )
                )
            if truncated:
                break

    return images, breakdown, truncated


def _image_block(rendered: RenderedImage) -> dict[str, Any]:
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": base64.b64encode(rendered.png).decode("ascii"),
        },
    }


def _image_caption(rendered: RenderedImage) -> dict[str, Any]:
    """Text block that labels the image immediately below it."""
    label = (
        f"Image: page {rendered.page}, tile {rendered.tile} "
        f"(rendered at {rendered.dpi} DPI)."
    )
    return {"type": "text", "text": label}


# ---------------------------------------------------------------------------
# Flag dedup (FR-1.3)
# ---------------------------------------------------------------------------


_CONFIDENCE_RANK = {"high": 3, "medium": 2, "low": 1}


def _normalise_area(area: str) -> str:
    return re.sub(r"\s+", " ", area or "").strip().lower()


def _dedup_flags(flags: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge flags with the same (page, normalised_area, category) key.

    Keeps the entry with the highest confidence, falling back to the first
    one seen.
    """
    seen: dict[tuple[int, str, str], dict[str, Any]] = {}
    for f in flags:
        key = (
            int(f.get("page") or 0),
            _normalise_area(f.get("area", "")),
            str(f.get("category") or ""),
        )
        existing = seen.get(key)
        if existing is None:
            seen[key] = f
            continue
        new_rank = _CONFIDENCE_RANK.get(f.get("confidence", "low"), 0)
        old_rank = _CONFIDENCE_RANK.get(existing.get("confidence", "low"), 0)
        if new_rank > old_rank:
            seen[key] = f
    return list(seen.values())


# ---------------------------------------------------------------------------
# Verification pass (FR-3)
# ---------------------------------------------------------------------------


def _verify_flags(
    *,
    client: anthropic.Anthropic,
    images: list[RenderedImage],
    flags: list[dict[str, Any]],
    metrics: Metrics,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str, str]:
    """Run a Haiku call to verify each flag's verbatim_quote.

    Returns (kept_flags, drops, verification_status, verification_prompt_version).
    `verification_status` is one of: "verified", "skipped".
    Drops carry their original flag plus the verification_note.
    """
    if not flags:
        return [], [], "verified", _load_prompt(ACTIVE_VERIFICATION_PROMPT)[1]

    template, version = _load_prompt(ACTIVE_VERIFICATION_PROMPT)
    flags_block = json.dumps(
        [
            {
                "flag_id": idx,
                "page": f.get("page"),
                "tile": f.get("tile") or "full",
                "verbatim_quote": f.get("verbatim_quote", ""),
                "reason": f.get("reason", ""),
                "recommended_action": f.get("recommended_action", ""),
            }
            for idx, f in enumerate(flags)
        ],
        indent=2,
    )
    prompt = _fill(template, flags_block=flags_block)

    content: list[dict[str, Any]] = []
    for img in images:
        content.append(_image_block(img))
        content.append(_image_caption(img))
    content.append({"type": "text", "text": prompt})

    settings = get_settings()
    payload: dict[str, Any]
    try:
        if settings.plan_verifier_provider == "gemini":
            captions = [
                f"Image: page {img.page}, tile {img.tile} (rendered at {img.dpi} DPI)."
                for img in images
            ]
            gemini_result = call_gemini_tool(
                images=[img.png for img in images],
                image_captions=captions,
                prompt=prompt,
                tool_name=_VERIFICATION_TOOL_SCHEMA["name"],
                tool_description=_VERIFICATION_TOOL_SCHEMA["description"],
                tool_parameters=_VERIFICATION_TOOL_SCHEMA["input_schema"],
                max_output_tokens=2000,
            )
            payload = gemini_result.payload
            metrics.verification_input_tokens += gemini_result.input_tokens
            metrics.verification_output_tokens += gemini_result.output_tokens
        else:
            response = client.messages.create(
                model=settings.anthropic_verification_model,
                max_tokens=2000,
                tools=[_VERIFICATION_TOOL_SCHEMA],
                tool_choice={"type": "tool", "name": "record_verification"},
                messages=[{"role": "user", "content": content}],
            )
            metrics.verification_input_tokens += int(
                getattr(response.usage, "input_tokens", 0) or 0
            )
            metrics.verification_output_tokens += int(
                getattr(response.usage, "output_tokens", 0) or 0
            )
            tool_use = next(
                (b for b in response.content if b.type == "tool_use"), None
            )
            if tool_use is None:
                log.warning("plan verification returned no tool_use; treating as skipped")
                return list(flags), [], "skipped", version
            payload = dict(tool_use.input)  # type: ignore[arg-type]
    except Exception as exc:  # noqa: BLE001
        log.warning("plan verification skipped: %s", exc)
        return list(flags), [], "skipped", version
    verifications = {
        int(v["flag_id"]): v
        for v in payload.get("verifications", [])
        if isinstance(v, dict) and "flag_id" in v
    }

    kept: list[dict[str, Any]] = []
    drops: list[dict[str, Any]] = []
    for idx, flag in enumerate(flags):
        v = verifications.get(idx)
        if v is None:
            # No verdict — be conservative and drop.
            drops.append({**flag, "verification_note": "no verdict from verifier"})
            continue
        if v.get("verified"):
            kept.append(flag)
        else:
            drops.append(
                {**flag, "verification_note": v.get("verification_note", "")}
            )
    return kept, drops, "verified", version


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


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
    template, prompt_version = _load_prompt(ACTIVE_PROMPT)
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    # --- Phase A: deterministic text-layer extraction ---------------------
    if media_type == "application/pdf":
        text_extraction = extract_plan_text(file_bytes)
        rule_flags = run_doc_rules(text_extraction)
        images, dpi_breakdown, truncated = _render_pages(file_bytes)
    else:
        # Single-image upload: no text layer, no doc rules, single full image.
        text_extraction = PlanTextExtraction()
        rule_flags = []
        images = [
            RenderedImage(page=1, tile="full", png=file_bytes, dpi=0),
        ]
        dpi_breakdown = {"standard_pages": 1, "high_detail_pages": 0, "tiled_pages": 0}
        truncated = False

    tx = get_taxonomy()
    bca_meta = next((b for b in tx["bcas"] if b["id"] == bca), {"name": bca})
    prompt = _fill(
        template,
        bca=bca,
        bca_long=bca_meta.get("name", bca),
        project_type=project_type,
        project_description=project_description or "(none provided)",
        taxonomy=_taxonomy_block(),
    )

    # --- Phase B: vision pass -------------------------------------------
    content: list[dict[str, Any]] = []
    for img in images:
        content.append(_image_block(img))
        content.append(_image_caption(img))
    if text_extraction.title_blocks or text_extraction.drawing_register:
        content.append(
            {
                "type": "text",
                "text": (
                    "Structured PDF text-layer extraction (treat as ground truth):\n```json\n"
                    + json.dumps(text_extraction.to_prompt_block(), indent=2)
                    + "\n```"
                ),
            }
        )
    content.append({"type": "text", "text": prompt})

    metrics = Metrics()
    t0 = time.monotonic()

    if settings.plan_analyser_provider == "gemini":
        captions = [
            f"Image: page {img.page}, tile {img.tile} (rendered at {img.dpi} DPI)."
            for img in images
        ]
        # The trailing extracted_text JSON block + the analysis prompt are
        # already part of `content`; for Gemini we re-flatten them into a
        # single text prompt and let `call_gemini_tool` handle the images.
        text_blocks = [b["text"] for b in content if b.get("type") == "text"]
        gemini_result = call_gemini_tool(
            images=[img.png for img in images],
            image_captions=captions,
            prompt="\n\n".join(text_blocks),
            tool_name=_ANALYSIS_TOOL_SCHEMA["name"],
            tool_description=_ANALYSIS_TOOL_SCHEMA["description"],
            tool_parameters=_ANALYSIS_TOOL_SCHEMA["input_schema"],
            max_output_tokens=6000,
        )
        payload = gemini_result.payload
        metrics.input_tokens = gemini_result.input_tokens
        metrics.output_tokens = gemini_result.output_tokens
    else:
        response = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=6000,
            tools=[_ANALYSIS_TOOL_SCHEMA],
            tool_choice={"type": "tool", "name": "record_plan_analysis"},
            messages=[{"role": "user", "content": content}],
        )
        metrics.input_tokens = int(getattr(response.usage, "input_tokens", 0) or 0)
        metrics.output_tokens = int(getattr(response.usage, "output_tokens", 0) or 0)
        tool_use = next((b for b in response.content if b.type == "tool_use"), None)
        if tool_use is None:
            raise RuntimeError("plan analyser did not return tool use")
        payload = dict(tool_use.input)  # type: ignore[arg-type]

    vision_flags: list[dict[str, Any]] = list(payload.get("flags") or [])

    # --- Phase C: dedup vision flags before verification ----------------
    vision_flags = _dedup_flags(vision_flags)

    # --- Phase D: verification pass -------------------------------------
    kept, drops, verification_status, verification_version = _verify_flags(
        client=client, images=images, flags=vision_flags, metrics=metrics
    )

    # --- Phase E: merge rule flags + verified flags ---------------------
    merged_flags = rule_flags + kept

    metrics.processing_ms = int((time.monotonic() - t0) * 1000)

    final_payload = {
        "flags": merged_flags,
        "summary": payload.get("summary", ""),
        "taxonomy_version": tx.get("schema_version", "1.0"),
        "pages_analysed": len({img.page for img in images}),
        "truncated": truncated,
        "verification": verification_status,
    }

    extras = {
        "analysis_version": ANALYSIS_VERSION,
        "verification_prompt_version": verification_version,
        "verification_drops": drops,
        "image_count": len(images),
        "dpi_breakdown": dpi_breakdown,
    }

    return final_payload, prompt_version, metrics, extras
