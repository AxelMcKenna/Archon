-- CAD (DXF) uploads + revisions for the geometry-edit RFI flow.

create table cad_uploads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  size_bytes bigint,
  content_hash text,
  status text not null default 'uploaded',
  analyser_version text,
  prompt_version text,
  analysis jsonb,
  processing_ms int,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cad_uploads_project_idx on cad_uploads (project_id, created_at desc);

create trigger cad_uploads_updated_at before update on cad_uploads
  for each row execute function set_updated_at();

create table cad_revisions (
  id uuid primary key default gen_random_uuid(),
  cad_id uuid not null references cad_uploads(id) on delete cascade,
  applied_ops jsonb not null default '[]'::jsonb,
  dxf_path text not null,
  changelog_path text,
  created_at timestamptz not null default now()
);

create index cad_revisions_cad_idx on cad_revisions (cad_id, created_at desc);

insert into storage.buckets (id, name, public)
values ('cad', 'cad', false)
on conflict (id) do nothing;

create policy "cad_open" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'cad')
  with check (bucket_id = 'cad');
