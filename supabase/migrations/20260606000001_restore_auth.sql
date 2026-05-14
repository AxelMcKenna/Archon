-- Restore per-user auth + RLS.
--
-- Ownership model: projects.user_id is the tenant boundary. Every child table
-- inherits ownership through its project_id FK (or via the rfi_letters /
-- rfi_items / cad_uploads chain). RLS policies enforce this with EXISTS
-- subqueries over projects.user_id = auth.uid().
--
-- Reference tables (bca_corpus, prompt_versions, rules_versions,
-- prompt_eval_runs) stay readable to all authenticated users, writable only by
-- service_role.
--
-- Backfill: existing rows are claimed by axel.mckenna7@gmail.com. The migration
-- aborts if that auth user does not exist yet — create it first via the
-- Supabase dashboard or `supabase auth users create`.

-- 1. projects.user_id ------------------------------------------------------

alter table public.projects
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists projects_user_id_idx on public.projects(user_id);

do $$
declare
  axel_id uuid;
  unowned_count int;
begin
  select id into axel_id from auth.users where lower(email) = 'axel.mckenna7@gmail.com';

  select count(*) into unowned_count from public.projects where user_id is null;

  if unowned_count > 0 and axel_id is null then
    raise exception
      'Cannot backfill projects.user_id: auth user axel.mckenna7@gmail.com does not exist. '
      'Create it in the Supabase dashboard (Authentication → Users) before applying this migration.';
  end if;

  if unowned_count > 0 then
    update public.projects set user_id = axel_id where user_id is null;
  end if;
end $$;

alter table public.projects alter column user_id set not null;

-- 2. RLS on projects -------------------------------------------------------

alter table public.projects enable row level security;

drop policy if exists projects_owner_select on public.projects;
drop policy if exists projects_owner_insert on public.projects;
drop policy if exists projects_owner_update on public.projects;
drop policy if exists projects_owner_delete on public.projects;

create policy projects_owner_select on public.projects
  for select to authenticated using (user_id = auth.uid());
create policy projects_owner_insert on public.projects
  for insert to authenticated with check (user_id = auth.uid());
create policy projects_owner_update on public.projects
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy projects_owner_delete on public.projects
  for delete to authenticated using (user_id = auth.uid());

-- 3. Helper: does the current user own this project? ----------------------

create or replace function public.user_owns_project(p uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects
    where id = p and user_id = auth.uid()
  );
$$;

grant execute on function public.user_owns_project(uuid) to authenticated;

-- 4. Project-scoped child tables ------------------------------------------

do $$
declare
  tbl text;
  project_tables text[] := array[
    'attachments',
    'audit_log',
    'plan_uploads',
    'rfi_letters',
    'consent_assessments',
    'project_inspections',
    'project_inspection_checklist_items',
    'project_inspection_pdfs',
    'cad_uploads'
  ];
begin
  foreach tbl in array project_tables loop
    if to_regclass('public.' || tbl) is null then continue; end if;

    execute format('alter table public.%I enable row level security', tbl);

    execute format('drop policy if exists %I_owner_all on public.%I', tbl, tbl);
    execute format($p$
      create policy %I_owner_all on public.%I
        for all to authenticated
        using (public.user_owns_project(project_id))
        with check (public.user_owns_project(project_id))
    $p$, tbl, tbl);
  end loop;
end $$;

-- 5. Two-hop tables via rfi_letters / rfi_items / cad_uploads -------------

-- rfi_items -> rfi_letters.project_id
alter table if exists public.rfi_items enable row level security;
drop policy if exists rfi_items_owner_all on public.rfi_items;
create policy rfi_items_owner_all on public.rfi_items
  for all to authenticated
  using (exists (
    select 1 from public.rfi_letters l
    where l.id = rfi_items.rfi_letter_id and public.user_owns_project(l.project_id)
  ))
  with check (exists (
    select 1 from public.rfi_letters l
    where l.id = rfi_items.rfi_letter_id and public.user_owns_project(l.project_id)
  ));

-- rfi_extractions -> rfi_letters
alter table if exists public.rfi_extractions enable row level security;
drop policy if exists rfi_extractions_owner_all on public.rfi_extractions;
create policy rfi_extractions_owner_all on public.rfi_extractions
  for all to authenticated
  using (exists (
    select 1 from public.rfi_letters l
    where l.id = rfi_extractions.rfi_letter_id and public.user_owns_project(l.project_id)
  ))
  with check (exists (
    select 1 from public.rfi_letters l
    where l.id = rfi_extractions.rfi_letter_id and public.user_owns_project(l.project_id)
  ));

-- classifications / reconciliation_log / responses / rfi_item_plan_evidence -> rfi_items -> rfi_letters
do $$
declare
  tbl text;
  item_tables text[] := array['classifications', 'reconciliation_log', 'responses', 'rfi_item_plan_evidence'];
begin
  foreach tbl in array item_tables loop
    if to_regclass('public.' || tbl) is null then continue; end if;
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I_owner_all on public.%I', tbl, tbl);
    execute format($p$
      create policy %I_owner_all on public.%I
        for all to authenticated
        using (exists (
          select 1
          from public.rfi_items i
          join public.rfi_letters l on l.id = i.rfi_letter_id
          where i.id = %I.rfi_item_id and public.user_owns_project(l.project_id)
        ))
        with check (exists (
          select 1
          from public.rfi_items i
          join public.rfi_letters l on l.id = i.rfi_letter_id
          where i.id = %I.rfi_item_id and public.user_owns_project(l.project_id)
        ))
    $p$, tbl, tbl, tbl, tbl);
  end loop;
end $$;

-- cad_revisions -> cad_uploads.project_id
do $$
begin
  if to_regclass('public.cad_revisions') is not null then
    alter table public.cad_revisions enable row level security;
    drop policy if exists cad_revisions_owner_all on public.cad_revisions;
    create policy cad_revisions_owner_all on public.cad_revisions
      for all to authenticated
      using (exists (
        select 1 from public.cad_uploads c
        where c.id = cad_revisions.cad_id and public.user_owns_project(c.project_id)
      ))
      with check (exists (
        select 1 from public.cad_uploads c
        where c.id = cad_revisions.cad_id and public.user_owns_project(c.project_id)
      ));
  end if;
end $$;

-- 6. Reference tables: authenticated read, service_role write -------------

do $$
declare
  tbl text;
  ref_tables text[] := array['bca_corpus', 'prompt_versions', 'rules_versions', 'prompt_eval_runs'];
begin
  foreach tbl in array ref_tables loop
    if to_regclass('public.' || tbl) is null then continue; end if;
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I_read on public.%I', tbl, tbl);
    execute format($p$
      create policy %I_read on public.%I
        for select to authenticated using (true)
    $p$, tbl, tbl);
  end loop;
end $$;

-- 7. Storage policies -----------------------------------------------------
--
-- Historical paths use a mix of `<project_id>/...`, `<user_id>/<project_id>/...`,
-- and the legacy `single-user/<project_id>/...` shape. Rather than rewriting
-- existing object names, the policy below allows access if ANY path segment
-- is a project_id owned by the caller. New uploads should still follow the
-- `<user_id>/<project_id>/...` convention.

create or replace function public.storage_path_owned(name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p,
         unnest(string_to_array(name, '/')) as seg
    where p.user_id = auth.uid()
      and seg = p.id::text
  );
$$;

grant execute on function public.storage_path_owned(text) to authenticated;

drop policy if exists "rfi_uploads_open" on storage.objects;
drop policy if exists "attachments_open" on storage.objects;
drop policy if exists "exports_open" on storage.objects;
drop policy if exists "rfi_uploads_owner" on storage.objects;
drop policy if exists "attachments_owner" on storage.objects;
drop policy if exists "exports_owner" on storage.objects;
drop policy if exists "cad_owner" on storage.objects;
drop policy if exists "plans_owner" on storage.objects;

create policy "rfi_uploads_owner" on storage.objects
  for all to authenticated
  using (bucket_id = 'rfi-uploads' and public.storage_path_owned(name))
  with check (bucket_id = 'rfi-uploads' and public.storage_path_owned(name));

create policy "attachments_owner" on storage.objects
  for all to authenticated
  using (bucket_id = 'attachments' and public.storage_path_owned(name))
  with check (bucket_id = 'attachments' and public.storage_path_owned(name));

create policy "exports_owner" on storage.objects
  for all to authenticated
  using (bucket_id = 'exports' and public.storage_path_owned(name))
  with check (bucket_id = 'exports' and public.storage_path_owned(name));

create policy "cad_owner" on storage.objects
  for all to authenticated
  using (bucket_id = 'cad' and public.storage_path_owned(name))
  with check (bucket_id = 'cad' and public.storage_path_owned(name));

create policy "plans_owner" on storage.objects
  for all to authenticated
  using (bucket_id = 'plans' and public.storage_path_owned(name))
  with check (bucket_id = 'plans' and public.storage_path_owned(name));

-- 8. Revoke anon access on user tables ------------------------------------
--
-- service_role bypasses RLS, so backend services can still operate when they
-- need to (e.g. webhooks). The anon role should no longer see anything user-
-- scoped now that we're back to authenticated mode.

do $$
declare
  tbl text;
  user_tables text[] := array[
    'projects', 'attachments', 'audit_log', 'plan_uploads', 'rfi_letters',
    'rfi_items', 'rfi_extractions', 'classifications', 'reconciliation_log',
    'responses', 'rfi_item_plan_evidence', 'consent_assessments',
    'project_inspections', 'project_inspection_checklist_items',
    'project_inspection_pdfs', 'cad_uploads', 'cad_revisions'
  ];
begin
  foreach tbl in array user_tables loop
    if to_regclass('public.' || tbl) is null then continue; end if;
    execute format('revoke all on public.%I from anon', tbl);
  end loop;
end $$;
