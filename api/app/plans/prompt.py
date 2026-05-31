"""Plan-analyser taxonomy block.

Prompt filenames live with their schemas in ``app.vision.plans.schema``;
generic prompt I/O (``load_prompt``, ``fill``) lives in
``app.vision.core.prompts``.
"""

from __future__ import annotations

import json

from app.taxonomy import get_taxonomy


def taxonomy_block() -> str:
    tx = get_taxonomy()
    rows = [
        {"id": c["id"], "label": c["label"], "weight": c.get("weight")}
        for c in tx["categories"]
    ]
    return json.dumps(rows, indent=2)
