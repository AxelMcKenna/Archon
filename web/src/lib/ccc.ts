import type { SupabaseClient } from "@supabase/supabase-js";

type ChecklistStatus = "complete" | "missing";
type ReadinessStatus = "green" | "amber" | "red";
type DeadlineStatus = "ok" | "warning" | "overdue";
type RequirementType = "required" | "if_applicable";

export interface CccInspectionItem {
  name: string;
  status: ChecklistStatus;
  matchedInspection?: string;
}

export interface CccDocumentRequirement {
  key: string;
  label: string;
  requirementType: RequirementType;
  helperText: string;
  validationMessage: string;
  keywords: string[];
  supportsMultiple: boolean;
}

export interface CccDocumentStatus extends CccDocumentRequirement {
  status: ChecklistStatus;
  matchedDocuments: string[];
}

export interface CccViewModel {
  projectId: string;
  consentPromise: string;
  consentGrantDate: string | null;
  consentGrantSource: string;
  requiredInspections: string[];
  inspectionChecklist: CccInspectionItem[];
  uploadedDocumentNames: string[];
  requiredDocumentItems: CccDocumentStatus[];
  conditionalDocumentItems: CccDocumentStatus[];
  readinessStatus: ReadinessStatus;
  blockers: string[];
  completedInspections: number;
  totalInspections: number;
  completedRequiredDocuments: number;
  totalRequiredDocuments: number;
  deadlineDate: string | null;
  deadlineStatus: DeadlineStatus;
  daysUntilDeadline: number | null;
}

const CCC_DOCUMENT_REQUIREMENTS: CccDocumentRequirement[] = [
  {
    key: "rbw_form_6a",
    label: "Record of Building Work (Form 6A)",
    requirementType: "required",
    helperText:
      "Upload one from each LBP trade involved (for example: carpenter, roofer, foundation specialist, bricklayer, external plasterer).",
    validationMessage:
      "Please upload a Record of Building Work (Form 6A) for each Licensed Building Practitioner trade involved.",
    keywords: ["record of building work", "form 6a", "rbw", "lbp"],
    supportsMultiple: true,
  },
  {
    key: "certificate_of_design_work",
    label: "Certificate of Design Work",
    requirementType: "required",
    helperText:
      "Upload one from each Licensed Building Practitioner who carried out or supervised restricted building work design.",
    validationMessage: "Please upload all required Certificates of Design Work.",
    keywords: ["certificate of design work", "design work certificate"],
    supportsMultiple: true,
  },
  {
    key: "ps3_construction_statement",
    label: "PS3 — Construction Statement",
    requirementType: "required",
    helperText: "Upload one from each contractor or installer who completed specialist work.",
    validationMessage: "Please upload all required PS3 — Construction Statement documents.",
    keywords: ["ps3", "construction statement", "producer statement 3", "producer statement ps3"],
    supportsMultiple: true,
  },
  {
    key: "ps4_construction_review",
    label: "PS4 — Construction Review (B-088 form)",
    requirementType: "required",
    helperText: "Upload from the supervising engineer.",
    validationMessage: "Please upload the PS4 — Construction Review (B-088 form).",
    keywords: ["ps4", "construction review", "b-088", "producer statement 4"],
    supportsMultiple: false,
  },
  {
    key: "electrical_coc",
    label: "Electrical Code of Compliance",
    requirementType: "if_applicable",
    helperText:
      "This document is only required if the related work was completed as part of the project.",
    validationMessage: "Please upload the Electrical Code of Compliance.",
    keywords: ["electrical code of compliance", "electrical coc", "electrical certificate"],
    supportsMultiple: true,
  },
  {
    key: "gasfitting_coc",
    label: "Gasfitting Code of Compliance",
    requirementType: "if_applicable",
    helperText:
      "This document is only required if the related work was completed as part of the project.",
    validationMessage: "Please upload the Gasfitting Code of Compliance.",
    keywords: ["gasfitting code of compliance", "gasfitting coc", "gas certificate"],
    supportsMultiple: true,
  },
  {
    key: "potable_water_test",
    label: "Test certificate for potable water",
    requirementType: "if_applicable",
    helperText:
      "This document is only required if the related work was completed as part of the project.",
    validationMessage: "Please upload the test certificate for potable water.",
    keywords: ["potable water", "water test certificate", "water quality"],
    supportsMultiple: true,
  },
  {
    key: "engineer_site_inspection_reports",
    label: "Site inspection reports conducted by an engineer",
    requirementType: "if_applicable",
    helperText: "Required if engineering inspections were part of the consented work.",
    validationMessage: "Please upload site inspection reports conducted by an engineer.",
    keywords: ["site inspection report", "engineer inspection", "engineering inspection"],
    supportsMultiple: true,
  },
  {
    key: "form_b068_specified_systems",
    label: "Form B-068 — Specified Systems Declaration",
    requirementType: "if_applicable",
    helperText:
      "This form is only required if the building includes specified systems (for example: sprinklers, fire alarms, emergency lighting, lifts).",
    validationMessage: "Please upload Form B-068 — Specified Systems Declaration.",
    keywords: ["b-068", "specified systems declaration", "specified systems"],
    supportsMultiple: false,
  },
  {
    key: "form_b065_accessible_facilities",
    label: "Form B-065 — Accessible Facilities Upgrade Report",
    requirementType: "if_applicable",
    helperText:
      "This form is only required if accessible facilities were included or modified as part of the project.",
    validationMessage: "Please upload Form B-065 — Accessible Facilities Upgrade Report.",
    keywords: ["b-065", "accessible facilities upgrade report", "accessible facilities"],
    supportsMultiple: false,
  },
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
  return text
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => includesAny(normalized(line), needles));
}
function findMatches(requirement: CccDocumentRequirement, uploadedItems: string[]) {
  return uploadedItems.filter((item) => {
    const n = normalized(item);
    return requirement.keywords.some((k) => n.includes(k));
  });
}
function findBestMatch(requiredName: string, completedItems: string[]) {
  const required = normalized(requiredName);
  const direct = completedItems.find((item) => normalized(item).includes(required));
  if (direct) return direct;
  return completedItems.find((item) => {
    const n = normalized(item);
    return required.split(/\s+/).some((w) => w.length > 3 && n.includes(w));
  });
}
function extractRequiredInspections(consentText: string) {
  const parsed = extractSentencesContaining(consentText, ["inspection"]).map((line) =>
    line.replace(/^[-•\d.)\s]+/, "").trim(),
  );
  return dedupe(parsed).slice(0, 14);
}
function calculateDeadline(
  consentGrantDate: string | null,
): { deadlineDate: string | null; deadlineStatus: DeadlineStatus; daysUntilDeadline: number | null } {
  if (!consentGrantDate) return { deadlineDate: null, deadlineStatus: "ok", daysUntilDeadline: null };
  const grant = new Date(consentGrantDate);
  if (Number.isNaN(grant.getTime())) return { deadlineDate: null, deadlineStatus: "ok", daysUntilDeadline: null };
  const deadline = new Date(grant);
  deadline.setFullYear(deadline.getFullYear() + 2);
  const daysUntilDeadline = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return {
    deadlineDate: deadline.toISOString().slice(0, 10),
    deadlineStatus: daysUntilDeadline < 0 ? "overdue" : daysUntilDeadline <= 90 ? "warning" : "ok",
    daysUntilDeadline,
  };
}
function extractGrantDate(projectUpdatedAt: string, consentText: string) {
  const match = Array.from(consentText.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)).map((m) => m[1])[0];
  if (match && !Number.isNaN(new Date(match).getTime())) return { date: match, source: "Extracted from consent notes" };
  return { date: projectUpdatedAt.slice(0, 10), source: "Using project last-updated date fallback" };
}

export async function getCccViewModel(supabase: SupabaseClient, projectId: string): Promise<CccViewModel> {
  const { data: project } = await supabase.from("projects").select("id, updated_at").eq("id", projectId).single();
  const [{ data: attachments }, { data: letters }, { data: items }] = await Promise.all([
    supabase.from("attachments").select("filename, uploaded_at").eq("project_id", projectId),
    supabase.from("rfi_letters").select("rendered_markdown, canonical_json").eq("project_id", projectId),
    supabase
      .from("rfi_items")
      .select("raw_text, extracted, rfi_letters!inner(project_id)")
      .eq("rfi_letters.project_id", projectId),
  ]);

  const consentText = [
    ...(letters ?? []).flatMap((l) => [l.rendered_markdown ?? "", JSON.stringify(l.canonical_json ?? "")]),
    ...(items ?? []).flatMap((i) => [i.raw_text ?? "", JSON.stringify(i.extracted ?? "")]),
  ].join("\n");

  const requiredInspections = extractRequiredInspections(consentText);
  const consentPromise =
    extractSentencesContaining(consentText, ["must", "required", "shall", "condition"]).slice(0, 6).join(" ") ||
    "Complete all scheduled inspections and provide all required compliance documentation.";

  const completedInspectionNames = dedupe(
    (items ?? [])
      .flatMap((item) => {
        const text = normalized(item.raw_text ?? "");
        return includesAny(text, ["inspection", "inspected", "sign off", "signed off", "approved"])
          ? [item.raw_text]
          : [];
      })
      .map((line) => line.slice(0, 120)),
  );
  const inspectionChecklist = requiredInspections.map((name) => {
    const match = findBestMatch(name, completedInspectionNames);
    return { name, status: (match ? "complete" : "missing") as ChecklistStatus, matchedInspection: match };
  });

  const uploadedDocumentNames = dedupe((attachments ?? []).map((d) => d.filename));
  const documentStatuses = CCC_DOCUMENT_REQUIREMENTS.map((req) => {
    const matched = findMatches(req, uploadedDocumentNames);
    return { ...req, status: matched.length > 0 ? "complete" : "missing", matchedDocuments: matched } as CccDocumentStatus;
  });
  const requiredDocumentItems = documentStatuses.filter((d) => d.requirementType === "required");
  const conditionalDocumentItems = documentStatuses.filter((d) => d.requirementType === "if_applicable");

  const completedInspections = inspectionChecklist.filter((i) => i.status === "complete").length;
  const completedRequiredDocuments = requiredDocumentItems.filter((d) => d.status === "complete").length;
  const blockers = [
    ...inspectionChecklist.filter((i) => i.status !== "complete").map((i) => `Inspection incomplete: ${i.name}`),
    ...requiredDocumentItems.filter((d) => d.status !== "complete").map((d) => d.validationMessage),
  ];
  const readinessStatus: ReadinessStatus =
    blockers.length === 0 ? "green" : completedInspections === 0 && completedRequiredDocuments === 0 ? "red" : "amber";

  const grantDate = extractGrantDate(project?.updated_at ?? new Date().toISOString(), consentText);
  const { deadlineDate, deadlineStatus, daysUntilDeadline } = calculateDeadline(grantDate.date);

  return {
    projectId,
    consentPromise,
    consentGrantDate: grantDate.date,
    consentGrantSource: grantDate.source,
    requiredInspections,
    inspectionChecklist,
    uploadedDocumentNames,
    requiredDocumentItems,
    conditionalDocumentItems,
    readinessStatus,
    blockers,
    completedInspections,
    totalInspections: inspectionChecklist.length,
    completedRequiredDocuments,
    totalRequiredDocuments: requiredDocumentItems.length,
    deadlineDate,
    deadlineStatus,
    daysUntilDeadline,
  };
}
