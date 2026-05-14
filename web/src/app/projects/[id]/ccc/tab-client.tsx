"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import {
  addYearsToDateValue,
  createClientRowId,
  getLocalTodayDateValue,
} from "@/lib/format";
import { Collapsible } from "@/components/ui/collapsible";
import { StatusPill } from "@/components/ui/status-pill";
import { MetricCard } from "@/components/ui/metric-card";
import type {
  ChecklistRow,
  Form6AEntry,
  Form6ANonRestrictedEntry,
  InspectionSettlementItem,
  LbpMemorandaFile,
  Status,
} from "./types";
import { statusTone, statusWeight } from "./constants";
import {
  hasAnyText,
  isAllowedMemorandaFile,
  memorandaDisplayName,
  memorandaRowFileLabel,
  statusLabel,
} from "./helpers";
import { ChecklistTable } from "./_components/checklist-table";
import { useLocalStorageBoolean } from "@/lib/use-local-storage";

function CccSection({
  title,
  status,
  defaultOpen = false,
  children,
}: {
  title: string;
  status: Status;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible
      title={title}
      defaultOpen={defaultOpen}
      badge={<StatusPill tone={statusTone[status]}>{statusLabel(status)}</StatusPill>}
    >
      {children}
    </Collapsible>
  );
}

export function CccTabClient({
  projectId,
  projectName,
  uploadedFileByRow = {},
  lbpMemorandaAttachments = [],
  consentIssueDate = null,
  consentExpiryDate = null,
}: {
  projectId: string;
  projectName?: string | null;
  uploadedFileByRow?: Record<string, string>;
  lbpMemorandaAttachments?: LbpMemorandaFile[];
  consentIssueDate?: string | null;
  consentExpiryDate?: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [submittedDocs, setSubmittedDocs] = useState<ChecklistRow[]>(() => {
    const baseRows: ChecklistRow[] = [
    {
      id: "2",
      name: "Record of Building Work Carried Out or Supervised",
      description: "Provide completion date plus LBP and other personnel details.",
      mandatory: true,
      status: "not_started",
    },
    {
      id: "2m",
      name: "LBP Memoranda / Record of Building Work",
      description:
        "Memoranda from licensed building practitioner(s) stating what restricted building work they carried out or supervised must be attached to this application.",
      mandatory: true,
      status: lbpMemorandaAttachments.length > 0 ? "accepted" : "not_started",
    },
    { id: "3a", name: "PS3 — Construction Statement", description: "From each contractor or installer who completed specialist work.", mandatory: true, status: "not_started" },
    { id: "4", name: "PS4 — Construction Review", description: "Final engineer review.", mandatory: true, status: "not_started" },
    { id: "5", name: "Electrical Code of Compliance", description: "Required for electrical work.", mandatory: true, status: "not_started" },
    { id: "6", name: "Gasfitting Code of Compliance", description: "Only if gas work included.", mandatory: false, status: "not_started" },
    { id: "7", name: "Test certificate for potable water", description: "Required where potable water testing applies.", mandatory: false, status: "not_started" },
    { id: "8", name: "Site inspection reports conducted by an engineer", description: "Required if engineering inspections were part of consented work.", mandatory: false, status: "not_started" },
    { id: "9", name: "Form B-068 — Specified Systems Declaration", description: "Required if specified systems exist.", mandatory: false, status: "not_started" },
    { id: "10", name: "Form B-065 — Accessible Facilities Upgrade Report", description: "Required if accessible facilities were included or modified.", mandatory: false, status: "not_started" },
  ];
    return baseRows.map((row) => {
    if (row.id === "2" || row.id === "9") return row;
    if (row.id === "2m" && lbpMemorandaAttachments.length > 0) {
      return { ...row, status: "accepted", fileName: memorandaRowFileLabel(lbpMemorandaAttachments) };
    }
    const uploadedFile = uploadedFileByRow[row.id];
    return uploadedFile
      ? { ...row, status: "uploaded", fileName: uploadedFile }
      : row;
  });
  });

  const [inspectionItems, setInspectionItems] = useState<InspectionSettlementItem[]>([]);
  const [inspectionsLoaded, setInspectionsLoaded] = useState(false);
  const [feesSettled, setFeesSettled] = useLocalStorageBoolean(`ccc:fees-settled:${projectId}`);
  const [uploadingRowId, setUploadingRowId] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [downloadingB011, setDownloadingB011] = useState(false);
  const [downloadingPackageZip, setDownloadingPackageZip] = useState(false);
  const [packageSent, setPackageSent] = useLocalStorageBoolean(`ccc:package-sent:${projectId}`);
  const [formPanelOpenByRow, setFormPanelOpenByRow] = useState<Record<string, boolean>>({});
  const defaultCompletionDateRef = useRef("");
  const [form6ACompletionDate, setForm6ACompletionDate] = useState("");
  const [form6AEntries, setForm6AEntries] = useState<Form6AEntry[]>([]);
  const [form6ANonRestrictedEntries, setForm6ANonRestrictedEntries] = useState<Form6ANonRestrictedEntry[]>([]);
  const [form6AHydrated, setForm6AHydrated] = useState(false);
  const [lbpMemorandaFiles, setLbpMemorandaFiles] = useState<LbpMemorandaFile[]>(lbpMemorandaAttachments);
  const [noSpecifiedSystems, setNoSpecifiedSystems] = useState(false);
  const [selectedSpecifiedSystems, setSelectedSpecifiedSystems] = useState<string[]>([]);
  const [specifiedSystemsHydrated, setSpecifiedSystemsHydrated] = useState(false);

  const mandatory = submittedDocs.filter((d) => d.mandatory);
  const conditional = submittedDocs.filter((d) => !d.mandatory);
  const doneCount = submittedDocs.filter((d) => d.status !== "not_started").length;
  const totalCount = submittedDocs.length;
  const hasInspections = inspectionItems.length > 0;
  const pendingInspections = inspectionItems.filter((inspection) => inspection.status !== "Passed");
  const inspectionsPassed = inspectionsLoaded && hasInspections && pendingInspections.length === 0;
  const mandatoryReady = mandatory.every((d) => d.status !== "not_started");

  const sectionStatus = useMemo(() => {
    const docsStatus: Status = mandatoryReady ? "complete" : "action_required";
    const inspectionsSettledStatus: Status = !inspectionsLoaded
      ? "not_started"
      : !hasInspections
        ? "not_started"
        : inspectionsPassed
          ? "complete"
          : "action_required";
    const feesSettledStatus: Status = feesSettled ? "complete" : "action_required";
    const downloadReady = mandatoryReady && inspectionsPassed && feesSettled;
    const submitStatus: Status = downloadReady ? "complete" : "not_started";
    const sendOffStatus: Status = !downloadReady
      ? "not_started"
      : packageSent
        ? "complete"
        : "in_progress";
    const statusBar: Status = packageSent
      ? "complete"
      : downloadReady
        ? "in_progress"
        : "action_required";
    return {
      statusBar,
      docs: docsStatus,
      inspectionsSettled: inspectionsSettledStatus,
      feesSettled: feesSettledStatus,
      submit: submitStatus,
      sendOff: sendOffStatus,
    };
  }, [mandatoryReady, inspectionsLoaded, hasInspections, inspectionsPassed, feesSettled, packageSent]);

  const overall: Status = (Object.values(sectionStatus) as Status[]).reduce((worst, current) =>
    statusWeight[current] > statusWeight[worst] ? current : worst,
  );
  const shortId = projectId.slice(0, 8);
  const projectDisplay = projectName?.trim() ? `${projectName} · ${shortId}` : projectId;
  const fallbackIssueDate = getLocalTodayDateValue();
  const consentIssueDisplay = consentIssueDate?.trim() || fallbackIssueDate;
  const consentExpiryDisplay =
    consentExpiryDate?.trim() || addYearsToDateValue(consentIssueDisplay, 2) || "Not set";
  const form6AStorageKey = `ccc:form6a:${projectId}`;
  const specifiedSystemsStorageKey = `ccc:specified-systems:${projectId}`;

  useEffect(() => {
    defaultCompletionDateRef.current = getLocalTodayDateValue();
    setForm6ACompletionDate(defaultCompletionDateRef.current);
    const saved = window.localStorage.getItem(form6AStorageKey);
    if (!saved) {
      setForm6AHydrated(true);
      return;
    }
    try {
      const parsed = JSON.parse(saved) as {
        completionDate?: string;
        entries?: Array<Partial<Form6AEntry>>;
        nonRestrictedEntries?: Array<Partial<Form6ANonRestrictedEntry>>;
      };
      if (parsed.completionDate?.trim()) {
        setForm6ACompletionDate(parsed.completionDate);
      }
      setForm6AEntries(
        (parsed.entries ?? []).map((entry) => ({
          id: entry.id?.trim() || createClientRowId(),
          lbpName: entry.lbpName ?? "",
          licensingClass: entry.licensingClass ?? "Carpenter",
          lbpOrRegistrationNumber: entry.lbpOrRegistrationNumber ?? "",
          particularWorkCarriedOutOrSupervised: entry.particularWorkCarriedOutOrSupervised ?? "",
        })),
      );
      setForm6ANonRestrictedEntries(
        (parsed.nonRestrictedEntries ?? []).map((entry) => ({
          id: entry.id?.trim() || createClientRowId(),
          name: entry.name ?? "",
          address: entry.address ?? "",
          phoneNumbers: entry.phoneNumbers ?? "",
          relevantLicenceOrRegistrationNumber: entry.relevantLicenceOrRegistrationNumber ?? "",
        })),
      );
    } catch {
      // ignore invalid cached form data
    }
    setForm6AHydrated(true);
  }, [form6AStorageKey]);

  useEffect(() => {
    let cancelled = false;
    async function loadInspections() {
      setInspectionsLoaded(false);
      const { data, error } = await supabase
        .from("project_inspections")
        .select("inspection_id,title,status,deleted,sort_order")
        .eq("project_id", projectId)
        .eq("deleted", false)
        .order("sort_order", { ascending: true });

      if (cancelled) return;
      if (error) {
        setInspectionItems([]);
        setInspectionsLoaded(true);
        return;
      }

      setInspectionItems(
        (data ?? []).map((row) => ({
          id: String(row.inspection_id ?? ""),
          title: String(row.title ?? "Inspection"),
          status: String(row.status ?? "Not Conducted"),
        })),
      );
      setInspectionsLoaded(true);
    }

    void loadInspections();
    return () => {
      cancelled = true;
    };
  }, [projectId, supabase]);

  useEffect(() => {
    if (!form6AHydrated) return;
    const persistableLbpEntries = form6AEntries.filter((entry) =>
      hasAnyText([
        entry.lbpName,
        entry.lbpOrRegistrationNumber,
        entry.particularWorkCarriedOutOrSupervised,
      ]),
    );
    const persistableOtherPersonnelEntries = form6ANonRestrictedEntries.filter((entry) =>
      hasAnyText([
        entry.name,
        entry.address,
        entry.phoneNumbers,
        entry.relevantLicenceOrRegistrationNumber,
      ]),
    );
    window.localStorage.setItem(
      form6AStorageKey,
      JSON.stringify({
        completionDate: form6ACompletionDate,
        entries: persistableLbpEntries,
        nonRestrictedEntries: persistableOtherPersonnelEntries,
      }),
    );
  }, [form6ACompletionDate, form6AEntries, form6ANonRestrictedEntries, form6AStorageKey, form6AHydrated]);

  useEffect(() => {
    if (!form6AHydrated) return;
    const hasLbpData = form6AEntries.some((entry) =>
      hasAnyText([
        entry.lbpName,
        entry.lbpOrRegistrationNumber,
        entry.particularWorkCarriedOutOrSupervised,
      ]),
    );
    const hasPersonnelData = form6ANonRestrictedEntries.some((entry) =>
      hasAnyText([
        entry.name,
        entry.address,
        entry.phoneNumbers,
        entry.relevantLicenceOrRegistrationNumber,
      ]),
    );
    const isComplete = form6ACompletionDate.trim().length > 0 && (hasLbpData || hasPersonnelData);
    setSubmittedDocs((prev) =>
      prev.map((item) =>
        item.id === "2"
          ? {
              ...item,
              status: isComplete ? "accepted" : "not_started",
              fileName: undefined,
            }
          : item,
      ),
    );
  }, [form6ACompletionDate, form6AEntries, form6ANonRestrictedEntries, form6AHydrated]);

  useEffect(() => {
    setLbpMemorandaFiles(lbpMemorandaAttachments);
  }, [lbpMemorandaAttachments]);

  useEffect(() => {
    setSubmittedDocs((prev) =>
      prev.map((item) => {
        if (item.id === "2" || item.id === "9") return item;
        if (item.id === "2m" && lbpMemorandaAttachments.length > 0) {
          return {
            ...item,
            status: "accepted",
            fileName: memorandaRowFileLabel(lbpMemorandaAttachments),
          };
        }
        const uploadedFile = uploadedFileByRow[item.id];
        if (!uploadedFile) return item;
        return {
          ...item,
          status: item.status === "accepted" ? item.status : "uploaded",
          fileName: uploadedFile,
        };
      }),
    );
  }, [uploadedFileByRow, lbpMemorandaAttachments.length]);

  useEffect(() => {
    setSubmittedDocs((prev) =>
      prev.map((item) =>
        item.id === "2m"
          ? {
              ...item,
              status: lbpMemorandaFiles.length > 0 ? "accepted" : "not_started",
              fileName: memorandaRowFileLabel(lbpMemorandaFiles),
            }
          : item,
      ),
    );
  }, [lbpMemorandaFiles]);

  useEffect(() => {
    const saved = window.localStorage.getItem(specifiedSystemsStorageKey);
    if (!saved) {
      setSpecifiedSystemsHydrated(true);
      return;
    }
    try {
      const parsed = JSON.parse(saved) as {
        noSpecifiedSystems?: boolean;
        selectedCodes?: string[];
      };
      setNoSpecifiedSystems(Boolean(parsed.noSpecifiedSystems));
      setSelectedSpecifiedSystems(
        Array.isArray(parsed.selectedCodes)
          ? parsed.selectedCodes.filter((code): code is string => typeof code === "string")
          : [],
      );
    } catch {
      setNoSpecifiedSystems(false);
      setSelectedSpecifiedSystems([]);
    }
    setSpecifiedSystemsHydrated(true);
  }, [specifiedSystemsStorageKey]);

  useEffect(() => {
    if (!specifiedSystemsHydrated) return;
    window.localStorage.setItem(
      specifiedSystemsStorageKey,
      JSON.stringify({
        noSpecifiedSystems,
        selectedCodes: selectedSpecifiedSystems,
      }),
    );
  }, [noSpecifiedSystems, selectedSpecifiedSystems, specifiedSystemsStorageKey, specifiedSystemsHydrated]);

  useEffect(() => {
    if (!specifiedSystemsHydrated) return;
    const isComplete = noSpecifiedSystems || selectedSpecifiedSystems.length > 0;
    setSubmittedDocs((prev) =>
      prev.map((item) =>
        item.id === "9"
          ? {
              ...item,
              status: isComplete ? "accepted" : "not_started",
              fileName: undefined,
            }
          : item,
      ),
    );
  }, [noSpecifiedSystems, selectedSpecifiedSystems, specifiedSystemsHydrated]);

  async function uploadLbpMemorandaFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const rowLabel = "LBP Memoranda / Record of Building Work";
    const filesToUpload = Array.from(files);
    const invalidFiles = filesToUpload.filter((file) => !isAllowedMemorandaFile(file));
    if (invalidFiles.length > 0) {
      setUploadError("Only PDF, DOCX, JPG, and PNG files are supported.");
      return;
    }

    setUploadingRowId("2m");
    setUploadError(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const storageOwner = authData.user?.id ?? "single-user";

      const createdFiles: LbpMemorandaFile[] = [];
      for (const file of filesToUpload) {
        const safeName = file.name.replace(/\s+/g, "_");
        const storagePath = `${storageOwner}/${projectId}/ccc-2m-${Date.now()}-${safeName}`;
        const { error: storageError } = await supabase.storage
          .from("attachments")
          .upload(storagePath, file, { upsert: false, contentType: file.type });
        if (storageError) throw storageError;

        const baseInsert = {
          project_id: projectId,
          filename: `${rowLabel} - ${file.name}`,
          storage_path: storagePath,
          mime_type: file.type || null,
          size_bytes: file.size,
        };

        let inserted:
          | {
              id: string;
              filename: string;
              storage_path: string;
              uploaded_at: string;
              size_bytes: number | null;
              display_name?: string | null;
              mime_type?: string | null;
            }
          | null = null;

        const { data: primaryInserted, error: primaryInsertError } = await supabase
          .from("attachments")
          .insert({
            ...baseInsert,
            linked_requirement_key: "2m",
            linked_requirement_label: rowLabel,
            linked_requirement_source: "ccc",
            display_name: "",
          })
          .select("id,filename,storage_path,uploaded_at,size_bytes,display_name,mime_type")
          .single();

        if (primaryInsertError) {
          const { data: fallbackInserted, error: fallbackInsertError } = await supabase
            .from("attachments")
            .insert(baseInsert)
            .select("id,filename,storage_path,uploaded_at,size_bytes,mime_type")
            .single();

          if (fallbackInsertError) throw primaryInsertError;
          inserted = fallbackInserted;
        } else {
          inserted = primaryInserted;
        }

        if (!inserted) throw new Error("Upload failed while saving attachment metadata.");

        createdFiles.push({
          id: inserted.id,
          filename: inserted.filename,
          storagePath: inserted.storage_path,
          uploadedAt: inserted.uploaded_at,
          sizeBytes: inserted.size_bytes ?? null,
          lbpName: inserted.display_name ?? "",
          mimeType: inserted.mime_type ?? null,
        });
      }

      setLbpMemorandaFiles((prev) =>
        [...createdFiles, ...prev].sort(
          (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
        ),
      );
      router.refresh();
    } catch (error) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message?: unknown }).message ?? "Upload failed.")
          : "Upload failed.";
      setUploadError(message);
    } finally {
      setUploadingRowId(null);
      setDragOverRowId(null);
    }
  }

  async function updateLbpMemorandaName(fileId: string, lbpName: string) {
    const { error } = await supabase.from("attachments").update({ display_name: lbpName }).eq("id", fileId);
    if (error) {
      setUploadError("Could not save the LBP name for that file.");
    }
  }

  async function removeLbpMemorandaFile(file: LbpMemorandaFile) {
    try {
      const { error: storageError } = await supabase.storage.from("attachments").remove([file.storagePath]);
      if (storageError) throw storageError;
      const { error: deleteError } = await supabase.from("attachments").delete().eq("id", file.id);
      if (deleteError) throw deleteError;
      setLbpMemorandaFiles((prev) => prev.filter((entry) => entry.id !== file.id));
      router.refresh();
    } catch {
      setUploadError("Could not remove the selected file.");
    }
  }

  async function openLbpMemorandaPreview(file: LbpMemorandaFile) {
    try {
      const { data, error } = await supabase.storage
        .from("attachments")
        .createSignedUrl(file.storagePath, 60 * 30);
      if (error || !data?.signedUrl) throw error ?? new Error("Missing signed URL");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      setUploadError("Could not open a preview for that file.");
    }
  }

  async function uploadChecklistFiles(rowId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const row = submittedDocs.find((item) => item.id === rowId);
    if (!row) return;

    setUploadingRowId(rowId);
    setUploadError(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const storageOwner = authData.user?.id ?? "single-user";

      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/\s+/g, "_");
        const storagePath = `${storageOwner}/${projectId}/ccc-${row.id}-${Date.now()}-${safeName}`;
        const { error: storageError } = await supabase.storage
          .from("attachments")
          .upload(storagePath, file, { upsert: false, contentType: file.type });
        if (storageError) throw storageError;

        const { error: insertError } = await supabase.from("attachments").insert({
          project_id: projectId,
          filename: `${row.name} - ${file.name}`,
          storage_path: storagePath,
          mime_type: file.type || null,
          size_bytes: file.size,
          linked_requirement_key: row.id,
          linked_requirement_label: row.name,
          linked_requirement_source: "ccc",
        });
        if (insertError) {
          // Fallback to the same minimal insert shape used by the Documents page.
          const { error: fallbackInsertError } = await supabase.from("attachments").insert({
            project_id: projectId,
            filename: `${row.name} - ${file.name}`,
            storage_path: storagePath,
            mime_type: file.type || null,
            size_bytes: file.size,
          });
          if (fallbackInsertError) throw fallbackInsertError;
        }
      }

      const lastFile = files.item(files.length - 1);
      setSubmittedDocs((prev) =>
        prev.map((item) =>
          item.id === rowId
            ? { ...item, status: "uploaded", fileName: lastFile?.name ?? `${files.length} file(s)` }
            : item,
        ),
      );
      router.refresh();
    } catch (error) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message?: unknown }).message ?? "Upload failed.")
          : "Upload failed.";
      setUploadError(message);
    } finally {
      setUploadingRowId(null);
      setDragOverRowId(null);
    }
  }

  async function downloadB011() {
    setDownloadError(null);
    setDownloadingB011(true);
    try {
      const payload = buildB011RequestPayload();
      const response = await fetch(`/projects/${projectId}/ccc/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type") ?? "";
        let serverMessage = "";
        if (contentType.includes("application/json")) {
          const payload = (await response.json()) as { error?: string };
          serverMessage = payload.error ?? "";
        } else {
          serverMessage = await response.text();
        }
        throw new Error(serverMessage || "Unable to generate B-011 download.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const contentDisposition = response.headers.get("Content-Disposition") ?? "";
      const match = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
      link.download = match?.[1] ?? `B-011-${projectId}.docx`;
      link.href = objectUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Unable to generate B-011 download.";
      setDownloadError(message);
    } finally {
      setDownloadingB011(false);
    }
  }

  function buildB011RequestPayload() {
    const hasRowAttachment = (rowId: string) =>
      submittedDocs.some((row) => row.id === rowId && row.status !== "not_started");
    const otherDocuments = submittedDocs.some(
      (row) =>
        row.status !== "not_started" &&
        !["2", "2m", "5", "6", "9"].includes(row.id) &&
        !/manufacturer(?:'s)?\s+certificate/i.test(`${row.name} ${row.fileName ?? ""}`),
    );

    return {
      projectName: projectName?.trim() || projectId,
      completionDate: form6ACompletionDate,
      lbpEntries: form6AEntries,
      otherPersonnelEntries: form6ANonRestrictedEntries,
      specifiedSystems: {
        noSpecifiedSystems,
        selectedCodes: selectedSpecifiedSystems,
      },
      lbpMemorandaFilenames: lbpMemorandaFiles.map((file) =>
        memorandaDisplayName(file.filename),
      ),
      attachments: {
        otherDocuments,
        lbpMemorandaUploaded: lbpMemorandaFiles.length > 0,
        energyCertificates: hasRowAttachment("5") || hasRowAttachment("6"),
        specifiedSystemsEvidence:
          hasRowAttachment("9") || (!noSpecifiedSystems && selectedSpecifiedSystems.length > 0),
        manufacturersCertificate: false,
      },
    };
  }

  async function downloadPackagedZip() {
    setPackageError(null);
    setDownloadingPackageZip(true);
    try {
      const payload = buildB011RequestPayload();
      const response = await fetch(`/projects/${projectId}/ccc/package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type") ?? "";
        let serverMessage = "";
        if (contentType.includes("application/json")) {
          const errorPayload = (await response.json()) as { error?: string };
          serverMessage = errorPayload.error ?? "";
        } else {
          serverMessage = await response.text();
        }
        throw new Error(serverMessage || "Unable to generate CCC package zip.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const contentDisposition = response.headers.get("Content-Disposition") ?? "";
      const match = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
      link.download = match?.[1] ?? `CCC-Package-${projectId}.zip`;
      link.href = objectUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Unable to generate CCC package zip.";
      setPackageError(message);
    } finally {
      setDownloadingPackageZip(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">Code Compliance Certificate</h1>
        <p className="mt-1 text-sm text-ink-600">Project {projectDisplay} · Christchurch City Council</p>
      </header>

      <CccSection title="1. Status Bar" status={sectionStatus.statusBar}>
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard variant="compact" label="Documents submitted" value={`${doneCount} of ${totalCount}`} />
          <MetricCard variant="compact" label="Consent issue date" value={consentIssueDisplay} />
          <MetricCard variant="compact" label="Consent expiry (2 years)" value={consentExpiryDisplay} />
          <MetricCard variant="compact" label="CCC application submitted" value={packageSent ? "Submitted" : "Not submitted"} />
          <MetricCard variant="compact" label="Overall tab status" value={statusLabel(overall)} />
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-ink-900" style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }} />
        </div>
      </CccSection>

      <CccSection title="2. Document Checklist" status={sectionStatus.docs}>
        <h3 className="mb-2 text-sm font-semibold text-ink-900">Mandatory</h3>
        <ChecklistTable
          rows={mandatory}
          uploadingRowId={uploadingRowId}
          dragOverRowId={dragOverRowId}
          onDragEnter={(id) => setDragOverRowId(id)}
          onDragLeave={(id) => {
            if (dragOverRowId === id) setDragOverRowId(null);
          }}
          onUpload={uploadChecklistFiles}
          formPanelOpenByRow={formPanelOpenByRow}
          onToggleFormPanel={(id) =>
            setFormPanelOpenByRow((prev) => ({
              ...prev,
              [id]: !prev[id],
            }))
          }
          form6AEntries={form6AEntries}
          setForm6AEntries={setForm6AEntries}
          form6ANonRestrictedEntries={form6ANonRestrictedEntries}
          setForm6ANonRestrictedEntries={setForm6ANonRestrictedEntries}
          form6ACompletionDate={form6ACompletionDate}
          setForm6ACompletionDate={setForm6ACompletionDate}
          lbpMemorandaFiles={lbpMemorandaFiles}
          onUploadLbpMemoranda={uploadLbpMemorandaFiles}
          onUpdateLbpMemorandaName={(fileId, lbpName) => {
            setLbpMemorandaFiles((prev) =>
              prev.map((file) => (file.id === fileId ? { ...file, lbpName } : file)),
            );
          }}
          onPersistLbpMemorandaName={updateLbpMemorandaName}
          onRemoveLbpMemorandaFile={removeLbpMemorandaFile}
          onPreviewLbpMemorandaFile={openLbpMemorandaPreview}
          noSpecifiedSystems={noSpecifiedSystems}
          setNoSpecifiedSystems={setNoSpecifiedSystems}
          selectedSpecifiedSystems={selectedSpecifiedSystems}
          setSelectedSpecifiedSystems={setSelectedSpecifiedSystems}
        />
        <h3 className="mb-2 mt-4 text-sm font-semibold text-ink-900">Conditional</h3>
        <ChecklistTable
          rows={conditional}
          uploadingRowId={uploadingRowId}
          dragOverRowId={dragOverRowId}
          onDragEnter={(id) => setDragOverRowId(id)}
          onDragLeave={(id) => {
            if (dragOverRowId === id) setDragOverRowId(null);
          }}
          onUpload={uploadChecklistFiles}
          formPanelOpenByRow={formPanelOpenByRow}
          onToggleFormPanel={(id) =>
            setFormPanelOpenByRow((prev) => ({
              ...prev,
              [id]: !prev[id],
            }))
          }
          form6AEntries={form6AEntries}
          setForm6AEntries={setForm6AEntries}
          form6ANonRestrictedEntries={form6ANonRestrictedEntries}
          setForm6ANonRestrictedEntries={setForm6ANonRestrictedEntries}
          form6ACompletionDate={form6ACompletionDate}
          setForm6ACompletionDate={setForm6ACompletionDate}
          lbpMemorandaFiles={lbpMemorandaFiles}
          onUploadLbpMemoranda={uploadLbpMemorandaFiles}
          onUpdateLbpMemorandaName={(fileId, lbpName) => {
            setLbpMemorandaFiles((prev) =>
              prev.map((file) => (file.id === fileId ? { ...file, lbpName } : file)),
            );
          }}
          onPersistLbpMemorandaName={updateLbpMemorandaName}
          onRemoveLbpMemorandaFile={removeLbpMemorandaFile}
          onPreviewLbpMemorandaFile={openLbpMemorandaPreview}
          noSpecifiedSystems={noSpecifiedSystems}
          setNoSpecifiedSystems={setNoSpecifiedSystems}
          selectedSpecifiedSystems={selectedSpecifiedSystems}
          setSelectedSpecifiedSystems={setSelectedSpecifiedSystems}
        />
        {uploadError && <p className="mt-3 text-xs text-red-600">{uploadError}</p>}
        <p className="mt-3 text-xs text-ink-500">Unassigned files can be assigned to checklist rows from the Documents tab.</p>
      </CccSection>

      <CccSection title="3. Inspections Settlement Check" status={sectionStatus.inspectionsSettled}>
        <p className="text-sm text-ink-700">
          This check is automatic and reflects inspection results from the Inspections tab.
        </p>
        {!inspectionsLoaded ? (
          <p className="mt-3 text-xs text-ink-500">Loading inspections...</p>
        ) : inspectionsPassed ? (
          <p className="mt-3 text-sm text-emerald-700">
            All inspections are passed. Inspection settlement is complete.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {inspectionItems.length === 0 ? (
              <>
                <p className="text-sm text-ink-700">
                  No inspections found yet in this project.
                </p>
                <p className="text-xs text-ink-500">
                  Add and complete inspections in the Inspections tab to unlock CCC submission.
                </p>
                <Link
                  href={`/projects/${projectId}/inspections`}
                  className="inline-block text-sm text-ink-900 underline underline-offset-2 hover:text-ink-700"
                >
                  Open Inspections
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-red-700">
                  Action required: complete and pass all inspections before CCC submission.
                </p>
              <ul className="space-y-1 text-sm">
                {pendingInspections.map((inspection) => (
                  <li key={inspection.id}>
                    <Link
                      href={`/projects/${projectId}/inspections/${inspection.id}`}
                      className="text-ink-900 underline underline-offset-2 hover:text-ink-700"
                    >
                      {inspection.title}
                    </Link>
                    <span className="ml-2 text-xs text-ink-500">({inspection.status})</span>
                  </li>
                ))}
              </ul>
              </>
            )}
          </div>
        )}
      </CccSection>

      <CccSection title="4. Fees Settlement Check" status={sectionStatus.feesSettled}>
        <p className="text-sm text-ink-700">
          Confirm all fees are settled in the fees module before CCC submission.
        </p>
        <label className="mt-3 inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={feesSettled}
            onChange={(e) => setFeesSettled(e.target.checked)}
          />
          Fees settled
        </label>
      </CccSection>

      <CccSection title="5. Download Prefilled Form" status={sectionStatus.submit}>
        <p className="text-sm text-ink-700">
          {sectionStatus.submit === "complete"
            ? "Ready to download the prefilled B-011 form."
            : "Download is locked until all mandatory documents are uploaded, inspections passed, and settlement checks are confirmed."}
        </p>
        <div className="mt-3">
          <button
            type="button"
            disabled={sectionStatus.submit !== "complete" || downloadingB011}
            onClick={() => void downloadB011()}
            className="rounded-md bg-ink-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloadingB011 ? "Generating..." : "Download now"}
          </button>
        </div>
        {downloadError && <p className="mt-2 text-xs text-red-600">{downloadError}</p>}
      </CccSection>

      <CccSection title="6. Package And Send Off" status={sectionStatus.sendOff}>
        <p className="text-sm text-ink-700">
          {sectionStatus.submit === "complete"
            ? "Package the downloaded B-011 with all required supporting documents, then submit via CCC Online Services."
            : "Packaging is locked until the prefilled B-011 is ready to download."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={sectionStatus.submit !== "complete" || downloadingPackageZip}
            onClick={() => void downloadPackagedZip()}
            className="rounded-md bg-ink-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloadingPackageZip ? "Packaging..." : "Download package (.zip)"}
          </button>
          <a
            href="https://onlineservices.ccc.govt.nz"
            target="_blank"
            rel="noreferrer"
            className={`rounded-md px-3 py-2 text-sm ${
              sectionStatus.submit === "complete"
                ? "bg-ink-900 text-white"
                : "pointer-events-none bg-ink-100 text-ink-500"
            }`}
          >
            Open CCC Online Services
          </a>
          <label className="inline-flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={packageSent}
              disabled={sectionStatus.submit !== "complete"}
              onChange={(e) => setPackageSent(e.target.checked)}
            />
            Package sent
          </label>
        </div>
        {packageError && <p className="mt-2 text-xs text-red-600">{packageError}</p>}
      </CccSection>

    </div>
  );
}

