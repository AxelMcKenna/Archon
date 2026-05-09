"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";

type Status = "not_started" | "in_progress" | "complete" | "action_required";
type Form6ALicensingClass =
  | "Carpenter"
  | "Foundation"
  | "Roofing"
  | "Bricklaying and Blocklaying"
  | "External Plastering"
  | "Design — LBP1"
  | "Design — LBP2"
  | "Site — SL1"
  | "Site — SL2"
  | "Section 291 — Treated as Licensed";

interface ChecklistRow {
  id: string;
  name: string;
  description: string;
  mandatory: boolean;
  status: "not_started" | "uploaded" | "accepted";
  fileName?: string;
}

interface Form6AEntry {
  id: string;
  lbpName: string;
  licensingClass: Form6ALicensingClass;
  lbpOrRegistrationNumber: string;
  particularWorkCarriedOutOrSupervised: string;
}

interface Form6ANonRestrictedEntry {
  id: string;
  name: string;
  address: string;
  phoneNumbers: string;
  relevantLicenceOrRegistrationNumber: string;
}

interface SpecifiedSystemOption {
  code: string;
  description: string;
}

interface LbpMemorandaFile {
  id: string;
  filename: string;
  storagePath: string;
  uploadedAt: string;
  sizeBytes: number | null;
  lbpName: string;
  mimeType: string | null;
}

const statusWeight: Record<Status, number> = {
  complete: 0,
  in_progress: 1,
  not_started: 2,
  action_required: 3,
};

const badgeClasses: Record<Status, string> = {
  not_started: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-amber-100 text-amber-800 border-amber-200",
  complete: "bg-emerald-100 text-emerald-800 border-emerald-200",
  action_required: "bg-red-100 text-red-800 border-red-200",
};

const checklistStatusBadge = (status: ChecklistRow["status"]): Status =>
  status === "accepted" ? "complete" : status === "uploaded" ? "in_progress" : "not_started";

function getLocalTodayDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createClientRowId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function hasAnyText(values: string[]) {
  return values.some((value) => value.trim().length > 0);
}

function isAllowedMemorandaFile(file: File) {
  const allowedMimeTypes = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
  ]);
  if (allowedMimeTypes.has(file.type)) return true;
  const lowerName = file.name.toLowerCase();
  return [".pdf", ".docx", ".jpg", ".jpeg", ".png"].some((ext) => lowerName.endsWith(ext));
}

function formatFileSize(sizeBytes: number | null) {
  if (!sizeBytes || sizeBytes <= 0) return "—";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploadedDate(isoDate: string) {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

function addYearsToDateValue(dateValue: string, years: number) {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setFullYear(parsed.getFullYear() + years);
  return parsed.toISOString().slice(0, 10);
}

function memorandaDisplayName(filename: string) {
  return filename.replace(/^LBP Memoranda \/ Record of Building Work -\s*/, "").trim() || filename;
}

function memorandaRowFileLabel(files: Array<{ filename: string }>) {
  if (files.length <= 0) return undefined;
  if (files.length === 1) return memorandaDisplayName(files[0].filename);
  return `${files.length} file(s)`;
}

const SPECIFIED_SYSTEM_OPTIONS: SpecifiedSystemOption[] = [
  { code: "SS1", description: "Automatic systems for fire suppression" },
  { code: "SS2", description: "Emergency warning systems" },
  { code: "SS3/1", description: "Automatic door" },
  { code: "SS3/2", description: "Access controlled doors" },
  { code: "SS3/3", description: "Interfaced fire or smoke doors or windows" },
  { code: "SS4", description: "Emergency lighting systems" },
  { code: "SS5", description: "Escape route pressurisation systems" },
  { code: "SS6", description: "Riser mains" },
  { code: "SS7", description: "Automatic back-flow preventers" },
  { code: "SS8/1", description: "Passenger carrying lifts" },
  { code: "SS8/2", description: "Service lifts" },
  { code: "SS8/3", description: "Escalator and moving walks" },
  { code: "SS9", description: "Mechanical ventilation or air conditioning systems" },
  { code: "SS10", description: "Building maintenance units" },
  { code: "SS11", description: "Laboratory fume cupboards" },
  { code: "SS12/1", description: "Audio loops" },
  { code: "SS12/2", description: "FM radio and infrared beam transmission systems" },
  { code: "SS13/1", description: "Mechanical smoke control" },
  { code: "SS13/2", description: "Natural smoke control" },
  { code: "SS13/3", description: "Smoke curtains" },
  { code: "SS14/1", description: "Emergency power systems" },
  { code: "SS14/2", description: "Signs for SS1-13" },
  { code: "SS15/1", description: "Spoken information to facilitate evacuation" },
  { code: "SS15/2", description: "Final exits" },
  { code: "SS15/3", description: "Fire separations" },
  { code: "SS15/4", description: "Signs for facilitating evacuation" },
  { code: "SS15/5", description: "Smoke separations" },
  { code: "SS16", description: "Cable cars" },
];

function Collapsible({
  title,
  status,
  defaultOpen = true,
  children,
}: {
  title: string;
  status: Status;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-ink-200 bg-surface-raised">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <span className={`rounded-full border px-2 py-0.5 text-xs ${badgeClasses[status]}`}>
            {status.replaceAll("_", " ")}
          </span>
        </div>
        <span className="text-ink-500" aria-hidden="true">
          {open ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m18 15-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </button>
      {open && <div className="border-t border-ink-100 p-4">{children}</div>}
    </section>
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
  const supabase = getSupabaseBrowser();
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

  const [inspectionsSettled, setInspectionsSettled] = useState(false);
  const [feesSettled, setFeesSettled] = useState(false);
  const [uploadingRowId, setUploadingRowId] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingB011, setDownloadingB011] = useState(false);
  const [packageSent, setPackageSent] = useState(false);
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

  const inspections: Array<{ type: string; scheduled: string; status: string; notes: string }> = [];

  const mandatory = submittedDocs.filter((d) => d.mandatory);
  const conditional = submittedDocs.filter((d) => !d.mandatory);
  const doneCount = submittedDocs.filter((d) => d.status !== "not_started").length;
  const totalCount = submittedDocs.length;
  const inspectionsPassed = inspections.every((i) => i.status === "passed");
  const mandatoryReady = mandatory.every((d) => d.status !== "not_started");

  const sectionStatus = useMemo(() => {
    const docsStatus: Status = mandatoryReady ? "complete" : "action_required";
    const inspectionsSettledStatus: Status = inspectionsSettled ? "complete" : "action_required";
    const feesSettledStatus: Status = feesSettled ? "complete" : "action_required";
    const downloadReady = mandatoryReady && inspectionsPassed && inspectionsSettled && feesSettled;
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
  }, [mandatoryReady, inspectionsPassed, inspectionsSettled, feesSettled, packageSent]);

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
  const packageSentStorageKey = `ccc:package-sent:${projectId}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
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
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(packageSentStorageKey);
    setPackageSent(saved === "1");
  }, [packageSentStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(packageSentStorageKey, packageSent ? "1" : "0");
  }, [packageSentStorageKey, packageSent]);

  useEffect(() => {
    if (typeof window === "undefined") return;
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
    if (typeof window === "undefined") return;
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
    if (typeof window === "undefined") return;
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
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("You need to be signed in to upload documents.");

      const createdFiles: LbpMemorandaFile[] = [];
      for (const file of filesToUpload) {
        const safeName = file.name.replace(/\s+/g, "_");
        const storagePath = `${user.id}/${projectId}/ccc-2m-${Date.now()}-${safeName}`;
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
              filename: string;
              storage_path: string;
              uploaded_at: string;
              size_bytes: number | null;
              display_name?: string | null;
              mime_type?: string | null;
            }
          | null = null;

        const { error: primaryInsertError } = await supabase
          .from("attachments")
          .insert({
            ...baseInsert,
            linked_requirement_key: "2m",
            linked_requirement_label: rowLabel,
            linked_requirement_source: "ccc",
            display_name: "",
          });

        if (primaryInsertError) {
          const { error: fallbackInsertError } = await supabase
            .from("attachments")
            .insert(baseInsert);

          if (fallbackInsertError) throw primaryInsertError;
          inserted = {
            filename: baseInsert.filename,
            storage_path: baseInsert.storage_path,
            uploaded_at: new Date().toISOString(),
            size_bytes: baseInsert.size_bytes ?? null,
            mime_type: baseInsert.mime_type ?? null,
          };
        } else {
          inserted = {
            filename: baseInsert.filename,
            storage_path: baseInsert.storage_path,
            uploaded_at: new Date().toISOString(),
            size_bytes: baseInsert.size_bytes ?? null,
            display_name: "",
            mime_type: baseInsert.mime_type ?? null,
          };
        }

        if (!inserted) throw new Error("Upload failed while saving attachment metadata.");

        createdFiles.push({
          id: createClientRowId(),
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
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("You need to be signed in to upload documents.");

      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/\s+/g, "_");
        const storagePath = `${user.id}/${projectId}/ccc-${row.id}-${Date.now()}-${safeName}`;
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
      const hasRowAttachment = (rowId: string) =>
        submittedDocs.some((row) => row.id === rowId && row.status !== "not_started");
      const otherDocuments = submittedDocs.some(
        (row) =>
          row.status !== "not_started" &&
          !["2", "2m", "5", "6", "9"].includes(row.id) &&
          !/manufacturer(?:'s)?\s+certificate/i.test(`${row.name} ${row.fileName ?? ""}`),
      );
      const response = await fetch(`/projects/${projectId}/ccc/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: projectName?.trim() || projectId,
          completionDate: form6ACompletionDate,
          lbpEntries: form6AEntries,
          otherPersonnelEntries: form6ANonRestrictedEntries,
          specifiedSystems: {
            noSpecifiedSystems,
            selectedCodes: selectedSpecifiedSystems,
          },
          lbpMemorandaFilenames: lbpMemorandaFiles.map((file) => memorandaDisplayName(file.filename)),
          attachments: {
            otherDocuments,
            lbpMemorandaUploaded: lbpMemorandaFiles.length > 0,
            energyCertificates: hasRowAttachment("5") || hasRowAttachment("6"),
            specifiedSystemsEvidence:
              hasRowAttachment("9") || (!noSpecifiedSystems && selectedSpecifiedSystems.length > 0),
            manufacturersCertificate: false,
          },
        }),
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

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">Code Compliance Certificate</h1>
        <p className="mt-1 text-sm text-ink-600">Project {projectDisplay} · Christchurch City Council</p>
      </header>

      <Collapsible title="1. Status Bar" status={sectionStatus.statusBar}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Documents submitted" value={`${doneCount} of ${totalCount}`} />
          <Metric label="Consent issue date" value={consentIssueDisplay} />
          <Metric label="Consent expiry (2 years)" value={consentExpiryDisplay} />
          <Metric label="CCC application submitted" value={packageSent ? "Submitted" : "Not submitted"} />
          <Metric label="Overall tab status" value={overall.replaceAll("_", " ")} />
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-ink-900" style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }} />
        </div>
      </Collapsible>

      <Collapsible title="2. Document Checklist" status={sectionStatus.docs}>
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
      </Collapsible>

      <Collapsible title="3. Inspections Settlement Check" status={sectionStatus.inspectionsSettled}>
        <p className="text-sm text-ink-700">
          Confirm inspections are settled in the inspections module before CCC submission.
        </p>
        <label className="mt-3 inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={inspectionsSettled}
            onChange={(e) => setInspectionsSettled(e.target.checked)}
          />
          Inspections settled
        </label>
      </Collapsible>

      <Collapsible title="4. Fees Settlement Check" status={sectionStatus.feesSettled}>
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
      </Collapsible>

      <Collapsible title="5. Download Prefilled Form" status={sectionStatus.submit}>
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
      </Collapsible>

      <Collapsible title="6. Package And Send Off" status={sectionStatus.sendOff}>
        <p className="text-sm text-ink-700">
          {sectionStatus.submit === "complete"
            ? "Package the downloaded B-011 with all required supporting documents, then submit via CCC Online Services."
            : "Packaging is locked until the prefilled B-011 is ready to download."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
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
      </Collapsible>

    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink-100 px-3 py-2">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink-900">{value}</p>
    </div>
  );
}

function ChecklistTable({
  rows,
  uploadingRowId,
  dragOverRowId,
  onDragEnter,
  onDragLeave,
  onUpload,
  formPanelOpenByRow,
  onToggleFormPanel,
  form6AEntries,
  setForm6AEntries,
  form6ANonRestrictedEntries,
  setForm6ANonRestrictedEntries,
  form6ACompletionDate,
  setForm6ACompletionDate,
  lbpMemorandaFiles,
  onUploadLbpMemoranda,
  onUpdateLbpMemorandaName,
  onPersistLbpMemorandaName,
  onRemoveLbpMemorandaFile,
  onPreviewLbpMemorandaFile,
  noSpecifiedSystems,
  setNoSpecifiedSystems,
  selectedSpecifiedSystems,
  setSelectedSpecifiedSystems,
}: {
  rows: ChecklistRow[];
  uploadingRowId: string | null;
  dragOverRowId: string | null;
  onDragEnter: (id: string) => void;
  onDragLeave: (id: string) => void;
  onUpload: (id: string, files: FileList | null) => Promise<void>;
  formPanelOpenByRow: Record<string, boolean>;
  onToggleFormPanel: (id: string) => void;
  form6AEntries: Form6AEntry[];
  setForm6AEntries: React.Dispatch<React.SetStateAction<Form6AEntry[]>>;
  form6ANonRestrictedEntries: Form6ANonRestrictedEntry[];
  setForm6ANonRestrictedEntries: React.Dispatch<React.SetStateAction<Form6ANonRestrictedEntry[]>>;
  form6ACompletionDate: string;
  setForm6ACompletionDate: React.Dispatch<React.SetStateAction<string>>;
  lbpMemorandaFiles: LbpMemorandaFile[];
  onUploadLbpMemoranda: (files: FileList | null) => Promise<void>;
  onUpdateLbpMemorandaName: (fileId: string, lbpName: string) => void;
  onPersistLbpMemorandaName: (fileId: string, lbpName: string) => Promise<void>;
  onRemoveLbpMemorandaFile: (file: LbpMemorandaFile) => Promise<void>;
  onPreviewLbpMemorandaFile: (file: LbpMemorandaFile) => Promise<void>;
  noSpecifiedSystems: boolean;
  setNoSpecifiedSystems: React.Dispatch<React.SetStateAction<boolean>>;
  selectedSpecifiedSystems: string[];
  setSelectedSpecifiedSystems: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  return (
    <div className="overflow-x-auto rounded-md border border-ink-100">
      <table className="min-w-full table-fixed text-xs">
        <thead className="bg-ink-50 text-left text-ink-500">
          <tr>
            <th className="w-[28%] px-2.5 py-2">Document</th>
            <th className="w-[42%] px-2.5 py-2">Description</th>
            <th className="w-[15%] px-2.5 py-2">Status</th>
            <th className="w-[15%] px-2.5 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const badge = checklistStatusBadge(row.status);
            const uploadDisabled = uploadingRowId === row.id;
            return (
              <Fragment key={row.id}>
                <tr className="border-t border-ink-100">
                <td className="px-2.5 py-2">{row.name}</td>
                <td className="px-2.5 py-2">{row.description}</td>
                <td className="px-2.5 py-2">
                  <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${badgeClasses[badge]}`}>
                    {row.status.replaceAll("_", " ")}
                  </span>
                  {row.fileName && <div className="mt-1 text-xs text-ink-700">✓ {row.fileName}</div>}
                </td>
                <td className="px-2.5 py-2">
                  {row.id === "2" || row.id === "9" ? (
                    <button
                      type="button"
                      onClick={() => onToggleFormPanel(row.id)}
                      className="rounded-md border border-ink-200 px-2 py-1 text-xs hover:bg-ink-50"
                    >
                      {formPanelOpenByRow[row.id] ? "Hide form" : "Fill in"}
                    </button>
                  ) : (
                    <>
                      <input
                    ref={(element) => {
                      inputRefs.current[row.id] = element;
                    }}
                    type="file"
                    className="hidden"
                    multiple={row.id === "2m"}
                    accept={
                      row.id === "2m"
                        ? ".pdf,.docx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png"
                        : undefined
                    }
                    onChange={(event) => {
                      if (row.id === "2m") {
                        void onUploadLbpMemoranda(event.target.files);
                      } else {
                        void onUpload(row.id, event.target.files);
                      }
                      event.target.value = "";
                    }}
                  />
                      <button
                    type="button"
                    onClick={() => inputRefs.current[row.id]?.click()}
                    onDragOver={(event) => {
                      event.preventDefault();
                      onDragEnter(row.id);
                    }}
                    onDragLeave={() => onDragLeave(row.id)}
                    onDrop={(event) => {
                      event.preventDefault();
                      onDragLeave(row.id);
                      if (row.id === "2m") {
                        void onUploadLbpMemoranda(event.dataTransfer.files);
                      } else {
                        void onUpload(row.id, event.dataTransfer.files);
                      }
                    }}
                    disabled={uploadDisabled}
                    className={`rounded-md border border-dashed px-2 py-1 text-xs transition ${
                      dragOverRowId === row.id
                        ? "border-ink-500 bg-ink-100 text-ink-900"
                        : "border-ink-200 hover:bg-ink-50"
                    } disabled:opacity-60`}
                  >
                    {uploadingRowId === row.id ? "Uploading..." : "Upload / Drop"}
                      </button>
                    </>
                  )}
                </td>
                </tr>
                {(row.id === "2" || row.id === "9") && formPanelOpenByRow[row.id] && (
                <tr className="border-t border-ink-100 bg-ink-50/40">
                  <td colSpan={4} className="px-3 py-3">
                    {row.id === "2" ? (
                      <FormInlineSection title="Record of Building Work Carried Out or Supervised" subtitle={row.description}>
                      <Form6AInlineTable
                        completionDate={form6ACompletionDate}
                        onCompletionDateChange={setForm6ACompletionDate}
                        entries={form6AEntries}
                        nonRestrictedEntries={form6ANonRestrictedEntries}
                        onChange={setForm6AEntries}
                        onChangeNonRestricted={setForm6ANonRestrictedEntries}
                      />
                      </FormInlineSection>
                    ) : (
                      <FormInlineSection
                        title="Specified Systems"
                        subtitle="The following specified systems are contained on the compliance schedule for the building and, in the opinion of the personnel who installed them, are capable of performing to the performance standards set out in the building consent:"
                      >
                        <SpecifiedSystemsInlineSection
                          noSpecifiedSystems={noSpecifiedSystems}
                          onNoSpecifiedSystemsChange={setNoSpecifiedSystems}
                          selectedCodes={selectedSpecifiedSystems}
                          onSelectedCodesChange={setSelectedSpecifiedSystems}
                        />
                      </FormInlineSection>
                    )}
                  </td>
                </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FormInlineSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <header>
        <h4 className="text-sm font-semibold text-ink-900">{title}</h4>
        <p className="text-xs text-ink-600">{subtitle}</p>
      </header>
      {children}
    </div>
  );
}

function LbpMemorandaInlineSection({
  files,
  uploading,
  onUpload,
  onNameChange,
  onNamePersist,
  onDelete,
  onPreview,
}: {
  files: LbpMemorandaFile[];
  uploading: boolean;
  onUpload: (files: FileList | null) => Promise<void>;
  onNameChange: (fileId: string, lbpName: string) => void;
  onNamePersist: (fileId: string, lbpName: string) => Promise<void>;
  onDelete: (file: LbpMemorandaFile) => Promise<void>;
  onPreview: (file: LbpMemorandaFile) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        accept=".pdf,.docx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png"
        onChange={(event) => {
          void onUpload(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void onUpload(event.dataTransfer.files);
        }}
        className={`rounded-md border border-dashed px-2 py-1 text-xs transition ${
          dragOver
            ? "border-ink-500 bg-ink-100 text-ink-900"
            : "border-ink-200 hover:bg-ink-50"
        }`}
      >
        {uploading ? "Uploading..." : "Upload / Drop"}
      </button>
      <p className="text-xs text-ink-600">Upload one memoranda per LBP</p>

      <div className="max-h-80 overflow-auto rounded-md border border-ink-100 bg-surface-raised">
        {files.length === 0 ? (
          <div className="px-3 py-4 text-xs text-ink-500">No files uploaded yet.</div>
        ) : (
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-ink-50 text-left text-ink-600">
              <tr>
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2">Uploaded</th>
                <th className="px-3 py-2">LBP name</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const fileLabel = file.filename.replace(/^LBP Memoranda \/ Record of Building Work -\s*/, "");
                return (
                  <tr key={file.id} className="border-t border-ink-100 align-top">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left text-sm text-blue-700 underline underline-offset-2"
                        onClick={() => void onPreview(file)}
                      >
                        {fileLabel}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-700">{formatFileSize(file.sizeBytes)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-700">{formatUploadedDate(file.uploadedAt)}</td>
                    <td className="px-3 py-2">
                      <input
                        value={file.lbpName}
                        onChange={(event) => onNameChange(file.id, event.target.value)}
                        onBlur={(event) => {
                          void onNamePersist(file.id, event.target.value.trim());
                        }}
                        className="w-full min-w-[180px] rounded border border-ink-200 px-2.5 py-2 text-xs"
                        placeholder="Enter LBP name"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="rounded border border-red-200 px-2 py-1.5 text-xs text-red-700"
                        onClick={() => void onDelete(file)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const modernSelectClassName =
  "w-full min-w-0 appearance-none rounded border border-ink-200 bg-surface-raised px-2.5 py-2 pr-8 text-xs leading-tight";
const modernSelectArrowStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7.5L10 12.5L15 7.5' stroke='%2364748b' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.55rem center",
  backgroundSize: "0.95rem 0.95rem",
} as const;

function Form6AInlineTable({
  completionDate,
  onCompletionDateChange,
  entries,
  nonRestrictedEntries,
  onChange,
  onChangeNonRestricted,
}: {
  completionDate: string;
  onCompletionDateChange: (value: string) => void;
  entries: Form6AEntry[];
  nonRestrictedEntries: Form6ANonRestrictedEntry[];
  onChange: React.Dispatch<React.SetStateAction<Form6AEntry[]>>;
  onChangeNonRestricted: React.Dispatch<React.SetStateAction<Form6ANonRestrictedEntry[]>>;
}) {
  const tradeOptions: Form6ALicensingClass[] = [
    "Carpenter",
    "Foundation",
    "Roofing",
    "Bricklaying and Blocklaying",
    "External Plastering",
    "Design — LBP1",
    "Design — LBP2",
    "Site — SL1",
    "Site — SL2",
    "Section 291 — Treated as Licensed",
  ];
  const [lbpOpen, setLbpOpen] = useState(false);
  const [personnelOpen, setPersonnelOpen] = useState(false);

  useEffect(() => {
    if (entries.length > 0) setLbpOpen(true);
    if (nonRestrictedEntries.length > 0) setPersonnelOpen(true);
  }, [entries.length, nonRestrictedEntries.length]);

  return (
    <div className="space-y-3 text-xs">
      <div className="rounded border border-ink-100 bg-surface-raised p-3">
        <label className="block text-xs font-medium text-ink-800">Completion date</label>
        <p className="mt-1 text-xs text-ink-600">
          All building work to be carried out under the building consent specified on this form was completed on:
        </p>
        <input
          type="date"
          value={completionDate}
          onChange={(event) => onCompletionDateChange(event.target.value)}
          className="mt-2 w-full max-w-56 rounded border border-ink-200 px-2.5 py-2 text-sm"
        />
      </div>
      <button
        type="button"
        onClick={() => setLbpOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded border border-ink-200 bg-surface-raised px-3 py-2 text-left"
      >
        <span className="text-sm font-medium text-ink-900">Licensed Building Practitioners</span>
        <div className="flex items-center gap-3">
          {!lbpOpen && <span className="text-xs text-ink-600">{entries.length} LBPs added</span>}
          <span className="text-ink-500" aria-hidden="true">
            {lbpOpen ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m18 15-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        </div>
      </button>
      {lbpOpen && (
      <>
      <p className="text-xs leading-tight text-ink-700">
        The licensed building practitioner(s) who carried out or supervised the restricted building work is/are as follows:
      </p>
      <div className="overflow-x-auto rounded border border-ink-100">
        <table className="min-w-[900px] w-full table-fixed text-xs">
          <thead className="bg-ink-50">
            <tr className="text-left align-top text-ink-600">
              <th className="w-[16%] px-2.5 py-2 leading-tight">Name</th>
              <th className="w-[20%] px-2.5 py-2 leading-tight">Licensing class</th>
              <th className="w-[30%] px-2.5 py-2 leading-tight">
                Licensed building practitioner number
                <div className="text-[11px] text-ink-500">
                  or registration number if treated as being licensed under section 291 of Act
                </div>
              </th>
              <th className="w-[26%] px-2.5 py-2 leading-tight">Particular work carried out or supervised</th>
              <th className="w-[8%] px-2.5 py-2 leading-tight">Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={entry.id} className="border-t border-ink-100">
                <td className="px-2.5 py-2"><input className="w-full min-w-0 rounded border border-ink-200 px-2.5 py-2 text-xs" value={entry.lbpName} onChange={(e) => onChange((prev) => prev.map((r, i) => i === index ? { ...r, lbpName: e.target.value } : r))} /></td>
                <td className="px-2.5 py-2"><select style={modernSelectArrowStyle} className={modernSelectClassName} value={entry.licensingClass} onChange={(e) => onChange((prev) => prev.map((r, i) => i === index ? { ...r, licensingClass: e.target.value as Form6ALicensingClass } : r))}>{tradeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></td>
                <td className="px-2.5 py-2"><input className="w-full min-w-0 rounded border border-ink-200 px-2.5 py-2 text-xs" value={entry.lbpOrRegistrationNumber} onChange={(e) => onChange((prev) => prev.map((r, i) => i === index ? { ...r, lbpOrRegistrationNumber: e.target.value } : r))} /></td>
                <td className="px-2.5 py-2"><input className="w-full min-w-0 rounded border border-ink-200 px-2.5 py-2 text-xs" value={entry.particularWorkCarriedOutOrSupervised} onChange={(e) => onChange((prev) => prev.map((r, i) => i === index ? { ...r, particularWorkCarriedOutOrSupervised: e.target.value } : r))} /></td>
                <td className="px-2.5 py-2"><button type="button" className="rounded border border-red-200 px-2 py-1.5 text-xs text-red-700" onClick={() => onChange((prev) => prev.filter((_, i) => i !== index))}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border border-ink-200 px-3 py-2 text-xs"
          onClick={() =>
            onChange((prev) => [
              ...prev,
              {
                id: createClientRowId(),
                lbpName: "",
                licensingClass: "Carpenter",
                lbpOrRegistrationNumber: "",
                particularWorkCarriedOutOrSupervised: "",
              },
            ])
          }
        >
          Add LBP
        </button>
      </div>
      </>
      )}
      <button
        type="button"
        onClick={() => setPersonnelOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded border border-ink-200 bg-surface-raised px-3 py-2 text-left"
      >
        <span className="text-sm font-medium text-ink-900">Other Personnel</span>
        <div className="flex items-center gap-3">
          {!personnelOpen && <span className="text-xs text-ink-600">{nonRestrictedEntries.length} people added</span>}
          <span className="text-ink-500" aria-hidden="true">
            {personnelOpen ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m18 15-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        </div>
      </button>
      {personnelOpen && (
      <>
      <p className="text-xs leading-tight text-ink-700">
        The personnel who carried out building work other than restricted building work are as follows: list names, addresses, telephone numbers, and (where relevant and if not provided above) licensed building practitioner numbers or Plumbers, Gasfitters, and Drainlayers Board registration numbers
      </p>
      <div className="overflow-x-auto rounded border border-ink-100">
        <table className="min-w-[900px] w-full table-fixed text-xs">
          <thead className="bg-ink-50">
            <tr className="text-left align-top text-ink-600">
              <th className="w-[15%] px-2.5 py-2 leading-tight">Name</th>
              <th className="w-[28%] px-2.5 py-2 leading-tight">Address</th>
              <th className="w-[16%] px-2.5 py-2 leading-tight">Phone number</th>
              <th className="w-[33%] px-2.5 py-2 leading-tight">
                LBP number or PGDB registration number
                <div className="text-[11px] text-ink-500">Where relevant and if not provided above</div>
              </th>
              <th className="w-[8%] px-2.5 py-2 leading-tight">Action</th>
            </tr>
          </thead>
          <tbody>
            {nonRestrictedEntries.map((entry, index) => (
              <tr key={entry.id} className="border-t border-ink-100">
                <td className="px-2.5 py-2"><input className="w-full min-w-0 rounded border border-ink-200 px-2.5 py-2 text-xs" value={entry.name} onChange={(e) => onChangeNonRestricted((prev) => prev.map((r, i) => i === index ? { ...r, name: e.target.value } : r))} /></td>
                <td className="px-2.5 py-2"><input className="w-full min-w-0 rounded border border-ink-200 px-2.5 py-2 text-xs" value={entry.address} onChange={(e) => onChangeNonRestricted((prev) => prev.map((r, i) => i === index ? { ...r, address: e.target.value } : r))} /></td>
                <td className="px-2.5 py-2"><input className="w-full min-w-0 rounded border border-ink-200 px-2.5 py-2 text-xs" value={entry.phoneNumbers} onChange={(e) => onChangeNonRestricted((prev) => prev.map((r, i) => i === index ? { ...r, phoneNumbers: e.target.value } : r))} /></td>
                <td className="px-2.5 py-2"><input className="w-full min-w-0 rounded border border-ink-200 px-2.5 py-2 text-xs" value={entry.relevantLicenceOrRegistrationNumber} onChange={(e) => onChangeNonRestricted((prev) => prev.map((r, i) => i === index ? { ...r, relevantLicenceOrRegistrationNumber: e.target.value } : r))} /></td>
                <td className="px-2.5 py-2"><button type="button" className="rounded border border-red-200 px-2 py-1.5 text-xs text-red-700" onClick={() => onChangeNonRestricted((prev) => prev.filter((_, i) => i !== index))}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border border-ink-200 px-3 py-2 text-xs"
          onClick={() =>
            onChangeNonRestricted((prev) => [
              ...prev,
              {
                id: createClientRowId(),
                name: "",
                address: "",
                phoneNumbers: "",
                relevantLicenceOrRegistrationNumber: "",
              },
            ])
          }
        >
          Add person
        </button>
      </div>
      </>
      )}
    </div>
  );
}

function SpecifiedSystemsInlineSection({
  noSpecifiedSystems,
  onNoSpecifiedSystemsChange,
  selectedCodes,
  onSelectedCodesChange,
}: {
  noSpecifiedSystems: boolean;
  onNoSpecifiedSystemsChange: (value: boolean) => void;
  selectedCodes: string[];
  onSelectedCodesChange: (value: string[]) => void;
}) {
  function handleToggleSystem(code: string, checked: boolean) {
    onSelectedCodesChange(
      checked ? Array.from(new Set([...selectedCodes, code])) : selectedCodes.filter((item) => item !== code),
    );
  }

  return (
    <div className="space-y-3">
      <label className="inline-flex items-center gap-2 text-sm text-ink-900">
        <input
          type="checkbox"
          checked={noSpecifiedSystems}
          onChange={(event) => {
            const checked = event.target.checked;
            onNoSpecifiedSystemsChange(checked);
            if (checked) onSelectedCodesChange([]);
          }}
        />
        There are no specified systems in the building
      </label>
      <div
        className={`rounded border border-ink-100 p-3 ${
          noSpecifiedSystems ? "bg-slate-50 text-slate-500" : "bg-surface-raised text-ink-900"
        }`}
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {SPECIFIED_SYSTEM_OPTIONS.map((option) => (
            <label key={option.code} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={selectedCodes.includes(option.code)}
                disabled={noSpecifiedSystems}
                onChange={(event) => handleToggleSystem(option.code, event.target.checked)}
              />
              <span>
                <span className="font-semibold text-ink-900">{option.code}</span>
                <span className="text-ink-700">{" - "}{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
