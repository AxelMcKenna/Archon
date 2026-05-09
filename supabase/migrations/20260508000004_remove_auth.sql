-- Single-user mode: drop auth.uid()-based RLS, drop user_id columns, replace
-- per-user storage policies with bucket-level access for the anon role.
--
-- This migration predates the checked-in remote schema baseline. On a fresh
-- local reset the baseline has not created the application tables yet, so this
-- migration must no-op until those tables exist.

do $$
begin
  if to_regclass('public.projects') is null then
    return;
  end if;

  if to_regclass('public.projects') is not null then
    drop policy if exists projects_owner_select on projects;
    drop policy if exists projects_owner_insert on projects;
    drop policy if exists projects_owner_update on projects;
    drop policy if exists projects_owner_delete on projects;
    alter table projects disable row level security;
    alter table projects drop column if exists user_id;
  end if;

  if to_regclass('public.rfi_letters') is not null then
    drop policy if exists rfi_letters_owner on rfi_letters;
    alter table rfi_letters disable row level security;
  end if;

  if to_regclass('public.rfi_items') is not null then
    drop policy if exists rfi_items_owner on rfi_items;
    alter table rfi_items disable row level security;
  end if;

  if to_regclass('public.rfi_extractions') is not null then
    drop policy if exists rfi_extractions_owner on rfi_extractions;
    alter table rfi_extractions disable row level security;
  end if;

  if to_regclass('public.classifications') is not null then
    drop policy if exists classifications_owner on classifications;
    alter table classifications disable row level security;
  end if;

  if to_regclass('public.reconciliation_log') is not null then
    drop policy if exists reconciliation_log_owner on reconciliation_log;
    alter table reconciliation_log disable row level security;
  end if;

  if to_regclass('public.responses') is not null then
    drop policy if exists responses_owner on responses;
    alter table responses disable row level security;
  end if;

  if to_regclass('public.attachments') is not null then
    drop policy if exists attachments_owner on attachments;
    alter table attachments disable row level security;
  end if;

  if to_regclass('public.audit_log') is not null then
    drop policy if exists audit_log_owner_select on audit_log;
    alter table audit_log disable row level security;
    alter table audit_log drop column if exists user_id;
  end if;

  drop policy if exists "rfi_uploads_owner" on storage.objects;
  drop policy if exists "attachments_owner" on storage.objects;
  drop policy if exists "exports_owner" on storage.objects;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'rfi_uploads_open'
  ) then
    create policy "rfi_uploads_open" on storage.objects
      for all to anon, authenticated
      using (bucket_id = 'rfi-uploads')
      with check (bucket_id = 'rfi-uploads');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'attachments_open'
  ) then
    create policy "attachments_open" on storage.objects
      for all to anon, authenticated
      using (bucket_id = 'attachments')
      with check (bucket_id = 'attachments');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'exports_open'
  ) then
    create policy "exports_open" on storage.objects
      for all to anon, authenticated
      using (bucket_id = 'exports')
      with check (bucket_id = 'exports');
  end if;
end $$;
