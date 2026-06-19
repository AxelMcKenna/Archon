-- Formalize cad_revisions as an append-only op log: each revision is
-- base_revision + [ops]. Enables undo/redo, optimistic locking, and storing
-- the per-revision compliance recheck result.

alter table cad_revisions
  add column if not exists base_revision_id uuid references cad_revisions(id) on delete set null,
  add column if not exists seq int not null default 0,
  add column if not exists delta jsonb,
  add column if not exists flags jsonb,
  add column if not exists recheck_status text not null default 'pending';

-- Fast "latest revision for this cad" lookups (optimistic-lock check + undo).
create index if not exists cad_revisions_seq_idx on cad_revisions (cad_id, seq desc);
