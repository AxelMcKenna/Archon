"""Pre-lodgement building-plan analyser (v2).

Split into submodules by responsibility:

- ``prompt``     — prompt loading + templating
- ``render``     — PDF → PNG rendering, tiling, adaptive DPI
- ``vote``       — cross-run consensus voting + dedup
- ``bbox``       — tile-local → page-relative bbox normalisation
- ``vision``     — vision + verification LLM calls (tool schemas live here)
- ``analyzer``   — top-level ``analyse_plan`` entry point

Public surface is re-exported from this package and from the back-compat
shim ``app.plan_analyzer``.
"""

from app.plans.analyzer import ANALYSER_VERSION, ANALYSIS_VERSION, analyse_plan
from app.plans.render import MAX_IMAGE_BYTES, MAX_IMAGES, RenderedImage

__all__ = [
    "ANALYSER_VERSION",
    "ANALYSIS_VERSION",
    "MAX_IMAGES",
    "MAX_IMAGE_BYTES",
    "RenderedImage",
    "analyse_plan",
]
