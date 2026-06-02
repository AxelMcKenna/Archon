-- Clause provenance on plan flags.
--
-- The verifier (app.vision.plans.vision_pass.verify_flags) retrieves a set of
-- MBIE Acceptable Solution / Verification Method clauses for each flag and
-- judges AS-compliance and the Alternative-Solution pathway against them.
-- Until now the verdict was persisted but the *evidence* — which clauses drove
-- it — was thrown away, so an AS-compliant drop or an alt-solution annotation
-- could not be audited back to its source. This stores that provenance
-- deterministically (no LLM): the exact clauses each flag was checked against.
--
-- Mirrors the existing nullable-add pattern (see
-- 20260612000002_plan_flags_alt_solution.sql): plan_flags is append-only and
-- the full flag set also lives in plan_uploads.analysis jsonb, so no backfill
-- is needed — pre-existing rows simply read null.

alter table public.plan_flags
  add column if not exists mbie_clauses_considered jsonb;

comment on column public.plan_flags.mbie_clauses_considered is
  'Array of {document_id, clause_number, heading, page, source_url} the flag '
  'was checked against during verification; deterministic provenance for the '
  'as_compliant / alt_solution verdict.';
