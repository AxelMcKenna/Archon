"""Per-item response drafter (FR-3.1, FR-3.2).

Versioned prompt; tool-use for structured output via the configured
provider (gemini or openrouter). Caches by item + category + prompt
version.
"""

from __future__ import annotations

import hashlib
import re
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.extractors.metrics import Metrics
from app.llm.gemini import call_gemini_tool
from app.llm.openrouter import call_openrouter_tool

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
ACTIVE_PROMPT = "drafter_v2.md"


def _render_plan_evidence_block(plan_evidence: dict[str, Any] | None) -> str:
    """Format the evidence row for the prompt's `{{plan_evidence_block}}` slot.

    Three shapes ('flag', 'vision', 'none') so the model can branch its tone
    and grounding behaviour without us forking the prompt template.
    """
    if not plan_evidence:
        return (
            "**Source: NO MATCH** — no linked plan, or the linked plan was "
            "not analysed before the RFI arrived. Treat per the NO MATCH rules."
        )

    source = plan_evidence.get("source", "none")
    if source == "none":
        reason = plan_evidence.get("rationale") or "no flag above threshold"
        return (
            f"**Source: NO MATCH** — {reason}. Treat per the NO MATCH rules."
        )
    if source == "vision":
        return (
            "**Source: VISION-LOCATED** — Stage B vision retrieval is not "
            "yet wired. Treat as NO MATCH for now."
        )

    # source == "flag"
    ev = plan_evidence.get("evidence") or {}
    rule = ev.get("rule_cited") or "(unknown clause)"
    rationale = ev.get("rationale") or "(no rationale recorded)"
    quote = ev.get("verbatim_quote")
    handles = ev.get("target_handles") or []
    page = ev.get("page")
    proposed = ev.get("proposed_change")
    plan_format = plan_evidence.get("plan_format")
    plan_filename = plan_evidence.get("plan_filename")

    location_bits: list[str] = []
    if plan_format == "dxf" and handles:
        location_bits.append(f"DXF entity handle(s) {', '.join(handles)}")
    if page is not None:
        location_bits.append(f"page {page}")
    if quote:
        location_bits.append(f'plan text "{quote}"')
    location = "; ".join(location_bits) or "(location not recorded)"

    fix_line = ""
    if proposed:
        op = proposed.get("op", "(no op)")
        if op == "place_symbol":
            sym = proposed.get("symbol", "(symbol)")
            anchor = proposed.get("anchor_handle", "(anchor)")
            fix_line = (
                f"Proposed fix (already specified by the analyser): place a "
                f"`{sym}` symbol anchored at handle {anchor}."
            )
        elif op == "add_text_note":
            text = proposed.get("text", "(text)")
            anchor = proposed.get("anchor_handle", "(anchor)")
            fix_line = (
                f'Proposed fix: add the note "{text}" near handle {anchor}.'
            )
        else:
            fix_line = f"Proposed fix op: `{op}` (see evidence for details)."

    confidence = plan_evidence.get("confidence")
    conf_str = f"{confidence:.2f}" if isinstance(confidence, int | float) else "?"

    file_line = ""
    if plan_filename:
        file_line = (
            f"Plan referenced: {plan_filename} ({plan_format or '?'})"
        )

    return "\n".join(
        line
        for line in [
            "**Source: FLAG-MATCHED** (Stage A retrieval).",
            file_line,
            f"Matched clause: {rule}.",
            f"Located on plan: {location}.",
            f"Analyser rationale: {rationale}",
            fix_line,
            f"Match confidence: {conf_str}.",
            "",
            "Apply the FLAG-MATCHED rules — ground every claim in the above.",
        ]
        if line
    )

_TOOL_SCHEMA: dict[str, Any] = {
    "name": "record_draft",
    "description": "Record the drafted RFI response.",
    "input_schema": {
        "type": "object",
        "required": ["draft_text"],
        "properties": {
            "draft_text": {
                "type": "string",
                "minLength": 60,
                "description": "Markdown body. May contain [ATTACH: …] placeholders.",
            },
        },
    },
}


@lru_cache
def _load_prompt(name: str) -> tuple[str, str]:
    raw = (PROMPTS_DIR / name).read_text(encoding="utf-8")
    fm = re.match(r"---\n(.*?)\n---\n(.*)", raw, re.DOTALL)
    if not fm:
        raise ValueError(f"Prompt {name} missing frontmatter")
    body = fm.group(2)
    version_match = re.search(r'version:\s*"?([\d.]+)"?', fm.group(1))
    if not version_match:
        raise ValueError(f"Prompt {name} missing version")
    return body, version_match.group(1)


def _fill(template: str, **kwargs: str) -> str:
    out = template
    for k, v in kwargs.items():
        out = out.replace("{{" + k + "}}", v)
    return out


_DRAFT_CACHE: dict[str, tuple[str, str]] = {}


def draft_response(
    *,
    bca: str,
    project_type: str,
    project_description: str,
    application_ref: str | None,
    rfi_number: int | None,
    item_text: str,
    category: str,
    severity: str,
    reasoning: str,
    acceptable_solution: str | None,
    plan_evidence: dict[str, Any] | None = None,
) -> tuple[str, str, Metrics]:
    """Returns (draft_text, prompt_version, metrics)."""
    template, version = _load_prompt(ACTIVE_PROMPT)
    evidence_block = _render_plan_evidence_block(plan_evidence)
    # Cache key includes the evidence source so re-grounded items get
    # re-drafted (a flag match should not return a previously cached
    # NO MATCH draft).
    evidence_source = (plan_evidence or {}).get("source", "absent")
    evidence_flag_idx = (plan_evidence or {}).get("flag_index", "")
    cache_key = hashlib.sha256(
        f"{item_text}|{category}|{bca}|{project_type}|{version}|{evidence_source}|{evidence_flag_idx}".encode()
    ).hexdigest()
    if cache_key in _DRAFT_CACHE:
        cached, ver = _DRAFT_CACHE[cache_key]
        return cached, ver, Metrics()

    settings = get_settings()

    prompt = _fill(
        template,
        bca=bca,
        project_type=project_type,
        project_description=project_description or "(none provided)",
        application_ref=application_ref or "(not yet lodged)",
        rfi_number=str(rfi_number or "?"),
        item_text=item_text,
        category=category,
        severity=severity,
        reasoning=reasoning or "(none)",
        acceptable_solution=acceptable_solution or "(none for this category)",
        plan_evidence_block=evidence_block,
    )

    t0 = time.monotonic()
    if settings.drafter_provider == "openrouter":
        result = call_openrouter_tool(
            images=[],
            prompt=prompt,
            tool_name=_TOOL_SCHEMA["name"],
            tool_description=_TOOL_SCHEMA["description"],
            tool_parameters=_TOOL_SCHEMA["input_schema"],
            max_output_tokens=2000,
            model=settings.openrouter_model,
        )
    else:
        result = call_gemini_tool(
            images=[],
            prompt=prompt,
            tool_name=_TOOL_SCHEMA["name"],
            tool_description=_TOOL_SCHEMA["description"],
            tool_parameters=_TOOL_SCHEMA["input_schema"],
            max_output_tokens=2000,
            model=settings.gemini_model,
        )

    draft = result.payload.get("draft_text")
    if not draft:
        raise RuntimeError("Drafter returned no draft_text")
    _DRAFT_CACHE[cache_key] = (draft, version)
    metrics = Metrics(
        processing_ms=int((time.monotonic() - t0) * 1000),
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )
    return draft, version, metrics
