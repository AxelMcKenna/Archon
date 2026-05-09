"use client";

import { useEffect, useMemo, useState } from "react";
import type { InspectionSchedule } from "@/lib/inspections";
import {
  type InspectionRecord,
  type InspectionUpdate,
  buildInspectionRecords,
  createManualInspection,
  createRescheduledInspection,
  getInspectionStats,
  shouldCreateRescheduledInspection,
} from "./model";

const INSPECTION_STORAGE_PREFIX = "project-inspections";

export function useInspections(projectId: string, schedule: InspectionSchedule) {
  const [savedRecords, setSavedRecords] = useState<Record<string, InspectionRecord>>({});
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setSavedRecords(readFromStorage<Record<string, InspectionRecord>>(getStorageKey(projectId)) ?? {});
    setHasHydrated(true);
  }, [projectId]);

  const inspections = useMemo(
    () => buildInspectionRecords(schedule, savedRecords),
    [schedule, savedRecords],
  );
  const stats = useMemo(() => getInspectionStats(inspections), [inspections]);

  function updateInspection(inspectionId: string, update: InspectionUpdate) {
    const current = inspections.find((inspection) => inspection.id === inspectionId);
    if (!current) return;

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

    if (shouldCreateRescheduledInspection(previous, nextRecord, nextRecords)) {
      const followUp = createRescheduledInspection(nextRecord);
      nextRecords[followUp.id] = followUp;
    }

    setSavedRecords(nextRecords);
    writeToStorage(getStorageKey(projectId), nextRecords);
  }

  function addManualInspection(inspectionTypeId?: string) {
    const manualInspection = createManualInspection(inspections, inspectionTypeId);
    const nextRecords = {
      ...savedRecords,
      [manualInspection.id]: manualInspection,
    };

    setSavedRecords(nextRecords);
    writeToStorage(getStorageKey(projectId), nextRecords);

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

    orderedInspections.forEach((record, index) => {
      const sortOrder = (index + 1) * 1000;
      nextRecords[record.id] = {
        ...record,
        sortOrder,
        updatedAt: record.sortOrder === sortOrder ? record.updatedAt : now,
      };
    });

    setSavedRecords(nextRecords);
    writeToStorage(getStorageKey(projectId), nextRecords);
  }

  function deleteInspection(inspectionId: string) {
    const current = inspections.find((inspection) => inspection.id === inspectionId);
    if (!current) return;

    const nextRecords = {
      ...savedRecords,
      [inspectionId]: {
        ...current,
        deleted: true,
        updatedAt: new Date().toISOString(),
      },
    };

    setSavedRecords(nextRecords);
    writeToStorage(getStorageKey(projectId), nextRecords);
  }

  return {
    inspections,
    stats,
    hasHydrated,
    updateInspection,
    addManualInspection,
    reorderInspection,
    deleteInspection,
  };
}

function mergeChecklistForRequirements(requirements: string[], checklist: Record<string, boolean>) {
  return Object.fromEntries(requirements.map((requirement) => [requirement, Boolean(checklist[requirement])]));
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

function writeToStorage(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}
