from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

Provider = Literal["gemini", "openrouter"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), extra="ignore")

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""

    # ── Address checklist / geocoding ────────────────────────────────────
    geoapify_api_key: str = ""

    # ── Gemini (direct) ──────────────────────────────────────────────────
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.1-pro-preview"
    gemini_verifier_model: str = "gemini-2.5-flash"

    # ── OpenRouter ───────────────────────────────────────────────────────
    openrouter_api_key: str = ""
    openrouter_model: str = "openai/gpt-5"
    openrouter_verifier_model: str = "openai/gpt-4o-mini"
    openrouter_referer: str = ""

    # Retry/backoff for LLM provider calls. Transient failures (429/5xx/
    # network blips/flaky tool calls) are retried with exponential backoff
    # before the call is allowed to fail.
    llm_max_attempts: int = 3
    # On exhausting retries against the primary provider, fail over to the
    # other provider (OpenRouter <-> Gemini) when its API key is configured.
    # Survives a single-provider outage at the cost of a model swap.
    llm_provider_fallback: bool = True

    # Per-touchpoint provider toggle. Values: gemini | openrouter
    plan_analyser_provider: Provider = "gemini"
    plan_verifier_provider: Provider = "gemini"
    rfi_extractor_provider: Provider = "gemini"
    classifier_provider: Provider = "gemini"
    drafter_provider: Provider = "gemini"
    # CAD analyser routes through OpenRouter by default — keeps using a
    # Gemini-class vision model but bills via OR so we don't trip the
    # Gemini direct free-tier daily quota.
    cad_analyser_provider: Provider = "openrouter"
    cad_analyser_model: str = "google/gemini-3.1-pro-preview"

    # Self-consistency voting on the analyser. N parallel runs; keep flags
    # appearing in >= threshold of them. N=1 short-circuits the threadpool.
    plan_analyser_voting_n: int = 3
    plan_analyser_voting_threshold: int = 2

    # OCR fallback (RapidOCR/PP-OCRv4) for flags whose verbatim_quote isn't
    # in the PDF text layer — typical when CAD vectorises drawing labels.
    # Disable to skip the refinement step (e.g. local dev without OCR
    # wheels available).
    plan_ocr_refiner_enabled: bool = True

    # Shared secret for admin-only ingestion endpoints (POST /admin/ingest/*).
    # Empty default forces the route to 500 in deployments that haven't
    # explicitly set it, so we don't accidentally expose an open trigger.
    admin_ingest_token: str = ""

    env: str = "dev"


@lru_cache
def get_settings() -> Settings:
    return Settings()
