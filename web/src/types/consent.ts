export type ZoneCategory =
  | "residential"
  | "commercial"
  | "industrial"
  | "rural"
  | "openspace"
  | "general";

export type ProjectType = "new_dwelling" | "extension" | "accessory_building" | "deck";

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
