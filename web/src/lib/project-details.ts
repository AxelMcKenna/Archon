import type { ProjectDetails, ProjectType } from "@/types/consent";

export type StoredProjectType = "new_dwelling" | "extension" | "accessory" | "deck";

export interface ProjectFormValues {
  address: string;
  bca: string;
  projectType: StoredProjectType;
  description: string;
  projectDetails: ProjectDetails;
}

export interface ProjectSettingsValues {
  buildingConsentNumbers: string;
  ownerPreferredFormOfAddress: "" | "Mr" | "Mrs" | "Ms" | "Miss" | "Dr";
  ownerFullName: string;
  ownerContactPersonFullName: string;
  ownerMailingAddress: string;
  ownerStreetAddressDifferent: boolean;
  ownerStreetAddress: string;
  ownerPhoneLandline: string;
  ownerPhoneMobile: string;
  ownerPhoneDaytime: string;
  ownerPhoneAfterHours: string;
  ownerPhoneFax: string;
  ownerEmailAddress: string;
  ownerWebsiteUrl: string;
  ownerEvidenceOfOwnershipType:
    | ""
    | "Certificate of title"
    | "Lease"
    | "Agreement for sale and purchase"
    | "Other document";
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
    buildingConsentNumbers: "",
    ownerPreferredFormOfAddress: "",
    ownerFullName: "",
    ownerContactPersonFullName: "",
    ownerMailingAddress: "",
    ownerStreetAddressDifferent: false,
    ownerStreetAddress: "",
    ownerPhoneLandline: "",
    ownerPhoneMobile: "",
    ownerPhoneDaytime: "",
    ownerPhoneAfterHours: "",
    ownerPhoneFax: "",
    ownerEmailAddress: "",
    ownerWebsiteUrl: "",
    ownerEvidenceOfOwnershipType: "",
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
    buildingConsentNumbers: String(input.buildingConsentNumbers ?? "").trim(),
    ownerPreferredFormOfAddress: normalizePreferredFormOfAddress(input.ownerPreferredFormOfAddress),
    ownerFullName: String(input.ownerFullName ?? "").trim(),
    ownerContactPersonFullName: String(input.ownerContactPersonFullName ?? "").trim(),
    ownerMailingAddress: String(input.ownerMailingAddress ?? "").trim(),
    ownerStreetAddressDifferent: Boolean(input.ownerStreetAddressDifferent),
    ownerStreetAddress: String(input.ownerStreetAddress ?? "").trim(),
    ownerPhoneLandline: String(input.ownerPhoneLandline ?? "").trim(),
    ownerPhoneMobile: String(input.ownerPhoneMobile ?? "").trim(),
    ownerPhoneDaytime: String(input.ownerPhoneDaytime ?? "").trim(),
    ownerPhoneAfterHours: String(input.ownerPhoneAfterHours ?? "").trim(),
    ownerPhoneFax: String(input.ownerPhoneFax ?? "").trim(),
    ownerEmailAddress: String(input.ownerEmailAddress ?? "").trim(),
    ownerWebsiteUrl: String(input.ownerWebsiteUrl ?? "").trim(),
    ownerEvidenceOfOwnershipType: normalizeEvidenceType(input.ownerEvidenceOfOwnershipType),
  };
}

export function buildProjectSettingsValues(project: {
  project_type: string;
  project_details?: unknown;
}): ProjectSettingsValues {
  const projectDetails = normalizeProjectDetails(project.project_details, project.project_type);
  return {
    buildingConsentNumbers: projectDetails.buildingConsentNumbers ?? "",
    ownerPreferredFormOfAddress: normalizePreferredFormOfAddress(projectDetails.ownerPreferredFormOfAddress),
    ownerFullName: projectDetails.ownerFullName ?? "",
    ownerContactPersonFullName: projectDetails.ownerContactPersonFullName ?? "",
    ownerMailingAddress: projectDetails.ownerMailingAddress ?? "",
    ownerStreetAddressDifferent: Boolean(projectDetails.ownerStreetAddressDifferent),
    ownerStreetAddress: projectDetails.ownerStreetAddress ?? "",
    ownerPhoneLandline: projectDetails.ownerPhoneLandline ?? "",
    ownerPhoneMobile: projectDetails.ownerPhoneMobile ?? "",
    ownerPhoneDaytime: projectDetails.ownerPhoneDaytime ?? "",
    ownerPhoneAfterHours: projectDetails.ownerPhoneAfterHours ?? "",
    ownerPhoneFax: projectDetails.ownerPhoneFax ?? "",
    ownerEmailAddress: projectDetails.ownerEmailAddress ?? "",
    ownerWebsiteUrl: projectDetails.ownerWebsiteUrl ?? "",
    ownerEvidenceOfOwnershipType: normalizeEvidenceType(projectDetails.ownerEvidenceOfOwnershipType),
  };
}

export function parseProjectSettingsFormData(formData: FormData): ProjectSettingsValues {
  return {
    buildingConsentNumbers: String(formData.get("building_consent_numbers") ?? "").trim(),
    ownerPreferredFormOfAddress: normalizePreferredFormOfAddress(formData.get("owner_preferred_form_of_address")),
    ownerFullName: String(formData.get("owner_full_name") ?? "").trim(),
    ownerContactPersonFullName: String(formData.get("owner_contact_person_full_name") ?? "").trim(),
    ownerMailingAddress: String(formData.get("owner_mailing_address") ?? "").trim(),
    ownerStreetAddressDifferent: hasCheckedValue(formData, "owner_street_address_different"),
    ownerStreetAddress: String(formData.get("owner_street_address") ?? "").trim(),
    ownerPhoneLandline: String(formData.get("owner_phone_landline") ?? "").trim(),
    ownerPhoneMobile: String(formData.get("owner_phone_mobile") ?? "").trim(),
    ownerPhoneDaytime: String(formData.get("owner_phone_daytime") ?? "").trim(),
    ownerPhoneAfterHours: String(formData.get("owner_phone_after_hours") ?? "").trim(),
    ownerPhoneFax: String(formData.get("owner_phone_fax") ?? "").trim(),
    ownerEmailAddress: String(formData.get("owner_email_address") ?? "").trim(),
    ownerWebsiteUrl: String(formData.get("owner_website_url") ?? "").trim(),
    ownerEvidenceOfOwnershipType: normalizeEvidenceType(formData.get("owner_evidence_of_ownership_type")),
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

function normalizePreferredFormOfAddress(
  value: unknown,
): "" | "Mr" | "Mrs" | "Ms" | "Miss" | "Dr" {
  const text = String(value ?? "").trim();
  if (text === "Mr" || text === "Mrs" || text === "Ms" || text === "Miss" || text === "Dr") {
    return text;
  }
  return "";
}

function normalizeEvidenceType(
  value: unknown,
): "" | "Certificate of title" | "Lease" | "Agreement for sale and purchase" | "Other document" {
  const text = String(value ?? "").trim();
  if (
    text === "Certificate of title" ||
    text === "Lease" ||
    text === "Agreement for sale and purchase" ||
    text === "Other document"
  ) {
    return text;
  }
  return "";
}
