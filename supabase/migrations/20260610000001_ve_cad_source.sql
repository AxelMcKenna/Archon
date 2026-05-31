-- Value engineering for DXF: allow a VE run to be sourced from a CAD upload
-- (cad_uploads) in addition to a PDF plan (plan_uploads).
--
-- Mirrors how rfi_letters links to either a plan_upload or a cad_upload.
-- plan_upload_id becomes nullable; a new cad_upload_id is added; exactly one
-- of the two must be set per row.

alter table public.plan_value_engineering
  alter column plan_upload_id drop not null;

alter table public.plan_value_engineering
  add column if not exists cad_upload_id uuid
    references public.cad_uploads(id) on delete cascade;

alter table public.plan_value_engineering
  drop constraint if exists plan_ve_one_source;
alter table public.plan_value_engineering
  add constraint plan_ve_one_source
  check (num_nonnulls(plan_upload_id, cad_upload_id) = 1);

create index if not exists plan_ve_cad_idx
  on public.plan_value_engineering (cad_upload_id, created_at desc);
