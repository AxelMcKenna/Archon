-- Intake metadata captured by the new-project form and consumed by the
-- inspections schedule + forecasting code. All columns are nullable so
-- existing rows continue to work without backfill.

alter table public.projects
  add column if not exists estimated_floor_area_m2          numeric,
  add column if not exists estimated_construction_value_nzd numeric,
  add column if not exists involves_structural_work         boolean default false,
  add column if not exists involves_earthworks              boolean default false,
  add column if not exists existing_structure_demolished    boolean default false,
  add column if not exists new_road_access                  boolean default false,
  add column if not exists service_connection_water         boolean default false,
  add column if not exists service_connection_wastewater    boolean default false,
  add column if not exists service_connection_stormwater    boolean default false;
