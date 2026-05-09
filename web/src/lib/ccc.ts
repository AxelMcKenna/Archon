import type { SupabaseClient } from "@supabase/supabase-js";

type ChecklistStatus = "complete" | "pending" | "missing";
type ReadinessStatus = "green" | "amber" | "red";
type DeadlineStatus = "ok" | "warning" | "overdue";

export interface CccInspectionItem {
  name: string;
  status: ChecklistStatus;
  matchedInspection?: string;
}

export interface CccDocumentItem {
  label: string;
  status: ChecklistStatus;
  matchedDocument?: string;
}

export interface CccViewModel {
  projectId: string;
  consentPromise: string;
  consentGrantDate: string | null;
  consentGrantSource: string;
  requiredInspections: string[];
  requiredDocuments: string[];
  inspectionChecklist: CccInspectionItem[];
  documentChecklist: CccDocumentItem[];
  readinessStatus: ReadinessStatus;
  blockers: string[];
  completedInspections: number;
  totalInspections: number;
  completedDocuments: number;
  totalDocuments: number;
  deadlineDate: string | null;
  deadlineStatus: DeadlineStatus;
  daysUntilDeadline: number | null;
}

const DEFAULT_REQUIRED_DOCS = [
  "LBP Record of Building Work",
  "Producer Statement",
  "Electrical Certificate",
  "Plumbing Certificate",
];

const KEYWORD_DOC_MAP: Array<{ label: string; keywords: string[] }> = [
  { label: "LBP Record of Building Work", keywords: ["lbp", "record of building work", "rbw"] },
  { label: "Producer Statement", keywords: ["producer statement", "ps1", "ps2", "ps3", "ps4"] },
  { label: "Electrical Certificate", keywords: ["electrical certificate", "electrical coc", "esc"] },
  { label: "Plumbing Certificate", keywords: ["plumbing certificate", "drainage certificate", "gas certificate"] },
];

function includesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function normalized(value: string) {
  return value.toLowerCase();
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function extractSentencesContaining(text: string, needles: string[]): string[] {
  const parts = text
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return parts.filter((line) => includesAny(normalized(line), needles));
}

function extractRequiredInspections(consentText: string) {
  const lines = extractSentencesContaining(consentText, ["inspection"]);
  const parsed = lines.map((line) => line.replace(/^[-•\d.)\s]+/, "").trim());
  return dedupe(parsed).slice(0, 14);
}

function extractRequiredDocuments(consentText: string) {
  const lines = extractSentencesContaining(consentText, [
    "certificate",
    "producer statement",
    "lbp",
    "record of building work",
    "rbw",
    "consent condition",
  ]);
  const fromKeywords = KEYWORD_DOC_MAP
    .filter((item) => includesAny(normalized(consentText), item.keywords))
    .map((item) => item.label);
  return dedupe([...DEFAULT_REQUIRED_DOCS, ...fromKeywords, ...lines]).slice(0, 18);
}

function findBestMatch(requiredName: string, completedItems: string[]) {
  const required = normalized(requiredName);
  const direct = completedItems.find((item) => normalized(item).includes(required));
  if (direct) return direct;
  const loose = completedItems.find((item) => {
    const itemNormalized = normalized(item);
    return required.split(/\s+/).some((word) => word.length > 3 && itemNormalized.includes(word));
  });
  return loose;
}

function calculateDeadline(
  consentGrantDate: string | null,
): { deadlineDate: string | null; deadlineStatus: DeadlineStatus; daysUntilDeadline: number | null } {
  if (!consentGrantDate) return { deadlineDate: null, deadlineStatus: "ok" as const, daysUntilDeadline: null };
  const grant = new Date(consentGrantDate);
  if (Number.isNaN(grant.getTime())) return { deadlineDate: null, deadlineStatus: "ok" as const, daysUntilDeadline: null };

  const deadline = new Date(grant);
  deadline.setFullYear(deadline.getFullYear() + 2);

  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntilDeadline = Math.ceil((deadline.getTime() - now.getTime()) / msPerDay);
  const deadlineStatus: DeadlineStatus =
    daysUntilDeadline < 0 ? "overdue" : daysUntilDeadline <= 90 ? "warning" : "ok";
  return {
    deadlineDate: deadline.toISOString().slice(0, 10),
    deadlineStatus,
    daysUntilDeadline,
  };
}

function extractGrantDate(projectUpdatedAt: string, consentText: string) {
  const dateRegex = /\b(20\d{2}-\d{2}-\d{2})\b/g;
  const found = Array.from(consentText.matchAll(dateRegex)).map((m) => m[1]);
  const candidate = found.find((iso) => !Number.isNaN(new Date(iso).getTime()));
  if (candidate) return { date: candidate, source: "Extracted from consent notes" };
  return { date: projectUpdatedAt.slice(0, 10), source: "Using project last-updated date fallback" };
}

export async function getCccViewModel(supabase: SupabaseClient, projectId: string): Promise<CccViewModel> {
  const { data: project } = await supabase
    .from("projects")
    .select("id, updated_at")
    .eq("id", projectId)
    .single();

  const [{ data: attachments }, { data: letters }, { data: items }] = await Promise.all([
    supabase
      .from("attachments")
      .select("filename, uploaded_at")
      .eq("project_id", projectId)
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("rfi_letters")
      .select("issue_date, rendered_markdown, canonical_json")
      .eq("project_id", projectId)
      .order("issue_date", { ascending: false }),
    supabase
      .from("rfi_items")
      .select("raw_text, extracted, rfi_letters!inner(project_id)")
      .eq("rfi_letters.project_id", projectId),
  ]);

  const consentTextBlocks: string[] = [];
  for (const letter of letters ?? []) {
    if (typeof letter.rendered_markdown === "string") consentTextBlocks.push(letter.rendered_markdown);
    if (letter.canonical_json) consentTextBlocks.push(JSON.stringify(letter.canonical_json));
  }
  for (const item of items ?? []) {
    if (item.raw_text) consentTextBlocks.push(item.raw_text);
    if (item.extracted) consentTextBlocks.push(JSON.stringify(item.extracted));
  }

  const consentText = consentTextBlocks.join("\n");
  const requiredInspections = extractRequiredInspections(consentText);
  const requiredDocuments = extractRequiredDocuments(consentText);
  const consentPromise =
    extractSentencesContaining(consentText, ["must", "required", "shall", "condition"])
      .slice(0, 6)
      .join(" ") || "Complete all scheduled inspections and provide all required compliance documentation.";

  const completedInspectionNames = dedupe(
    (items ?? [])
      .flatMap((item) => {
        const text = normalized(item.raw_text ?? "");
        if (!includesAny(text, ["inspection", "inspected", "sign off", "signed off", "approved"])) return [];
        return [item.raw_text];
      })
      .map((line) => line.slice(0, 120)),
  );

  const inspectionChecklist = requiredInspections.map((name) => {
    const match = findBestMatch(name, completedInspectionNames);
    return {
      name,
      status: match ? "complete" : "missing",
      matchedInspection: match,
    } as CccInspectionItem;
  });

  const uploadedDocumentNames = dedupe((attachments ?? []).map((doc) => doc.filename));
  const documentChecklist = requiredDocuments.map((label) => {
    const match = findBestMatch(label, uploadedDocumentNames);
    return {
      label,
      status: match ? "complete" : "missing",
      matchedDocument: match,
    } as CccDocumentItem;
  });

  const completedInspections = inspectionChecklist.filter((i) => i.status === "complete").length;
  const completedDocuments = documentChecklist.filter((d) => d.status === "complete").length;

  const blockers = [
    ...inspectionChecklist
      .filter((i) => i.status !== "complete")
      .map((i) => `Inspection incomplete: ${i.name}`),
    ...documentChecklist
      .filter((d) => d.status !== "complete")
      .map((d) => `${d.label} — not uploaded`),
  ];

  const readinessStatus: ReadinessStatus =
    blockers.length === 0 ? "green" : completedInspections === 0 && completedDocuments === 0 ? "red" : "amber";

  const grantDate = extractGrantDate(project?.updated_at ?? new Date().toISOString(), consentText);
  const { deadlineDate, deadlineStatus, daysUntilDeadline } = calculateDeadline(grantDate.date);

  return {
    projectId,
    consentPromise,
    consentGrantDate: grantDate.date,
    consentGrantSource: grantDate.source,
    requiredInspections,
    requiredDocuments,
    inspectionChecklist,
    documentChecklist,
    readinessStatus,
    blockers,
    completedInspections,
    totalInspections: inspectionChecklist.length,
    completedDocuments,
    totalDocuments: documentChecklist.length,
    deadlineDate,
    deadlineStatus,
    daysUntilDeadline,
  };
}
