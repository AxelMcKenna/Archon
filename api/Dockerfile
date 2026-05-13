FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH=/app/.venv/bin:/root/.local/bin:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libgl1 libglib2.0-0 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11.12 /uv /usr/local/bin/uv

WORKDIR /app

# Build context must be the repo root so we can pull in `shared/` (used by
# app/taxonomy.py via Path(__file__).parent.parent.parent / "shared").
# Build:  docker build -t atlas-api:latest -f api/Dockerfile .

COPY api/pyproject.toml api/uv.lock api/.python-version* ./
RUN uv sync --frozen --no-install-project --no-dev

COPY api/app ./app
COPY api/prompts ./prompts
COPY api/rules ./rules
COPY api/data ./data
COPY api/scripts ./scripts
COPY shared /shared

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
