import os
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import get_settings


class DebugEnvResponse(BaseModel):
    cwd: str
    env_file_exists: bool
    env_local_file_exists: bool
    geoapify_in_settings: bool
    geoapify_in_os_environ: bool
    geoapify_length: int


router = APIRouter()


@router.get("", response_model=DebugEnvResponse)
async def debug_env() -> DebugEnvResponse:
    settings = get_settings()
    settings_key = settings.geoapify_api_key.strip()
    os_key = os.getenv("GEOAPIFY_API_KEY", "").strip()
    merged = settings_key or os_key
    return DebugEnvResponse(
        cwd=str(Path.cwd()),
        env_file_exists=(Path.cwd() / ".env").exists(),
        env_local_file_exists=(Path.cwd() / ".env.local").exists(),
        geoapify_in_settings=bool(settings_key),
        geoapify_in_os_environ=bool(os_key),
        geoapify_length=len(merged),
    )
