alter table public.consent_assessments
  add column if not exists submission_packages jsonb not null default '[]'::jsonb,
  add column if not exists document_submission_ids jsonb not null default '{}'::jsonb;
