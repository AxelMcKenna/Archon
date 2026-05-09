-- Persist consent-assessment + forecast state per project (was localStorage-only).
create table if not exists public.consent_assessments (
  project_id uuid primary key references public.projects(id) on delete cascade,
  checklist jsonb,
  manual_documents jsonb not null default '[]'::jsonb,
  hidden_document_ids jsonb not null default '[]'::jsonb,
  document_order jsonb not null default '[]'::jsonb,
  uploads jsonb not null default '{}'::jsonb,
  completions jsonb not null default '{}'::jsonb,
  forecast_context jsonb,
  updated_at timestamp with time zone not null default now()
);

create or replace function public.consent_assessments_touch_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists consent_assessments_touch_updated_at on public.consent_assessments;
create trigger consent_assessments_touch_updated_at
before update on public.consent_assessments
for each row execute function public.consent_assessments_touch_updated_at();

alter table public.consent_assessments enable row level security;

drop policy if exists "consent_assessments are public" on public.consent_assessments;
create policy "consent_assessments are public"
  on public.consent_assessments
  for all
  using (true)
  with check (true);
