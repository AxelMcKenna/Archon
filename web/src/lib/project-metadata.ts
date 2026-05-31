import type { ProjectTypeId } from "@archon/shared";

export interface NormalizedProjectMetadata {
  project_type: ProjectTypeId;
  address: string;
  description: string | null;
  estimated_floor_area_m2: number | null;
  estimated_construction_value_nzd: number | null;
  involves_structural_work: boolean;
  involves_earthworks: boolean;
  existing_structure_demolished: boolean;
  new_road_access: boolean;
  service_connection_water: boolean;
  service_connection_wastewater: boolean;
  service_connection_stormwater: boolean;
}

export function normalizeProjectMetadata(project: unknown): NormalizedProjectMetadata {
  const row = asRecord(project) ?? {};
  const details = asRecord(row.project_details) ?? {};
  const serviceConnections =
    asRecord(details.new_service_connections) ?? asRecord(details.newServiceConnections);

  return {
    project_type: normalizeProjectType(
      row.project_type ?? details.project_type ?? details.projectType,
    ),
    address: asString(row.address) ?? "",
    description: asNullableString(row.description ?? details.description),
    estimated_floor_area_m2: asNumber(
      row.estimated_floor_area_m2 ??
        details.estimated_floor_area_m2 ??
        details.estimatedFloorAreaM2,
    ),
    estimated_construction_value_nzd: asNumber(
      row.estimated_construction_value_nzd ??
        details.estimated_construction_value_nzd ??
        details.estimatedConstructionValueNZD,
    ),
    involves_structural_work: asBoolean(
      row.involves_structural_work ??
        details.involves_structural_work ??
        details.involvesStructuralWork,
    ),
    involves_earthworks: asBoolean(
      row.involves_earthworks ?? details.involves_earthworks ?? details.involvesEarthworks,
    ),
    existing_structure_demolished: asBoolean(
      row.existing_structure_demolished ??
        details.existing_structure_demolished ??
        details.existingStructureDemolished,
    ),
    new_road_access: asBoolean(
      row.new_road_access ?? details.new_road_access ?? details.newRoadAccess,
    ),
    service_connection_water: asBoolean(
      row.service_connection_water ??
        serviceConnections?.water ??
        details.service_connection_water,
    ),
    service_connection_wastewater: asBoolean(
      row.service_connection_wastewater ??
        serviceConnections?.wastewater ??
        details.service_connection_wastewater,
    ),
    service_connection_stormwater: asBoolean(
      row.service_connection_stormwater ??
        serviceConnections?.stormwater ??
        details.service_connection_stormwater,
    ),
  };
}

export function buildProjectDetailsPayload(input: {
  projectType: string;
  description: string | null;
  estimatedFloorAreaM2: number | null;
  estimatedConstructionValueNZD: number | null;
  involvesStructuralWork: boolean;
  involvesEarthworks: boolean;
  existingStructureDemolished: boolean;
  newRoadAccess: boolean;
  newServiceConnections: {
    water: boolean;
    wastewater: boolean;
    stormwater: boolean;
  };
}) {
  return {
    projectType: normalizeProjectType(input.projectType),
    description: input.description,
    estimatedFloorAreaM2: input.estimatedFloorAreaM2,
    estimatedConstructionValueNZD: input.estimatedConstructionValueNZD,
    involvesStructuralWork: input.involvesStructuralWork,
    involvesEarthworks: input.involvesEarthworks,
    existingStructureDemolished: input.existingStructureDemolished,
    newRoadAccess: input.newRoadAccess,
    newServiceConnections: {
      water: input.newServiceConnections.water,
      wastewater: input.newServiceConnections.wastewater,
      stormwater: input.newServiceConnections.stormwater,
    },
  };
}

function normalizeProjectType(value: unknown): ProjectTypeId {
  if (value === "new_dwelling" || value === "extension" || value === "accessory" || value === "deck") {
    return value;
  }
  if (value === "accessory_building") {
    return "accessory";
  }
  return "new_dwelling";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNullableString(value: unknown): string | null {
  const normalized = asString(value);
  return normalized === null || normalized === "" ? null : normalized;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
