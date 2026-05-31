# Architecture

Two views: the **system** (services, storage, deploy targets) and the **AI pipeline** (how a document moves through extraction, classification, drafting, and the agent loop).

## System

```mermaid
flowchart LR
  user([User browser])

  subgraph Vercel["Vercel"]
    web["Next.js 15 App Router<br/>(web)"]
    proxy["Route handlers<br/>/api/backend/* · /api/agent-proxy/*"]
    web --> proxy
  end

  subgraph GCP["Google Cloud"]
    api["FastAPI · api :8000<br/>RFI pipeline · plan overlay · CAD"]
    agent["FastAPI · agent :8001<br/>tool-use loop · conversations"]
  end

  subgraph Supabase["Supabase"]
    db[(Postgres + RLS)]
    auth[(Auth)]
    storage[(Storage<br/>plans · attachments · CAD)]
  end

  subgraph LLMs["LLM providers"]
    openai["OpenAI<br/>GPT-5"]
    anthropic["Anthropic<br/>Claude Opus 4.7"]
    gemini["Google<br/>Gemini 3.1 Pro"]
    openrouter["OpenRouter<br/>vision fan-out"]
  end

  user --> web
  proxy -->|server-side fetch| api
  proxy -->|server-side fetch| agent

  api --> db
  api --> storage
  api --> auth
  agent --> db
  agent --> auth
  agent -->|HTTP tool calls| api

  api --> openai
  api --> anthropic
  api --> gemini
  api --> openrouter
  agent --> openai
  agent --> anthropic
  agent --> openrouter
```

Notes:

- The browser never talks to `api` or `agent` directly — Next.js route handlers proxy both, so only the web origin is public.
- `api` and `agent` are independent FastAPI services sharing the same Supabase project. `agent` calls `api` over HTTP for heavy tools (plan flags, forecast, classification).
- Local dev uses `docker compose up` from the repo root.

## AI pipeline

```mermaid
flowchart TB
  subgraph Ingest["Ingest"]
    upload["PDF upload<br/>(RFI letter / plan / attachment)"]
    storage[(Supabase Storage)]
    upload --> storage
  end

  subgraph Extract["Extract"]
    router["extractors/router.py<br/>routes by doc type + page count"]
    native["pdf_native<br/>text + layout"]
    md["markdown<br/>(structured letters)"]
    vision["vision/rfi/extractor<br/>(scanned / image PDFs)"]
    plan_text["plan_text<br/>(plan OCR + bbox refiner)"]
    storage --> router
    router --> native
    router --> md
    router --> vision
    router --> plan_text
  end

  subgraph Classify["Two-pronged RFI classification"]
    rules["classifier/rules.py<br/>(taxonomy + heuristics)"]
    ai_cls["classifier/ai.py<br/>(LLM, tool-use)"]
    reconcile["classifier/reconciler.py<br/>(merge + confidence)"]
    native --> rules
    md --> rules
    vision --> rules
    native --> ai_cls
    md --> ai_cls
    vision --> ai_cls
    rules --> reconcile
    ai_cls --> reconcile
  end

  subgraph Plan["Plan analyser"]
    plan_an["plans/analyzer<br/>flags + severity"]
    bbox["plans/bbox_refiner<br/>(grounded coords)"]
    overlay["plans/overlay<br/>render boxes on PDF"]
    plan_text --> plan_an --> bbox --> overlay
  end

  subgraph Draft["Drafting + forecasting"]
    draft["drafter.py<br/>response draft per RFI item"]
    forecast["services/forecast<br/>cost · duration · risk"]
    risk["risk.py<br/>project risk score"]
    reconcile --> draft
    reconcile --> risk
    plan_an --> risk
  end

  subgraph Agent["Agent (chat loop)"]
    chat["routes/chat.py · SSE"]
    loop["agent_loop.py<br/>orchestrator (Claude Opus 4.7)"]
    tools["tools/*<br/>read_tab · get_project_workflow ·<br/>get_plan_flags · get_forecast ·<br/>classify_rfi_letter · draft_rfi_response ·<br/>score_project_risk"]
    chat --> loop --> tools
    tools -->|HTTP| Classify
    tools -->|HTTP| Plan
    tools -->|HTTP| Draft
    tools -->|SQL| db2[(Supabase)]
  end

  Draft --> db2
  Plan --> db2
  Classify --> db2

  subgraph Providers["LLM routing"]
    p_openai["OpenAI GPT-5<br/>(default OpenRouter model)"]
    p_anthropic["Claude Opus 4.7<br/>(orchestrator, drafting)"]
    p_gemini["Gemini 3.1 Pro<br/>(plan + CAD analyser)"]
    p_vision["OpenRouter vision<br/>(GPT-5V · Qwen2.5-VL · Llama 4V)"]
  end

  ai_cls -.-> p_anthropic
  ai_cls -.-> p_openai
  vision -.-> p_anthropic
  vision -.-> p_vision
  plan_an -.-> p_gemini
  draft -.-> p_anthropic
  loop -.-> p_anthropic
  loop -.-> p_openai
```

Highlights:

- **Two-pronged classifier**: deterministic rules and an LLM run in parallel; `reconciler` merges them with a confidence score, so a single provider blip can't silently corrupt a letter.
- **Plan grounding**: every flag the LLM raises is re-grounded to a bounding box on the source PDF before it's persisted, so the UI can render an overlay the user can verify.
- **Agent tools call `api`**: the agent doesn't re-implement classification or forecasting — it invokes the same FastAPI endpoints the web app uses, so behaviour stays consistent.
- **Model routing is per-role**, configured by env var (`anthropic_model`, `gemini_model`, `openrouter_model`, `cad_analyser_model`, `agent_orchestrator_model`, `agent_summarizer_model`) — providers swap without code changes.
