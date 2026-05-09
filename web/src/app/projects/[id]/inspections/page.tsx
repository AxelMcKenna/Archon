import { notFound } from "next/navigation";
import {
  type InspectionWorkflowSnapshot,
  InspectionsPage,
} from "@/components/inspections/inspections-page";
import { loadInspectionRecords } from "@/components/inspections/persistence";
import { getInspectionSchedule } from "@/lib/inspections";
import { normalizeProjectMetadata } from "@/lib/project-metadata";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LetterRow = {
  id: string;
  status: string | null;
  issue_date: string | null;
  response_deadline: string | null;
  created_at: string;
  rfi_items?: Array<{ id: string }>;
};

type AttachmentRow = {
  id: string;
  uploaded_at: string;
  document_status: string | null;
  document_type: string | null;
};

type PlanRow = {
  id: string;
  status: string;
  created_at: string;
  processing_ms: number | null;
  analysis: {
    flags?: Array<{ severity?: string }>;
  } | null;
};

export default async function ProjectInspectionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const [{ data: project, error }, { data: letters }, { data: attachments }, { data: plans }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single(),
      supabase
        .from("rfi_letters")
        .select("id, status, issue_date, response_deadline, created_at, rfi_items(id)")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("attachments")
        .select("id, uploaded_at, document_status, document_type")
        .eq("project_id", id)
        .order("uploaded_at", { ascending: false }),
      supabase
        .from("plan_uploads")
        .select("id, status, created_at, processing_ms, analysis")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
    ]);

  if (!project) {
    if (error) {
      throw error;
    }
    notFound();
  }

  const normalizedProject = normalizeProjectMetadata(project);
  const schedule = getInspectionSchedule(normalizedProject);
  const savedRecords = await loadInspectionRecords(supabase, project.id);
  const letterRows = (letters ?? []) as LetterRow[];
  const attachmentRows = (attachments ?? []) as AttachmentRow[];
  const planRows = (plans ?? []) as PlanRow[];

  const openRfis = letterRows.filter((letter) => {
    const status = String(letter.status ?? "").toLowerCase();
    return status.includes("open") || status.includes("draft") || status.includes("pending");
  }).length;
  const totalRfiItems = letterRows.reduce(
    (count, letter) => count + (letter.rfi_items?.length ?? 0),
    0,
  );

  const approvedDocuments = attachmentRows.filter(
    (item) => String(item.document_status ?? "").toLowerCase() === "approved",
  ).length;
  const pendingDocuments = attachmentRows.filter((item) => {
    const status = String(item.document_status ?? "").toLowerCase();
    return !status || status === "pending" || status === "missing";
  }).length;

  const analysedPlans = planRows.filter((plan) => plan.status === "analysed");
  const mustResolveFlags = analysedPlans.reduce(
    (count, plan) =>
      count +
      (plan.analysis?.flags?.filter((flag) => flag.severity === "must_resolve").length ?? 0),
    0,
  );

  const workflow: InspectionWorkflowSnapshot = {
    projectAddress: normalizedProject.address ?? project.address ?? null,
    projectStatus: project.status,
    openRfis,
    totalLetters: letterRows.length,
    totalRfiItems,
    approvedDocuments,
    pendingDocuments,
    totalDocuments: attachmentRows.length,
    analysedPlans: analysedPlans.length,
    totalPlans: planRows.length,
    mustResolveFlags,
    averagePlanProcessingSeconds:
      analysedPlans.length > 0
        ? Math.round(
            analysedPlans.reduce((total, plan) => total + (plan.processing_ms ?? 0), 0) /
              analysedPlans.length /
              100,
          ) / 10
        : null,
    latestLetter: letterRows[0]
      ? {
          id: letterRows[0].id,
          status: letterRows[0].status,
          issueDate: letterRows[0].issue_date,
        }
      : null,
    latestAttachment: attachmentRows[0]
      ? {
          uploadedAt: attachmentRows[0].uploaded_at,
          documentType: attachmentRows[0].document_type,
        }
      : null,
    latestPlan: planRows[0]
      ? {
          createdAt: planRows[0].created_at,
          status: planRows[0].status,
        }
      : null,
  };

  return (
    <InspectionsPage
      projectId={project.id}
      schedule={schedule}
      savedRecords={savedRecords}
      workflow={workflow}
    />
  );
}
