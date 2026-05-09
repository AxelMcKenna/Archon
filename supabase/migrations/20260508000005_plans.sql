-- Building plans: pre-lodgement upload + AI analysis surfacing likely RFIs.
--
-- This migration predates the checked-in remote schema baseline. On a fresh
-- reset, the baseline creates plan_uploads later, so no-op until projects
-- exists.

do $$
begin
  if to_regclass('public.projects') is null then
    return;
  end if;

  create table if not exists plan_uploads (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references projects(id) on delete cascade,
    filename text not null,
    storage_path text not null,
    mime_type text,
    size_bytes bigint,
    status text not null default 'uploaded',
    analyser_version text,
    prompt_version text,
    analysis jsonb,
    processing_ms int,
    cost_usd numeric(10, 6),
    error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create index if not exists plan_uploads_project_idx on plan_uploads (project_id, created_at desc);

  drop trigger if exists plan_uploads_updated_at on plan_uploads;
  create trigger plan_uploads_updated_at before update on plan_uploads
    for each row execute function set_updated_at();

  insert into storage.buckets (id, name, public)
  values ('plans', 'plans', false)
  on conflict (id) do nothing;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'plans_open'
  ) then
    create policy "plans_open" on storage.objects
      for all to anon, authenticated
      using (bucket_id = 'plans')
      with check (bucket_id = 'plans');
  end if;
end $$;
