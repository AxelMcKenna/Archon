-- Specification / product-document understanding (the third consent-set pillar
-- alongside drawings and the council RFI letter).
--
-- spec_documents mirrors plan_uploads: one row per uploaded specification or
-- product document, with a jsonb `analysis` mirror written by the deterministic
-- spec flagger. spec_flags is the per-flag source of truth (mirrors plan_flags),
-- so reads can paginate and the RFI surface is queryable per category/severity.
--
-- Created post per-user-isolation flip (20260620000001): NO permissive
-- allow_all policy - owner-scoped policies anchored on projects.user_id are the
-- sole gate, matching every other user-owned table today.

create table if not exists public.spec_documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  filename      text not null,
  storage_path  text not null,
  mime_type     text,
  size_bytes    bigint,
  status        text not null default 'uploaded',
  content_hash  text,
  extractor_version text,
  analysis      jsonb,
  flags_count   int not null default 0,
  processing_ms int,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists spec_documents_project_idx
  on public.spec_documents (project_id, created_at desc);

drop trigger if exists spec_documents_updated_at on public.spec_documents;
create trigger spec_documents_updated_at before update on public.spec_documents
  for each row execute function set_updated_at();

alter table public.spec_documents enable row level security;

drop policy if exists "spec_documents_owner_all" on public.spec_documents;
create policy "spec_documents_owner_all" on public.spec_documents
  for all to authenticated
  using (public.user_owns_project(project_id))
  with check (public.user_owns_project(project_id));

create table if not exists public.spec_flags (
  id                  uuid primary key default gen_random_uuid(),
  spec_document_id    uuid not null references public.spec_documents(id) on delete cascade,
  project_id          uuid not null references public.projects(id) on delete cascade,
  page                int not null default 1,
  area                text not null,
  category            text not null,
  severity            text not null,
  confidence          text not null,
  verbatim_quote      text not null,
  reason              text,
  recommended_action  text,
  rule                text,
  created_at          timestamptz not null default now()
);

create index if not exists spec_flags_document_idx
  on public.spec_flags (spec_document_id, id);
create index if not exists spec_flags_project_idx
  on public.spec_flags (project_id);
create index if not exists spec_flags_category_idx
  on public.spec_flags (spec_document_id, category);

alter table public.spec_flags enable row level security;

drop policy if exists "spec_flags_owner_all" on public.spec_flags;
create policy "spec_flags_owner_all" on public.spec_flags
  for all to authenticated
  using (public.user_owns_project(project_id))
  with check (public.user_owns_project(project_id));

-- Storage bucket for the raw spec/product files. Mirrors the plans bucket: a
-- private bucket whose objects are reached via signed URLs and whose paths
-- embed project_id. (Bucket-level policy is scoped to authenticated; the
-- spec_documents row RLS is the real per-user gate.)
insert into storage.buckets (id, name, public)
values ('specs', 'specs', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'specs_authenticated'
  ) then
    create policy "specs_authenticated" on storage.objects
      for all to authenticated
      using (bucket_id = 'specs')
      with check (bucket_id = 'specs');
  end if;
end $$;
