-- Single-user mode: drop auth.uid()-based RLS, drop user_id columns, replace
-- per-user storage policies with bucket-level access for the anon role.
--
-- Reversal of this migration is non-trivial (re-introducing user_id requires
-- backfill). Don't apply unless committing to single-user mode.

-- ── Drop owner RLS policies (table-level) ────────────────────────────
drop policy if exists projects_owner_select on projects;
drop policy if exists projects_owner_insert on projects;
drop policy if exists projects_owner_update on projects;
drop policy if exists projects_owner_delete on projects;
drop policy if exists rfi_letters_owner on rfi_letters;
drop policy if exists rfi_items_owner on rfi_items;
drop policy if exists rfi_extractions_owner on rfi_extractions;
drop policy if exists classifications_owner on classifications;
drop policy if exists reconciliation_log_owner on reconciliation_log;
drop policy if exists responses_owner on responses;
drop policy if exists attachments_owner on attachments;
drop policy if exists audit_log_owner_select on audit_log;

-- ── Disable RLS on user-scoped tables ────────────────────────────────
alter table projects disable row level security;
alter table rfi_letters disable row level security;
alter table rfi_items disable row level security;
alter table rfi_extractions disable row level security;
alter table classifications disable row level security;
alter table reconciliation_log disable row level security;
alter table responses disable row level security;
alter table attachments disable row level security;
alter table audit_log disable row level security;

-- ── Drop user_id columns ─────────────────────────────────────────────
alter table projects drop column if exists user_id;
alter table audit_log drop column if exists user_id;

-- ── Replace storage policies (drop per-user prefix policies) ─────────
drop policy if exists "rfi_uploads_owner" on storage.objects;
drop policy if exists "attachments_owner" on storage.objects;
drop policy if exists "exports_owner" on storage.objects;

-- Single-user mode: anon role can read/write the three buckets.
-- Note: we still gate API access via the service role key in api/.env;
-- public anon access here is acceptable because the buckets aren't
-- exposed without a signed URL or service-role call.
create policy "rfi_uploads_open" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'rfi-uploads')
  with check (bucket_id = 'rfi-uploads');

create policy "attachments_open" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'attachments')
  with check (bucket_id = 'attachments');

create policy "exports_open" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'exports')
  with check (bucket_id = 'exports');
