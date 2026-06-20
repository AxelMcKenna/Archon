-- Material / product data sheets reuse the spec_documents infrastructure,
-- distinguished by doc_kind ('spec' | 'material'). Existing rows are specs.
alter table public.spec_documents
  add column if not exists doc_kind text not null default 'spec';

create index if not exists spec_documents_kind_idx
  on public.spec_documents (project_id, doc_kind);
