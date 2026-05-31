"""RFI vision extractor.

- ``schema``    — tool schema, prompt filename, extractor version.
- ``extractor`` — service entrypoint: ``extract_via_vision``.
"""

from app.vision.rfi.extractor import extract_via_vision
from app.vision.rfi.schema import EXTRACTOR_VERSION

__all__ = ["EXTRACTOR_VERSION", "extract_via_vision"]
