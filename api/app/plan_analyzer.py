"""Back-compat shim. The implementation now lives under ``app.plans``.

External callers (``routes/plans.py``, tests, ``eval/plan-flagger``) import
from here. New code should import from ``app.plans`` directly.
"""

from app.plans.analyzer import ANALYSER_VERSION, ANALYSIS_VERSION, analyse_plan
from app.plans.bbox import (
    attach_page_bbox as _attach_page_bbox,
)
from app.plans.bbox import (
    normalise_bbox as _normalise_bbox,
)
from app.plans.bbox import (
    tile_region as _tile_region,
)
from app.plans.render import (
    MAX_IMAGE_BYTES,
    MAX_IMAGES,
    RenderedImage,
)
from app.plans.render import (
    png_bytes as _png_bytes,
)
from app.plans.render import (
    tile_image as _tile_image,
)
from app.plans.vote import (
    dedup_flags as _dedup_flags,
)
from app.plans.vote import (
    vote_flags as _vote_flags,
)
from app.plans.vote import (
    vote_key as _vote_key,
)

__all__ = [
    "ANALYSER_VERSION",
    "ANALYSIS_VERSION",
    "MAX_IMAGES",
    "MAX_IMAGE_BYTES",
    "RenderedImage",
    "_attach_page_bbox",
    "_dedup_flags",
    "_normalise_bbox",
    "_png_bytes",
    "_tile_image",
    "_tile_region",
    "_vote_flags",
    "_vote_key",
    "analyse_plan",
]
