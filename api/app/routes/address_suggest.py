import logging

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.utils.geocoding import suggest_addresses


class AddressSuggestion(BaseModel):
    display_name: str
    lat: str | None = None
    lon: str | None = None


class AddressSuggestResponse(BaseModel):
    suggestions: list[AddressSuggestion]


router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("", response_model=AddressSuggestResponse)
async def address_suggest(
    q: str = Query(min_length=3),
    limit: int = Query(default=6, ge=1, le=10),
) -> AddressSuggestResponse:
    suggestions = await suggest_addresses(q, limit)
    logger.info("address_suggest q=%r limit=%s suggestions=%s", q, limit, len(suggestions))
    return AddressSuggestResponse(
        suggestions=[AddressSuggestion(**item) for item in suggestions]
    )
