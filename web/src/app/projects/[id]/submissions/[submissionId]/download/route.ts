import { NextResponse } from "next/server";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { normalizeDocuments } from "@/components/consent-assessment/model";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

interface ConsentAssessmentExportRow {
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; submissionId: string }> },
) {
  let workDir: string | null = null;
  try {
    const { id: projectId, submissionId } = await context.params;
    if (!isUuid(projectId)) {
      return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
    }
    if (!submissionId.trim()) {
      return NextResponse.json({ error: "submission_id is required." }, { status: 400 });
    }

    const supabase = await getSupabaseServer();
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError) {
      return NextResponse.json(
        { error: projectError.message || "Unable to validate project." },
        { status: 500 },
      );
    }
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const { data: row, error } = await supabase
      .from("consent_assessments")
      .select(
        "checklist, manual_documents, hidden_document_ids, document_order, submission_packages, document_submission_ids",
      )
      .eq("project_id", projectId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message || "Unable to load submission." }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }

    const assessment = row as ConsentAssessmentExportRow;
    const submissionPackage = (assessment.submission_packages ?? []).find((item) => item.id === submissionId);
    if (!submissionPackage) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }

    const documents = normalizeDocuments(
      assessment.checklist?.required_documents ?? [],
      assessment.manual_documents ?? [],
      assessment.hidden_document_ids ?? [],
      assessment.document_order ?? [],
    );
    const documentIds = documents
      .filter((document) => assessment.document_submission_ids?.[document.id] === submissionId)
      .map((document) => document.id);
    if (documentIds.length === 0) {
      return NextResponse.json({ error: "This submission has no documents assigned." }, { status: 400 });
    }

    const { data: richAttachments, error: richAttachmentError } = await supabase
      .from("attachments")
      .select("id, filename, storage_path, linked_requirement_key")
      .eq("project_id", projectId)
      .eq("linked_requirement_source", "consent_assessment")
      .in("linked_requirement_key", documentIds)
      .order("uploaded_at", { ascending: true });
    const { data: fallbackAttachments, error: fallbackAttachmentError } = richAttachmentError
      ? await supabase
          .from("attachments")
          .select("id, filename, storage_path, linked_requirement_key")
          .eq("project_id", projectId)
          .in("linked_requirement_key", documentIds)
          .order("uploaded_at", { ascending: true })
      : { data: null, error: null };
    if (fallbackAttachmentError) {
      return NextResponse.json(
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
      return assessment.document_submission_ids?.[document.id] === submissionId && files.length > 0;
    });
    if (documentsWithFiles.length === 0) {
      return NextResponse.json({ error: "This submission has no uploaded files to download." }, { status: 400 });
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
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Unable to prepare submission ZIP.") },
      { status: 500 },
    );
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
