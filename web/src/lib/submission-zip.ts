import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { normalizeDocuments } from "@/components/consent-assessment/model";
import { isMissingConsentAssessmentsTableError } from "@/lib/consent-assessment-schema";
import { getSupabaseServer } from "@/lib/supabase/server";

const execFileAsync = promisify(execFile);

interface ConsentAssessmentExportRow {
  project_id: string;
  checklist: {
    required_documents?: Array<{
      document_type: string;
      category: string;
      reason: string;
      triggered_by: string[];
    }>;
  } | null;
  manual_documents: Array<{
    id: string;
    title: string;
    whyRequired: string;
    referenceUrl: string;
    createdAt: string;
  }> | null;
  hidden_document_ids: string[] | null;
  document_order: string[] | null;
  submission_packages: Array<{
    id: string;
    projectId?: string | null;
    title: string;
    createdAt: string;
    submittedAt: string | null;
    status: string | null;
  }> | null;
  document_submission_ids: Record<string, string> | null;
}

interface AttachmentRow {
  id: string;
  filename: string;
  storage_path: string;
  linked_requirement_key?: string | null;
}

interface BuildSubmissionZipOptions {
  submissionId: string;
  routeProjectId?: string | null;
}

export async function buildSubmissionZipResponse({
  submissionId,
  routeProjectId,
}: BuildSubmissionZipOptions) {
  let workDir: string | null = null;

  try {
    const normalizedSubmissionId = submissionId.trim();
    const normalizedRouteProjectId = routeProjectId?.trim() || null;

    console.log("[submission-zip] request", {
      submissionId: normalizedSubmissionId || null,
      routeProjectId: normalizedRouteProjectId,
    });

    if (!normalizedSubmissionId) {
      return Response.json({ error: "Missing submission ID." }, { status: 400 });
    }

    const supabase = await getSupabaseServer();
    const { data: assessmentRows, error: assessmentError } = await supabase
      .from("consent_assessments")
      .select(
        "project_id, checklist, manual_documents, hidden_document_ids, document_order, submission_packages, document_submission_ids",
      );

    if (assessmentError) {
      if (isMissingConsentAssessmentsTableError(assessmentError)) {
        return Response.json(
          {
            error:
              "Consent submission data is unavailable because the consent_assessments table has not been migrated.",
          },
          { status: 503 },
        );
      }
      return Response.json(
        { error: assessmentError.message || "Unable to load submissions." },
        { status: 500 },
      );
    }

    const assessments = (assessmentRows ?? []) as ConsentAssessmentExportRow[];
    const matchingAssessment = assessments.find((row) =>
      (row.submission_packages ?? []).some((item) => item.id === normalizedSubmissionId),
    );

    if (!matchingAssessment) {
      return Response.json({ error: "Submission not found." }, { status: 404 });
    }

    const submissionPackage = (matchingAssessment.submission_packages ?? []).find(
      (item) => item.id === normalizedSubmissionId,
    );
    if (!submissionPackage) {
      return Response.json({ error: "Submission not found." }, { status: 404 });
    }

    const resolvedProjectId =
      submissionPackage.projectId?.trim() || matchingAssessment.project_id;
    if (!resolvedProjectId) {
      return Response.json(
        { error: "Submission is missing its project relationship." },
        { status: 500 },
      );
    }

    if (normalizedRouteProjectId && normalizedRouteProjectId !== resolvedProjectId) {
      console.log("[submission-zip] route project mismatch", {
        submissionId: normalizedSubmissionId,
        routeProjectId: normalizedRouteProjectId,
        resolvedProjectId,
      });
    }

    console.log("[submission-zip] resolved", {
      submissionId: normalizedSubmissionId,
      projectId: resolvedProjectId,
    });

    const documents = normalizeDocuments(
      matchingAssessment.checklist?.required_documents ?? [],
      matchingAssessment.manual_documents ?? [],
      matchingAssessment.hidden_document_ids ?? [],
      matchingAssessment.document_order ?? [],
    );
    const documentIds = documents
      .filter(
        (document) =>
          matchingAssessment.document_submission_ids?.[document.id] === normalizedSubmissionId,
      )
      .map((document) => document.id);

    if (documentIds.length === 0) {
      return Response.json(
        { error: "This submission has no documents assigned." },
        { status: 400 },
      );
    }

    const { data: richAttachments, error: richAttachmentError } = await supabase
      .from("attachments")
      .select("id, filename, storage_path, linked_requirement_key")
      .eq("project_id", resolvedProjectId)
      .eq("linked_requirement_source", "consent_assessment")
      .in("linked_requirement_key", documentIds)
      .order("uploaded_at", { ascending: true });

    const { data: fallbackAttachments, error: fallbackAttachmentError } = richAttachmentError
      ? await supabase
          .from("attachments")
          .select("id, filename, storage_path, linked_requirement_key")
          .eq("project_id", resolvedProjectId)
          .in("linked_requirement_key", documentIds)
          .order("uploaded_at", { ascending: true })
      : { data: null, error: null };

    if (fallbackAttachmentError) {
      return Response.json(
        { error: fallbackAttachmentError.message || "Unable to load submission files." },
        { status: 500 },
      );
    }

    const attachments = (richAttachments ?? fallbackAttachments ?? []) as AttachmentRow[];
    const attachmentsByDocument = new Map<string, AttachmentRow[]>();
    for (const attachment of attachments) {
      const key = attachment.linked_requirement_key;
      if (!key) continue;
      const list = attachmentsByDocument.get(key) ?? [];
      list.push(attachment);
      attachmentsByDocument.set(key, list);
    }

    const documentsWithFiles = documents.filter((document) => {
      const files = attachmentsByDocument.get(document.id) ?? [];
      return (
        matchingAssessment.document_submission_ids?.[document.id] === normalizedSubmissionId &&
        files.length > 0
      );
    });

    if (documentsWithFiles.length === 0) {
      return Response.json(
        { error: "This submission has no uploaded files to download." },
        { status: 400 },
      );
    }

    workDir = await mkdtemp(join(tmpdir(), "submission-package-"));
    const packageDir = join(workDir, "package");
    await mkdir(packageDir, { recursive: true });

    const seenPaths = new Set<string>();
    for (const document of documentsWithFiles) {
      const files = attachmentsByDocument.get(document.id) ?? [];
      for (const file of files) {
        const { data, error: downloadError } = await supabase.storage
          .from("attachments")
          .download(file.storage_path);
        if (!data || downloadError) continue;

        const bytes = Buffer.from(await data.arrayBuffer());
        const folder = join(
          packageDir,
          sanitizePathSegment(document.category),
          sanitizePathSegment(document.title),
        );
        await mkdir(folder, { recursive: true });
        let fileName = sanitizePathSegment(file.filename);
        let relativePath = join(
          sanitizePathSegment(document.category),
          sanitizePathSegment(document.title),
          fileName,
        );
        if (seenPaths.has(relativePath.toLowerCase())) {
          const dot = fileName.lastIndexOf(".");
          const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
          const ext = dot > 0 ? fileName.slice(dot) : "";
          fileName = `${stem}-${Date.now()}${ext}`;
          relativePath = join(
            sanitizePathSegment(document.category),
            sanitizePathSegment(document.title),
            fileName,
          );
        }
        seenPaths.add(relativePath.toLowerCase());
        await writeFile(join(folder, fileName), bytes);
      }
    }

    const zipName = `${sanitizePathSegment(submissionPackage.title || "submission")}.zip`;
    const zipPath = join(workDir, zipName);
    const pythonZipScript = [
      "import os, sys, zipfile",
      "root = sys.argv[1]",
      "outp = sys.argv[2]",
      "with zipfile.ZipFile(outp, 'w', zipfile.ZIP_DEFLATED) as zf:",
      "  for base, _, files in os.walk(root):",
      "    for fn in files:",
      "      fp = os.path.join(base, fn)",
      "      arc = os.path.relpath(fp, root)",
      "      zf.write(fp, arcname=arc)",
    ].join("\n");
    await execFileAsync("python3", ["-c", pythonZipScript, packageDir, zipPath]);

    const zipBuffer = await readFile(zipPath);
    return new Response(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
      },
    });
  } catch (error) {
    return Response.json(
      { error: getErrorMessage(error, "Unable to prepare submission ZIP.") },
      { status: 500 },
    );
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function sanitizePathSegment(value: string) {
  const sanitized = value
    .trim()
    .replace(/[\\/:"*?<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  return sanitized || "file";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [
      typeof maybe.message === "string" ? maybe.message : "",
      typeof maybe.details === "string" ? maybe.details : "",
      typeof maybe.hint === "string" ? maybe.hint : "",
      typeof maybe.code === "string" ? `code=${maybe.code}` : "",
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(" | ");
  }
  return fallback;
}
