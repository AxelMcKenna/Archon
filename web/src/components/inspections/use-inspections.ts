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
  isInspectionResolved,
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

  function addManualInspection() {
    const manualInspection = createManualInspection(inspections);
    const nextRecords = {
      ...savedRecords,
      [manualInspection.id]: manualInspection,
    };

    setSavedRecords(nextRecords);
    writeToStorage(getStorageKey(projectId), nextRecords);

    return manualInspection;
  }

  function reorderManualInspection(inspectionId: string, targetIndex: number) {
    const dragged = inspections.find((inspection) => inspection.id === inspectionId);
    if (!dragged?.manual || isInspectionResolved(dragged)) return;

    const currentIndex = inspections.findIndex((inspection) => inspection.id === inspectionId);
    const remaining = inspections.filter((inspection) => inspection.id !== inspectionId);
    const adjustedTargetIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const nextIndex = Math.max(0, Math.min(adjustedTargetIndex, remaining.length));
    const orderedInspections = [
      ...remaining.slice(0, nextIndex),
      dragged,
      ...remaining.slice(nextIndex),
    ];

    const manualSortOrders = getManualSortOrders(orderedInspections);
    const nextRecords = { ...savedRecords };
    let hasChanges = false;

    for (const [id, sortOrder] of Object.entries(manualSortOrders)) {
      const record = nextRecords[id] ?? inspections.find((inspection) => inspection.id === id);
      if (!record?.manual || record.sortOrder === sortOrder) continue;

      nextRecords[id] = {
        ...record,
        sortOrder,
        updatedAt: new Date().toISOString(),
      };
      hasChanges = true;
    }

    if (!hasChanges) return;

    setSavedRecords(nextRecords);
    writeToStorage(getStorageKey(projectId), nextRecords);
  }

  return {
    inspections,
    stats,
    hasHydrated,
    updateInspection,
    addManualInspection,
    reorderManualInspection,
  };
}

function getManualSortOrders(records: InspectionRecord[]) {
  const orders: Record<string, number> = {};
  let index = 0;

  while (index < records.length) {
    const record = records[index];
    if (!record.manual) {
      index += 1;
      continue;
    }

    const startIndex = index;
    while (index < records.length && records[index].manual) index += 1;

    const manualRun = records.slice(startIndex, index);
    const previousAnchor = records.slice(0, startIndex).findLast((item) => !item.manual);
    const nextAnchor = records.slice(index).find((item) => !item.manual);
    const previousOrder = previousAnchor?.sortOrder;
    const nextOrder = nextAnchor?.sortOrder;

    if (previousOrder !== undefined && nextOrder !== undefined) {
      const step = (nextOrder - previousOrder) / (manualRun.length + 1);
      manualRun.forEach((manualRecord, runIndex) => {
        orders[manualRecord.id] = previousOrder + step * (runIndex + 1);
      });
      continue;
    }

    if (nextOrder !== undefined) {
      const step = 1000 / (manualRun.length + 1);
      manualRun.forEach((manualRecord, runIndex) => {
        orders[manualRecord.id] = nextOrder - step * (manualRun.length - runIndex);
      });
      continue;
    }

    const baseOrder = previousOrder ?? 0;
    manualRun.forEach((manualRecord, runIndex) => {
      orders[manualRecord.id] = baseOrder + 1000 * (runIndex + 1);
    });
  }

  return orders;
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
