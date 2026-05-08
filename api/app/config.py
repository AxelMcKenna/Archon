from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

Provider = Literal["claude", "gemini"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-4-7"
    anthropic_verification_model: str = "claude-haiku-4-5"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.1-pro-preview"

    # Per-touchpoint provider override. Default to Claude; flip individually
    # via env to A/B Gemini against Claude on the same input.
    plan_analyser_provider: Provider = "claude"
    plan_verifier_provider: Provider = "claude"
    rfi_extractor_provider: Provider = "claude"

    env: str = "dev"


@lru_cache
def get_settings() -> Settings:
    return Settings()
