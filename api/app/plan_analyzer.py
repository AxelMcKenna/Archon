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
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import pdfplumber
from PIL import Image

from app.config import get_settings
from app.extractors.doc_rules import run_doc_rules
from app.extractors.metrics import Metrics
from app.extractors.plan_text import PlanTextExtraction, extract_plan_text
from app.llm.gemini import call_gemini_tool
from app.llm.openrouter import call_openrouter_tool
from app.plan_bbox_refiner import refine_flag_bboxes
from app.plan_ocr_refiner import refine_via_ocr
from app.taxonomy import get_taxonomy

log = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
ACTIVE_PROMPT = "plan_analyser_v2.md"
ACTIVE_VERIFICATION_PROMPT = "plan_verification_v1.md"
ANALYSIS_VERSION = "2.2.0"
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
                        "bbox": {
                            "type": "array",
                            "description": (
                                "Optional bounding box around the cited "
                                "feature, in normalised coordinates (0-1) "
                                "RELATIVE TO THE IMAGE YOU ARE LOOKING AT "
                                "(the tile if tiled, otherwise the full "
                                "page). Order: [x0, y0, x1, y1] with origin "
                                "at top-left. Omit if you cannot localise."
                            ),
                            "minItems": 4,
                            "maxItems": 4,
                            "items": {
                                "type": "number",
                                "minimum": 0,
                                "maximum": 1,
                            },
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


def _flag_key(f: dict[str, Any]) -> tuple[int, str, str]:
    return (
        int(f.get("page") or 0),
        _normalise_area(f.get("area", "")),
        str(f.get("category") or ""),
    )


def _dedup_flags(flags: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge flags with the same (page, normalised_area, category) key.

    Keeps the entry with the highest confidence, falling back to the first
    one seen.
    """
    seen: dict[tuple[int, str, str], dict[str, Any]] = {}
    for f in flags:
        key = _flag_key(f)
        existing = seen.get(key)
        if existing is None:
            seen[key] = f
            continue
        new_rank = _CONFIDENCE_RANK.get(f.get("confidence", "low"), 0)
        old_rank = _CONFIDENCE_RANK.get(existing.get("confidence", "low"), 0)
        if new_rank > old_rank:
            seen[key] = f
    return list(seen.values())


def _quote_signature(q: str | None) -> str:
    """Aggressive normalisation for cross-run bucket keys.

    Strips non-alphanumeric and lowercases. "Kitchen 4,050 x 2,900" and
    "Kitchen 4.050 x 2.900" both reduce to "kitchen4050x2900" so they
    bucket together regardless of punctuation drift between runs.
    """
    return re.sub(r"[^a-z0-9]+", "", (q or "").lower())


def _vote_key(f: dict[str, Any]) -> tuple[int, str]:
    """Bucket key for cross-run voting.

    Prefer the verbatim quote (anchored in real drawing text and stable
    across runs). Fall back to the area description only when no quote
    is present, so unquoted flags don't all collapse into one bucket.
    """
    page = int(f.get("page") or 0)
    quote_sig = _quote_signature(f.get("verbatim_quote"))
    if quote_sig:
        return (page, f"q:{quote_sig}")
    return (page, f"a:{_normalise_area(f.get('area', ''))}")


def _vote_flags(
    runs: list[list[dict[str, Any]]], *, threshold: int
) -> list[dict[str, Any]]:
    """Cross-run consensus voting.

    Bucket every flag by ``_vote_key`` — primarily by (page, normalised
    verbatim_quote). The model labels the same observation with different
    `area` prose and different `category` labels across runs, but the
    verbatim quote (a string copied off the drawing) is much more stable
    — so it's the strongest cross-run anchor we have.

    Within a single run, duplicate keys count once (so a hyperactive run
    can't pad the vote). Keep buckets that appear in >= threshold
    distinct runs; the surviving representative is the highest-confidence
    hit, with ties broken by most-common category within the bucket
    (a soft signal of consensus categorisation).
    """
    threshold = max(1, threshold)
    buckets: dict[tuple[int, str], list[dict[str, Any]]] = defaultdict(list)
    for run in runs:
        seen_in_run: set[tuple[int, str]] = set()
        for f in run:
            key = _vote_key(f)
            if key in seen_in_run:
                continue
            seen_in_run.add(key)
            buckets[key].append(f)

    out: list[dict[str, Any]] = []
    for hits in buckets.values():
        if len(hits) < threshold:
            continue
        cat_counts = Counter(f.get("category") for f in hits)

        def _score(f: dict[str, Any]) -> tuple[int, int]:
            return (
                _CONFIDENCE_RANK.get(f.get("confidence", "low"), 0),
                cat_counts[f.get("category")],
            )

        best = max(hits, key=_score)
        out.append(best)
    return out


# ---------------------------------------------------------------------------
# Bbox normalisation: tile-local → page-relative
# ---------------------------------------------------------------------------


# Page-relative offset/scale per tile. Tiles are quartered so each maps to
# a 0.5×0.5 region of the parent page.
_TILE_TRANSFORM: dict[str, tuple[float, float, float, float]] = {
    # tile_name: (x_offset, y_offset, x_scale, y_scale)
    "top-left":     (0.0, 0.0, 0.5, 0.5),
    "top-right":    (0.5, 0.0, 0.5, 0.5),
    "bottom-left":  (0.0, 0.5, 0.5, 0.5),
    "bottom-right": (0.5, 0.5, 0.5, 0.5),
    "full":         (0.0, 0.0, 1.0, 1.0),
}


def _tile_region(tile: str | None) -> tuple[float, float, float, float]:
    """Coarse page-relative bbox covering the entire tile region."""
    ox, oy, sx, sy = _TILE_TRANSFORM.get(tile or "full", _TILE_TRANSFORM["full"])
    return (ox, oy, ox + sx, oy + sy)


def _normalise_bbox(
    bbox: Any, tile: str | None
) -> tuple[float, float, float, float] | None:
    """Convert a tile-local bbox to page-relative coords, clamped to [0,1].

    Returns None if the bbox is malformed. Callers should fall back to
    `_tile_region(tile)` when they want a coarse region instead.
    """
    if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
        return None
    try:
        x0, y0, x1, y1 = (float(v) for v in bbox)
    except (TypeError, ValueError):
        return None
    # Reject NaN/inf and obviously bad ordering.
    vals = (x0, y0, x1, y1)
    if any(v != v or v in (float("inf"), float("-inf")) for v in vals):
        return None
    # Tolerate swapped corners.
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    # Clamp tile-local coords to [0,1] before mapping.
    x0 = max(0.0, min(1.0, x0))
    y0 = max(0.0, min(1.0, y0))
    x1 = max(0.0, min(1.0, x1))
    y1 = max(0.0, min(1.0, y1))
    if x1 <= x0 or y1 <= y0:
        return None
    ox, oy, sx, sy = _TILE_TRANSFORM.get(tile or "full", _TILE_TRANSFORM["full"])
    return (ox + x0 * sx, oy + y0 * sy, ox + x1 * sx, oy + y1 * sy)


def _attach_page_bbox(flags: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Replace tile-local `bbox` with a page-relative one, falling back to
    the tile region when the model omitted/fumbled the box.
    """
    out: list[dict[str, Any]] = []
    for f in flags:
        tile = f.get("tile") or "full"
        page_bbox = _normalise_bbox(f.get("bbox"), tile)
        if page_bbox is None:
            page_bbox = _tile_region(tile)
            f = {**f, "bbox_source": "tile_fallback"}
        else:
            f = {**f, "bbox_source": "model"}
        f["bbox"] = list(page_bbox)
        out.append(f)
    return out


# ---------------------------------------------------------------------------
# Vision pass (single run; analyse_plan calls this N times for voting)
# ---------------------------------------------------------------------------


def _run_single_vision_pass(
    *,
    settings: Any,
    images: list[bytes],
    captions: list[str],
    prompt: str,
) -> tuple[dict[str, Any], int, int]:
    """One analyser call. Returns (payload, input_tokens, output_tokens)."""
    if settings.plan_analyser_provider == "openrouter":
        result = call_openrouter_tool(
            images=images,
            image_captions=captions,
            prompt=prompt,
            tool_name=_ANALYSIS_TOOL_SCHEMA["name"],
            tool_description=_ANALYSIS_TOOL_SCHEMA["description"],
            tool_parameters=_ANALYSIS_TOOL_SCHEMA["input_schema"],
            max_output_tokens=6000,
            model=settings.openrouter_model,
        )
        return result.payload, result.input_tokens, result.output_tokens

    result = call_gemini_tool(
        images=images,
        image_captions=captions,
        prompt=prompt,
        tool_name=_ANALYSIS_TOOL_SCHEMA["name"],
        tool_description=_ANALYSIS_TOOL_SCHEMA["description"],
        tool_parameters=_ANALYSIS_TOOL_SCHEMA["input_schema"],
        max_output_tokens=6000,
        model=settings.gemini_model,
    )
    return result.payload, result.input_tokens, result.output_tokens


# ---------------------------------------------------------------------------
# Verification pass (FR-3)
# ---------------------------------------------------------------------------


def _verify_flags(
    *,
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

    settings = get_settings()
    captions = [
        f"Image: page {img.page}, tile {img.tile} (rendered at {img.dpi} DPI)."
        for img in images
    ]
    payload: dict[str, Any]
    try:
        if settings.plan_verifier_provider == "openrouter":
            or_result = call_openrouter_tool(
                images=[img.png for img in images],
                image_captions=captions,
                prompt=prompt,
                tool_name=_VERIFICATION_TOOL_SCHEMA["name"],
                tool_description=_VERIFICATION_TOOL_SCHEMA["description"],
                tool_parameters=_VERIFICATION_TOOL_SCHEMA["input_schema"],
                max_output_tokens=2000,
                model=settings.openrouter_verifier_model,
            )
            payload = or_result.payload
            metrics.verification_input_tokens += or_result.input_tokens
            metrics.verification_output_tokens += or_result.output_tokens
        else:
            gemini_result = call_gemini_tool(
                images=[img.png for img in images],
                image_captions=captions,
                prompt=prompt,
                tool_name=_VERIFICATION_TOOL_SCHEMA["name"],
                tool_description=_VERIFICATION_TOOL_SCHEMA["description"],
                tool_parameters=_VERIFICATION_TOOL_SCHEMA["input_schema"],
                max_output_tokens=2000,
                model=settings.gemini_verifier_model,
            )
            payload = gemini_result.payload
            metrics.verification_input_tokens += gemini_result.input_tokens
            metrics.verification_output_tokens += gemini_result.output_tokens
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

    # --- Phase B: vision pass (with N-of-K self-consistency voting) -----
    captions = [
        f"Image: page {img.page}, tile {img.tile} (rendered at {img.dpi} DPI)."
        for img in images
    ]
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
        return _run_single_vision_pass(
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

    # Sum tokens across all runs for honest cost reporting.
    metrics.input_tokens = sum(r[1] for r in results)
    metrics.output_tokens = sum(r[2] for r in results)

    run_flag_lists = [list(r[0].get("flags") or []) for r in results]
    vision_flags = _vote_flags(run_flag_lists, threshold=threshold)

    # Stash per-run pre-vote summaries for post-hoc diagnosis. Keep only
    # the fields needed to explain why voting did or didn't bucket flags
    # together; never surfaced to end users, just queryable from the row.
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
                    "vote_key": list(_vote_key(f)),
                }
                for f in run
            ],
        }
        for idx, run in enumerate(run_flag_lists)
    ]

    # Pick the longest non-empty summary as the canonical narrative.
    summary = max(
        (r[0].get("summary") or "" for r in results), key=len, default=""
    )

    # --- Phase C: dedup vision flags before verification ----------------
    vision_flags = _dedup_flags(vision_flags)
    vision_flags = _attach_page_bbox(vision_flags)

    # --- Phase D: verification pass -------------------------------------
    kept, drops, verification_status, verification_version = _verify_flags(
        images=images, flags=vision_flags, metrics=metrics
    )

    # --- Phase E: merge rule flags + verified flags ---------------------
    merged_flags = _attach_page_bbox(rule_flags) + kept

    # --- Phase F: snap bboxes to PDF text layer where possible ----------
    merged_flags = refine_flag_bboxes(
        file_bytes=file_bytes, media_type=media_type, flags=merged_flags
    )

    # --- Phase G: OCR fallback for flags the text layer didn't find ----
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
