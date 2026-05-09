from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

Provider = Literal["gemini", "openrouter"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.1-pro-preview"
    gemini_verifier_model: str = "gemini-2.5-flash"

    openrouter_api_key: str = ""
    openrouter_model: str = "openai/gpt-5"
    openrouter_verifier_model: str = "openai/gpt-4o-mini"
    openrouter_referer: str = ""

    # Per-touchpoint provider toggle. Values: gemini | openrouter
    plan_analyser_provider: Provider = "gemini"
    plan_verifier_provider: Provider = "gemini"
    rfi_extractor_provider: Provider = "gemini"
    classifier_provider: Provider = "gemini"
    drafter_provider: Provider = "gemini"

    # Self-consistency voting on the analyser. N parallel runs; keep flags
    # appearing in >= threshold of them. N=1 short-circuits the threadpool.
    plan_analyser_voting_n: int = 3
    plan_analyser_voting_threshold: int = 2

    # OCR fallback (RapidOCR/PP-OCRv4) for flags whose verbatim_quote isn't
    # in the PDF text layer — typical when CAD vectorises drawing labels.
    # Disable to skip the refinement step (e.g. local dev without OCR
    # wheels available).
    plan_ocr_refiner_enabled: bool = True

    env: str = "dev"


@lru_cache
def get_settings() -> Settings:
    return Settings()
