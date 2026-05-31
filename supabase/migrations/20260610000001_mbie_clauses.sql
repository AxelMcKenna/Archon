-- mbie_clauses: parsed clauses from MBIE Acceptable Solutions /
-- Verification Methods PDFs. Used by the verifier to ground RFI
-- decisions: given a flag's category, look up relevant clauses and
-- let the verifier decide whether the drawing detail matches an
-- Acceptable Solution before raising an RFI.
--
-- ingest_document_id intentionally has no FK constraint so this table
-- works whether or not the VE ingestion migration has been applied.
-- When ve_ingest_documents exists it stores the id of the source row;
-- otherwise it stays null and the row is self-contained.

create table if not exists public.mbie_clauses (
  id                  uuid primary key default gen_random_uuid(),
  ingest_document_id  uuid,
  document_id         text not null,
  code_clause         text not null,
  clause_number       text,
  heading             text,
  text                text not null,
  page                int,
  amendment_version   text,
  source_url          text,
  created_at          timestamptz not null default now(),
  fts                 tsvector
);

create index if not exists mbie_clauses_doc_idx
  on public.mbie_clauses (document_id, clause_number);
create index if not exists mbie_clauses_code_clause_idx
  on public.mbie_clauses (code_clause);
create index if not exists mbie_clauses_fts_idx
  on public.mbie_clauses using gin (fts);

create or replace function public.mbie_clauses_refresh_fts()
  returns trigger
  language plpgsql
  set search_path = public
  as $$
begin
  new.fts := setweight(to_tsvector('english', coalesce(new.heading, '')), 'A')
          || setweight(to_tsvector('english', coalesce(new.text, '')), 'B');
  return new;
end
$$;

drop trigger if exists mbie_clauses_fts_trigger on public.mbie_clauses;
create trigger mbie_clauses_fts_trigger
  before insert or update of heading, text on public.mbie_clauses
  for each row execute function public.mbie_clauses_refresh_fts();

alter table public.mbie_clauses enable row level security;

drop policy if exists "allow_all_single_user" on public.mbie_clauses;
create policy "allow_all_single_user" on public.mbie_clauses
  for all to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "mbie_clauses_read_authenticated" on public.mbie_clauses;
create policy "mbie_clauses_read_authenticated" on public.mbie_clauses
  for select to authenticated
  using (true);
