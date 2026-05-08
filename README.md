# ConsentIQ — RFI Module

Canterbury BCA RFI ingestion, two-pronged classification, and response drafting.

## Structure

```
/web        Next.js 15 app (Vercel)
/api        FastAPI app (Fly.io)
/supabase   Migrations, RLS, seed
/shared     Canonical JSON schema + taxonomies (source of truth)
```

## Stack

- Frontend: Next.js (App Router) + Tailwind + shadcn/ui
- Backend: FastAPI (Python 3.12, uv)
- DB / Auth / Storage: Supabase
- LLM: Anthropic Claude (`claude-opus-4-7`, vision + tool use)

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
