"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "./model";

interface UseConsentAssessmentOptions {
  projectId: string;
  address: string;
}

const CHECKLIST_STORAGE_PREFIX = "consent-assessment-checklist";
const UPLOAD_STORAGE_PREFIX = "consent-assessment-uploads";
const COMPLETION_STORAGE_PREFIX = "consent-assessment-completions";
const MANUAL_DOCUMENT_STORAGE_PREFIX = "consent-assessment-manual-documents";
const HIDDEN_DOCUMENT_STORAGE_PREFIX = "consent-assessment-hidden-documents";
const DOCUMENT_ORDER_STORAGE_PREFIX = "consent-assessment-document-order";
const STORAGE_SYNC_EVENT = "consent-assessment-sync";

export function useConsentAssessment({ projectId, address }: UseConsentAssessmentOptions) {
  const [checklist, setChecklist] = useState<ChecklistResult | null>(null);
  const [manualDocuments, setManualDocuments] = useState<StoredManualConsentDocument[]>([]);
  const [hiddenDocumentIds, setHiddenDocumentIds] = useState<string[]>([]);
  const [documentOrder, setDocumentOrder] = useState<string[]>([]);
  const [uploads, setUploads] = useState<Record<string, UploadRecord>>({});
  const [completions, setCompletions] = useState<Record<string, CompletionRecord>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    syncFromStorage(
      projectId,
      setChecklist,
      setManualDocuments,
      setHiddenDocumentIds,
      setDocumentOrder,
      setUploads,
      setCompletions,
    );
    setHasHydrated(true);
  }, [projectId]);

  useEffect(() => {
    const handleSync = () => {
      syncFromStorage(
        projectId,
        setChecklist,
        setManualDocuments,
        setHiddenDocumentIds,
        setDocumentOrder,
        setUploads,
        setCompletions,
      );
    };

    window.addEventListener(STORAGE_SYNC_EVENT, handleSync);
    window.addEventListener("storage", handleSync);

    return () => {
      window.removeEventListener(STORAGE_SYNC_EVENT, handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, [projectId]);

  const documents = useMemo<ConsentDocument[]>(
    () =>
      normalizeDocuments(
        checklist?.required_documents ?? [],
        manualDocuments,
        hiddenDocumentIds,
        documentOrder,
      ),
    [checklist, manualDocuments, hiddenDocumentIds, documentOrder],
  );

  const completion = useMemo(
    () => getCompletionStats(documents, completions),
    [completions, documents],
  );

  async function generateChecklist() {
    if (!address) {
      setError("Project address is required before a consent checklist can be generated.");
      return;
    }

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
      setChecklist(payload);
      writeToStorage(getChecklistStorageKey(projectId), payload);
      emitSync();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "An unexpected error occurred while generating the checklist.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function createManualDocument(input: ManualConsentDocumentInput, file?: File | null) {
    const record = createManualDocumentRecord(input);
    const nextManualDocuments = [...manualDocuments, record];
    const nextCompletions = { ...completions };
    const nextUploads = { ...uploads };
    const nextHiddenDocumentIds = hiddenDocumentIds.filter((id) => id !== record.id);
    const nextDocumentOrder = [...documentOrder.filter((id) => id !== record.id), record.id];

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

    setManualDocuments(nextManualDocuments);
    setCompletions(nextCompletions);
    setUploads(nextUploads);
    setHiddenDocumentIds(nextHiddenDocumentIds);
    setDocumentOrder(nextDocumentOrder);
    writeToStorage(getManualDocumentsStorageKey(projectId), nextManualDocuments);
    writeToStorage(getCompletionStorageKey(projectId), nextCompletions);
    writeToStorage(getUploadStorageKey(projectId), nextUploads);
    writeToStorage(getHiddenDocumentsStorageKey(projectId), nextHiddenDocumentIds);
    writeToStorage(getDocumentOrderStorageKey(projectId), nextDocumentOrder);
    emitSync();

    return record.id;
  }

  function removeDocument(documentId: string) {
    const target = documents.find((document) => document.id === documentId);
    const nextManualDocuments = isManualDocument(target)
      ? manualDocuments.filter((document) => document.id !== documentId)
      : manualDocuments;
    const nextHiddenDocumentIds = isManualDocument(target)
      ? hiddenDocumentIds.filter((id) => id !== documentId)
      : Array.from(new Set([...hiddenDocumentIds, documentId]));
    const nextDocumentOrder = documentOrder.filter((id) => id !== documentId);
    const nextCompletions = { ...completions };
    const nextUploads = { ...uploads };

    delete nextCompletions[documentId];
    delete nextUploads[documentId];

    setManualDocuments(nextManualDocuments);
    setHiddenDocumentIds(nextHiddenDocumentIds);
    setDocumentOrder(nextDocumentOrder);
    setCompletions(nextCompletions);
    setUploads(nextUploads);
    writeToStorage(getManualDocumentsStorageKey(projectId), nextManualDocuments);
    writeToStorage(getHiddenDocumentsStorageKey(projectId), nextHiddenDocumentIds);
    writeToStorage(getDocumentOrderStorageKey(projectId), nextDocumentOrder);
    writeToStorage(getCompletionStorageKey(projectId), nextCompletions);
    writeToStorage(getUploadStorageKey(projectId), nextUploads);
    emitSync();
  }

  function saveDocumentOrder(nextDocumentOrder: string[]) {
    setDocumentOrder(nextDocumentOrder);
    writeToStorage(getDocumentOrderStorageKey(projectId), nextDocumentOrder);
    emitSync();
  }

  function resetDocumentOrder() {
    const defaultOrder = getOrderedDocumentIds(
      normalizeDocuments(
        checklist?.required_documents ?? [],
        manualDocuments,
        hiddenDocumentIds,
        [],
      ),
    );
    saveDocumentOrder(defaultOrder);
  }

  function saveUpload(documentId: string, file: File) {
    const nextUploads = {
      ...uploads,
      [documentId]: {
        fileName: file.name,
        fileSize: file.size,
        uploadedAt: new Date().toISOString(),
      },
    };

    setUploads(nextUploads);
    writeToStorage(getUploadStorageKey(projectId), nextUploads);
    emitSync();
  }

  function removeUpload(documentId: string) {
    const nextUploads = { ...uploads };
    delete nextUploads[documentId];

    setUploads(nextUploads);
    writeToStorage(getUploadStorageKey(projectId), nextUploads);
    emitSync();
  }

  function setDocumentCompleted(documentId: string, checked: boolean) {
    const nextCompletions = { ...completions };

    if (checked) {
      nextCompletions[documentId] = { completedAt: new Date().toISOString() };
    } else {
      delete nextCompletions[documentId];
    }

    setCompletions(nextCompletions);
    writeToStorage(getCompletionStorageKey(projectId), nextCompletions);
    emitSync();
  }

  return {
    checklist,
    documents,
    manualDocuments,
    hiddenDocumentIds,
    documentOrder,
    uploads,
    completions,
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

function syncFromStorage(
  projectId: string,
  setChecklist: (value: ChecklistResult | null) => void,
  setManualDocuments: (value: StoredManualConsentDocument[]) => void,
  setHiddenDocumentIds: (value: string[]) => void,
  setDocumentOrder: (value: string[]) => void,
  setUploads: (value: Record<string, UploadRecord>) => void,
  setCompletions: (value: Record<string, CompletionRecord>) => void,
) {
  setChecklist(readFromStorage<ChecklistResult>(getChecklistStorageKey(projectId)));
  setManualDocuments(
    readFromStorage<StoredManualConsentDocument[]>(getManualDocumentsStorageKey(projectId)) ?? [],
  );
  setHiddenDocumentIds(readFromStorage<string[]>(getHiddenDocumentsStorageKey(projectId)) ?? []);
  setDocumentOrder(readFromStorage<string[]>(getDocumentOrderStorageKey(projectId)) ?? []);
  setUploads(readFromStorage<Record<string, UploadRecord>>(getUploadStorageKey(projectId)) ?? {});
  setCompletions(
    readFromStorage<Record<string, CompletionRecord>>(getCompletionStorageKey(projectId)) ?? {},
  );
}

function getChecklistStorageKey(projectId: string) {
  return `${CHECKLIST_STORAGE_PREFIX}:${projectId}`;
}

function getManualDocumentsStorageKey(projectId: string) {
  return `${MANUAL_DOCUMENT_STORAGE_PREFIX}:${projectId}`;
}

function getHiddenDocumentsStorageKey(projectId: string) {
  return `${HIDDEN_DOCUMENT_STORAGE_PREFIX}:${projectId}`;
}

function getDocumentOrderStorageKey(projectId: string) {
  return `${DOCUMENT_ORDER_STORAGE_PREFIX}:${projectId}`;
}

function getUploadStorageKey(projectId: string) {
  return `${UPLOAD_STORAGE_PREFIX}:${projectId}`;
}

function getCompletionStorageKey(projectId: string) {
  return `${COMPLETION_STORAGE_PREFIX}:${projectId}`;
}

function readFromStorage<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeToStorage(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function emitSync() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(STORAGE_SYNC_EVENT));
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
