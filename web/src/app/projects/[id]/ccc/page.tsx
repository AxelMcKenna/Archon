import { CccTabClient } from "./tab-client";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getCccViewModel } from "@/lib/ccc";
import { ConstructionSubnav } from "@/components/construction-subnav";
import { notFound } from "next/navigation";

interface LbpMemorandaAttachment {
  id: string;
  filename: string;
  storagePath: string;
  uploadedAt: string;
  sizeBytes: number | null;
  lbpName: string;
  mimeType: string | null;
}

const CCC_ROW_PREFIXES: Array<{ id: string; prefix: string }> = [
  { id: "2", prefix: "Record of Building Work - " },
  { id: "2m", prefix: "LBP Memoranda / Record of Building Work - " },
  { id: "3", prefix: "Certificate of Design Work - " },
  { id: "3a", prefix: "PS3 — Construction Statement - " },
  { id: "4", prefix: "PS4 — Construction Review - " },
  { id: "5", prefix: "Electrical Code of Compliance - " },
  { id: "6", prefix: "Gasfitting Code of Compliance - " },
  { id: "7", prefix: "Test certificate for potable water - " },
  { id: "8", prefix: "Site inspection reports conducted by an engineer - " },
  { id: "9", prefix: "Form B-068 — Specified Systems Declaration - " },
  { id: "10", prefix: "Form B-065 — Accessible Facilities Upgrade Report - " },
];

const CCC_ROW_LABELS: Array<{ id: string; label: string }> = [
  { id: "2", label: "Record of Building Work" },
  { id: "2", label: "Record of Building Work Carried Out or Supervised" },
  { id: "2m", label: "LBP Memoranda / Record of Building Work" },
  { id: "3", label: "Certificate of Design Work" },
  { id: "3a", label: "PS3 — Construction Statement" },
  { id: "4", label: "PS4 — Construction Review" },
  { id: "5", label: "Electrical Code of Compliance" },
  { id: "6", label: "Gasfitting Code of Compliance" },
  { id: "7", label: "Test certificate for potable water" },
  { id: "8", label: "Site inspection reports conducted by an engineer" },
  { id: "9", label: "Form B-068 — Specified Systems Declaration" },
  { id: "10", label: "Form B-065 — Accessible Facilities Upgrade Report" },
];

function normaliseLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function inferRowIdFromFilename(filename: string) {
  const exactPrefix = CCC_ROW_PREFIXES.find((row) => filename.startsWith(row.prefix));
  if (exactPrefix) return exactPrefix.id;

  const prefixLabel = filename.includes(" - ") ? filename.split(" - ")[0].trim() : filename.trim();
  const normalisedPrefixLabel = normaliseLabel(prefixLabel);
  const labelMatch = CCC_ROW_LABELS.find((row) => normaliseLabel(row.label) === normalisedPrefixLabel);
  return labelMatch?.id;
}

export default async function CccPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data: project } = await supabase.from("projects").select("id, address").eq("id", id).single();
  const { data: richAttachments, error: richAttachmentsError } = await supabase
    .from("attachments")
    .select("id, filename, storage_path, uploaded_at, size_bytes, mime_type, linked_requirement_key, display_name")
    .eq("project_id", id)
    .order("uploaded_at", { ascending: false });

  const { data: basicAttachments } = richAttachmentsError
    ? await supabase
        .from("attachments")
        .select("id, filename, storage_path, uploaded_at, size_bytes, mime_type")
        .eq("project_id", id)
        .order("uploaded_at", { ascending: false })
    : { data: null };

  const attachments = (richAttachments ?? basicAttachments ?? []) as Array<{
    id?: string;
    filename?: string;
    storage_path?: string;
    uploaded_at?: string;
    size_bytes?: number | null;
    mime_type?: string | null;
    linked_requirement_key?: string;
    display_name?: string | null;
  }>;

  if (!project) notFound();
  const ccc = await getCccViewModel(supabase, id);

  const uploadedFileByRow: Record<string, string> = {};
  const lbpMemorandaAttachments: LbpMemorandaAttachment[] = [];
  for (const attachment of attachments ?? []) {
    const filename = attachment.filename ?? "";
    const inferredRowId = inferRowIdFromFilename(filename);
    const linkedRowId =
      attachment.linked_requirement_key === "2"
        ? "2m"
        : attachment.linked_requirement_key === "2m"
          ? "2m"
          : attachment.linked_requirement_key;
    const resolvedRowId = inferredRowId ?? linkedRowId;
    if (resolvedRowId && !uploadedFileByRow[resolvedRowId]) {
      const match = CCC_ROW_PREFIXES.find((row) => row.id === resolvedRowId);
      const displayName =
        match && filename.startsWith(match.prefix)
          ? filename.slice(match.prefix.length).trim() || filename
          : filename;
      uploadedFileByRow[resolvedRowId] = displayName;
    }

    const isRowTwoMemoranda =
      resolvedRowId === "2m" ||
      attachment.linked_requirement_key === "2" ||
      attachment.linked_requirement_key === "2m" ||
      filename.startsWith("LBP Memoranda / Record of Building Work - ") ||
      filename.startsWith("Record of Building Work - ");
    if (isRowTwoMemoranda && attachment.id && attachment.storage_path && attachment.uploaded_at) {
      lbpMemorandaAttachments.push({
        id: attachment.id,
        filename,
        storagePath: attachment.storage_path,
        uploadedAt: attachment.uploaded_at,
        sizeBytes: attachment.size_bytes ?? null,
        lbpName: attachment.display_name ?? "",
        mimeType: attachment.mime_type ?? null,
      });
    }
  }

  return (
    <>
      <ConstructionSubnav projectId={id} />
      <CccTabClient
        projectId={id}
        projectName={project.address ?? null}
        uploadedFileByRow={uploadedFileByRow}
        lbpMemorandaAttachments={lbpMemorandaAttachments}
        consentIssueDate={ccc.consentGrantDate}
        consentExpiryDate={ccc.deadlineDate}
      />
    </>
  );
}
