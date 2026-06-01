-- Mirror the permissive single-user RLS policy onto the CAD tables.
--
-- cad_uploads / cad_revisions were added after the plan_* tables and only
-- ever got the owner-scoped policy (user_owns_project). Every plan-side
-- table (plan_uploads, plan_flags, plan_value_engineering) ALSO carries an
-- `allow_all_single_user` permissive policy for the app's current
-- single-user / permissive-RLS phase. Its absence on the CAD tables meant
-- analysed DXF drawings were RLS-filtered out of the project page's
-- server-side read on refresh — they showed during the live session
-- (served from API/service-role state) but vanished on reload.
--
-- Both policies are PERMISSIVE, so they OR together with the owner policy:
-- a project owner still matches via user_owns_project; the single-user
-- fallback covers the anon/non-owner session the page currently reads under.

drop policy if exists "allow_all_single_user" on public.cad_uploads;
create policy "allow_all_single_user" on public.cad_uploads
  for all to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "allow_all_single_user" on public.cad_revisions;
create policy "allow_all_single_user" on public.cad_revisions
  for all to anon, authenticated
  using (true)
  with check (true);
