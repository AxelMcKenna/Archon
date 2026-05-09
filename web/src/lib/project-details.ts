import type { ProjectDetails, ProjectType } from "@/types/consent";

export type StoredProjectType = "new_dwelling" | "extension" | "accessory" | "deck";

export interface ProjectFormValues {
  address: string;
  bca: string;
  projectType: StoredProjectType;
  description: string;
  projectDetails: ProjectDetails;
}

export function normalizeProjectType(value: string | null | undefined): ProjectType {
  if (value === "accessory" || value === "accessory_building") {
    return "accessory_building";
  }
  if (value === "new_dwelling" || value === "extension" || value === "deck") {
    return value;
  }
  return "new_dwelling";
}

export function getStoredProjectType(value: string | null | undefined): StoredProjectType {
  if (value === "accessory" || value === "accessory_building") {
    return "accessory";
  }
  if (value === "extension" || value === "deck") {
    return value;
  }
  return "new_dwelling";
}

export function createDefaultProjectDetails(projectType?: string | null): ProjectDetails {
  return {
    projectType: normalizeProjectType(projectType),
    estimatedFloorAreaM2: null,
    estimatedConstructionValueNZD: null,
    involvesStructuralWork: false,
    involvesEarthworks: false,
    existingStructureDemolished: false,
    newRoadAccess: false,
    newServiceConnections: {
      water: false,
      wastewater: false,
      stormwater: false,
    },
  };
}

export function normalizeProjectDetails(
  value: unknown,
  projectTypeFallback?: string | null,
): ProjectDetails {
  const defaults = createDefaultProjectDetails(projectTypeFallback);
  if (!value || typeof value !== "object") {
    return defaults;
  }

  const input = value as Partial<ProjectDetails> & {
    newServiceConnections?: Partial<ProjectDetails["newServiceConnections"]>;
  };

  return {
    projectType: normalizeProjectType(input.projectType ?? projectTypeFallback),
    estimatedFloorAreaM2: normalizeNullableNumber(input.estimatedFloorAreaM2),
    estimatedConstructionValueNZD: normalizeNullableNumber(
      input.estimatedConstructionValueNZD,
    ),
    involvesStructuralWork: Boolean(input.involvesStructuralWork),
    involvesEarthworks: Boolean(input.involvesEarthworks),
    existingStructureDemolished: Boolean(input.existingStructureDemolished),
    newRoadAccess: Boolean(input.newRoadAccess),
    newServiceConnections: {
      water: Boolean(input.newServiceConnections?.water),
      wastewater: Boolean(input.newServiceConnections?.wastewater),
      stormwater: Boolean(input.newServiceConnections?.stormwater),
    },
  };
}

export function buildProjectFormValues(project: {
  address: string;
  bca: string;
  project_type: string;
  description: string | null;
  project_details?: unknown;
}): ProjectFormValues {
  const storedProjectType = getStoredProjectType(project.project_type);
  const projectDetails = normalizeProjectDetails(
    project.project_details,
    storedProjectType,
  );

  return {
    address: project.address,
    bca: project.bca,
    projectType: storedProjectType,
    description: project.description ?? "",
    projectDetails,
  };
}

export function parseProjectFormData(formData: FormData): ProjectFormValues {
  const projectType = getStoredProjectType(String(formData.get("project_type") ?? "").trim());

  return {
    address: String(formData.get("address") ?? "").trim(),
    bca: String(formData.get("bca") ?? "").trim(),
    projectType,
    description: String(formData.get("description") ?? "").trim(),
    projectDetails: {
      projectType: normalizeProjectType(projectType),
      estimatedFloorAreaM2: parseNullableNumber(
        String(formData.get("estimated_floor_area_m2") ?? ""),
      ),
      estimatedConstructionValueNZD: parseNullableNumber(
        String(formData.get("estimated_construction_value_nzd") ?? ""),
      ),
      involvesStructuralWork: hasCheckedValue(formData, "involves_structural_work"),
      involvesEarthworks: hasCheckedValue(formData, "involves_earthworks"),
      existingStructureDemolished: hasCheckedValue(
        formData,
        "existing_structure_demolished",
      ),
      newRoadAccess: hasCheckedValue(formData, "new_road_access"),
      newServiceConnections: {
        water: hasCheckedValue(formData, "new_service_connection_water"),
        wastewater: hasCheckedValue(formData, "new_service_connection_wastewater"),
        stormwater: hasCheckedValue(formData, "new_service_connection_stormwater"),
      },
    },
  };
}

function hasCheckedValue(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function parseNullableNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

function normalizeNullableNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.trunc(value));
}
