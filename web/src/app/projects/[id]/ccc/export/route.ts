import { NextResponse } from "next/server";
import { access, copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

interface RawExportPayload {
  completionDate?: string;
  lbpEntries?: Array<{
    lbpName?: string;
    licensingClass?: string;
    lbpOrRegistrationNumber?: string;
    particularWorkCarriedOutOrSupervised?: string;
  }>;
  otherPersonnelEntries?: Array<{
    name?: string;
    address?: string;
    phoneNumbers?: string;
    relevantLicenceOrRegistrationNumber?: string;
  }>;
  specifiedSystems?: {
    noSpecifiedSystems?: boolean;
    selectedCodes?: string[];
  } | null;
}

interface PythonPayload {
  completionDate: string;
  lbpEntries: Array<{
    name: string;
    licensingClass: string;
    lbpNumber: string;
    particularWork: string;
  }>;
  otherPersonnelEntries: Array<{
    name: string;
    address: string;
    phoneNumber: string;
    registrationNumber: string;
  }>;
  specifiedSystems: {
    noSpecifiedSystems: boolean;
    selected: string[];
  } | null;
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function hasAnyText(values: string[]) {
  return values.some((value) => value.length > 0);
}

async function resolveTemplatePath() {
  const candidates = [
    join(process.cwd(), "src", "templates", "B011ApplicationforCCC.docx"),
    join(process.cwd(), "web", "src", "templates", "B011ApplicationforCCC.docx"),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new Error("B011ApplicationforCCC.docx template not found.");
}

async function resolveScriptPath() {
  const candidates = [
    join(process.cwd(), "scripts", "populate_b011_section4.py"),
    join(process.cwd(), "web", "scripts", "populate_b011_section4.py"),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new Error("populate_b011_section4.py script not found.");
}

function toPythonPayload(raw: RawExportPayload): PythonPayload {
  const lbpEntries = (raw.lbpEntries ?? [])
    .map((entry) => ({
      name: normalizeText(entry.lbpName),
      licensingClass: normalizeText(entry.licensingClass),
      lbpNumber: normalizeText(entry.lbpOrRegistrationNumber),
      particularWork: normalizeText(entry.particularWorkCarriedOutOrSupervised),
    }))
    .filter((entry) => hasAnyText([entry.name, entry.licensingClass, entry.lbpNumber, entry.particularWork]));

  const otherPersonnelEntries = (raw.otherPersonnelEntries ?? [])
    .map((entry) => ({
      name: normalizeText(entry.name),
      address: normalizeText(entry.address),
      phoneNumber: normalizeText(entry.phoneNumbers),
      registrationNumber: normalizeText(entry.relevantLicenceOrRegistrationNumber),
    }))
    .filter((entry) =>
      hasAnyText([entry.name, entry.address, entry.phoneNumber, entry.registrationNumber]),
    );

  const specifiedSystems = raw.specifiedSystems
    ? {
        noSpecifiedSystems: Boolean(raw.specifiedSystems.noSpecifiedSystems),
        selected: Array.isArray(raw.specifiedSystems.selectedCodes)
          ? raw.specifiedSystems.selectedCodes.filter(
              (code): code is string => typeof code === "string" && code.trim().length > 0,
            )
          : [],
      }
    : null;

  return {
    completionDate: normalizeText(raw.completionDate),
    lbpEntries,
    otherPersonnelEntries,
    specifiedSystems,
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RawExportPayload;

  let workDir = "";
  try {
    const templatePath = await resolveTemplatePath();
    const scriptPath = await resolveScriptPath();
    const payload = toPythonPayload(body);

    workDir = await mkdtemp(join(tmpdir(), "b011-export-"));
    const inputPath = join(workDir, "B011ApplicationforCCC.docx");
    const payloadPath = join(workDir, "payload.json");
    const outputPath = join(workDir, "B-011-completed.docx");

    await copyFile(templatePath, inputPath);
    await writeFile(payloadPath, JSON.stringify(payload), "utf8");

    await execFileAsync("python3", [scriptPath, inputPath, payloadPath, outputPath]);

    const outputBuffer = await readFile(outputPath);
    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="B-011-completed.docx"',
      },
    });
  } catch (error) {
    const err =
      typeof error === "object" && error !== null
        ? (error as { message?: unknown; stderr?: unknown })
        : undefined;
    const rawMessage = [err?.message, err?.stderr]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .join("\n")
      .trim();
    const normalizedMessage = rawMessage || "Unable to generate B-011 document.";
    const message = normalizedMessage.includes("No module named 'docx'")
      ? "python-docx is not installed on the server environment. Install it with: pip install python-docx"
      : normalizedMessage;
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
