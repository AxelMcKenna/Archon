"""PDF → PNG rendering, adaptive DPI, 2x2 tiling with overlap."""

from __future__ import annotations

import base64
import io
from dataclasses import dataclass
from typing import Any

import pdfplumber
from PIL import Image

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


def render_pages(
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
            classification = classify_sheet(page)
            dpi = DPI_HIGH_DETAIL if classification == "high_detail" else DPI_STANDARD
            if classification == "high_detail":
                breakdown["high_detail_pages"] += 1
            else:
                breakdown["standard_pages"] += 1

            rendered = render_page(page, dpi)
            png = png_bytes(rendered)

            if len(png) <= MAX_IMAGE_BYTES:
                if len(images) >= max_images:
                    truncated = True
                    break
                images.append(
                    RenderedImage(page=idx, tile="full", png=png, dpi=dpi)
                )
                continue

            breakdown["tiled_pages"] += 1
            tiles = tile_image(rendered)
            for tile_name, tile_img in tiles.items():
                if len(images) >= max_images:
                    truncated = True
                    break
                tile_png = png_bytes(tile_img)
                if len(tile_png) > MAX_IMAGE_BYTES:
                    tile_img = tile_img.resize(
                        (tile_img.width // 2, tile_img.height // 2),
                        Image.LANCZOS,
                    )
                    tile_png = png_bytes(tile_img)
                images.append(
                    RenderedImage(
                        page=idx, tile=tile_name, png=tile_png, dpi=dpi
                    )
                )
            if truncated:
                break

    return images, breakdown, truncated


def image_block(rendered: RenderedImage) -> dict[str, Any]:
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": base64.b64encode(rendered.png).decode("ascii"),
        },
    }


def image_caption(rendered: RenderedImage) -> dict[str, Any]:
    label = (
        f"Image: page {rendered.page}, tile {rendered.tile} "
        f"(rendered at {rendered.dpi} DPI)."
    )
    return {"type": "text", "text": label}


def caption_str(rendered: RenderedImage) -> str:
    return (
        f"Image: page {rendered.page}, tile {rendered.tile} "
        f"(rendered at {rendered.dpi} DPI)."
    )
