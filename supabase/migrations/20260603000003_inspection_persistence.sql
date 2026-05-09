create table if not exists public.project_inspections (
  project_id uuid not null references public.projects(id) on delete cascade,
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
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint project_inspections_pkey primary key (project_id, inspection_id),
  constraint project_inspections_status_check
    check (status in ('Not Conducted', 'Passed', 'Failed'))
);

create table if not exists public.project_inspection_checklist_items (
  project_id uuid not null,
  inspection_id text not null,
  requirement text not null,
  checked boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamp with time zone not null default now(),
  constraint project_inspection_checklist_items_pkey
    primary key (project_id, inspection_id, sort_order),
  constraint project_inspection_checklist_items_inspection_fkey
    foreign key (project_id, inspection_id)
    references public.project_inspections(project_id, inspection_id)
    on delete cascade
);

create table if not exists public.project_inspection_pdfs (
  id text primary key,
  project_id uuid not null,
  inspection_id text not null,
  name text not null,
  size_bytes bigint not null default 0,
  storage_bucket text not null default 'inspection-pdfs',
  storage_path text not null,
  uploaded_at timestamp with time zone not null default now(),
  constraint project_inspection_pdfs_inspection_fkey
    foreign key (project_id, inspection_id)
    references public.project_inspections(project_id, inspection_id)
    on delete cascade
);

create index if not exists project_inspections_project_sort_idx
  on public.project_inspections(project_id, sort_order);

create index if not exists project_inspections_rescheduled_from_idx
  on public.project_inspections(project_id, rescheduled_from);

create index if not exists project_inspection_checklist_items_inspection_idx
  on public.project_inspection_checklist_items(project_id, inspection_id, sort_order);

create index if not exists project_inspection_pdfs_inspection_idx
  on public.project_inspection_pdfs(project_id, inspection_id, uploaded_at);

create or replace trigger project_inspections_updated_at
  before update on public.project_inspections
  for each row execute function public.set_updated_at();

create or replace trigger project_inspection_checklist_items_updated_at
  before update on public.project_inspection_checklist_items
  for each row execute function public.set_updated_at();

alter table public.project_inspections disable row level security;
alter table public.project_inspection_checklist_items disable row level security;
alter table public.project_inspection_pdfs disable row level security;

grant all on table public.project_inspections to anon;
grant all on table public.project_inspections to authenticated;
grant all on table public.project_inspections to service_role;

grant all on table public.project_inspection_checklist_items to anon;
grant all on table public.project_inspection_checklist_items to authenticated;
grant all on table public.project_inspection_checklist_items to service_role;

grant all on table public.project_inspection_pdfs to anon;
grant all on table public.project_inspection_pdfs to authenticated;
grant all on table public.project_inspection_pdfs to service_role;

insert into storage.buckets (id, name, public)
values ('inspection-pdfs', 'inspection-pdfs', false)
on conflict (id) do nothing;

create policy "inspection_pdfs_open" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'inspection-pdfs')
  with check (bucket_id = 'inspection-pdfs');
