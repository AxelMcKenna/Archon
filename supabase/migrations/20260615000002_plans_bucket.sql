-- Ensure the `plans` storage bucket exists.
--
-- The plans bucket was only ever created in 20260508000005_plans.sql, which is
-- guarded to no-op until public.projects exists. On a from-scratch apply that
-- guard (correctly) skips — and nothing else recreates the bucket — so plan
-- uploads 500 with StorageApiError 404 "The related resource does not exist".
-- Every other bucket (attachments/rfi-uploads/exports/cad/inspection-pdfs/
-- ve-ingest) has an unguarded insert; this backfills the one that didn't.
insert into storage.buckets (id, name, public)
values ('plans', 'plans', false)
on conflict (id) do nothing;
