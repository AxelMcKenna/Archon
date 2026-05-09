"use client";

import { useRef } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";

type DocumentType = "Plans" | "Consents" | "Certificates" | "Inspections" | "Photos" | "Other";
type DocumentStatus = "Pending" | "Approved" | "Rejected";
type SortValue = "newest" | "oldest" | "az" | "updated";

export interface ProjectDocumentItem {
  id: string;
  name: string;
  originalName: string;
  storagePath: string;
  type: DocumentType;
  status: DocumentStatus;
  uploadDate: string;
  uploadedBy: string;
  fileSize: string;
  extension: string;
}

interface Props {
  projectId: string;
  projectRef: string;
  documents: ProjectDocumentItem[];
  canEditStatus: boolean;
}

const typeOptions: DocumentType[] = ["Plans", "Consents", "Certificates", "Inspections", "Photos", "Other"];
const statusOptions: DocumentStatus[] = ["Pending", "Approved", "Rejected"];

function statusClasses(status: DocumentStatus) {
  if (status === "Approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "Rejected") return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function extIcon(ext: string) {
  const value = ext.toLowerCase();
  if (["pdf"].includes(value)) return "PDF";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(value)) return "IMG";
  if (["doc", "docx"].includes(value)) return "DOC";
  if (["xls", "xlsx", "csv"].includes(value)) return "XLS";
  return "FILE";
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) return message;
  }
  return fallback;
}

export function ProjectDocumentsView({ projectId, projectRef, documents, canEditStatus }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectDocumentItem | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, { name: string; type: DocumentType }>>({});
  const [metadataSupported, setMetadataSupported] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | DocumentType>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | DocumentStatus>("All");
  const [sortBy, setSortBy] = useState<SortValue>("newest");
  const supabase = getSupabaseBrowser();

  async function uploadSelectedFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/\s+/g, "_");
        const storagePath = `${projectId}/${Date.now()}-${safeName}`;
        const { error: uploadErrorResult } = await supabase.storage
          .from("attachments")
          .upload(storagePath, file, { upsert: false, contentType: file.type });
        if (uploadErrorResult) throw uploadErrorResult;

        const { error: insertError } = await supabase.from("attachments").insert({
          project_id: projectId,
          filename: file.name,
          storage_path: storagePath,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
        if (insertError) throw insertError;
      }
      router.refresh();
    } catch (error) {
      setUploadError(errorMessage(error, "Upload failed."));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onDropUpload(event: React.DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragOver(false);
    uploadSelectedFiles(event.dataTransfer.files);
  }

  async function getSignedUrl(storagePath: string) {
    const { data, error } = await supabase.storage
      .from("attachments")
      .createSignedUrl(storagePath, 60);
    if (error || !data?.signedUrl) {
      throw new Error(error?.message ?? "Unable to create secure file link.");
    }
    return data.signedUrl;
  }

  async function handleView(doc: ProjectDocumentItem) {
    setActionBusyId(doc.id);
    setActionError(null);
    try {
      const url = await getSignedUrl(doc.storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to open document.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleDownload(doc: ProjectDocumentItem) {
    setActionBusyId(doc.id);
    setActionError(null);
    try {
      const url = await getSignedUrl(doc.storagePath);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Unable to download document.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to download document.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleDelete(doc: ProjectDocumentItem) {
    setActionBusyId(doc.id);
    setActionError(null);
    try {
      const { error: storageError } = await supabase.storage.from("attachments").remove([doc.storagePath]);
      if (storageError) throw storageError;
      const { error: rowError } = await supabase.from("attachments").delete().eq("id", doc.id);
      if (rowError) throw rowError;
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to delete document.");
    } finally {
      setActionBusyId(null);
      setDeleteTarget(null);
    }
  }

  async function handleStatusUpdate(doc: ProjectDocumentItem, nextStatus: DocumentStatus) {
    if (!canEditStatus) {
      setActionError("Document status updates are unavailable until the latest database migration is applied.");
      return;
    }
    setActionBusyId(doc.id);
    setActionError(null);
    try {
      const statusValue = nextStatus.toLowerCase();
      const { error } = await supabase
        .from("attachments")
        .update({ document_status: statusValue })
        .eq("id", doc.id);
      if (error) throw error;
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update document status.";
      if (message.toLowerCase().includes("document_status")) {
        setActionError("Document status updates are unavailable until the latest database migration is applied.");
      } else {
        setActionError(message);
      }
    } finally {
      setActionBusyId(null);
    }
  }

  function getDraft(doc: ProjectDocumentItem) {
    return editDrafts[doc.id] ?? { name: doc.name, type: doc.type };
  }

  function updateDraft(doc: ProjectDocumentItem, patch: Partial<{ name: string; type: DocumentType }>) {
    setEditDrafts((prev) => ({ ...prev, [doc.id]: { ...getDraft(doc), ...patch } }));
  }

  function hasMetadataChanges(doc: ProjectDocumentItem) {
    const draft = getDraft(doc);
    return draft.name.trim() !== doc.name || draft.type !== doc.type;
  }

  function toStoredType(type: DocumentType) {
    return type.toLowerCase() as "plans" | "consents" | "certificates" | "inspections" | "photos" | "other";
  }

  async function saveMetadata(doc: ProjectDocumentItem) {
    if (!metadataSupported) return;
    const draft = getDraft(doc);
    if (!draft.name.trim()) {
      setActionError("Document name cannot be empty.");
      return;
    }
    setActionBusyId(doc.id);
    setActionError(null);
    try {
      const { error } = await supabase
        .from("attachments")
        .update({
          display_name: draft.name.trim(),
          document_type: toStoredType(draft.type),
        })
        .eq("id", doc.id);
      if (error) throw error;
      router.refresh();
    } catch (error) {
      const message = errorMessage(error, "Unable to save document details.");
      const lower = message.toLowerCase();
      const isMissingColumn =
        lower.includes("column") &&
        (lower.includes("display_name") || lower.includes("document_type")) &&
        lower.includes("does not exist");
      if (isMissingColumn) {
        setMetadataSupported(false);
        setActionError("Document name/type editing requires the latest database migration.");
      } else {
        setActionError(message);
      }
    } finally {
      setActionBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = documents.filter((doc) => {
      const queryMatch = !q || doc.name.toLowerCase().includes(q);
      const typeMatch = typeFilter === "All" || doc.type === typeFilter;
      const statusMatch = statusFilter === "All" || doc.status === statusFilter;
      return queryMatch && typeMatch && statusMatch;
    });
    return result.sort((a, b) => {
      if (sortBy === "az") return a.name.localeCompare(b.name);
      if (sortBy === "oldest") return +new Date(a.uploadDate) - +new Date(b.uploadDate);
      if (sortBy === "updated") return +new Date(b.uploadDate) - +new Date(a.uploadDate);
      return +new Date(b.uploadDate) - +new Date(a.uploadDate);
    });
  }, [documents, query, sortBy, statusFilter, typeFilter]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Documents</h1>
          <p className="mt-1 text-sm text-ink-500">{projectRef}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => uploadSelectedFiles(event.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDropUpload}
            disabled={uploading}
            className={`w-72 rounded-xl border border-dashed px-4 py-3 text-left text-sm shadow-sm transition ${
              isDragOver
                ? "border-ink-500 bg-ink-100 text-ink-900"
                : "border-ink-300 bg-white text-ink-700 hover:bg-ink-50"
            } disabled:opacity-60`}
          >
            <p className="font-medium">{uploading ? "Uploading…" : "Upload document"}</p>
            <p className="mt-1 text-xs text-ink-500">Drag and drop files here, or click to browse.</p>
          </button>
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
        </div>
      </header>

      <section className="sticky top-0 z-10 mb-6 rounded-xl border border-ink-200 bg-white/95 p-4 shadow-sm backdrop-blur">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search document names"
            className="md:col-span-2 rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-ink-400"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "All" | DocumentType)}
            className="rounded-lg border border-ink-200 px-3 py-2 text-sm"
          >
            <option value="All">All types</option>
            {typeOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "All" | DocumentStatus)}
            className="rounded-lg border border-ink-200 px-3 py-2 text-sm"
          >
            <option value="All">All statuses</option>
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortValue)}
            className="rounded-lg border border-ink-200 px-3 py-2 text-sm"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="az">A–Z</option>
            <option value="updated">Recently updated</option>
          </select>
        </div>
      </section>
      {actionError && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {actionError}
        </p>
      )}

      {documents.length === 0 ? (
        <section className="rounded-xl border border-dashed border-ink-300 bg-white p-12 text-center">
          <p className="text-lg font-medium text-ink-800">No documents uploaded yet</p>
          <p className="mt-2 text-sm text-ink-500">
            Upload plans, consent records, certificates, and supporting files for this project.
          </p>
        </section>
      ) : filtered.length === 0 ? (
        <section className="rounded-xl border border-dashed border-ink-300 bg-white p-12 text-center">
          <p className="text-lg font-medium text-ink-800">No matching documents</p>
          <p className="mt-2 text-sm text-ink-500">Try a different search or filter combination.</p>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((doc) => (
            <article
              key={doc.id}
              className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-xs font-semibold text-ink-700">
                    {extIcon(doc.extension)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-900">{doc.name}</p>
                    <p className="text-xs text-ink-500">{doc.originalName}</p>
                  </div>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClasses(doc.status)}`}>
                  {doc.status}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <dt className="text-ink-500">Upload date</dt>
                  <dd className="text-ink-800">{doc.uploadDate}</dd>
                </div>
                <div>
                  <dt className="text-ink-500">Uploaded by</dt>
                  <dd className="text-ink-800">{doc.uploadedBy}</dd>
                </div>
                <div>
                  <dt className="text-ink-500">File size</dt>
                  <dd className="text-ink-800">{doc.fileSize}</dd>
                </div>
              </dl>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleView(doc)}
                  disabled={actionBusyId === doc.id}
                  className="rounded-md border border-ink-200 px-3 py-1.5 text-xs text-ink-700 hover:bg-ink-50 disabled:opacity-60"
                >
                  {actionBusyId === doc.id ? "Working…" : "View"}
                </button>
                <button
                  onClick={() => handleDownload(doc)}
                  disabled={actionBusyId === doc.id}
                  className="rounded-md border border-ink-200 px-3 py-1.5 text-xs text-ink-700 hover:bg-ink-50 disabled:opacity-60"
                >
                  Download
                </button>
                <button
                  onClick={() => setDeleteTarget(doc)}
                  disabled={actionBusyId === doc.id}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
              <div className="mt-3 grid gap-2">
                <label className="text-xs text-ink-500">Document name</label>
                <input
                  value={getDraft(doc).name}
                  onChange={(event) => updateDraft(doc, { name: event.target.value })}
                  disabled={actionBusyId === doc.id || !metadataSupported}
                  className="rounded-md border border-ink-200 px-2 py-1.5 text-xs text-ink-700 disabled:opacity-60"
                />
                <label className="text-xs text-ink-500">Document type</label>
                <select
                  value={getDraft(doc).type}
                  onChange={(event) => updateDraft(doc, { type: event.target.value as DocumentType })}
                  disabled={actionBusyId === doc.id || !metadataSupported}
                  className="rounded-md border border-ink-200 px-2 py-1.5 text-xs text-ink-700 disabled:opacity-60"
                >
                  {typeOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => saveMetadata(doc)}
                  disabled={actionBusyId === doc.id || !metadataSupported || !hasMetadataChanges(doc)}
                  className="rounded-md border border-ink-200 px-3 py-1.5 text-xs text-ink-700 hover:bg-ink-50 disabled:opacity-60"
                >
                  Save details
                </button>
                {!metadataSupported && (
                  <p className="text-[11px] text-amber-700">
                    Name/type editing requires the latest database migration.
                  </p>
                )}
              </div>
              <div className="mt-3">
                <label className="text-xs text-ink-500">Status</label>
                <select
                  value={doc.status}
                  onChange={(event) => handleStatusUpdate(doc, event.target.value as DocumentStatus)}
                  disabled={actionBusyId === doc.id || !canEditStatus}
                  className="mt-1 w-full rounded-md border border-ink-200 px-2 py-1.5 text-xs text-ink-700 disabled:opacity-60"
                >
                  {statusOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                {!canEditStatus && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Status updates require the latest database migration.
                  </p>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-ink-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-ink-900">Delete document?</h3>
            <p className="mt-2 text-sm text-ink-600">
              This will permanently remove <span className="font-medium text-ink-800">{deleteTarget.name}</span> from
              this project.
            </p>
            <p className="mt-1 text-xs text-ink-500">This action cannot be undone.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={actionBusyId === deleteTarget.id}
                className="rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteTarget)}
                disabled={actionBusyId === deleteTarget.id}
                className="rounded-lg border border-red-200 bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {actionBusyId === deleteTarget.id ? "Deleting…" : "Delete document"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
