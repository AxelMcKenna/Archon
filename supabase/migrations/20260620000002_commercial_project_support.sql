-- Commercial building support: new project types + occupancy modelling.
--
-- Adds the commercial project_type enum values and three nullable columns on
-- projects that capture the NZ Building Code compliance dimensions:
--   * risk_group        — fire risk group (SH/SM/SI/CA/WB/WF/VP); drives C/AS1 vs C/AS2.
--   * importance_level  — AS/NZS 1170 IL1-IL4; drives B1 structural design.
--   * occupancy_notes   — free-text describing mixed-use / unusual occupancy.
--
-- Kept as validated text (not enums) so the model can evolve without further
-- enum migrations; the application validates against shared/taxonomy.json.
--
-- NOTE: Postgres cannot use a newly-added enum value in the same transaction
-- that adds it. ADD VALUE statements run auto-committed (Supabase migrations run
-- each statement outside an explicit BEGIN/COMMIT), and the ALTER TABLE below
-- does not reference the new values, so this is safe in one migration file.

ALTER TYPE "public"."project_type" ADD VALUE IF NOT EXISTS 'multi_unit_residential';
ALTER TYPE "public"."project_type" ADD VALUE IF NOT EXISTS 'commercial_office';
ALTER TYPE "public"."project_type" ADD VALUE IF NOT EXISTS 'retail';
ALTER TYPE "public"."project_type" ADD VALUE IF NOT EXISTS 'industrial';
ALTER TYPE "public"."project_type" ADD VALUE IF NOT EXISTS 'mixed_use';

ALTER TABLE "public"."projects" ADD COLUMN IF NOT EXISTS "risk_group" "text";
ALTER TABLE "public"."projects" ADD COLUMN IF NOT EXISTS "importance_level" "text";
ALTER TABLE "public"."projects" ADD COLUMN IF NOT EXISTS "occupancy_notes" "text";

COMMENT ON COLUMN "public"."projects"."risk_group" IS
  'NZ Building Code fire risk group: SH/SM/SI/CA/WB/WF/VP. SH -> C/AS1, others -> C/AS2. Validated against shared/taxonomy.json risk_groups.';
COMMENT ON COLUMN "public"."projects"."importance_level" IS
  'AS/NZS 1170 importance level: IL1-IL4. Drives B1 seismic/wind design. Validated against shared/taxonomy.json importance_levels.';
COMMENT ON COLUMN "public"."projects"."occupancy_notes" IS
  'Free-text occupancy detail, e.g. mixed-use risk-group split per storey.';
