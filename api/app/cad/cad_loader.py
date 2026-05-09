"""Load a DXF and emit a compact semantic summary the LLM can reason over.

The vision model never sees raw DXF — it sees a rendered PNG plus this
JSON list of entities keyed by stable ezdxf handles. Flags reference
handles, and we resolve them back to geometry server-side at apply-time.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Any

import ezdxf
from ezdxf.document import Drawing


@dataclass
class EntitySummary:
    handle: str
    type: str
    layer: str
    bbox: tuple[float, float, float, float] | None  # model-space
    extra: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "handle": self.handle,
            "type": self.type,
            "layer": self.layer,
        }
        if self.bbox is not None:
            d["bbox"] = list(self.bbox)
        if self.extra:
            d.update(self.extra)
        return d


_AUTOCAD_CODES = {
    "%%u": "",
    "%%U": "",
    "%%o": "",
    "%%O": "",
    "%%d": "°",
    "%%p": "±",
    "%%c": "⌀",
    "%%%": "%",
}


def _clean_dxf_text(s: str) -> str:
    """Strip AutoCAD inline formatting codes from a TEXT/MTEXT string.

    `%%u`/`%%o` toggle underline/overline (no glyph), `%%d`/`%%p`/`%%c`
    map to degree/plus-minus/diameter symbols. `%%nnn` is ASCII-by-code.
    MTEXT escape sequences (`\\L`, `\\l`, `{\\fArial...}`) are also
    stripped — though `e.plain_text()` handles most of them, defensive
    cleanup catches stragglers.
    """
    if not s:
        return s
    for code, repl in _AUTOCAD_CODES.items():
        s = s.replace(code, repl)
    # %%nnn — ASCII code (3 digits)
    import re

    s = re.sub(r"%%(\d{3})", lambda m: chr(int(m.group(1))), s)
    # MTEXT inline overrides like {\fArial|b0|i0;...} → keep inner text
    s = re.sub(r"\\[A-Za-z][^;]*;", "", s)
    s = s.replace("\\L", "").replace("\\l", "")
    s = s.replace("\\O", "").replace("\\o", "")
    s = s.replace("{", "").replace("}", "")
    return s.strip()


def load_dxf(data: bytes) -> Drawing:
    """Robust load — falls back to ezdxf.recover for messy real-world files
    that mix text and binary chunks."""
    from ezdxf import recover

    try:
        return ezdxf.read(io.StringIO(data.decode("utf-8", errors="replace")))
    except Exception:
        doc, _auditor = recover.read(io.BytesIO(data))
        return doc


def _bbox_of(entity: Any) -> tuple[float, float, float, float] | None:
    """Best-effort bbox in model-space coords."""
    try:
        from ezdxf import bbox as _bbox

        b = _bbox.extents([entity])
        if not b.has_data:
            return None
        return (b.extmin.x, b.extmin.y, b.extmax.x, b.extmax.y)
    except Exception:
        return None


def summarise(doc: Drawing, *, max_entities: int = 1500) -> list[EntitySummary]:
    """Walk modelspace and produce a per-entity summary.

    `max_entities` caps the JSON we send the LLM — a busy DXF can have
    tens of thousands of entities, most of which are noise (hatches,
    individual line segments inside a block). Title-block / label
    entities are kept first so they're never trimmed.
    """
    msp = doc.modelspace()
    summaries: list[EntitySummary] = []

    for e in msp:
        t = e.dxftype()
        layer = getattr(e.dxf, "layer", "") or ""
        handle = e.dxf.handle
        extra: dict[str, Any] = {}

        if t == "LINE":
            s, end = e.dxf.start, e.dxf.end
            extra["start"] = [round(s.x, 3), round(s.y, 3)]
            extra["end"] = [round(end.x, 3), round(end.y, 3)]
            extra["length"] = round(((end.x - s.x) ** 2 + (end.y - s.y) ** 2) ** 0.5, 3)
        elif t == "LWPOLYLINE":
            pts = [(round(p[0], 3), round(p[1], 3)) for p in e.get_points("xy")]
            extra["points"] = pts
            extra["closed"] = bool(e.closed)
        elif t == "POLYLINE":
            pts = [(round(v.dxf.location.x, 3), round(v.dxf.location.y, 3)) for v in e.vertices]
            extra["points"] = pts
        elif t == "CIRCLE":
            extra["center"] = [round(e.dxf.center.x, 3), round(e.dxf.center.y, 3)]
            extra["radius"] = round(e.dxf.radius, 3)
        elif t == "ARC":
            extra["center"] = [round(e.dxf.center.x, 3), round(e.dxf.center.y, 3)]
            extra["radius"] = round(e.dxf.radius, 3)
            extra["start_angle"] = round(e.dxf.start_angle, 2)
            extra["end_angle"] = round(e.dxf.end_angle, 2)
        elif t in ("TEXT", "MTEXT"):
            txt = getattr(e.dxf, "text", None) or getattr(e, "text", "")
            if t == "MTEXT":
                txt = e.plain_text() if hasattr(e, "plain_text") else str(txt)
            extra["text"] = _clean_dxf_text(txt or "")
            ins = getattr(e.dxf, "insert", None)
            if ins is not None:
                extra["insert"] = [round(ins.x, 3), round(ins.y, 3)]
        elif t == "INSERT":
            extra["block"] = e.dxf.name
            ins = e.dxf.insert
            extra["insert"] = [round(ins.x, 3), round(ins.y, 3)]
            extra["scale"] = [
                round(getattr(e.dxf, "xscale", 1.0), 3),
                round(getattr(e.dxf, "yscale", 1.0), 3),
            ]
            extra["rotation"] = round(getattr(e.dxf, "rotation", 0.0), 2)
        elif t == "DIMENSION":
            extra["text"] = (getattr(e.dxf, "text", "") or "").strip()
            extra["measurement"] = round(getattr(e, "measurement", 0.0) or 0.0, 3)
        else:
            # Skip noisy types we don't have a useful summary for.
            if t in {"HATCH", "VIEWPORT", "SOLID", "POINT"}:
                continue

        summaries.append(
            EntitySummary(
                handle=handle,
                type=t,
                layer=layer,
                bbox=_bbox_of(e),
                extra=extra,
            )
        )

    # Sort: text-bearing entities first (they anchor flags), then by handle.
    def _priority(s: EntitySummary) -> tuple[int, str]:
        has_text = "text" in s.extra and bool(s.extra.get("text"))
        return (0 if has_text else 1, s.handle)

    summaries.sort(key=_priority)
    if len(summaries) > max_entities:
        summaries = summaries[:max_entities]
    return summaries


def model_extents(doc: Drawing) -> tuple[float, float, float, float]:
    """Modelspace bbox covering all entities — used to scale renders."""
    from ezdxf import bbox as _bbox

    b = _bbox.extents(doc.modelspace(), fast=True)
    if not b.has_data:
        return (0.0, 0.0, 1000.0, 1000.0)
    return (b.extmin.x, b.extmin.y, b.extmax.x, b.extmax.y)
