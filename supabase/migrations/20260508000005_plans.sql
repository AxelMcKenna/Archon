-- Building plans: pre-lodgement upload + AI analysis surfacing likely RFIs.

create table plan_uploads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  status text not null default 'uploaded',  -- uploaded | analysing | analysed | failed
  analyser_version text,
  prompt_version text,
  analysis jsonb,                            -- {flags: [...], summary, taxonomy_version}
  processing_ms int,
  cost_usd numeric(10, 6),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plan_uploads_project_idx on plan_uploads (project_id, created_at desc);

create trigger plan_uploads_updated_at before update on plan_uploads
  for each row execute function set_updated_at();

-- Storage bucket for plan PDFs/images.
insert into storage.buckets (id, name, public)
values ('plans', 'plans', false)
on conflict (id) do nothing;

create policy "plans_open" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'plans')
  with check (bucket_id = 'plans');
