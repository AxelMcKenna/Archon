-- Auto-once gate for the Tier-2 (LLM) coordination pass: record when it last
-- ran for a project so the per-upload auto-trigger runs it at most once until
-- the user re-runs it manually. Never cleared once set.
alter table public.project_coordination_runs
  add column if not exists tier2_ran_at timestamptz;
