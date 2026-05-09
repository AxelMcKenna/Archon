export interface Coordinates {
  nztm_x: number;
  nztm_y: number;
  lat: number;
  lon: number;
}

export interface ZoneInfo {
  zone_code: string;
  zone_type: string;
  source_council: string;
}

export interface RequiredDocument {
  document_type: string;
  category: string;
  reason: string;
  triggered_by: string[];
}

export interface ChecklistResult {
  address: string;
  coordinates: Coordinates;
  zone_info: ZoneInfo;
  overlays: Record<string, boolean>;
  required_documents: RequiredDocument[];
}

export interface UploadRecord {
  fileName: string;
  fileSize: number;
  uploadedAt: string;
}

export interface CompletionRecord {
  completedAt: string;
}

export interface ManualConsentDocumentInput {
  title: string;
  whyRequired: string;
  referenceUrl?: string;
  completed: boolean;
}

export interface StoredManualConsentDocument {
  id: string;
  title: string;
  whyRequired: string;
  referenceUrl: string;
  createdAt: string;
}

export interface ConsentDocument extends RequiredDocument {
  id: string;
  title: string;
  description: string;
  whyRequired: string;
  referenceUrl: string;
  source: "generated" | "manual";
  createdAt?: string;
}

const DEFAULT_REFERENCE_URL =
  "https://www.building.govt.nz/projects-and-consents/apply-for-building-consent";
const FORM2_TEMPLATE_URL = `${
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
}/api/templates/form2`;

const DOCUMENT_LIBRARY: Record<
  string,
  {
    description: string;
    referenceUrl: string;
  }
> = {
  "site-plan": {
    description:
      "The Site Plan shows the proposed building location, legal boundaries, setbacks, accessways, and key site features that affect the consent review.",
    referenceUrl: DEFAULT_REFERENCE_URL,
  },
  "stormwater-plan": {
    description:
      "The Stormwater Plan sets out how runoff will be collected, managed, and discharged so the council can assess drainage performance and downstream effects.",
    referenceUrl:
      "https://ccc.govt.nz/consents-and-licences/property-information-and-lims/drainage-plans-for-your-property",
  },
  "producer-statement": {
    description:
      "A Producer Statement records a chartered professional opinion or design assurance for specialist work supporting the consent application.",
    referenceUrl:
      "https://www.building.govt.nz/projects-and-consents/apply-for-building-consent/support-your-consent-application/producer-statements",
  },
  "drainage-plan": {
    description:
      "The Drainage Plan maps foul water and stormwater infrastructure, connection points, gradients, and servicing details required for council review.",
    referenceUrl:
      "https://ccc.govt.nz/consents-and-licences/property-information-and-lims/drainage-plans-for-your-property",
  },
  "floor-plan": {
    description:
      "Floor Plans show the layout, dimensions, room use, and circulation of the proposed building work for code and consent review.",
    referenceUrl: DEFAULT_REFERENCE_URL,
  },
  elevations: {
    description:
      "Elevations show the external appearance, heights, and relationship of the proposed work to natural ground and surrounding context.",
    referenceUrl: DEFAULT_REFERENCE_URL,
  },
  "structural-engineering": {
    description:
      "Structural engineering documents set out framing, foundations, bracing, and engineering design information needed to assess compliance.",
    referenceUrl:
      "https://www.building.govt.nz/projects-and-consents/apply-for-building-consent/support-your-consent-application/producer-statements",
  },
  "geotechnical-report": {
    description:
      "A geotechnical report explains site ground conditions and informs foundation design, earthworks constraints, and hazard-related consent decisions.",
    referenceUrl:
      "https://www.building.govt.nz/projects-and-consents/planning-a-successful-build/scope-and-design/natural-hazard-sections-of-the-building-act",
  },
  specifications: {
    description:
      "Specifications define materials, assemblies, workmanship, and product requirements that support the consent documentation set.",
    referenceUrl: DEFAULT_REFERENCE_URL,
  },
  "building-consent-application": {
    description:
      "The building consent application form captures the statutory project and ownership details that accompany the supporting plans and specifications.",
    referenceUrl:
      "https://ccc.govt.nz/consents-and-licences/building-consents/building-consent-forms-guides-fees/building-consent-forms-and-guides",
  },
  "form-2-building-consent-application": {
    description:
      "Form 2 is the standard NZ building consent application form. Download, complete, and upload it back to this project.",
    referenceUrl: FORM2_TEMPLATE_URL,
  },
  "plans-and-specifications": {
    description:
      "Plans and specifications package the drawings, notes, and product information the council relies on when assessing compliance.",
    referenceUrl: DEFAULT_REFERENCE_URL,
  },
};

export function slugifyDocument(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeDocuments(
  generatedDocuments: RequiredDocument[],
  manualDocuments: StoredManualConsentDocument[],
  hiddenDocumentIds: string[],
  documentOrder: string[],
): ConsentDocument[] {
  const merged = new Map<string, ConsentDocument>();

  for (const document of generatedDocuments) {
    const title = document.document_type.trim();
    const id = slugifyDocument(title);
    const libraryEntry = getDocumentLibraryEntry(id, title);
    const description = libraryEntry?.description ?? buildFallbackDescription(title);
    const existing = merged.get(id);

    if (existing) {
      existing.triggered_by = Array.from(new Set([...existing.triggered_by, ...document.triggered_by]));
      existing.reason = mergeSentences(existing.reason, document.reason);
      existing.whyRequired = existing.reason;
      if (!existing.category && document.category) {
        existing.category = document.category;
      }
      continue;
    }

    merged.set(id, {
      ...document,
      id,
      title,
      description,
      whyRequired: document.reason,
      referenceUrl: libraryEntry?.referenceUrl ?? DEFAULT_REFERENCE_URL,
      source: "generated",
    });
  }

  for (const document of manualDocuments) {
    merged.set(document.id, {
      id: document.id,
      title: document.title,
      description: buildFallbackDescription(document.title),
      whyRequired: document.whyRequired,
      referenceUrl: document.referenceUrl || DEFAULT_REFERENCE_URL,
      source: "manual",
      createdAt: document.createdAt,
      document_type: document.title,
      category: "Additional requirement",
      reason: document.whyRequired,
      triggered_by: ["Manually added"],
    });
  }

  const visibleDocuments = Array.from(merged.values()).filter(
    (document) => !hiddenDocumentIds.includes(document.id),
  );

  return applyDocumentOrder(visibleDocuments, documentOrder);
}

export function createManualDocumentRecord(
  input: ManualConsentDocumentInput,
): StoredManualConsentDocument {
  return {
    id: `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title.trim(),
    whyRequired: input.whyRequired.trim(),
    referenceUrl: input.referenceUrl?.trim() || DEFAULT_REFERENCE_URL,
    createdAt: new Date().toISOString(),
  };
}

export function getCompletionStats(
  documents: ConsentDocument[],
  completions: Record<string, CompletionRecord>,
) {
  const completed = documents.filter((document) => completions[document.id]).length;
  const total = documents.length;
  const remaining = documents.filter((document) => !completions[document.id]);
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return { completed, total, remaining, percent };
}

export function isManualDocument(document: ConsentDocument | undefined | null) {
  return document?.source === "manual";
}

export function getOrderedDocumentIds(documents: ConsentDocument[]) {
  return documents.map((document) => document.id);
}

function applyDocumentOrder(documents: ConsentDocument[], documentOrder: string[]) {
  const orderIndex = new Map(documentOrder.map((id, index) => [id, index]));

  return [...documents].sort((left, right) => {
    const leftIndex = orderIndex.get(left.id);
    const rightIndex = orderIndex.get(right.id);

    if (leftIndex !== undefined && rightIndex !== undefined) {
      return leftIndex - rightIndex;
    }
    if (leftIndex !== undefined) {
      return -1;
    }
    if (rightIndex !== undefined) {
      return 1;
    }

    return left.title.localeCompare(right.title);
  });
}

function getDocumentLibraryEntry(id: string, title: string) {
  if (DOCUMENT_LIBRARY[id]) {
    return DOCUMENT_LIBRARY[id];
  }

  const normalizedTitle = title.toLowerCase();

  if (normalizedTitle.includes("producer statement")) return DOCUMENT_LIBRARY["producer-statement"];
  if (normalizedTitle.includes("stormwater")) return DOCUMENT_LIBRARY["stormwater-plan"];
  if (normalizedTitle.includes("drainage")) return DOCUMENT_LIBRARY["drainage-plan"];
  if (normalizedTitle.includes("site plan")) return DOCUMENT_LIBRARY["site-plan"];
  if (normalizedTitle.includes("floor plan")) return DOCUMENT_LIBRARY["floor-plan"];
  if (normalizedTitle.includes("elevation")) return DOCUMENT_LIBRARY.elevations;
  if (normalizedTitle.includes("geotechnical")) return DOCUMENT_LIBRARY["geotechnical-report"];
  if (normalizedTitle.includes("structural")) return DOCUMENT_LIBRARY["structural-engineering"];
  if (normalizedTitle.includes("specification")) return DOCUMENT_LIBRARY.specifications;
  if (normalizedTitle.includes("form 2") || normalizedTitle.includes("application")) {
    return DOCUMENT_LIBRARY["building-consent-application"];
  }
  if (normalizedTitle.includes("plans") && normalizedTitle.includes("specifications")) {
    return DOCUMENT_LIBRARY["plans-and-specifications"];
  }

  return null;
}

function mergeSentences(current: string, incoming: string) {
  if (!incoming || current.includes(incoming)) {
    return current;
  }
  return `${current} ${incoming}`.trim();
}

function buildFallbackDescription(title: string) {
  const lowerTitle = title.toLowerCase();

  if (lowerTitle.includes("plan")) {
    return `${title} sets out the proposed design information, dimensions, and supporting details the council needs to review this part of the consent submission.`;
  }

  if (lowerTitle.includes("report")) {
    return `${title} summarises the technical findings and recommendations that support the consent application and demonstrate suitability for the proposed work.`;
  }

  if (lowerTitle.includes("statement")) {
    return `${title} provides a formal declaration or supporting professional confirmation used within the consent submission set.`;
  }

  return `${title} is part of the consent documentation package used to assess the proposed work, demonstrate compliance, and support review by the relevant council.`;
}
