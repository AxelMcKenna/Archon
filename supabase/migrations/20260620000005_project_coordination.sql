-- Project coordination layer - cross-document reconciliation flags.
--
-- Treats a project as one related document set (drawings + specifications) and
-- records where they disagree. project_coordination_flags is the per-flag store
-- (each flag carries >=2 citations in jsonb); project_coordination_runs holds one
-- row per project for freshness (the fingerprint of the document set last
-- reconciled). Both owner-scoped only - created post per-user-isolation flip,
-- mirroring spec_documents/spec_flags.

create table if not exists public.project_coordination_flags (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade,
  category            text not null,
  severity            text not null,
  confidence          text not null,
  area                text not null,
  reason              text,
  recommended_action  text,
  rule                text,
  tier                text not null default 'deterministic',
  -- list of {source_kind, source_id, filename, page, quote} - every flag cites
  -- at least two documents, so it can never be ungrounded single-source noise.
  citations           jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists project_coordination_flags_project_idx
  on public.project_coordination_flags (project_id, severity);

alter table public.project_coordination_flags enable row level security;

drop policy if exists "project_coordination_flags_owner_all" on public.project_coordination_flags;
create policy "project_coordination_flags_owner_all" on public.project_coordination_flags
  for all to authenticated
  using (public.user_owns_project(project_id))
  with check (public.user_owns_project(project_id));

create table if not exists public.project_coordination_runs (
  project_id            uuid primary key references public.projects(id) on delete cascade,
  document_fingerprint  text,
  flags_count           int not null default 0,
  tier                  text not null default 'deterministic',
  ran_at                timestamptz not null default now()
);

-- Bump ran_at on every re-run (upsert-on-conflict updates this row in place, so
-- a plain default isn't enough to reflect "last checked").
create or replace function public.set_coordination_ran_at()
returns trigger language plpgsql as $$
begin
  new.ran_at = now();
  return new;
end;
$$;

drop trigger if exists project_coordination_runs_ran_at on public.project_coordination_runs;
create trigger project_coordination_runs_ran_at before update on public.project_coordination_runs
  for each row execute function public.set_coordination_ran_at();

alter table public.project_coordination_runs enable row level security;

drop policy if exists "project_coordination_runs_owner_all" on public.project_coordination_runs;
create policy "project_coordination_runs_owner_all" on public.project_coordination_runs
  for all to authenticated
  using (public.user_owns_project(project_id))
  with check (public.user_owns_project(project_id));
