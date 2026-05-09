"""Render a DXF to PNGs (one per layout) for vision input + UI display.

The render is deterministic: image pixel dims are exactly `figsize * dpi`,
the data extents are exactly the modelspace bbox plus a fixed margin, and
no tight-bbox trim runs. This means a model-space coordinate maps to a
predictable image pixel — used by the analyser to attach per-flag bboxes
in normalised image coordinates.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from ezdxf import bbox as _bbox  # noqa: E402
from ezdxf.addons.drawing import Frontend, RenderContext  # noqa: E402
from ezdxf.addons.drawing.config import (  # noqa: E402
    BackgroundPolicy,
    ColorPolicy,
    Configuration,
    HatchPolicy,
    LineweightPolicy,
)
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend  # noqa: E402
from ezdxf.document import Drawing  # noqa: E402

PAD_RATIO = 0.05  # 5% margin around content


@dataclass
class ViewInfo:
    name: str
    width: int
    height: int
    extents: tuple[float, float, float, float]  # padded model-space bbox actually rendered


def list_views(doc: Drawing) -> list[str]:
    """Modelspace + any paperspace layout with meaningful native content.

    Paperspace layouts that contain only VIEWPORT entities are skipped —
    they only display modelspace through windows, and rendering them
    standalone produces a wrong-scale or near-blank image.
    """
    views = ["Model"]
    for name in doc.layout_names():
        if name == "Model":
            continue
        layout = doc.layout(name)
        non_viewport = sum(1 for e in layout if e.dxftype() != "VIEWPORT")
        if non_viewport >= 5:
            views.append(name)
    return views


def _layout_for(doc: Drawing, name: str):
    if name == "Model":
        return doc.modelspace()
    return doc.layout(name)


def _content_extents(layout) -> tuple[float, float, float, float]:
    b = _bbox.extents(layout, fast=True)
    if not b.has_data:
        return (0.0, 0.0, 1000.0, 1000.0)
    return (b.extmin.x, b.extmin.y, b.extmax.x, b.extmax.y)


def _padded(extents: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    x0, y0, x1, y1 = extents
    w = max(x1 - x0, 1.0)
    h = max(y1 - y0, 1.0)
    return (x0 - w * PAD_RATIO, y0 - h * PAD_RATIO, x1 + w * PAD_RATIO, y1 + h * PAD_RATIO)


def view_extents(doc: Drawing, view_name: str) -> tuple[float, float, float, float]:
    """Padded extents the view would render at — same value render_view uses."""
    return _padded(_content_extents(_layout_for(doc, view_name)))


def render_view(
    doc: Drawing,
    view_name: str,
    *,
    dpi: int = 200,
    target_max_dim: int = 3200,
) -> tuple[bytes, ViewInfo]:
    """Render one layout to PNG with deterministic data→pixel mapping."""
    layout = _layout_for(doc, view_name)
    ext = _padded(_content_extents(layout))
    x0, y0, x1, y1 = ext
    w_data = x1 - x0
    h_data = y1 - y0
    aspect = w_data / h_data if h_data else 1.0

    if aspect >= 1:
        fig_w_in = target_max_dim / dpi
        fig_h_in = fig_w_in / aspect
    else:
        fig_h_in = target_max_dim / dpi
        fig_w_in = fig_h_in * aspect

    fig, ax = plt.subplots(figsize=(fig_w_in, fig_h_in), dpi=dpi)
    fig.patch.set_facecolor("#fbfaf6")
    ax.set_facecolor("#fbfaf6")
    ctx = RenderContext(doc)
    cfg = Configuration(
        background_policy=BackgroundPolicy.CUSTOM,
        custom_bg_color="#fbfaf6",
        color_policy=ColorPolicy.CUSTOM,
        custom_fg_color="#1f2937",  # ink-900-ish
        lineweight_policy=LineweightPolicy.ABSOLUTE,
        lineweight_scaling=0.25,
        min_lineweight=1,
        hatch_policy=HatchPolicy.SHOW_OUTLINE,
    )
    backend = MatplotlibBackend(ax)
    Frontend(ctx, backend, config=cfg).draw_layout(layout, finalize=True)

    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.set_aspect("equal", adjustable="box")
    ax.set_axis_off()
    fig.subplots_adjust(left=0, right=1, top=1, bottom=0)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, pad_inches=0)
    plt.close(fig)
    png = buf.getvalue()

    width_px = int(round(fig_w_in * dpi))
    height_px = int(round(fig_h_in * dpi))
    return png, ViewInfo(name=view_name, width=width_px, height=height_px, extents=ext)


def model_to_norm_bbox(
    extents: tuple[float, float, float, float],
    model_bbox: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    """Map a model-space bbox into normalised image coords (top-left origin)."""
    ex0, ey0, ex1, ey1 = extents
    mx0, my0, mx1, my1 = model_bbox
    w = max(ex1 - ex0, 1e-9)
    h = max(ey1 - ey0, 1e-9)
    nx0 = (mx0 - ex0) / w
    nx1 = (mx1 - ex0) / w
    # y flips: top of image = max model y
    ny0 = (ey1 - my1) / h
    ny1 = (ey1 - my0) / h
    return (
        max(0.0, min(1.0, nx0)),
        max(0.0, min(1.0, ny0)),
        max(0.0, min(1.0, nx1)),
        max(0.0, min(1.0, ny1)),
    )
