alter table attachments
add column if not exists document_status text,
add column if not exists display_name text,
add column if not exists document_type text;

update attachments
set document_status = coalesce(document_status, 'pending')
where document_status is null;

alter table attachments
alter column document_status set default 'pending',
alter column document_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'attachments_document_status_check'
  ) then
    alter table attachments
    add constraint attachments_document_status_check
    check (document_status in ('pending', 'approved', 'rejected', 'missing'));
  end if;

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
