-- Database-backed inspection records, checklist state, and returned PDFs.

create table if not exists project_inspections (
  project_id uuid not null references projects(id) on delete cascade,
  inspection_id text not null,
  base_inspection_id text not null,
  inspection_type_id text not null,
  manual boolean not null default false,
  deleted boolean not null default false,
  sort_order integer not null default 0,
  title text not null,
  category text not null,
  timing text not null,
  requirements text[] not null default '{}',
  details text not null default '',
  due_date date,
  booked_date date,
  status text not null default 'Not Conducted',
  result_notes text not null default '',
  rescheduled_from text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, inspection_id),
  constraint project_inspections_status_check
    check (status in ('Not Conducted', 'Passed', 'Failed'))
);

create index if not exists project_inspections_project_order_idx
  on project_inspections (project_id, sort_order, created_at);

create index if not exists project_inspections_rescheduled_from_idx
  on project_inspections (project_id, rescheduled_from);

create table if not exists project_inspection_checklist_items (
  project_id uuid not null,
  inspection_id text not null,
  requirement text not null,
  checked boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (project_id, inspection_id, requirement),
  foreign key (project_id, inspection_id)
    references project_inspections(project_id, inspection_id)
    on delete cascade
);

create index if not exists project_inspection_checklist_items_order_idx
  on project_inspection_checklist_items (project_id, inspection_id, sort_order);

create table if not exists project_inspection_pdfs (
  id text primary key,
  project_id uuid not null,
  inspection_id text not null,
  name text not null,
  size_bytes bigint not null,
  storage_bucket text not null default 'inspection-pdfs',
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  foreign key (project_id, inspection_id)
    references project_inspections(project_id, inspection_id)
    on delete cascade
);

create index if not exists project_inspection_pdfs_inspection_idx
  on project_inspection_pdfs (project_id, inspection_id, uploaded_at);

drop trigger if exists project_inspections_updated_at on project_inspections;
create trigger project_inspections_updated_at before update on project_inspections
  for each row execute function set_updated_at();

insert into storage.buckets (id, name, public)
values ('inspection-pdfs', 'inspection-pdfs', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'inspection_pdfs_open'
  ) then
    create policy "inspection_pdfs_open"
    on storage.objects
    for all to anon, authenticated
    using (bucket_id = 'inspection-pdfs')
    with check (bucket_id = 'inspection-pdfs');
  end if;
end $$;

alter table project_inspections disable row level security;
alter table project_inspection_checklist_items disable row level security;
alter table project_inspection_pdfs disable row level security;

grant all on table project_inspections to anon, authenticated, service_role;
grant all on table project_inspection_checklist_items to anon, authenticated, service_role;
grant all on table project_inspection_pdfs to anon, authenticated, service_role;
