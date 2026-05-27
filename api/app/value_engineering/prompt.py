"""Prompt loading for the value-engineering pass.

Reuses ``app.plans.prompt`` helpers — the frontmatter format and
``{{var}}`` substitution are identical.
"""

from __future__ import annotations

from app.plans.prompt import fill, load_prompt

ACTIVE_PROMPT = "value_engineering_v1.md"

__all__ = ["ACTIVE_PROMPT", "fill", "load_prompt"]
