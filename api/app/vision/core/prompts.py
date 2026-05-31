"""Markdown prompt loading with frontmatter + ``{{var}}`` substitution."""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "prompts"


@lru_cache
def load_prompt(filename: str) -> tuple[str, str]:
    """Read a prompt file. Returns (body, version) from the frontmatter."""
    raw = (PROMPTS_DIR / filename).read_text(encoding="utf-8")
    fm = re.match(r"---\n(.*?)\n---\n(.*)", raw, re.DOTALL)
    if not fm:
        raise ValueError(f"prompt {filename} missing frontmatter")
    body = fm.group(2)
    version = re.search(r'version:\s*"?([\d.]+)"?', fm.group(1))
    if not version:
        raise ValueError(f"prompt {filename} missing version")
    return body, version.group(1)


def fill(template: str, **kwargs: str) -> str:
    out = template
    for k, v in kwargs.items():
        out = out.replace("{{" + k + "}}", v)
    return out
