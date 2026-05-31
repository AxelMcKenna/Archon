-- VE knowledge base + ingestion document registry.
--
-- Two tables shipped together because they reference each other:
--   ve_ingest_documents: raw fetched wiki (PDFs, HTML) from public sources
--   ve_knowledge_base:   curated substitution patterns; rows can cite a
--                        ve_ingest_documents row to record provenance
--
-- Plus the ve-ingest storage bucket where raw bytes are persisted so we
-- can re-extract without re-fetching.

create table if not exists public.ve_ingest_documents (
  id                   uuid primary key default gen_random_uuid(),
  source_kind          text not null,        -- 'mbie_acceptable_solution' | 'council_guidance' | 'supplier_datasheet' | 'test'
  source_key           text not null,        -- stable id, e.g. 'mbie:e2_as1'
  source_url           text not null,
  storage_path         text not null,        -- ve-ingest/<source_kind>/<sha256>.<ext>
  content_hash         text not null,
  content_type         text,
  etag                 text,
  last_modified        text,
  fetched_at           timestamptz not null default now(),
  extraction_status    text not null default 'pending', -- pending|extracted|failed|skipped
  extraction_error     text,
  extraction_at        timestamptz,
  extractor_name       text,
  extractor_version    text,
  bytes                bigint,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index if not exists ve_ingest_documents_unique
  on public.ve_ingest_documents (source_key, content_hash);
create index if not exists ve_ingest_documents_status_idx
  on public.ve_ingest_documents (extraction_status, source_kind);
create index if not exists ve_ingest_documents_source_idx
  on public.ve_ingest_documents (source_kind, fetched_at desc);

drop trigger if exists ve_ingest_documents_updated_at on public.ve_ingest_documents;
create trigger ve_ingest_documents_updated_at
  before update on public.ve_ingest_documents
  for each row execute function set_updated_at();

alter table public.ve_ingest_documents enable row level security;

drop policy if exists "allow_all_single_user" on public.ve_ingest_documents;
create policy "allow_all_single_user" on public.ve_ingest_documents
  for all to anon, authenticated
  using (true)
  with check (true);


create table if not exists public.ve_knowledge_base (
  id                       uuid primary key default gen_random_uuid(),
  category                 text not null,   -- material_substitution | structural_oversize | treatment_downgrade | product_alternative | detail_simplification | finish_downgrade
  subcategory              text,
  current_spec_patterns    text[] not null default '{}',  -- keywords/strings that signal this spec
  proposed_alternative     text not null,
  applicability_conditions jsonb,           -- {exposure_zone: ["B","C"], wind_zone: ["low","medium"], ...}
  code_references          jsonb,           -- [{document: "E2/AS1", clause: "9.2.4"}, ...]
  savings_band             text not null,   -- low|medium|high
  savings_note             text,
  source                   text not null,   -- 'mbie_e2_as1' | 'ccc_avoiding_rfis' | 'expert_seed' | 'james_hardie_linea' ...
  source_url               text,
  confidence               text not null default 'auto_extracted',  -- curated|expert_seed|auto_extracted|llm_derived
  status                   text not null default 'review',          -- review|active|deprecated
  bca_specific             text[],          -- ['ccc','sdc','wdc'] or null for national
  ingest_document_id       uuid references public.ve_ingest_documents(id) on delete set null,
  extracted_clause         text,            -- verbatim source quote
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid             -- nullable for ingestion runs
);

create index if not exists ve_kb_category_idx
  on public.ve_knowledge_base (category, status);
create index if not exists ve_kb_patterns_gin
  on public.ve_knowledge_base using gin (current_spec_patterns);
create index if not exists ve_kb_bca_gin
  on public.ve_knowledge_base using gin (bca_specific);
create index if not exists ve_kb_active_lookup_idx
  on public.ve_knowledge_base (status, category)
  where status = 'active';
create index if not exists ve_kb_ingest_doc_idx
  on public.ve_knowledge_base (ingest_document_id);

drop trigger if exists ve_knowledge_base_updated_at on public.ve_knowledge_base;
create trigger ve_knowledge_base_updated_at
  before update on public.ve_knowledge_base
  for each row execute function set_updated_at();

alter table public.ve_knowledge_base enable row level security;

drop policy if exists "allow_all_single_user" on public.ve_knowledge_base;
create policy "allow_all_single_user" on public.ve_knowledge_base
  for all to anon, authenticated
  using (true)
  with check (true);


-- Storage bucket for raw fetched documents. Private; admin-only reads.
insert into storage.buckets (id, name, public)
values ('ve-ingest', 've-ingest', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 've_ingest_open'
  ) then
    create policy "ve_ingest_open" on storage.objects
      for all to anon, authenticated
      using (bucket_id = 've-ingest')
      with check (bucket_id = 've-ingest');
  end if;
end $$;
