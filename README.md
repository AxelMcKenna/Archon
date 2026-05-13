# ConsentIQ

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38B2AC?logo=tailwind-css&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![uv](https://img.shields.io/badge/uv-package%20mgr-DE5FE9)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ECF8E?logo=supabase&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--5-412991?logo=openai&logoColor=white)
![Anthropic](https://img.shields.io/badge/Anthropic-Claude%20Opus%204.7-D97757?logo=anthropic&logoColor=white)
![OpenRouter](https://img.shields.io/badge/OpenRouter-vision-7C3AED)
![Google Cloud](https://img.shields.io/badge/Google%20Cloud-API-4285F4?logo=googlecloud&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Vercel](https://img.shields.io/badge/Web-Vercel-000?logo=vercel&logoColor=white)

Canterbury BCA RFI ingestion, two-pronged classification, response drafting, and a pre-lodgement plan analyser with a conversational agent.

Councils in scope: Christchurch City, Selwyn, Waimakariri.

## Structure

```text
/web        Next.js 15 app (App Router), proxies API + agent calls via route handlers
/api        FastAPI app — RFI pipeline, plan overlay, CAD rendering
/agent      FastAPI app — conversational agent (tool-use loop, Supabase-backed conversations)
/supabase   Migrations, RLS, seed
/shared     Canonical JSON schema + taxonomies (source of truth)
/eval       Evaluation harnesses (e.g. plan-flagger synthetic suite)
/docs       Design notes
```

## Stack

- Frontend: Next.js 15 (App Router) + Tailwind
- Backend: FastAPI (Python 3.12, uv) — two services: `api` (port 8000) and `agent` (port 8001), hosted on Google Cloud
- DB / Auth / Storage: Supabase
- LLM: OpenAI (GPT-5) and Anthropic (Claude Opus 4.7) for the main pipeline and orchestration, with additional vision models via OpenRouter; tool-use across all providers
- CAD: ezdxf with `fonts-dejavu-core` for MTEXT rendering

## Dev

```bash
# Web
cd web && pnpm install && pnpm dev

# API (port 8000)
cd api && uv sync && uv run uvicorn app.main:app --reload

# Agent (port 8001)
cd agent && uv sync && uv run uvicorn app.main:app --reload --port 8001

# Supabase (local)
cd supabase && supabase start
```

Web calls `api` and `agent` through Next.js route handlers, so only the web origin needs to be public.

## Deploy

Root `docker-compose.yml` builds and runs both backends:

```bash
docker compose up -d --build
```

Each service reads its own `.env` (`api/.env`, `agent/.env`).

## Docs

- [`docs/plan-overlay.md`](docs/plan-overlay.md) — pre-lodgement plan analyser, bbox grounding pipeline, overlay rendering, inline UI, known limitations.
- [`eval/plan-flagger/README.md`](eval/plan-flagger/README.md) — plan-flagger evaluation harness.
