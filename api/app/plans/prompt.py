"""Prompt loading + lightweight templating for the plan analyser."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

from app.taxonomy import get_taxonomy

PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent / "prompts"
ACTIVE_PROMPT = "plan_analyser_v2.md"
ACTIVE_VERIFICATION_PROMPT = "plan_verification_v1.md"


@lru_cache
def load_prompt(filename: str) -> tuple[str, str]:
    raw = (PROMPTS_DIR / filename).read_text(encoding="utf-8")
    fm = re.match(r"---\n(.*?)\n---\n(.*)", raw, re.DOTALL)
    if not fm:
        raise ValueError(f"prompt {filename} missing frontmatter")
    body = fm.group(2)
    version = re.search(r'version:\s*"?([\d.]+)"?', fm.group(1))
    if not version:
        raise ValueError(f"prompt {filename} missing version")
    return body, version.group(1)


def taxonomy_block() -> str:
    tx = get_taxonomy()
    rows = [
        {"id": c["id"], "label": c["label"], "weight": c.get("weight")}
        for c in tx["categories"]
    ]
    return json.dumps(rows, indent=2)


def fill(template: str, **kwargs: str) -> str:
    out = template
    for k, v in kwargs.items():
        out = out.replace("{{" + k + "}}", v)
    return out
