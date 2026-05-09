do $$
begin
  if to_regclass('public.attachments') is null then
    return;
  end if;

  alter table attachments
  add column if not exists display_name text,
  add column if not exists document_type text;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'attachments_document_type_check'
  ) then
    alter table attachments
    add constraint attachments_document_type_check
    check (
      document_type is null
      or document_type in ('plans', 'consents', 'certificates', 'inspections', 'photos', 'other')
    );
  end if;
end $$;
