-- Project initializer fields used to tailor generated inspection schedules.

alter table projects
  add column if not exists estimated_floor_area_m2 numeric(10, 2),
  add column if not exists estimated_construction_value_nzd numeric(12, 2),
  add column if not exists involves_structural_work boolean not null default false,
  add column if not exists involves_earthworks boolean not null default false,
  add column if not exists existing_structure_demolished boolean not null default false,
  add column if not exists new_road_access boolean not null default false,
  add column if not exists service_connection_water boolean not null default false,
  add column if not exists service_connection_wastewater boolean not null default false,
  add column if not exists service_connection_stormwater boolean not null default false;
