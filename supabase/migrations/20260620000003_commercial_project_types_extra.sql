-- More commercial project types: accommodation, healthcare, education,
-- carpark, commercial_other. Gives the orphaned fire risk groups (SM managed
-- sleeping, SI institutional, VP vehicle parking) a project-type home plus a
-- catch-all. Risk group / importance level columns already exist (added in
-- 20260620000002); these are just additional enum values.

ALTER TYPE "public"."project_type" ADD VALUE IF NOT EXISTS 'accommodation';
ALTER TYPE "public"."project_type" ADD VALUE IF NOT EXISTS 'healthcare';
ALTER TYPE "public"."project_type" ADD VALUE IF NOT EXISTS 'education';
ALTER TYPE "public"."project_type" ADD VALUE IF NOT EXISTS 'carpark';
ALTER TYPE "public"."project_type" ADD VALUE IF NOT EXISTS 'commercial_other';
