"""Vision-based RFI extraction (FR-1.3).

Primary extractor for scanned PDFs and image uploads. Renders each PDF page
to an image and asks the configured vision model to return structured JSON
via tool use. The deterministic entity extractor (entities.py) populates the
`extracted` block afterwards — the vision model is not asked to do entity
extraction, only layout-aware item segmentation.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.config import get_settings
from app.extractors.entities import extract_entities
from app.extractors.metrics import Metrics
from app.models import CanonicalRfi, ExtractionMeta, RfiItem, RfiLetter
from app.vision.core.invoker import invoke_tool
from app.vision.core.prompts import load_prompt
from app.vision.core.renderer import RenderedImage, caption_str, render_pages
from app.vision.rfi.schema import (
    ACTIVE_PROMPT,
    EXTRACTOR_VERSION,
    RFI_TOOL_SCHEMA,
)


def extract_via_vision(
    file_bytes: bytes,
    *,
    media_type: str,
    project_id: UUID,
    bca: str,
    rfi_id: UUID | None = None,
) -> tuple[CanonicalRfi, Metrics]:
    """Extract a scanned PDF or image upload via vision."""
    rfi_id = rfi_id or uuid4()
    settings = get_settings()
    t0 = time.monotonic()

    prompt, prompt_version = load_prompt(ACTIVE_PROMPT)

    if media_type == "application/pdf":
        # Page count is bounded at the upload boundary (settings.rfi_max_pages),
        # so render every page here without truncating.
        rendered, _, _ = render_pages(file_bytes)
        image_pngs = [img.png for img in rendered]
        captions: list[str] | None = [caption_str(img) for img in rendered]
    else:
        rendered = [RenderedImage(page=1, tile="full", png=file_bytes, dpi=0)]
        image_pngs = [file_bytes]
        captions = None

    provider = settings.rfi_extractor_provider
    model = (
        settings.openrouter_model
        if provider == "openrouter"
        else settings.gemini_model
    )
    payload, input_tokens, output_tokens = invoke_tool(
        provider=provider,
        model=model,
        images=image_pngs,
        image_captions=captions,
        prompt=prompt,
        tool_name=RFI_TOOL_SCHEMA["name"],
        tool_description=RFI_TOOL_SCHEMA["description"],
        tool_parameters=RFI_TOOL_SCHEMA["input_schema"],
        max_output_tokens=8000,
        seed=0,
    )

    items: list[RfiItem] = []
    for idx, raw in enumerate(payload.get("items", []), start=1):
        text = raw["raw_text"]
        items.append(
            RfiItem(
                item_id=f"item-{idx}",
                raw_number=raw.get("raw_number"),
                raw_text=text,
                page=raw.get("page"),
                bbox=None,
                extracted=extract_entities(text),
            )
        )

    canonical = CanonicalRfi(
        rfi_letter=RfiLetter(
            rfi_id=rfi_id,
            project_id=project_id,
            bca=bca,
            application_ref=payload.get("application_ref"),
            rfi_number=payload.get("rfi_number"),
            issue_date=payload.get("issue_date"),
            response_deadline=payload.get("response_deadline"),
            officer_name=payload.get("officer_name"),
            extraction=ExtractionMeta(
                extractor="claude-vision",
                extractor_version=EXTRACTOR_VERSION,
                prompt_version=prompt_version,
                processed_at=datetime.now(UTC),
                warnings=[],
            ),
            items=items,
        )
    )
    metrics = Metrics(
        processing_ms=int((time.monotonic() - t0) * 1000),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
    return canonical, metrics
