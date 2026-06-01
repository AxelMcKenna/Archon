-- Free-form intake details for a project, captured by the new-project form.

alter table public.projects
  add column if not exists project_details jsonb;
