"""Sanitise user-supplied filenames before composing storage paths.

Strips directory components, dangerous characters, and over-long names.
Always returns a non-empty string so callers can compose paths without
extra fallbacks.
"""

from __future__ import annotations

import re
from pathlib import PurePosixPath

_BAD_CHARS = re.compile(r"[^A-Za-z0-9._\-]+")
_MAX_LEN = 120


def safe_filename(raw: str | None, *, default: str) -> str:
    """Return a path-traversal-free, storage-safe filename.

    Drops directory components (``../etc/passwd`` → ``passwd``), collapses
    runs of unsafe characters into ``_``, trims to ``_MAX_LEN``, and falls
    back to ``default`` if nothing usable is left.
    """
    name = PurePosixPath((raw or "").replace("\\", "/")).name
    name = _BAD_CHARS.sub("_", name).strip("._")
    if not name:
        return default
    if len(name) > _MAX_LEN:
        # Preserve extension on truncation.
        suffix = PurePosixPath(name).suffix[:16]
        stem = name[: _MAX_LEN - len(suffix)]
        name = f"{stem}{suffix}"
    return name
