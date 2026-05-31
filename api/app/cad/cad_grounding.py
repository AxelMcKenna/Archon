"""Shared CAD grounding helpers used by both the RFI flagger and the
value-engineering pass.

The capability both features need is the same: rasterize a DXF's layouts,
hand the model a slim entity list, then turn the handles the model points
at back into per-view overlay boxes via geometric projection (not pixel
guesses). Centralised here so RFI (``app.cad.cad_analyzer``) and VE
(``app.vision.value_engineering``) stay in lock-step.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from app.cad.cad_render import list_views, model_to_norm_bbox, render_view

# Slim entity projection for the LLM — drop bulky fields (bbox, point arrays)
# so the prompt stays well under the window. Text-bearing entities are already
# at the front of the summarised list (see ``cad_loader.summarise``).
_LLM_KEEP = {"handle", "type", "layer", "text", "length", "block", "rotation"}
_DEFAULT_ENTITY_LIMIT = 400
_TEXT_CLIP = 120


def summarise_for_llm(
    entities: list[dict[str, Any]],
    *,
    keep: set[str] = _LLM_KEEP,
    limit: int = _DEFAULT_ENTITY_LIMIT,
    text_clip: int = _TEXT_CLIP,
) -> list[dict[str, Any]]:
    """Cap + slim entities for inclusion in a prompt."""
    out: list[dict[str, Any]] = []
    for e in entities[:limit]:
        slim = {k: v for k, v in e.items() if k in keep}
        if isinstance(slim.get("text"), str):
            slim["text"] = slim["text"][:text_clip]
        out.append(slim)
    return out


def index_bbox_by_handle(
    entities: list[dict[str, Any]],
) -> dict[str, tuple[float, float, float, float]]:
    """Map each entity handle to its model-space bbox (x0, y0, x1, y1)."""
    out: dict[str, tuple[float, float, float, float]] = {}
    for e in entities:
        bb = e.get("bbox")
        if isinstance(bb, list) and len(bb) == 4:
            out[e["handle"]] = (float(bb[0]), float(bb[1]), float(bb[2]), float(bb[3]))
    return out


def build_text_index(entities: list[dict[str, Any]]) -> list[tuple[str, str]]:
    """List of (handle, lowercased text) for text-bearing entities."""
    return [
        (e["handle"], (e.get("text") or "").strip().lower())
        for e in entities
        if isinstance(e.get("text"), str) and e.get("text", "").strip()
    ]


def recover_handles_from_quote(
    quote: str, text_index: list[tuple[str, str]], *, limit: int = 3
) -> list[str]:
    """Fall back to text matching when the model cites no valid handles.

    Substring match in either direction tolerates abbreviations and noise.
    """
    q = (quote or "").strip().lower()
    if len(q) < 4:
        return []
    hits = [h for h, t in text_index if t and (q in t or t in q)]
    return hits[:limit]


@dataclass
class RenderedViews:
    images: list[bytes] = field(default_factory=list)
    captions: list[str] = field(default_factory=list)
    views: list[dict[str, Any]] = field(default_factory=list)  # [{name, width, height}]
    extents_by_name: dict[str, tuple[float, float, float, float]] = field(
        default_factory=dict
    )


def render_views(
    doc: Any, *, max_views: int | None = None, caption_suffix: str = ""
) -> RenderedViews:
    """Render every (or the first ``max_views``) layout to PNG.

    Returns the images + captions for the vision pass alongside the view
    metadata and padded model extents needed to project overlays.
    """
    out = RenderedViews()
    names = list_views(doc)
    if max_views is not None:
        names = names[:max_views]
    for name in names:
        try:
            png, info = render_view(doc, name)
        except Exception:
            continue
        out.images.append(png)
        out.captions.append(f"View: {name}{caption_suffix}")
        out.views.append({"name": info.name, "width": info.width, "height": info.height})
        out.extents_by_name[info.name] = info.extents
    return out


def image_bboxes_for_handles(
    target_handles: list[str],
    bbox_by_handle: dict[str, tuple[float, float, float, float]],
    extents_by_name: dict[str, tuple[float, float, float, float]],
) -> dict[str, list[float]] | None:
    """Project a set of targeted handles into normalised per-view overlay boxes.

    Unions the model-space bboxes of the targeted handles, pads point-like
    boxes (single text inserts) so they render as visible/clickable rectangles,
    then maps the union into each view's image coordinates. Returns ``None``
    when none of the handles have a known bbox.
    """
    target_bboxes = [bbox_by_handle[h] for h in target_handles if h in bbox_by_handle]
    if not target_bboxes:
        return None
    mx0 = min(b[0] for b in target_bboxes)
    my0 = min(b[1] for b in target_bboxes)
    mx1 = max(b[2] for b in target_bboxes)
    my1 = max(b[3] for b in target_bboxes)

    image_bboxes: dict[str, list[float]] = {}
    for view_name, ext in extents_by_name.items():
        vw = max(ext[2] - ext[0], 1e-9)
        vh = max(ext[3] - ext[1], 1e-9)
        pad_x = vw * 0.01 if (mx1 - mx0) < vw * 0.005 else 0
        pad_y = vh * 0.01 if (my1 - my0) < vh * 0.005 else 0
        norm = model_to_norm_bbox(
            ext, (mx0 - pad_x, my0 - pad_y, mx1 + pad_x, my1 + pad_y)
        )
        image_bboxes[view_name] = list(norm)
    return image_bboxes


@dataclass
class GroundedDXF:
    """A loaded + indexed DXF ready for a handle-grounded vision pass.

    Bundles everything both the RFI and VE CAD analysers build identically:
    the parsed doc, the slimmed entity list for the prompt, the bbox/text
    indexes used to ground + recover handles, and the rendered views.
    """

    doc: Any
    entities: list[dict[str, Any]]
    valid_handles: set[str]
    entities_for_llm: list[dict[str, Any]]
    bbox_by_handle: dict[str, tuple[float, float, float, float]]
    text_index: list[tuple[str, str]]
    rendered: RenderedViews

    def entity_list_block(self) -> str:
        """The ``## Entity list`` prompt section appended to the CAD prompt."""
        return (
            "\n\n## Entity list (first 400, text-bearing first)\n\n"
            "```json\n" + json.dumps(self.entities_for_llm) + "\n```\n"
        )


def load_and_index_dxf(
    dxf_bytes: bytes, *, max_views: int | None = None, caption_suffix: str = ""
) -> GroundedDXF:
    """Parse a DXF, build the grounding indexes, and render its views.

    The shared front half of both CAD analysers (RFI ``cad_analyzer`` and VE
    ``analyse_value_engineering_cad``) — they diverge only in the prompt,
    schema, and how they post-process the model's output.
    """
    from app.cad.cad_loader import load_dxf, summarise

    doc = load_dxf(dxf_bytes)
    entities = [e.to_dict() for e in summarise(doc)]
    rendered = render_views(doc, max_views=max_views, caption_suffix=caption_suffix)
    return GroundedDXF(
        doc=doc,
        entities=entities,
        valid_handles={e["handle"] for e in entities},
        entities_for_llm=summarise_for_llm(entities),
        bbox_by_handle=index_bbox_by_handle(entities),
        text_index=build_text_index(entities),
        rendered=rendered,
    )


def ground_item_handles(
    item: dict[str, Any],
    grounded: GroundedDXF,
    *,
    quote_fields: Sequence[str],
    recovery_marker: str | None = None,
) -> bool:
    """Resolve an item's ``target_handles`` against the DXF and attach overlays.

    Keeps the handles the model cited that actually exist; if none survive,
    falls back to text-matching the first non-empty ``quote_fields`` value.
    Mutates ``item`` in place (sets ``target_handles`` and, when projectable,
    ``image_bboxes``). Returns True if the item ended up grounded to at least
    one valid handle.

    Callers decide what to do with un-grounded items: the RFI flagger drops
    them, VE keeps them (they simply render without an overlay box).
    """
    targets = [h for h in (item.get("target_handles") or []) if h in grounded.valid_handles]
    if not targets:
        quote = next(
            (str(item.get(f) or "") for f in quote_fields if item.get(f)), ""
        )
        recovered = recover_handles_from_quote(quote, grounded.text_index)
        if recovered:
            targets = recovered
            if recovery_marker:
                item[recovery_marker] = "quote_match"
    item["target_handles"] = targets
    if not targets:
        return False
    image_bboxes = image_bboxes_for_handles(
        targets, grounded.bbox_by_handle, grounded.rendered.extents_by_name
    )
    if image_bboxes:
        item["image_bboxes"] = image_bboxes
    return True
