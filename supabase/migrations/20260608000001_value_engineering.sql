-- plan_value_engineering: results of the cost-reduction (VE) vision pass.
--
-- Separate from plan_uploads.analysis (which holds RFI flags) so VE can run
-- independently, be versioned independently, and not bloat the existing jsonb.
-- One row per VE run; we keep historical rows for audit + cache lookup.

create table if not exists public.plan_value_engineering (
  id                  uuid primary key default gen_random_uuid(),
  plan_upload_id      uuid not null references public.plan_uploads(id) on delete cascade,
  project_id          uuid not null references public.projects(id) on delete cascade,
  status              text not null default 'pending', -- pending|analysing|analysed|failed
  analyser_version    text,
  prompt_version      text,
  provider            text,
  model_id            text,
  opportunities       jsonb,
  summary             text,
  processing_ms       int,
  cost_usd            numeric(10, 6),
  image_count         int,
  dpi_breakdown       jsonb,
  content_hash        text,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists plan_ve_upload_idx
  on public.plan_value_engineering (plan_upload_id, created_at desc);
create index if not exists plan_ve_project_idx
  on public.plan_value_engineering (project_id, created_at desc);
create index if not exists plan_ve_cache_idx
  on public.plan_value_engineering
  (content_hash, analyser_version, prompt_version, provider, model_id);

drop trigger if exists plan_value_engineering_updated_at on public.plan_value_engineering;
create trigger plan_value_engineering_updated_at
  before update on public.plan_value_engineering
  for each row execute function set_updated_at();

alter table public.plan_value_engineering enable row level security;

-- Mirror plan_uploads / plan_flags exactly: permissive single-user policy +
-- owner-scoped policy. Both PERMISSIVE so they OR together.
drop policy if exists "allow_all_single_user" on public.plan_value_engineering;
create policy "allow_all_single_user" on public.plan_value_engineering
  for all to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "plan_value_engineering_owner_all" on public.plan_value_engineering;
create policy "plan_value_engineering_owner_all" on public.plan_value_engineering
  for all to authenticated
  using (public.user_owns_project(project_id))
  with check (public.user_owns_project(project_id));
