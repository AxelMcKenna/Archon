"""Cross-view reconciliation pass.

For each comparison set produced by :mod:`app.plans.registration`, run one
vision call over just those sheets and ask whether the floor levels / datums
they state agree. Contradictions come back as cross-view flags carrying *two*
citations (one per view), so the resulting RFI points the designer at both
sheets.

This is the third stage of the cross-view slice; it is only invoked when
``plan_cross_view_enabled`` is set. Sets are reconciled in parallel, mirroring
the per-sheet fan-out in the analyser.
"""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from app.config import get_settings
from app.extractors.metrics import Metrics
from app.plans.registration import ComparisonSet
from app.vision.core.invoker import run_tool_pass
from app.vision.core.prompts import fill, load_prompt
from app.vision.core.renderer import RenderedImage, caption_str
from app.vision.plans.schema import ACTIVE_RECONCILIATION_PROMPT, RECONCILIATION_TOOL_SCHEMA

log = logging.getLogger(__name__)

CROSS_VIEW_CATEGORY = "consistency:level_datum"


def _view_records_block(cs: ComparisonSet) -> str:
    return json.dumps(
        [
            {
                "page": v.page,
                "sheet_number": v.sheet_number,
                "view_type": v.view_type,
                "level_id": v.level_id,
                "datums": [
                    {
                        "label": d.get("label"),
                        "value": d.get("value"),
                        "verbatim_quote": d.get("verbatim_quote"),
                    }
                    for d in v.datums
                ],
            }
            for v in cs.views
        ],
        indent=2,
    )


def _citation(d: dict[str, Any], key: str) -> dict[str, Any] | None:
    c = d.get(key)
    if not isinstance(c, dict):
        return None
    quote = str(c.get("verbatim_quote") or "").strip()
    page = c.get("page")
    if not quote or not isinstance(page, int):
        return None
    bbox = c.get("bbox") if isinstance(c.get("bbox"), list) else None
    return {"page": page, "verbatim_quote": quote, "bbox": bbox}


def _to_flag(disc: dict[str, Any], cs: ComparisonSet) -> dict[str, Any] | None:
    """Map one reconciliation discrepancy onto a cross-view flag dict.

    Returns ``None`` (dropped) when either citation is ungrounded, the two
    citations sit on the same page, or a cited page isn't in this set — the
    model occasionally invents a page, and an ungrounded cross-view flag is
    worse than a missed one.
    """
    a = _citation(disc, "citation_a")
    b = _citation(disc, "citation_b")
    if not a or not b:
        return None
    if a["page"] == b["page"]:
        return None
    if a["page"] not in cs.pages or b["page"] not in cs.pages:
        log.info("cross-view: dropping discrepancy citing pages outside the set")
        return None

    by_page = {v.page: v for v in cs.views}
    va, vb = by_page.get(a["page"]), by_page.get(b["page"])
    area = (
        f"{va.view_type if va else '?'} (p{a['page']}) vs "
        f"{vb.view_type if vb else '?'} (p{b['page']}) — {cs.region_label}"
    )
    return {
        "page": a["page"],
        "tile": "full",
        "bbox": a["bbox"],
        "area": area[:200],
        "category": CROSS_VIEW_CATEGORY,
        "severity": disc.get("severity", "must_resolve"),
        "confidence": disc.get("confidence", "medium"),
        "verbatim_quote": a["verbatim_quote"],
        "reason": str(disc.get("reason") or "")[:500],
        "recommended_action": str(disc.get("recommended_action") or "")[:500],
        "source": "cross_view",
        "cross_view": {
            "page_b": b["page"],
            "verbatim_quote_b": b["verbatim_quote"],
            "bbox_b": b["bbox"],
            "link_types": cs.link_types,
            "region_label": cs.region_label,
        },
    }


def reconcile_set(
    cs: ComparisonSet,
    *,
    images_by_page: dict[int, list[RenderedImage]],
    metrics: Metrics,
) -> list[dict[str, Any]]:
    """Run one reconciliation call for a comparison set. Returns cross-view flags."""
    images: list[bytes] = []
    captions: list[str] = []
    for page in cs.pages:
        for img in images_by_page.get(page, []):
            images.append(img.png)
            captions.append(caption_str(img))
    if not images:
        return []

    template, _ = load_prompt(ACTIVE_RECONCILIATION_PROMPT)
    prompt = fill(template, view_records=_view_records_block(cs))

    settings = get_settings()
    try:
        payload, in_t, out_t = run_tool_pass(
            settings=settings,
            schema=RECONCILIATION_TOOL_SCHEMA,
            images=images,
            captions=captions,
            prompt=prompt,
            max_output_tokens=4000,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("cross-view reconciliation failed for %s: %s", cs.region_label, exc)
        return []
    metrics.input_tokens += in_t
    metrics.output_tokens += out_t

    discrepancies = payload.get("discrepancies") or []
    flags = [f for d in discrepancies if (f := _to_flag(d, cs)) is not None]
    return flags


def reconcile_sets(
    sets: list[ComparisonSet],
    *,
    images_by_page: dict[int, list[RenderedImage]],
    metrics: Metrics,
    concurrency: int = 4,
) -> list[dict[str, Any]]:
    """Reconcile every comparison set, in parallel. Returns all cross-view flags."""
    if not sets:
        return []

    def _process(cs: ComparisonSet) -> list[dict[str, Any]]:
        return reconcile_set(cs, images_by_page=images_by_page, metrics=metrics)

    if len(sets) == 1 or concurrency == 1:
        results = [_process(cs) for cs in sets]
    else:
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            results = list(pool.map(_process, sets))
    return [f for batch in results for f in batch]
