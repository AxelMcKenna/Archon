-- Alternative Solution consideration on plan flags.
--
-- The verifier (app.vision.plans.vision_pass.verify_flags) now records, for
-- each surviving flag, whether the flagged detail deviates from the MBIE
-- Acceptable Solution in a way that could still comply with the Building Code
-- via an Alternative Solution (Building Act s19(1)(b)), plus the supporting
-- evidence pathway. This does not drop the flag — it reframes the RFI from a
-- flat non-compliance into "AS deviation, resolvable via Alternative Solution".
--
-- Mirrors the existing nullable-add pattern: plan_flags is append-only and the
-- full flag set also lives in plan_uploads.analysis jsonb, so no backfill is
-- needed — pre-existing rows simply read false / null.

alter table public.plan_flags
  add column if not exists alt_solution_available boolean not null default false,
  add column if not exists alt_solution_pathway   text;
