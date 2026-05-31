"""Pre-lodgement building-plan analyser (v2).

Split into submodules by responsibility:

- ``analyzer``    — top-level ``analyse_plan`` entry point.
- ``vote``        — cross-run consensus voting + dedup.
- ``bbox``        — tile-local → page-relative bbox normalisation.
- ``bbox_refiner``— text-layer snap for vision-emitted bboxes.
- ``ocr_refiner`` — OCR fallback for bboxes the text layer didn't find.
- ``overlay``     — annotated-PDF rendering with bbox pins.
- ``flags_store`` — persistence into ``plan_flags``.
- ``prompt``      — plan-specific taxonomy block.

Vision-side pieces (rendering, tool schemas, LLM calls) live under
``app.vision.plans`` and ``app.vision.core``.
"""

from app.plans.analyzer import ANALYSER_VERSION, ANALYSIS_VERSION, analyse_plan
from app.vision.core.renderer import MAX_IMAGE_BYTES, RenderedImage

__all__ = [
    "ANALYSER_VERSION",
    "ANALYSIS_VERSION",
    "MAX_IMAGE_BYTES",
    "RenderedImage",
    "analyse_plan",
]
