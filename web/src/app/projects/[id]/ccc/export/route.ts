import { NextResponse } from "next/server";
import { access, copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { normalizeProjectDetails } from "@/lib/project-details";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

interface RawExportPayload {
  projectName?: string;
  completionDate?: string;
  consent?: {
    consentNumber?: string;
  } | null;
  owner?: {
    preferredAddress?: string;
    fullName?: string;
    contactPerson?: string;
    mailingAddress?: string;
    streetAddress?: string;
    landline?: string;
    mobile?: string;
    daytime?: string;
    afterHours?: string;
    fax?: string;
    email?: string;
    website?: string;
    ownershipEvidence?: string;
  } | null;
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
  attachments?: {
    otherDocuments?: boolean;
    lbpMemorandaUploaded?: boolean;
    energyCertificates?: boolean;
    specifiedSystemsEvidence?: boolean;
    manufacturersCertificate?: boolean;
  } | null;
}

interface PythonPayload {
  completionDate: string;
  consent: {
    consentNumber: string;
  } | null;
  owner: {
    preferredAddress: "" | "Mr" | "Mrs" | "Ms" | "Miss" | "Dr";
    fullName: string;
    contactPerson: string;
    mailingAddress: string;
    streetAddress: string;
    landline: string;
    mobile: string;
    daytime: string;
    afterHours: string;
    fax: string;
    email: string;
    website: string;
    ownershipEvidence:
      | ""
      | "Certificate of title"
      | "Lease"
      | "Agreement for sale and purchase"
      | "Other document";
  } | null;
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
  attachments: {
    otherDocuments: boolean;
    lbpMemorandaUploaded: boolean;
    energyCertificates: boolean;
    specifiedSystemsEvidence: boolean;
    manufacturersCertificate: boolean;
  } | null;
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function sanitizeFilenamePart(value: string) {
  const cleaned = value
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 80) || "project";
}

function hasAnyText(values: string[]) {
  return values.some((value) => value.length > 0);
}

function startsWithIgnoreCase(value: string, prefix: string) {
  return value.toLowerCase().startsWith(prefix.toLowerCase());
}

function buildOwnerName(preferredFormOfAddress: string, fullName: string) {
  if (!preferredFormOfAddress) return fullName;
  if (!fullName) return "";
  const fullNameLower = fullName.toLowerCase();
  const honorificLower = `${preferredFormOfAddress.toLowerCase()} `;
  if (fullNameLower.startsWith(honorificLower)) {
    return fullName;
  }
  return `${preferredFormOfAddress} ${fullName}`.trim();
}

function normalizePreferredAddress(value: unknown): "" | "Mr" | "Mrs" | "Ms" | "Miss" | "Dr" {
  const text = normalizeText(value);
  if (text === "Mr" || text === "Mrs" || text === "Ms" || text === "Miss" || text === "Dr") {
    return text;
  }
  return "";
}

function normalizeOwnershipEvidence(
  value: unknown,
): "" | "Certificate of title" | "Lease" | "Agreement for sale and purchase" | "Other document" {
  const text = normalizeText(value);
  if (
    text === "Certificate of title" ||
    text === "Lease" ||
    text === "Agreement for sale and purchase" ||
    text === "Other document"
  ) {
    return text;
  }
  return "";
}

function normalizeSettingsSnapshot(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const settings =
    record.settings && typeof record.settings === "object"
      ? (record.settings as Record<string, unknown>)
      : record;
  return {
    buildingConsentNumbers: String(settings.buildingConsentNumbers ?? ""),
    ownerPreferredFormOfAddress: String(settings.ownerPreferredFormOfAddress ?? ""),
    ownerFullName: String(settings.ownerFullName ?? ""),
    ownerContactPersonFullName: String(settings.ownerContactPersonFullName ?? ""),
    ownerMailingAddress: String(settings.ownerMailingAddress ?? ""),
    ownerStreetAddressDifferent: Boolean(settings.ownerStreetAddressDifferent),
    ownerStreetAddress: String(settings.ownerStreetAddress ?? ""),
    ownerPhoneLandline: String(settings.ownerPhoneLandline ?? ""),
    ownerPhoneMobile: String(settings.ownerPhoneMobile ?? ""),
    ownerPhoneDaytime: String(settings.ownerPhoneDaytime ?? ""),
    ownerPhoneAfterHours: String(settings.ownerPhoneAfterHours ?? ""),
    ownerPhoneFax: String(settings.ownerPhoneFax ?? ""),
    ownerEmailAddress: String(settings.ownerEmailAddress ?? ""),
    ownerWebsiteUrl: String(settings.ownerWebsiteUrl ?? ""),
    ownerEvidenceOfOwnershipType: String(settings.ownerEvidenceOfOwnershipType ?? ""),
  };
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

  const attachments = raw.attachments
    ? {
        otherDocuments: Boolean(raw.attachments.otherDocuments),
        lbpMemorandaUploaded: Boolean(raw.attachments.lbpMemorandaUploaded),
        energyCertificates: Boolean(raw.attachments.energyCertificates),
        specifiedSystemsEvidence: Boolean(raw.attachments.specifiedSystemsEvidence),
        manufacturersCertificate: Boolean(raw.attachments.manufacturersCertificate),
      }
    : null;

  const consent = raw.consent
    ? {
        consentNumber: normalizeText(raw.consent.consentNumber),
      }
    : null;

  const owner = raw.owner
    ? {
        preferredAddress: normalizePreferredAddress(raw.owner.preferredAddress),
        fullName: normalizeText(raw.owner.fullName),
        contactPerson: normalizeText(raw.owner.contactPerson),
        mailingAddress: normalizeText(raw.owner.mailingAddress),
        streetAddress: normalizeText(raw.owner.streetAddress),
        landline: normalizeText(raw.owner.landline),
        mobile: normalizeText(raw.owner.mobile),
        daytime: normalizeText(raw.owner.daytime),
        afterHours: normalizeText(raw.owner.afterHours),
        fax: normalizeText(raw.owner.fax),
        email: normalizeText(raw.owner.email),
        website: normalizeText(raw.owner.website),
        ownershipEvidence: normalizeOwnershipEvidence(raw.owner.ownershipEvidence),
      }
    : null;

  return {
    completionDate: normalizeText(raw.completionDate),
    consent,
    owner,
    lbpEntries,
    otherPersonnelEntries,
    specifiedSystems,
    attachments,
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as RawExportPayload;

  let workDir = "";
  try {
    const templatePath = await resolveTemplatePath();
    const scriptPath = await resolveScriptPath();
    const payload = toPythonPayload(body);

    const supabase = await getSupabaseServer();
    const { data: projectDataWithDetails, error: projectDataError } = await supabase
      .from("projects")
      .select("project_type, project_details")
      .eq("id", id)
      .single();
    const { data: projectDataWithoutDetails } =
      projectDataError && (projectDataError as { code?: string }).code === "42703"
        ? await supabase
            .from("projects")
            .select("project_type")
            .eq("id", id)
            .single()
        : { data: null };
    const projectData = projectDataWithDetails ?? projectDataWithoutDetails;

    if (projectData) {
      const projectDetailsRaw =
        "project_details" in projectData ? projectData.project_details : null;
      const projectDetails = normalizeProjectDetails(
        projectDetailsRaw,
        projectData.project_type,
      );
      if (!payload.consent || !payload.consent.consentNumber) {
        payload.consent = {
          consentNumber: normalizeText(projectDetails.buildingConsentNumbers ?? ""),
        };
      }
      if (!payload.owner) {
        payload.owner = {
          preferredAddress: normalizePreferredAddress(projectDetails.ownerPreferredFormOfAddress),
          fullName: normalizeText(projectDetails.ownerFullName),
          contactPerson: normalizeText(projectDetails.ownerContactPersonFullName),
          mailingAddress: normalizeText(projectDetails.ownerMailingAddress),
          streetAddress: Boolean(projectDetails.ownerStreetAddressDifferent)
            ? normalizeText(projectDetails.ownerStreetAddress)
            : "",
          landline: normalizeText(projectDetails.ownerPhoneLandline),
          mobile: normalizeText(projectDetails.ownerPhoneMobile),
          daytime: normalizeText(projectDetails.ownerPhoneDaytime),
          afterHours: normalizeText(projectDetails.ownerPhoneAfterHours),
          fax: normalizeText(projectDetails.ownerPhoneFax),
          email: normalizeText(projectDetails.ownerEmailAddress),
          website: normalizeText(projectDetails.ownerWebsiteUrl),
          ownershipEvidence: normalizeOwnershipEvidence(projectDetails.ownerEvidenceOfOwnershipType),
        };
      }
    }
    if (!payload.owner || !payload.owner.fullName || !payload.consent?.consentNumber) {
      const { data: snapshotRows } = await supabase
        .from("audit_log")
        .select("metadata")
        .eq("project_id", id)
        .eq("action", "project_settings_snapshot")
        .order("created_at", { ascending: false })
        .limit(1);
      const snapshot = normalizeSettingsSnapshot(snapshotRows?.[0]?.metadata);
      if (snapshot) {
        if (!payload.consent || !payload.consent.consentNumber) {
          payload.consent = {
            consentNumber: normalizeText(snapshot.buildingConsentNumbers),
          };
        }
        if (!payload.owner || !payload.owner.fullName) {
          payload.owner = {
            preferredAddress: normalizePreferredAddress(snapshot.ownerPreferredFormOfAddress),
            fullName: normalizeText(snapshot.ownerFullName),
            contactPerson: normalizeText(snapshot.ownerContactPersonFullName),
            mailingAddress: normalizeText(snapshot.ownerMailingAddress),
            streetAddress: snapshot.ownerStreetAddressDifferent
              ? normalizeText(snapshot.ownerStreetAddress)
              : "",
            landline: normalizeText(snapshot.ownerPhoneLandline),
            mobile: normalizeText(snapshot.ownerPhoneMobile),
            daytime: normalizeText(snapshot.ownerPhoneDaytime),
            afterHours: normalizeText(snapshot.ownerPhoneAfterHours),
            fax: normalizeText(snapshot.ownerPhoneFax),
            email: normalizeText(snapshot.ownerEmailAddress),
            website: normalizeText(snapshot.ownerWebsiteUrl),
            ownershipEvidence: normalizeOwnershipEvidence(snapshot.ownerEvidenceOfOwnershipType),
          };
        }
      }
    }
    if (payload.owner) {
      payload.owner = {
        ...payload.owner,
        fullName: buildOwnerName(payload.owner.preferredAddress, payload.owner.fullName),
      };
    }

    const { data: richAttachments, error: richAttachmentsError } = await supabase
      .from("attachments")
      .select("filename, linked_requirement_key")
      .eq("project_id", id);
    const { data: basicAttachments } = richAttachmentsError
      ? await supabase
          .from("attachments")
          .select("filename")
          .eq("project_id", id)
      : { data: null };
    const attachmentRows = (richAttachments ?? basicAttachments ?? []) as Array<{
      filename?: string | null;
      linked_requirement_key?: string | null;
    }>;
    const hasOwnerEvidenceAttachment = attachmentRows.some((item) => {
      const filename = normalizeText(item.filename ?? "");
      if (item.linked_requirement_key === "owner_evidence") return true;
      return startsWithIgnoreCase(filename, "Ownership evidence - ");
    });
    if (hasOwnerEvidenceAttachment) {
      payload.attachments = {
        otherDocuments: true,
        lbpMemorandaUploaded: Boolean(payload.attachments?.lbpMemorandaUploaded),
        energyCertificates: Boolean(payload.attachments?.energyCertificates),
        specifiedSystemsEvidence: Boolean(payload.attachments?.specifiedSystemsEvidence),
        manufacturersCertificate: false,
      };
    }

    workDir = await mkdtemp(join(tmpdir(), "b011-export-"));
    const inputPath = join(workDir, "B011ApplicationforCCC.docx");
    const payloadPath = join(workDir, "payload.json");
    const outputPath = join(workDir, "B-011-completed.docx");
    const baseName = sanitizeFilenamePart(normalizeText(body.projectName) || id);
    const downloadFilename = `B-011-${baseName}.docx`;

    await copyFile(templatePath, inputPath);
    await writeFile(payloadPath, JSON.stringify(payload), "utf8");

    await execFileAsync("python3", [scriptPath, inputPath, payloadPath, outputPath]);

    const outputBuffer = await readFile(outputPath);
    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${downloadFilename}"`,
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
