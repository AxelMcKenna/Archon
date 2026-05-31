"""PDF → PNG rendering, adaptive DPI, 2x2 tiling with overlap."""

from __future__ import annotations

import io
from collections.abc import Iterator
from dataclasses import dataclass

import pdfplumber
from PIL import Image

# Anthropic per-image size ceiling is ~5MB base64 encoded; raw PNG must
# stay under ~3.7MB to be safe. We use a slightly tighter threshold.
MAX_IMAGE_BYTES = 3_500_000
# Page classification thresholds (FR-1.1).
HIGH_DETAIL_TEXT_OBJECTS = 500
HIGH_DETAIL_VECTOR_PATHS = 2000
DPI_STANDARD = 200
DPI_HIGH_DETAIL = 300


@dataclass
class RenderedImage:
    page: int
    tile: str  # "full" | "top-left" | "top-right" | "bottom-left" | "bottom-right"
    png: bytes
    dpi: int


def classify_sheet(page: pdfplumber.page.Page) -> str:
    """High-detail (schedules, annotated details) vs standard sheet."""
    text_count = len(page.chars or [])
    vector_count = len(page.curves or []) + len(page.lines or [])
    if text_count > HIGH_DETAIL_TEXT_OBJECTS or vector_count > HIGH_DETAIL_VECTOR_PATHS:
        return "high_detail"
    return "standard"


def png_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def tile_image(image: Image.Image, overlap: float = 0.10) -> dict[str, Image.Image]:
    """Split a PIL image into 2x2 with `overlap` fractional overlap on each side."""
    w, h = image.size
    ox = int(w * overlap / 2)
    oy = int(h * overlap / 2)
    mid_x = w // 2
    mid_y = h // 2

    boxes = {
        "top-left": (0, 0, min(w, mid_x + ox), min(h, mid_y + oy)),
        "top-right": (max(0, mid_x - ox), 0, w, min(h, mid_y + oy)),
        "bottom-left": (0, max(0, mid_y - oy), min(w, mid_x + ox), h),
        "bottom-right": (max(0, mid_x - ox), max(0, mid_y - oy), w, h),
    }
    return {name: image.crop(box) for name, box in boxes.items()}


def render_page(page: pdfplumber.page.Page, dpi: int) -> Image.Image:
    return page.to_image(resolution=dpi).original


@dataclass
class RenderedSheet:
    """One sheet's worth of images: either [full] or 4 tiles."""

    page: int  # 1-based
    sheet_index: int  # 0-based
    images: list[RenderedImage]
    classification: str  # "standard" | "high_detail"


def _render_one_page(
    page: pdfplumber.page.Page, page_num: int
) -> tuple[RenderedSheet, dict[str, int]]:
    classification = classify_sheet(page)
    dpi = DPI_HIGH_DETAIL if classification == "high_detail" else DPI_STANDARD
    breakdown_delta = {
        "standard_pages": 1 if classification == "standard" else 0,
        "high_detail_pages": 1 if classification == "high_detail" else 0,
        "tiled_pages": 0,
    }

    rendered = render_page(page, dpi)
    png = png_bytes(rendered)

    if len(png) <= MAX_IMAGE_BYTES:
        images = [RenderedImage(page=page_num, tile="full", png=png, dpi=dpi)]
        return (
            RenderedSheet(
                page=page_num,
                sheet_index=page_num - 1,
                images=images,
                classification=classification,
            ),
            breakdown_delta,
        )

    breakdown_delta["tiled_pages"] = 1
    images = []
    for tile_name, tile_img in tile_image(rendered).items():
        tile_png = png_bytes(tile_img)
        if len(tile_png) > MAX_IMAGE_BYTES:
            tile_img = tile_img.resize(
                (tile_img.width // 2, tile_img.height // 2),
                Image.LANCZOS,
            )
            tile_png = png_bytes(tile_img)
        images.append(
            RenderedImage(page=page_num, tile=tile_name, png=tile_png, dpi=dpi)
        )
    return (
        RenderedSheet(
            page=page_num,
            sheet_index=page_num - 1,
            images=images,
            classification=classification,
        ),
        breakdown_delta,
    )


def iter_sheets(
    pdf_bytes: bytes,
) -> Iterator[tuple[RenderedSheet, dict[str, int]]]:
    """Yield (sheet, breakdown_delta) one page at a time.

    Streaming so the analyser can process and discard each sheet's image
    bytes without holding the whole document in memory.
    """
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            yield _render_one_page(page, idx)


def render_pages(
    pdf_bytes: bytes,
    *,
    max_images: int | None = None,
) -> tuple[list[RenderedImage], dict[str, int], bool]:
    """Render every page in the PDF. Flat list, no truncation by default.

    Single-shot callers (RFI extractor, VE analyser, supplier datasheet)
    use this. The plan analyser uses ``iter_sheets`` instead so each
    sheet can be processed independently and image bytes released.

    ``max_images`` caps the returned image count (returns
    ``truncated=True`` when hit). Pass it on uploads where unbounded
    vision spend is the wrong default.
    """
    images: list[RenderedImage] = []
    breakdown = {"standard_pages": 0, "high_detail_pages": 0, "tiled_pages": 0}
    truncated = False

    for sheet, delta in iter_sheets(pdf_bytes):
        for key, value in delta.items():
            breakdown[key] += value
        for img in sheet.images:
            if max_images is not None and len(images) >= max_images:
                truncated = True
                return images, breakdown, truncated
            images.append(img)

    return images, breakdown, truncated


def caption_str(rendered: RenderedImage) -> str:
    return (
        f"Image: page {rendered.page}, tile {rendered.tile} "
        f"(rendered at {rendered.dpi} DPI)."
    )
