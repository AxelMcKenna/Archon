-- Plan flagger v2: grounded flags + verification pass + adaptive rendering telemetry.
-- Additive only. Existing plan_uploads rows remain valid.

alter table plan_uploads
  add column if not exists analysis_version text,
  add column if not exists verification_prompt_version text,
  add column if not exists verification_drops jsonb,
  add column if not exists image_count int,
  add column if not exists dpi_breakdown jsonb;

-- Backfill v1 rows.
update plan_uploads
   set analysis_version = '1.0'
 where analysis_version is null
   and analyser_version is not null;

-- Per-prompt-version eval results, populated by the regression runner.
create table if not exists prompt_eval_runs (
  id uuid primary key default gen_random_uuid(),
  prompt_version text not null,
  prompt_type text not null,                -- 'analysis' | 'verification'
  eval_set_version text not null,
  run_at timestamptz not null default now(),
  n_plans int not null,
  precision_avg numeric(5, 4),
  recall_avg numeric(5, 4),
  hallucination_rate numeric(5, 4),
  per_plan_results jsonb,
  notes text
);

create index if not exists prompt_eval_runs_version_idx
  on prompt_eval_runs (prompt_type, prompt_version, run_at desc);
