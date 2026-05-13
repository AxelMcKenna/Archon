"""Back-compat shim — moved to ``app.plans.ocr_refiner``."""

from app.plans.ocr_refiner import *  # noqa: F401,F403
from app.plans.ocr_refiner import refine_via_ocr

__all__ = ["refine_via_ocr"]
