import { getSupabaseServer } from "@/lib/supabase/server";
import { ProjectDocumentsView, type ProjectDocumentItem } from "@/components/project-documents-view";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-NZ", { year: "numeric", month: "short", day: "numeric" });
}

function formatFileSize(size: number | null) {
  if (!size || size <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let index = 0;
  let value = size;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function extensionFromName(filename: string) {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function fromStoredType(value: string | null): ProjectDocumentItem["type"] | null {
  if (value === "plans") return "Plans";
  if (value === "consents") return "Consents";
  if (value === "certificates") return "Certificates";
  if (value === "inspections") return "Inspections";
  if (value === "photos") return "Photos";
  if (value === "other") return "Other";
  return null;
}

function deriveType(filename: string, mimeType: string | null): ProjectDocumentItem["type"] {
  const value = `${filename} ${mimeType ?? ""}`.toLowerCase();
  if (value.includes("plan") || value.includes("drawing")) return "Plans";
  if (value.includes("consent")) return "Consents";
  if (value.includes("certificate") || value.includes("ps3") || value.includes("ps4")) return "Certificates";
  if (value.includes("inspection")) return "Inspections";
  if (mimeType?.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(extensionFromName(filename))) {
    return "Photos";
  }
  return "Other";
}

function toDisplayStatus(value: string | null): ProjectDocumentItem["status"] {
  if (value === "approved") return "Approved";
  if (value === "rejected") return "Rejected";
  if (value === "missing") return "Pending";
  return "Pending";
}

export default async function ProjectDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServer();

  const [{ data: project }, { data: attachments }] = await Promise.all([
    supabase.from("projects").select("id, address, application_ref").eq("id", id).single(),
    supabase
      .from("attachments")
      .select("*")
      .eq("project_id", id)
      .order("uploaded_at", { ascending: false }),
  ]);

  const documents: ProjectDocumentItem[] = (attachments ?? []).map((item) => ({
    id: item.id,
    name: item.display_name || item.filename,
    originalName: item.filename,
    storagePath: item.storage_path,
    type: fromStoredType(item.document_type) ?? deriveType(item.filename, item.mime_type),
    status: toDisplayStatus(item.document_status),
    uploadDate: formatDate(item.uploaded_at),
    uploadedBy: "Project owner",
    fileSize: formatFileSize(item.size_bytes),
    extension: extensionFromName(item.filename),
  }));
  const canEditStatus = Boolean(
    attachments &&
      attachments.length > 0 &&
      Object.prototype.hasOwnProperty.call(attachments[0], "document_status"),
  );

  const reference = project?.application_ref
    ? `${project.application_ref} · ${project.address}`
    : `${project?.address ?? "Project"}`;

  return (
    <ProjectDocumentsView
      projectId={id}
      projectRef={reference}
      documents={documents}
      canEditStatus={canEditStatus}
    />
  );
}
