from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-4-7"
    env: str = "dev"


@lru_cache
def get_settings() -> Settings:
    return Settings()
