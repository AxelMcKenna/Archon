import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

interface ChecklistRequiredDocument {
  document_type: string;
  category: string;
  reason: string;
  triggered_by: string[];
}

interface Checklist {
  address: string;
  coordinates: { lat: number; lon: number; nztm_x?: number; nztm_y?: number };
  zone_info: { zone_type: string; zone_code?: string; source_council?: string };
  overlays: Record<string, boolean>;
  required_documents: ChecklistRequiredDocument[];
}

interface ResolvedDocument {
  id: string;
  title: string;
  description: string;
  category: string;
  trigger: string;
  specialist: string | null;
  referenceClause: string | null;
}

export interface BootstrapIntake {
  projectType: string;
  estimatedFloorAreaM2: number | null;
  estimatedConstructionValueNZD: number | null;
  involvesStructuralWork: boolean;
  involvesEarthworks: boolean;
  existingStructureDemolished: boolean;
  newRoadAccess: boolean;
  serviceConnectionWater: boolean;
  serviceConnectionWastewater: boolean;
  serviceConnectionStormwater: boolean;
  yearOfConstruction?: number | null;
}

/**
 * Generate a consent checklist + forecast context from project intake and persist
 * to consent_assessments. Designed to run as fire-and-forget after project creation.
 * Errors are swallowed (logged) so they never block the user-facing redirect.
 */
export async function bootstrapConsentAssessment(
  supabase: SupabaseClient,
  projectId: string,
  address: string,
  intake: BootstrapIntake,
): Promise<void> {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

    const checklistResp = await fetch(`${apiUrl}/address-to-checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, city: "", postalcode: "" }),
    });
    if (!checklistResp.ok) {
      console.warn("[consent-bootstrap] address-to-checklist failed", checklistResp.status);
      return;
    }
    const checklist = (await checklistResp.json()) as Checklist;

    const projectDetails = {
      projectType: intake.projectType,
      estimatedFloorAreaM2: intake.estimatedFloorAreaM2,
      estimatedConstructionValueNZD: intake.estimatedConstructionValueNZD,
      involvesStructuralWork: intake.involvesStructuralWork,
      involvesEarthworks: intake.involvesEarthworks,
      existingStructureDemolished: intake.existingStructureDemolished,
      yearOfConstruction: intake.yearOfConstruction ?? null,
      newRoadAccess: intake.newRoadAccess,
      newServiceConnections: {
        water: intake.serviceConnectionWater,
        wastewater: intake.serviceConnectionWastewater,
        stormwater: intake.serviceConnectionStormwater,
      },
    };

    const activeOverlays = Object.entries(checklist.overlays ?? {})
      .filter(([, isActive]) => isActive)
      .map(([key]) => normalizeOverlayKey(key))
      .filter((k): k is string => Boolean(k));
    const zoneCategory = getZoneCategory(checklist.zone_info?.zone_type);

    const resolveResp = await fetch(`${apiUrl}/api/resolve-documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zoneCategory, activeOverlays, projectDetails }),
    });

    let resolvedDocuments: ResolvedDocument[] = [];
    if (resolveResp.ok) {
      const json = (await resolveResp.json()) as { documents: ResolvedDocument[] };
      resolvedDocuments = json.documents ?? [];
    } else {
      console.warn("[consent-bootstrap] resolve-documents failed", resolveResp.status);
    }

    const mergedChecklist: Checklist = {
      ...checklist,
      required_documents: mergeRequiredDocuments(
        checklist.required_documents ?? [],
        resolvedDocuments,
      ),
    };

    const forecastContext = {
      address,
      lat: checklist.coordinates?.lat ?? 0,
      lon: checklist.coordinates?.lon ?? 0,
      zoneCategory,
      activeOverlays,
      projectType: intake.projectType,
      estimatedFloorAreaM2: intake.estimatedFloorAreaM2,
      estimatedConstructionValueNZD: intake.estimatedConstructionValueNZD,
      involvesStructuralWork: intake.involvesStructuralWork,
      involvesEarthworks: intake.involvesEarthworks,
      existingStructureDemolished: intake.existingStructureDemolished,
      newRoadAccess: intake.newRoadAccess,
      yearOfConstruction: intake.yearOfConstruction ?? null,
      newServiceConnections: projectDetails.newServiceConnections,
    };

    const { error } = await supabase.from("consent_assessments").upsert(
      {
        project_id: projectId,
        checklist: mergedChecklist,
        forecast_context: forecastContext,
      },
      { onConflict: "project_id" },
    );
    if (error) {
      console.warn("[consent-bootstrap] upsert failed", error.message);
    }
  } catch (err) {
    console.warn(
      "[consent-bootstrap] unexpected error",
      err instanceof Error ? err.message : String(err),
    );
  }
}

function getZoneCategory(zoneType: string | null | undefined) {
  if (!zoneType || typeof zoneType !== "string") return "general";
  const value = zoneType.toLowerCase();
  if (value.includes("residential")) return "residential";
  if (value.includes("commercial") || value.includes("city centre")) return "commercial";
  if (value.includes("industrial")) return "industrial";
  if (value.includes("rural")) return "rural";
  if (value.includes("open space") || value.includes("open")) return "openspace";
  return "general";
}

function normalizeOverlayKey(sourceKey: string): string | null {
  const map: Record<string, string> = {
    liquefaction: "liquefaction",
    flood: "floodHigh",
    flood_ponding: "floodPonding",
    slope: "slopeHazard",
    heritage_item: "heritage",
    heritage_character: "heritageChar",
    residential_character: "residentialChar",
    tsunami: "tsunami",
    coastal_erosion: "coastalErosion",
    coastal_inundation: "coastalInundation",
    protected_vegetation: "protectedVeg",
    notable_trees: "notableTree",
  };
  return map[sourceKey] ?? null;
}

function slugifyDocument(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function mergeRequiredDocuments(
  addressDocuments: ChecklistRequiredDocument[],
  resolvedDocuments: ResolvedDocument[],
): ChecklistRequiredDocument[] {
  const merged = new Map<string, ChecklistRequiredDocument>();

  for (const doc of addressDocuments) {
    merged.set(slugifyDocument(doc.document_type), {
      ...doc,
      triggered_by: [...doc.triggered_by],
    });
  }

  for (const doc of resolvedDocuments) {
    const key = slugifyDocument(doc.title);
    const triggers = [doc.trigger, doc.specialist, doc.referenceClause].filter(
      (v): v is string => Boolean(v),
    );
    const existing = merged.get(key);
    if (existing) {
      merged.set(key, {
        ...existing,
        category: existing.category || doc.category,
        reason: existing.reason.includes(doc.description)
          ? existing.reason
          : `${existing.reason} ${doc.description}`.trim(),
        triggered_by: Array.from(new Set([...existing.triggered_by, ...triggers])),
      });
      continue;
    }
    merged.set(key, {
      document_type: doc.title,
      category: doc.category,
      reason: doc.description,
      triggered_by: triggers,
    });
  }

  return Array.from(merged.values());
}
