-- Ensure deployed databases support idempotent checklist upserts.
--
-- The original inspection migration existed with conflicting local definitions
-- during development. This forward migration normalizes the live schema instead
-- of relying on edits to an already-applied migration version.

do $$
begin
  if to_regclass('public.project_inspection_checklist_items') is null then
    return;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.project_inspection_checklist_items'::regclass
      and conname = 'project_inspection_checklist_items_pkey'
  ) then
    alter table public.project_inspection_checklist_items
      drop constraint project_inspection_checklist_items_pkey;
  end if;

  alter table public.project_inspection_checklist_items
    add constraint project_inspection_checklist_items_pkey
    primary key (project_id, inspection_id, sort_order);
end $$;
