"""Production redline overlay for analysed building plans.

Two output modes:

- ``render_page`` returns a plain PNG of one page (no overlay) — used by the
  inline UI which then positions HTML bboxes over it.
- ``render_overlay_pdf`` returns a multi-page PDF with bboxes + numbered pins
  baked in — used for downloads and sharing.

The renderer also reports each page's dimensions so the UI can size its
overlay layer correctly.
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import Any

import pdfplumber
from PIL import Image, ImageDraw, ImageFont

OVERLAY_DPI = 150
# Visual breathing room around each bbox rectangle, in rendered pixels.
# Keeps the data bbox unchanged but pads the drawn rectangle so text
# ascenders/descenders inside the box don't touch the border. ~1mm at
# 150 DPI feels right.
_RECT_VISUAL_PAD_PX = 8

# Severity → (rect colour, pin fill colour)
_SEV_COLOURS: dict[str, tuple[tuple[int, int, int], tuple[int, int, int]]] = {
    "must_resolve": ((220, 38, 38), (220, 38, 38)),     # red
    "nice_to_have": ((217, 119, 6), (217, 119, 6)),     # amber
}


@dataclass
class PageInfo:
    page: int
    width: int
    height: int


# ---------------------------------------------------------------------------
# Public renderers
# ---------------------------------------------------------------------------


def get_page_info(*, file_bytes: bytes, media_type: str) -> list[PageInfo]:
    """Return rendered page dimensions (at OVERLAY_DPI) so the UI can scale."""
    pages: list[PageInfo] = []
    if media_type == "application/pdf":
        with pdfplumber.open(BytesIO(file_bytes)) as pdf:
            for idx, page in enumerate(pdf.pages, start=1):
                img = page.to_image(resolution=OVERLAY_DPI).original
                pages.append(PageInfo(page=idx, width=img.width, height=img.height))
    else:
        img = Image.open(BytesIO(file_bytes))
        pages.append(PageInfo(page=1, width=img.width, height=img.height))
    return pages


def render_page(*, file_bytes: bytes, media_type: str, page: int) -> bytes:
    """Render a single page as PNG bytes — no overlay."""
    img = _render_page_image(file_bytes=file_bytes, media_type=media_type, page=page)
    out = BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()


def render_overlay_pdf(
    *,
    file_bytes: bytes,
    media_type: str,
    flags: list[dict[str, Any]],
) -> bytes:
    """Multi-page PDF with bboxes + numbered pins drawn on each page."""
    numbered = list(enumerate(flags, start=1))
    by_page: dict[int, list[tuple[int, dict[str, Any]]]] = {}
    for n, f in numbered:
        p = int(f.get("page") or 1)
        by_page.setdefault(p, []).append((n, f))

    images: list[Image.Image] = []
    if media_type == "application/pdf":
        with pdfplumber.open(BytesIO(file_bytes)) as pdf:
            for idx, page in enumerate(pdf.pages, start=1):
                img = page.to_image(resolution=OVERLAY_DPI).original.convert("RGB")
                _draw_overlay(img, by_page.get(idx, []))
                images.append(img)
    else:
        img = Image.open(BytesIO(file_bytes)).convert("RGB")
        _draw_overlay(img, by_page.get(1, []))
        images.append(img)

    if not images:
        raise ValueError("no pages rendered")

    out = BytesIO()
    images[0].save(
        out,
        format="PDF",
        save_all=True,
        append_images=images[1:],
        resolution=OVERLAY_DPI,
    )
    return out.getvalue()


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _render_page_image(
    *, file_bytes: bytes, media_type: str, page: int
) -> Image.Image:
    if media_type == "application/pdf":
        with pdfplumber.open(BytesIO(file_bytes)) as pdf:
            if page < 1 or page > len(pdf.pages):
                raise ValueError(f"page {page} out of range (1..{len(pdf.pages)})")
            return (
                pdf.pages[page - 1]
                .to_image(resolution=OVERLAY_DPI)
                .original.convert("RGB")
            )
    if page != 1:
        raise ValueError("non-PDF uploads have a single page")
    return Image.open(BytesIO(file_bytes)).convert("RGB")


def _load_font(px: int) -> ImageFont.ImageFont:
    for path in (
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ):
        try:
            return ImageFont.truetype(path, px)
        except OSError:
            continue
    return ImageFont.load_default()


def _draw_dashed_rect(
    draw: ImageDraw.ImageDraw,
    rect: tuple[float, float, float, float],
    *,
    colour: tuple[int, int, int, int],
    width: int,
    dash: int = 12,
    gap: int = 8,
) -> None:
    """Pillow has no native dashed stroke; we segment each side ourselves."""
    x0, y0, x1, y1 = rect
    sides = [
        ((x0, y0), (x1, y0)),  # top
        ((x1, y0), (x1, y1)),  # right
        ((x0, y1), (x1, y1)),  # bottom
        ((x0, y0), (x0, y1)),  # left
    ]
    step = dash + gap
    for (sx, sy), (ex, ey) in sides:
        length = ((ex - sx) ** 2 + (ey - sy) ** 2) ** 0.5
        if length <= 0:
            continue
        ux, uy = (ex - sx) / length, (ey - sy) / length
        dist = 0.0
        while dist < length:
            seg_end = min(dist + dash, length)
            draw.line(
                (sx + ux * dist, sy + uy * dist, sx + ux * seg_end, sy + uy * seg_end),
                fill=colour,
                width=width,
            )
            dist += step


def _draw_overlay(
    img: Image.Image, flags: list[tuple[int, dict[str, Any]]]
) -> None:
    """Draw severity-coloured rectangles + numbered pins onto `img` in place."""
    if not flags:
        return
    draw = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    pin_radius = max(14, w // 90)
    pin_font = _load_font(int(pin_radius * 1.2))

    for n, f in flags:
        bbox = f.get("bbox")
        if not (isinstance(bbox, (list, tuple)) and len(bbox) == 4):
            continue
        try:
            x0, y0, x1, y1 = (float(v) for v in bbox)
        except (TypeError, ValueError):
            continue
        # Inflate the drawn rect by a small visual pad so text inside
        # the bbox doesn't touch the rectangle border. The data bbox
        # stays unchanged; this is presentation-only.
        pad = _RECT_VISUAL_PAD_PX
        rect = (
            max(0, x0 * w - pad),
            max(0, y0 * h - pad),
            min(w, x1 * w + pad),
            min(h, y1 * h + pad),
        )

        severity = f.get("severity", "must_resolve")
        rect_rgb, pin_rgb = _SEV_COLOURS.get(severity, _SEV_COLOURS["must_resolve"])
        is_fallback = f.get("bbox_source") == "tile_fallback"

        outline = (*rect_rgb, 255)
        fill = (*rect_rgb, 30)
        # Translucent fill always; outline differs (solid vs dashed).
        draw.rectangle(rect, fill=fill)
        if is_fallback:
            _draw_dashed_rect(draw, rect, colour=outline, width=3)
        else:
            draw.rectangle(rect, outline=outline, width=4)

        # Numbered pin anchored to the top-left corner, nudged outside.
        cx = rect[0] - 4
        cy = rect[1] - 4
        # Keep pin on-canvas.
        cx = max(pin_radius + 2, cx)
        cy = max(pin_radius + 2, cy)
        pin_box = (
            cx - pin_radius,
            cy - pin_radius,
            cx + pin_radius,
            cy + pin_radius,
        )
        draw.ellipse(pin_box, fill=(*pin_rgb, 255), outline=(255, 255, 255, 255), width=2)
        label = str(n)
        text_box = draw.textbbox((0, 0), label, font=pin_font)
        tw = text_box[2] - text_box[0]
        th = text_box[3] - text_box[1]
        draw.text(
            (cx - tw / 2 - text_box[0], cy - th / 2 - text_box[1]),
            label,
            fill=(255, 255, 255, 255),
            font=pin_font,
        )
