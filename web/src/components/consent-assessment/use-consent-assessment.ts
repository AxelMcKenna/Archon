"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectDetails, ProjectType, ResolveDocumentsResponse } from "@/types/consent";
import {
  type ChecklistResult,
  type CompletionRecord,
  createManualDocumentRecord,
  getOrderedDocumentIds,
  type ManualConsentDocumentInput,
  normalizeDocuments,
  type StoredManualConsentDocument,
  type ConsentDocument,
  type UploadRecord,
  getCompletionStats,
  isManualDocument,
  slugifyDocument,
} from "./model";
import {
  type ConsentAssessmentRow,
  EMPTY_ROW,
  browserClient,
  loadConsentAssessment,
  saveConsentAssessment,
} from "./persistence";

export interface ProjectIntake {
  projectType: string;
  estimatedFloorAreaM2?: number | null;
  estimatedConstructionValueNZD?: number | null;
  involvesStructuralWork?: boolean;
  involvesEarthworks?: boolean;
  existingStructureDemolished?: boolean;
  newRoadAccess?: boolean;
  serviceConnectionWater?: boolean;
  serviceConnectionWastewater?: boolean;
  serviceConnectionStormwater?: boolean;
  yearOfConstruction?: number | null;
}

interface UseConsentAssessmentOptions {
  projectId: string;
  address: string;
  projectDetails?: ProjectDetails;
  projectIntake?: ProjectIntake;
}

export function useConsentAssessment({
  projectId,
  address,
  projectDetails,
  projectIntake,
}: UseConsentAssessmentOptions) {
  const requestIdRef = useRef(0);
  const supabaseRef = useRef(browserClient());
  const [state, setState] = useState<ConsentAssessmentRow>(EMPTY_ROW);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHasHydrated(false);
    void (async () => {
      const row = await loadConsentAssessment(supabaseRef.current, projectId);
      if (cancelled) return;
      requestIdRef.current += 1;
      setState(row);
      setError(null);
      setIsLoading(false);
      setHasHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const documents = useMemo<ConsentDocument[]>(
    () =>
      normalizeDocuments(
        state.checklist?.required_documents ?? [],
        state.manualDocuments,
        state.hiddenDocumentIds,
        state.documentOrder,
      ),
    [state],
  );

  const documentMap = useMemo(
    () => new Map(documents.map((document) => [document.id, document])),
    [documents],
  );

  const completion = useMemo(
    () => getCompletionStats(documents, state.completions),
    [documents, state.completions],
  );

  function commitState(
    updater: (current: ConsentAssessmentRow) => ConsentAssessmentRow,
  ) {
    setState((current) => {
      const next = updater(current);
      void saveConsentAssessment(supabaseRef.current, projectId, next);
      return next;
    });
  }

  async function generateChecklist() {
    if (!address) {
      setError("Project address is required before a consent checklist can be generated.");
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/address-to-checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, city: "", postalcode: "" }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(formatApiError(payload) || "Failed to generate consent checklist.");
      }

      const payload = (await response.json()) as ChecklistResult;
      if (requestIdRef.current !== requestId) {
        return;
      }

      const effectiveDetails =
        projectDetails ?? intakeToProjectDetails(projectIntake);
      const resolvedDocuments = await resolveProjectDocuments(
        apiUrl,
        payload,
        effectiveDetails,
      );
      const nextChecklist: ChecklistResult = {
        ...payload,
        required_documents: mergeRequiredDocuments(
          payload.required_documents,
          resolvedDocuments?.documents ?? [],
        ),
      };

      const nextForecastContext = buildForecastContext(
        address,
        nextChecklist,
        projectIntake,
      );

      commitState((current) => ({
        ...current,
        checklist: nextChecklist,
        forecastContext: nextForecastContext,
      }));
    } catch (requestError) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "An unexpected error occurred while generating the checklist.",
      );
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }

  function createManualDocument(input: ManualConsentDocumentInput, file?: File | null) {
    const record = createManualDocumentRecord(input);

    commitState((current) => {
      const nextCompletions = { ...current.completions };
      const nextUploads = { ...current.uploads };

      if (input.completed) {
        nextCompletions[record.id] = { completedAt: new Date().toISOString() };
      }
      if (file) {
        nextUploads[record.id] = {
          fileName: file.name,
          fileSize: file.size,
          uploadedAt: new Date().toISOString(),
        };
      }

      return {
        ...current,
        manualDocuments: [...current.manualDocuments, record],
        hiddenDocumentIds: current.hiddenDocumentIds.filter((id) => id !== record.id),
        documentOrder: [...current.documentOrder.filter((id) => id !== record.id), record.id],
        completions: nextCompletions,
        uploads: nextUploads,
      };
    });

    return record.id;
  }

  function removeDocument(documentId: string) {
    commitState((current) => {
      const currentDocuments = getDocumentsForState(current);
      const target = currentDocuments.find((document) => document.id === documentId);
      const nextCompletions = { ...current.completions };
      const nextUploads = { ...current.uploads };

      delete nextCompletions[documentId];
      delete nextUploads[documentId];

      return {
        ...current,
        manualDocuments: isManualDocument(target)
          ? current.manualDocuments.filter((document) => document.id !== documentId)
          : current.manualDocuments,
        hiddenDocumentIds: isManualDocument(target)
          ? current.hiddenDocumentIds.filter((id) => id !== documentId)
          : Array.from(new Set([...current.hiddenDocumentIds, documentId])),
        documentOrder: current.documentOrder.filter((id) => id !== documentId),
        completions: nextCompletions,
        uploads: nextUploads,
      };
    });
  }

  function saveDocumentOrder(nextDocumentOrder: string[]) {
    commitState((current) => ({
      ...current,
      documentOrder: nextDocumentOrder,
    }));
  }

  function resetDocumentOrder() {
    commitState((current) => ({
      ...current,
      documentOrder: getOrderedDocumentIds(
        normalizeDocuments(
          current.checklist?.required_documents ?? [],
          current.manualDocuments,
          current.hiddenDocumentIds,
          [],
        ),
      ),
    }));
  }

  function saveUpload(documentId: string, file: File) {
    commitState((current) => ({
      ...current,
      uploads: {
        ...current.uploads,
        [documentId]: {
          fileName: file.name,
          fileSize: file.size,
          uploadedAt: new Date().toISOString(),
        },
      },
    }));
  }

  function removeUpload(documentId: string) {
    commitState((current) => {
      const nextUploads = { ...current.uploads };
      delete nextUploads[documentId];

      return {
        ...current,
        uploads: nextUploads,
      };
    });
  }

  function setDocumentCompleted(documentId: string, checked: boolean) {
    commitState((current) => {
      const nextCompletions = { ...current.completions };

      if (checked) {
        nextCompletions[documentId] = { completedAt: new Date().toISOString() };
      } else {
        delete nextCompletions[documentId];
      }

      return {
        ...current,
        completions: nextCompletions,
      };
    });
  }

  return {
    checklist: state.checklist,
    documents,
    documentMap,
    manualDocuments: state.manualDocuments,
    hiddenDocumentIds: state.hiddenDocumentIds,
    documentOrder: state.documentOrder,
    uploads: state.uploads,
    completions: state.completions,
    forecastContext: state.forecastContext,
    completion,
    isLoading,
    error,
    hasHydrated,
    generateChecklist,
    createManualDocument,
    removeDocument,
    saveDocumentOrder,
    resetDocumentOrder,
    saveUpload,
    removeUpload,
    setDocumentCompleted,
  };
}

function intakeToProjectDetails(
  intake: ProjectIntake | undefined,
): ProjectDetails {
  const allowedTypes: ProjectType[] = [
    "new_dwelling",
    "extension",
    "accessory_building",
    "deck",
  ];
  const rawType = (intake?.projectType ?? "new_dwelling") as ProjectType;
  const projectType: ProjectType = allowedTypes.includes(rawType)
    ? rawType
    : "new_dwelling";
  return {
    projectType,
    estimatedFloorAreaM2: intake?.estimatedFloorAreaM2 ?? null,
    estimatedConstructionValueNZD: intake?.estimatedConstructionValueNZD ?? null,
    involvesStructuralWork: intake?.involvesStructuralWork ?? false,
    involvesEarthworks: intake?.involvesEarthworks ?? false,
    existingStructureDemolished: intake?.existingStructureDemolished ?? false,
    yearOfConstruction: intake?.yearOfConstruction ?? null,
    newRoadAccess: intake?.newRoadAccess ?? false,
    newServiceConnections: {
      water: intake?.serviceConnectionWater ?? false,
      wastewater: intake?.serviceConnectionWastewater ?? false,
      stormwater: intake?.serviceConnectionStormwater ?? false,
    },
  };
}

async function resolveProjectDocuments(
  apiUrl: string,
  checklist: ChecklistResult,
  projectDetails: ProjectDetails,
) {
  const response = await fetch(`${apiUrl}/api/resolve-documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      zoneCategory: getZoneCategory(checklist.zone_info?.zone_type),
      activeOverlays: Object.entries(checklist.overlays ?? {})
        .filter(([, isActive]) => isActive)
        .map(([key]) => normalizeOverlayKey(key))
        .filter((key): key is string => Boolean(key)),
      projectDetails,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(formatApiError(payload) || "Failed to resolve consent documents.");
  }

  return (await response.json()) as ResolveDocumentsResponse;
}

function mergeRequiredDocuments(
  addressDocuments: ChecklistResult["required_documents"],
  resolvedDocuments: ResolveDocumentsResponse["documents"],
) {
  const merged = new Map<string, ChecklistResult["required_documents"][number]>();

  for (const document of addressDocuments) {
    merged.set(slugifyDocument(document.document_type), {
      ...document,
      triggered_by: [...document.triggered_by],
    });
  }

  for (const document of resolvedDocuments) {
    const key = slugifyDocument(document.title);
    const existing = merged.get(key);
    const nextTriggeredBy = buildResolvedDocumentTriggers(document);

    if (existing) {
      merged.set(key, {
        ...existing,
        category: existing.category || document.category,
        reason: mergeReason(existing.reason, document.description),
        triggered_by: Array.from(new Set([...existing.triggered_by, ...nextTriggeredBy])),
      });
      continue;
    }

    merged.set(key, {
      document_type: document.title,
      category: document.category,
      reason: document.description,
      triggered_by: nextTriggeredBy,
    });
  }

  return Array.from(merged.values());
}

function buildResolvedDocumentTriggers(
  document: ResolveDocumentsResponse["documents"][number],
) {
  return [document.trigger, document.specialist, document.referenceClause].filter(
    (value): value is string => Boolean(value),
  );
}

function mergeReason(current: string, incoming: string) {
  if (!incoming || current.includes(incoming)) {
    return current;
  }

  return `${current} ${incoming}`.trim();
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

function buildForecastContext(
  address: string,
  checklist: ChecklistResult,
  intake: ProjectIntake | undefined,
): Record<string, unknown> {
  const activeOverlays = Object.entries(checklist.overlays ?? {})
    .filter(([, isActive]) => isActive)
    .map(([key]) => normalizeOverlayKey(key))
    .filter((key): key is string => Boolean(key));

  return {
    address,
    lat: checklist.coordinates?.lat ?? 0,
    lon: checklist.coordinates?.lon ?? 0,
    zoneCategory: getZoneCategory(checklist.zone_info?.zone_type),
    activeOverlays,
    projectType: intake?.projectType ?? "new_dwelling",
    estimatedFloorAreaM2: intake?.estimatedFloorAreaM2 ?? null,
    estimatedConstructionValueNZD: intake?.estimatedConstructionValueNZD ?? null,
    involvesStructuralWork: intake?.involvesStructuralWork ?? false,
    involvesEarthworks: intake?.involvesEarthworks ?? false,
    existingStructureDemolished: intake?.existingStructureDemolished ?? false,
    newRoadAccess: intake?.newRoadAccess ?? false,
    yearOfConstruction: intake?.yearOfConstruction ?? null,
    newServiceConnections: {
      water: intake?.serviceConnectionWater ?? false,
      wastewater: intake?.serviceConnectionWastewater ?? false,
      stormwater: intake?.serviceConnectionStormwater ?? false,
    },
  };
}

function getDocumentsForState(state: ConsentAssessmentRow) {
  return normalizeDocuments(
    state.checklist?.required_documents ?? [],
    state.manualDocuments,
    state.hiddenDocumentIds,
    state.documentOrder,
  );
}

function formatApiError(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: unknown; loc?: unknown } | undefined;
    if (!first) return "Validation error";
    const message = typeof first.msg === "string" ? first.msg : "Validation error";
    const loc = Array.isArray(first.loc) ? first.loc.join(".") : "";
    return loc ? `${loc}: ${message}` : message;
  }
  return "";
}
