export type ZoneCategory =
  | "residential"
  | "commercial"
  | "industrial"
  | "rural"
  | "openspace"
  | "general";

export type ProjectType =
  | "new_dwelling"
  | "extension"
  | "accessory_building"
  | "deck"
  | "multi_unit_residential"
  | "commercial_office"
  | "retail"
  | "industrial"
  | "mixed_use"
  | "accommodation"
  | "healthcare"
  | "education"
  | "carpark"
  | "commercial_other";

export type RiskGroup = "SH" | "SM" | "SI" | "CA" | "WB" | "WF" | "VP";
export type ImportanceLevel = "IL1" | "IL2" | "IL3" | "IL4";

export interface ServiceConnections {
  water: boolean;
  wastewater: boolean;
  stormwater: boolean;
}

export interface ProjectDetails {
  projectType: ProjectType;
  estimatedFloorAreaM2: number | null;
  estimatedConstructionValueNZD: number | null;
  involvesStructuralWork: boolean;
  involvesEarthworks: boolean;
  existingStructureDemolished: boolean;
  yearOfConstruction: number | null;
  newRoadAccess: boolean;
  newServiceConnections: ServiceConnections;
  riskGroup?: RiskGroup | null;
  importanceLevel?: ImportanceLevel | null;
  buildingConsentNumbers?: string;
  ownerPreferredFormOfAddress?: "" | "Mr" | "Mrs" | "Ms" | "Miss" | "Dr";
  ownerFullName?: string;
  ownerContactPersonFullName?: string;
  ownerMailingAddress?: string;
  ownerStreetAddressDifferent?: boolean;
  ownerStreetAddress?: string;
  ownerPhoneLandline?: string;
  ownerPhoneMobile?: string;
  ownerPhoneDaytime?: string;
  ownerPhoneAfterHours?: string;
  ownerPhoneFax?: string;
  ownerEmailAddress?: string;
  ownerWebsiteUrl?: string;
  ownerEvidenceOfOwnershipType?:
    | ""
    | "Certificate of title"
    | "Lease"
    | "Agreement for sale and purchase"
    | "Other document";
}

export interface ResolveDocumentsRequest {
  zoneCategory: ZoneCategory;
  activeOverlays: string[];
  projectDetails: ProjectDetails;
}

export interface Document {
  id: string;
  title: string;
  description: string;
  category: string;
  trigger: string;
  specialist: string | null;
  referenceClause: string | null;
}

export interface ResolveDocumentsResponse {
  documents: Document[];
  totalCount: number;
  specialistCount: number;
}
