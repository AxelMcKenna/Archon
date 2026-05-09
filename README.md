# ConsentIQ — RFI Module

Canterbury BCA RFI ingestion, two-pronged classification, and response drafting.

## Shared scope

- Councils:
  - Christchurch City
  - Selwyn
  - Waimakariri
## Saasathon

## Structure

```text
/web        Next.js 15 app (Vercel)
/api        FastAPI app (Fly.io)
/supabase   Migrations, RLS, seed
/shared     Canonical JSON schema + taxonomies (source of truth)
```

## Stack

- Frontend: Next.js (App Router) + Tailwind
- Backend: FastAPI (Python 3.12, uv)
- DB / Auth / Storage: Supabase
- LLM: Gemini 2.5 Flash + 3.1 Pro (direct) and any vision model via OpenRouter; tool-use across both

## Dev

```bash
# Web
cd web && pnpm install && pnpm dev

# API
cd api && uv sync && uv run uvicorn app.main:app --reload

# Supabase (local)
cd supabase && supabase start
```

See PRD for full scope.

## Docs

- [`docs/plan-overlay.md`](docs/plan-overlay.md) — pre-lodgement plan analyser, bbox grounding pipeline, overlay rendering, inline UI, known limitations.

## Shared scope

- Councils:
  - Chch City
  - Selwyn
  - Waimakariri
