import { NextResponse } from "next/server";
import archiver from "archiver";
import { PassThrough, Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { normalizeDocuments } from "@/components/consent-assessment/model";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

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
  linked_requirement_key: string | null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; submissionId: string }> },
) {
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

  const { data: attachments, error: attachmentError } = await supabase
    .from("attachments")
    .select("id, filename, storage_path, linked_requirement_key")
    .eq("project_id", projectId)
    .eq("linked_requirement_source", "consent_assessment")
    .in("linked_requirement_key", documentIds)
    .order("uploaded_at", { ascending: true });

  if (attachmentError) {
    return NextResponse.json({ error: attachmentError.message || "Unable to load submission files." }, { status: 500 });
  }

  const attachmentsByDocument = new Map<string, AttachmentRow[]>();
  for (const attachment of (attachments ?? []) as AttachmentRow[]) {
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

  const zipName = `${sanitizePathSegment(submissionPackage.title || "submission")}.zip`;
  const archiveStream = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (archiveError: Error) => archiveStream.destroy(archiveError));
  archive.pipe(archiveStream);

  void (async () => {
    try {
      for (const document of documentsWithFiles) {
        const files = attachmentsByDocument.get(document.id) ?? [];
        for (const file of files) {
          const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from("attachments")
            .createSignedUrl(file.storage_path, 60);
          if (signedUrlError || !signedUrlData?.signedUrl) {
            continue;
          }

          const response = await fetch(signedUrlData.signedUrl);
          if (!response.ok || !response.body) {
            continue;
          }

          archive.append(
            Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
            {
              name: [
                sanitizePathSegment(document.category),
                sanitizePathSegment(document.title),
                sanitizePathSegment(file.filename),
              ].join("/"),
            },
          );
        }
      }

      await archive.finalize();
    } catch (streamError) {
      archiveStream.destroy(streamError instanceof Error ? streamError : new Error(String(streamError)));
    }
  })();

  return new Response(Readable.toWeb(archiveStream) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
    },
  });
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
