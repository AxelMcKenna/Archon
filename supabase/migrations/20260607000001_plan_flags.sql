-- plan_flags: per-flag rows so we can paginate reads and scale past the
-- 50-flag-per-document ceiling that lived in the analysis tool schema.
--
-- Source of truth for individual flags is plan_flags. plan_uploads.analysis
-- jsonb keeps a full mirror written by the analyser at the end of a run so
-- existing readers (UI, llm-gateway get_plan_flags, overlay.pdf renderer) keep
-- working unchanged.
--
-- No triggers: the analyser does one batched insert per plan after the
-- analysis run completes. Append-only — flags are never updated in place.

create table if not exists public.plan_flags (
  id                  uuid primary key default gen_random_uuid(),
  plan_upload_id      uuid not null references public.plan_uploads(id) on delete cascade,
  project_id          uuid not null references public.projects(id) on delete cascade,
  -- 0-based sheet ordinal within the document. Equivalent to page-1 today;
  -- separate column because a Phase-2 discipline split may reorder sheets.
  sheet_index         int not null,
  -- Populated by the Phase-2 title-block classifier. Nullable for now.
  sheet_label         text,
  discipline          text,
  -- 1-based page number — matches the existing flag.page field in the
  -- analysis jsonb. Kept alongside sheet_index for query convenience.
  page                int not null,
  tile                text not null default 'full',
  area                text not null,
  category            text not null,
  severity            text not null,
  confidence          text not null,
  verbatim_quote      text not null,
  reason              text,
  recommended_action  text,
  bbox                jsonb,
  bbox_source         text,
  verified            boolean not null default false,
  verification_note   text,
  -- Which vision pass produced the surviving representative (debug only).
  pass_index          int,
  created_at          timestamptz not null default now()
);

create index if not exists plan_flags_plan_upload_idx
  on public.plan_flags (plan_upload_id, sheet_index, id);
create index if not exists plan_flags_project_idx
  on public.plan_flags (project_id);
create index if not exists plan_flags_severity_idx
  on public.plan_flags (plan_upload_id, severity);
create index if not exists plan_flags_discipline_idx
  on public.plan_flags (plan_upload_id, discipline);

alter table public.plan_flags enable row level security;

-- Mirror plan_uploads exactly: permissive single-user policy + owner-scoped
-- policy. Both are PERMISSIVE so they OR together; single-user mode wins
-- today, owner-scoped takes over when allow_all_single_user is dropped.
drop policy if exists "allow_all_single_user" on public.plan_flags;
create policy "allow_all_single_user" on public.plan_flags
  for all to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "plan_flags_owner_all" on public.plan_flags;
create policy "plan_flags_owner_all" on public.plan_flags
  for all to authenticated
  using (public.user_owns_project(project_id))
  with check (public.user_owns_project(project_id));
