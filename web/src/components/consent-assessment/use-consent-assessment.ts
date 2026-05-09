"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type ChecklistResult,
  type ConsentDocument,
  type UploadRecord,
  getCompletionStats,
  normalizeDocuments,
} from "./model";

interface UseConsentAssessmentOptions {
  projectId: string;
  address: string;
}

const CHECKLIST_STORAGE_PREFIX = "consent-assessment-checklist";
const UPLOAD_STORAGE_PREFIX = "consent-assessment-uploads";

export function useConsentAssessment({ projectId, address }: UseConsentAssessmentOptions) {
  const [checklist, setChecklist] = useState<ChecklistResult | null>(null);
  const [uploads, setUploads] = useState<Record<string, UploadRecord>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setChecklist(readFromStorage<ChecklistResult>(getChecklistStorageKey(projectId)));
    setUploads(readFromStorage<Record<string, UploadRecord>>(getUploadStorageKey(projectId)) ?? {});
    setHasHydrated(true);
  }, [projectId]);

  const documents = useMemo<ConsentDocument[]>(
    () => normalizeDocuments(checklist?.required_documents ?? []),
    [checklist],
  );

  const completion = useMemo(() => getCompletionStats(documents, uploads), [documents, uploads]);

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
  }

  function removeUpload(documentId: string) {
    const nextUploads = { ...uploads };
    delete nextUploads[documentId];

    setUploads(nextUploads);
    writeToStorage(getUploadStorageKey(projectId), nextUploads);
  }

  return {
    checklist,
    documents,
    uploads,
    completion,
    isLoading,
    error,
    hasHydrated,
    generateChecklist,
    saveUpload,
    removeUpload,
  };
}

function getChecklistStorageKey(projectId: string) {
  return `${CHECKLIST_STORAGE_PREFIX}:${projectId}`;
}

function getUploadStorageKey(projectId: string) {
  return `${UPLOAD_STORAGE_PREFIX}:${projectId}`;
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
