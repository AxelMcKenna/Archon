from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), extra="ignore")

    # OpenRouter (reused from api/)
    openrouter_api_key: str = ""
    openrouter_referer: str = ""

    # Per-role models — one env var per role so we can swap without code changes.
    agent_orchestrator_model: str = "anthropic/claude-sonnet-4.6"
    agent_summarizer_model: str = "google/gemini-2.5-flash"
    agent_utility_model: str = "anthropic/claude-haiku-4.5"

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""

    # Downstream FastAPI
    api_base_url: str = "http://localhost:8000"

    # CORS
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    env: str = "dev"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
