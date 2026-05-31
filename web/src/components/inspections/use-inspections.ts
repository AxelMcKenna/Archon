"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { InspectionSchedule } from "@/lib/inspections";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import {
  type InspectionPdf,
  type InspectionRecord,
  type InspectionUpdate,
  buildInspectionRecords,
  createManualInspection,
  createRescheduledInspection,
  getInspectionStats,
  shouldCreateRescheduledInspection,
} from "./model";
import {
  INSPECTION_PDF_BUCKET,
  checklistToRows,
  inspectionToRow,
  isMissingInspectionTables,
  pdfToRow,
} from "./persistence";

const INSPECTION_STORAGE_PREFIX = "project-inspections";

// Stable empty reference so callers that omit the third arg don't churn the
// effect dep array (used to cause a setState-in-useEffect loop).
const EMPTY_RECORDS: Record<string, InspectionRecord> = {};

export function useInspections(
  projectId: string,
  schedule: InspectionSchedule,
  initialSavedRecords: Record<string, InspectionRecord> = EMPTY_RECORDS,
) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const toast = useToast();
  const [savedRecords, setSavedRecords] = useState<Record<string, InspectionRecord>>(initialSavedRecords);
  const [hasHydrated, setHasHydrated] = useState(false);

  // Persist + surface real DB failures. A genuine write error here used to be
  // swallowed (console.error only), silently losing the user's edits. The
  // missing-tables fallback path stays quiet — it is an expected degraded mode.
  const persist = useCallback(
    (records: InspectionRecord[]) =>
      persistInspectionRecords(projectId, records, supabase, (message) =>
        toast.error(`Couldn't save inspections: ${message}`),
      ),
    [projectId, supabase, toast],
  );

  useEffect(() => {
    const localRecords = readFromStorage<Record<string, InspectionRecord>>(getStorageKey(projectId));
    const shouldMigrateLocalRecords =
      Object.keys(initialSavedRecords).length === 0 &&
      localRecords &&
      Object.keys(localRecords).length > 0;

    if (shouldMigrateLocalRecords) {
      const nextRecords = withSeededGeneratedRecords(schedule, localRecords);
      setSavedRecords(nextRecords);
      setHasHydrated(true);
      void persist(Object.values(nextRecords));
      return;
    }

    const nextRecords = withSeededGeneratedRecords(schedule, initialSavedRecords);
    const seededRecords = Object.values(nextRecords).filter((record) => !initialSavedRecords[record.id]);

    setSavedRecords(nextRecords);
    setHasHydrated(true);
    void persist(seededRecords);
  }, [initialSavedRecords, projectId, schedule, persist]);

  const inspections = useMemo(
    () => buildInspectionRecords(schedule, savedRecords),
    [schedule, savedRecords],
  );
  const stats = useMemo(() => getInspectionStats(inspections), [inspections]);

  async function updateInspection(inspectionId: string, update: InspectionUpdate) {
    const current = inspections.find((inspection) => inspection.id === inspectionId);
    if (!current) return false;

    const previous = savedRecords[inspectionId] ?? current;
    const now = new Date().toISOString();
    const nextRecord: InspectionRecord = {
      ...current,
      ...update,
      checklist: update.requirements
        ? mergeChecklistForRequirements(update.requirements, update.checklist ?? current.checklist)
        : (update.checklist ?? current.checklist),
      updatedAt: now,
    };

    const nextRecords = {
      ...savedRecords,
      [inspectionId]: nextRecord,
    };
    const recordsToPersist = [nextRecord];

    if (shouldCreateRescheduledInspection(previous, nextRecord, nextRecords)) {
      const followUp = createRescheduledInspection(nextRecord);
      nextRecords[followUp.id] = followUp;
      recordsToPersist.push(followUp);
    }

    setSavedRecords(nextRecords);
    return persist(recordsToPersist);
  }

  function addManualInspection(inspectionTypeId?: string) {
    const manualInspection = createManualInspection(inspections, inspectionTypeId);
    const nextRecords = {
      ...savedRecords,
      [manualInspection.id]: manualInspection,
    };

    setSavedRecords(nextRecords);
    void persist([manualInspection]);

    return manualInspection;
  }

  function reorderInspection(inspectionId: string, targetIndex: number) {
    const dragged = inspections.find((inspection) => inspection.id === inspectionId);
    if (!dragged) return;

    const currentIndex = inspections.findIndex((inspection) => inspection.id === inspectionId);
    const remaining = inspections.filter((inspection) => inspection.id !== inspectionId);
    const adjustedTargetIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const nextIndex = Math.max(0, Math.min(adjustedTargetIndex, remaining.length));
    const orderedInspections = [
      ...remaining.slice(0, nextIndex),
      dragged,
      ...remaining.slice(nextIndex),
    ];

    const nextRecords = { ...savedRecords };
    const now = new Date().toISOString();

    const recordsToPersist = orderedInspections.map((record, index) => {
      const sortOrder = (index + 1) * 1000;
      const nextRecord = {
        ...record,
        sortOrder,
        updatedAt: record.sortOrder === sortOrder ? record.updatedAt : now,
      };
      nextRecords[record.id] = nextRecord;
      return nextRecord;
    });

    setSavedRecords(nextRecords);
    void persist(recordsToPersist);
  }

  function deleteInspection(inspectionId: string) {
    const current = inspections.find((inspection) => inspection.id === inspectionId);
    if (!current) return;

    const nextRecord = {
      ...current,
      deleted: true,
      updatedAt: new Date().toISOString(),
    };
    const nextRecords = {
      ...savedRecords,
      [inspectionId]: nextRecord,
    };

    setSavedRecords(nextRecords);
    void persist([nextRecord]);
  }

  async function uploadInspectionPdf(inspectionId: string, file: File) {
    const inspection = inspections.find((item) => item.id === inspectionId);
    if (!inspection) return null;

    const existingRecord = savedRecords[inspectionId] ?? inspection;
    await persist([existingRecord]);

    const now = new Date().toISOString();
    const pdfId = `inspection-pdf-${crypto.randomUUID()}`;
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const storagePath = `${projectId}/${inspectionId}/${pdfId}-${cleanName}`;

    const { error: uploadError } = await supabase.storage
      .from(INSPECTION_PDF_BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        contentType: file.type || "application/pdf",
        upsert: false,
      });
    if (uploadError) throw new Error(uploadError.message || "PDF upload failed.");

    const pdf: InspectionPdf = {
      id: pdfId,
      name: file.name,
      size: file.size,
      uploadedAt: now,
      dataUrl: "",
      storageBucket: INSPECTION_PDF_BUCKET,
      storagePath,
    };

    const { error: insertError } = await supabase
      .from("project_inspection_pdfs")
      .insert(pdfToRow(projectId, inspectionId, pdf));
    if (insertError) throw new Error(insertError.message || "PDF metadata save failed.");

    const { data } = await supabase.storage
      .from(INSPECTION_PDF_BUCKET)
      .createSignedUrl(storagePath, 60 * 60);
    const nextPdf = { ...pdf, dataUrl: data?.signedUrl ?? "" };
    const nextRecord = {
      ...existingRecord,
      pdfs: [...existingRecord.pdfs, nextPdf],
      updatedAt: now,
    };

    setSavedRecords((current) => ({
      ...current,
      [inspectionId]: nextRecord,
    }));

    return nextPdf;
  }

  async function removeInspectionPdf(inspectionId: string, pdfId: string) {
    const inspection = inspections.find((item) => item.id === inspectionId);
    if (!inspection) return;

    const pdf = inspection.pdfs.find((item) => item.id === pdfId);
    const nextRecord = {
      ...(savedRecords[inspectionId] ?? inspection),
      pdfs: inspection.pdfs.filter((item) => item.id !== pdfId),
      updatedAt: new Date().toISOString(),
    };

    setSavedRecords((current) => ({
      ...current,
      [inspectionId]: nextRecord,
    }));

    const { error } = await supabase
      .from("project_inspection_pdfs")
      .delete()
      .eq("id", pdfId)
      .eq("project_id", projectId)
      .eq("inspection_id", inspectionId);
    if (error) throw new Error(error.message || "PDF metadata delete failed.");

    if (pdf?.storagePath) {
      await supabase.storage
        .from(pdf.storageBucket ?? INSPECTION_PDF_BUCKET)
        .remove([pdf.storagePath]);
    }
  }

  return {
    inspections,
    stats,
    hasHydrated,
    updateInspection,
    addManualInspection,
    reorderInspection,
    deleteInspection,
    uploadInspectionPdf,
    removeInspectionPdf,
  };
}

async function persistInspectionRecords(
  projectId: string,
  records: InspectionRecord[],
  supabase: ReturnType<typeof getSupabaseBrowser>,
  onError?: (message: string) => void,
) {
  if (records.length === 0) return true;

  const { error: recordError } = await supabase
    .from("project_inspections")
    .upsert(records.map((record) => inspectionToRow(projectId, record)), {
      onConflict: "project_id,inspection_id",
    });
  if (recordError) {
    if (isMissingInspectionTables(recordError)) return false;

    console.error("Unable to persist inspections", recordError);
    onError?.(recordError.message || "Unable to save inspection changes.");
    return false;
  }

  const checklistResults = await Promise.all(records.map(async (record) => {
    const { error: deleteError } = await supabase
      .from("project_inspection_checklist_items")
      .delete()
      .eq("project_id", projectId)
      .eq("inspection_id", record.id);
    if (deleteError) {
      if (isMissingInspectionTables(deleteError)) return false;

      console.error("Unable to clear inspection checklist", deleteError);
      onError?.(deleteError.message || "Unable to save inspection checklist.");
      return false;
    }

    if (record.deleted || record.requirements.length === 0) return true;

    const { error: checklistError } = await supabase
      .from("project_inspection_checklist_items")
      .upsert(checklistToRows(projectId, record), {
        onConflict: "project_id,inspection_id,sort_order",
      });
    if (checklistError) {
      if (isMissingInspectionTables(checklistError)) return false;

      console.error(
        "Unable to persist inspection checklist",
        {
          message: checklistError.message,
          details: checklistError.details,
          hint: checklistError.hint,
          code: checklistError.code,
          inspectionId: record.id,
          rowCount: record.requirements.length,
        },
      );
      onError?.(checklistError.message || "Unable to save inspection checklist.");
      return false;
    }

    return true;
  }));

  return checklistResults.every(Boolean);
}

function mergeChecklistForRequirements(requirements: string[], checklist: Record<string, boolean>) {
  return Object.fromEntries(requirements.map((requirement) => [requirement, Boolean(checklist[requirement])]));
}

function withSeededGeneratedRecords(
  schedule: InspectionSchedule,
  savedRecords: Record<string, InspectionRecord>,
) {
  const builtRecords = buildInspectionRecords(schedule, savedRecords);
  const nextRecords = { ...savedRecords };

  for (const record of builtRecords) {
    if (nextRecords[record.id]) continue;
    nextRecords[record.id] = record;
  }

  return nextRecords;
}

function getStorageKey(projectId: string) {
  return `${INSPECTION_STORAGE_PREFIX}:${projectId}`;
}

function readFromStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
