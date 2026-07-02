-- Shared write-once LLM result cache (wiki/issues/0007).
--
-- The AI classifier and the drafter cached results in process-local dicts,
-- so each worker froze whatever the model returned to *it* first — two
-- workers (or one worker after a redeploy) could serve different "cached"
-- answers for identical inputs. This table makes the first *persisted*
-- answer the durable, global one: workers insert with on-conflict-do-nothing
-- and read back whichever row won the race.
--
-- Access is service-role only (the API's service client). RLS is enabled
-- with no policies: anon/authenticated see nothing, service_role bypasses.

create table if not exists public.llm_cache (
  key text primary key,          -- caller-computed sha256 over all inputs
  kind text not null,            -- 'classifier' | 'draft' | ...
  value jsonb not null,
  prompt_version text,
  created_at timestamptz not null default now()
);

alter table public.llm_cache enable row level security;
