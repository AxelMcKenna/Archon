import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { POST as exportB011Post } from "../export/route";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

const SECTION2_PREFIXES = [
  "LBP Memoranda / Record of Building Work - ",
  "PS3 — Construction Statement - ",
  "PS4 — Construction Review - ",
  "Electrical Code of Compliance - ",
  "Gasfitting Code of Compliance - ",
  "Test certificate for potable water - ",
  "Site inspection reports conducted by an engineer - ",
  "Form B-065 — Accessible Facilities Upgrade Report - ",
];

function sanitizeFilenamePart(value: string) {
  const cleaned = value
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 100) || "file";
}

function getFilenameFromDisposition(contentDisposition: string | null) {
  if (!contentDisposition) return null;
  const match = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
  return match?.[1] ?? null;
}

function belongsToSection2Attachment(row: {
  filename?: string | null;
  linked_requirement_key?: string | null;
  linked_requirement_source?: string | null;
}) {
  if (!row.filename) return false;
  if (
    row.linked_requirement_source === "ccc" &&
    row.linked_requirement_key !== "2" &&
    row.linked_requirement_key !== "9"
  ) {
    return true;
  }
  return SECTION2_PREFIXES.some((prefix) => row.filename?.startsWith(prefix));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
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
  return "Unable to generate CCC package zip.";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let workDir: string | null = null;
  try {
    const { id } = await params;
    const body = await request.json();

    const exportRequest = new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const b011Response = await exportB011Post(exportRequest, {
      params: Promise.resolve({ id }),
    });
    if (!b011Response.ok) {
      const raw = await b011Response.text();
      return NextResponse.json(
        { error: raw || "Unable to generate B-011 document." },
        { status: b011Response.status || 500 },
      );
    }

    const b011Buffer = Buffer.from(await b011Response.arrayBuffer());
    const b011Filename =
      getFilenameFromDisposition(b011Response.headers.get("Content-Disposition")) ??
      `B-011-${sanitizeFilenamePart(id)}.docx`;

    const supabase = await getSupabaseServer();
    const { data: richAttachments, error: richAttachmentsError } = await supabase
      .from("attachments")
      .select("filename,storage_path,linked_requirement_key,linked_requirement_source")
      .eq("project_id", id)
      .order("uploaded_at", { ascending: true });
    const { data: basicAttachments, error: basicAttachmentsError } = richAttachmentsError
      ? await supabase
          .from("attachments")
          .select("filename,storage_path,linked_requirement_key")
          .eq("project_id", id)
          .order("uploaded_at", { ascending: true })
      : { data: null, error: null };
    const { data: minimalAttachments, error: minimalAttachmentsError } = basicAttachmentsError
      ? await supabase
          .from("attachments")
          .select("filename,storage_path")
          .eq("project_id", id)
          .order("uploaded_at", { ascending: true })
      : { data: null, error: null };
    if (minimalAttachmentsError) throw new Error(getErrorMessage(minimalAttachmentsError));

    const attachmentRows = (richAttachments ?? basicAttachments ?? minimalAttachments ?? []) as Array<{
      filename?: string | null;
      storage_path?: string | null;
      linked_requirement_key?: string | null;
      linked_requirement_source?: string | null;
    }>;
    const section2Attachments = attachmentRows.filter((row) =>
      belongsToSection2Attachment(row),
    );

    workDir = await mkdtemp(join(tmpdir(), "ccc-package-"));
    const packageDir = join(workDir, "package");
    await mkdir(packageDir, { recursive: true });

    const seenNames = new Set<string>();
    const b011SafeName = sanitizeFilenamePart(b011Filename.replace(/\s+/g, "-"));
    const b011Path = join(packageDir, b011SafeName);
    await writeFile(b011Path, b011Buffer);
    seenNames.add(b011SafeName.toLowerCase());

    for (const attachment of section2Attachments) {
      if (!attachment.storage_path || !attachment.filename) continue;
      const { data, error } = await supabase.storage
        .from("attachments")
        .download(attachment.storage_path);
      if (error || !data) {
        throw new Error(getErrorMessage(error));
      }

      const bytes = Buffer.from(await data.arrayBuffer());
      let safeName = sanitizeFilenamePart(attachment.filename);
      const lower = safeName.toLowerCase();
      if (seenNames.has(lower)) {
        const dot = safeName.lastIndexOf(".");
        const base = dot > 0 ? safeName.slice(0, dot) : safeName;
        const ext = dot > 0 ? safeName.slice(dot) : "";
        safeName = `${base}-${Date.now()}${ext}`;
      }
      seenNames.add(safeName.toLowerCase());
      await writeFile(join(packageDir, safeName), bytes);
    }

    const zipPath = join(workDir, `CCC-Package-${sanitizeFilenamePart(id)}.zip`);
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
    await access(zipPath);

    const zipBuffer = await readFile(zipPath);
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="CCC-Package-${sanitizeFilenamePart(id)}.zip"`,
      },
    });
  } catch (error) {
    const message = getErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
