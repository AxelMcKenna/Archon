-- Flip the app from permissive single-user mode to strict per-user isolation.
--
-- Every table that carried an `allow_all_single_user` (or equivalent wide-open)
-- RLS policy was readable/writable by ANY anon or authenticated caller, because
-- Postgres ORs permissive policies together: the "allow everyone" rule always
-- won. Each user-owned table already has an owner-scoped policy anchored on
-- projects.user_id = auth.uid(); this migration removes the open policies so
-- those owner policies become the sole gate.
--
-- Shared reference corpora (mbie_clauses, ve_knowledge_base, ve_ingest_documents)
-- are system-ingested global knowledge, not per-user data: they become
-- authenticated-read + service-role-write (ingestion runs as service-role via
-- app.auth.get_service_db(), which bypasses RLS). The waitlist stays
-- anon-writable but is tightened to insert-only so the public anon key can no
-- longer read back every stored email.

begin;

-- 1. Backfill ownership. Any legacy project with no owner is assigned to the
--    sole existing account. Guarded to run ONLY when exactly one user exists,
--    so it can never mis-assign rows in a real multi-user database (no-op today;
--    current projects already have owners).
update public.projects p
   set user_id = (select id from auth.users order by created_at limit 1)
 where p.user_id is null
   and (select count(*) from auth.users) = 1;

-- 2. cad_rfi_pins carried ONLY the open policy. Add an owner policy that
--    inherits ownership through cad_uploads -> projects, mirroring cad_revisions.
drop policy if exists "cad_rfi_pins_owner_all" on public.cad_rfi_pins;
create policy "cad_rfi_pins_owner_all" on public.cad_rfi_pins
  for all to authenticated
  using (
    exists (
      select 1 from public.cad_uploads c
      where c.id = cad_rfi_pins.cad_id
        and public.user_owns_project(c.project_id)
    )
  )
  with check (
    exists (
      select 1 from public.cad_uploads c
      where c.id = cad_rfi_pins.cad_id
        and public.user_owns_project(c.project_id)
    )
  );

-- 3. Shared reference corpora: authenticated read, service-role write.
--    (mbie_clauses already has mbie_clauses_read_authenticated.)
drop policy if exists "ve_ingest_documents_read_authenticated" on public.ve_ingest_documents;
create policy "ve_ingest_documents_read_authenticated" on public.ve_ingest_documents
  for select to authenticated using (true);

drop policy if exists "ve_knowledge_base_read_authenticated" on public.ve_knowledge_base;
create policy "ve_knowledge_base_read_authenticated" on public.ve_knowledge_base
  for select to authenticated using (true);

-- 4. Waitlist: keep public (anon) signups working, but insert-only. Previously
--    `allow_all_single_user` (ALL to anon) let the public key read every email.
drop policy if exists "allow_all_single_user" on public.waitlist;
drop policy if exists "waitlist_anon_insert" on public.waitlist;
create policy "waitlist_anon_insert" on public.waitlist
  for insert to anon, authenticated
  with check (true);

-- 5. Drop every remaining wide-open policy. The owner / authenticated-read
--    policies (added above and pre-existing) are now the sole gate.
drop policy if exists "allow_all_single_user" on public.cad_revisions;
drop policy if exists "allow_all_single_user" on public.cad_rfi_pins;
drop policy if exists "allow_all_single_user" on public.cad_uploads;
drop policy if exists "allow_all_single_user" on public.mbie_clauses;
drop policy if exists "allow_all_single_user" on public.plan_flags;
drop policy if exists "allow_all_single_user" on public.plan_value_engineering;
drop policy if exists "allow_all_single_user" on public.ve_ingest_documents;
drop policy if exists "allow_all_single_user" on public.ve_knowledge_base;
drop policy if exists "consent_assessments are public" on public.consent_assessments;

-- 6. Tighten the ve-ingest storage bucket (raw fetched reference docs) to match:
--    authenticated read, service-role writes. It was anon+authenticated ALL.
drop policy if exists "ve_ingest_open" on storage.objects;
drop policy if exists "ve_ingest_read_authenticated" on storage.objects;
create policy "ve_ingest_read_authenticated" on storage.objects
  for select to authenticated using (bucket_id = 've-ingest');

commit;
