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

export interface ConsentDocument extends RequiredDocument {
  id: string;
  title: string;
  description: string;
  whyRequired: string;
  templateUrl: string;
}

const DOCUMENT_LIBRARY: Record<
  string,
  {
    description: string;
    templateUrl: string;
  }
> = {
  "site-plan": {
    description:
      "The Site Plan shows the proposed building location, legal boundaries, setbacks, accessways, and key site features that affect the consent review.",
    templateUrl: "https://example.com/consent-templates/site-plan",
  },
  "stormwater-plan": {
    description:
      "The Stormwater Plan sets out how runoff will be collected, managed, and discharged so the council can assess drainage performance and downstream effects.",
    templateUrl: "https://example.com/consent-templates/stormwater-plan",
  },
  "producer-statement": {
    description:
      "A Producer Statement records a chartered professional opinion or design assurance for specialist work supporting the consent application.",
    templateUrl: "https://example.com/consent-templates/producer-statement",
  },
  "drainage-plan": {
    description:
      "The Drainage Plan maps foul water and stormwater infrastructure, connection points, gradients, and servicing details required for council review.",
    templateUrl: "https://example.com/consent-templates/drainage-plan",
  },
  "floor-plan": {
    description:
      "Floor Plans show the layout, dimensions, room use, and circulation of the proposed building work for code and consent review.",
    templateUrl: "https://example.com/consent-templates/floor-plan",
  },
  "elevations": {
    description:
      "Elevations show the external appearance, heights, and relationship of the proposed work to natural ground and surrounding context.",
    templateUrl: "https://example.com/consent-templates/elevations",
  },
  "structural-engineering": {
    description:
      "Structural engineering documents set out framing, foundations, bracing, and engineering design information needed to assess compliance.",
    templateUrl: "https://example.com/consent-templates/structural-engineering",
  },
  "geotechnical-report": {
    description:
      "A geotechnical report explains site ground conditions and informs foundation design, earthworks constraints, and hazard-related consent decisions.",
    templateUrl: "https://example.com/consent-templates/geotechnical-report",
  },
  specifications: {
    description:
      "Specifications define materials, assemblies, workmanship, and product requirements that support the consent documentation set.",
    templateUrl: "https://example.com/consent-templates/specifications",
  },
};

export function slugifyDocument(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeDocuments(documents: RequiredDocument[]): ConsentDocument[] {
  const merged = new Map<string, ConsentDocument>();

  for (const document of documents) {
    const title = document.document_type.trim();
    const id = slugifyDocument(title);
    const libraryEntry = DOCUMENT_LIBRARY[id];
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
      templateUrl: libraryEntry?.templateUrl ?? `https://example.com/consent-templates/${id}`,
    });
  }

  return Array.from(merged.values()).sort((left, right) => left.title.localeCompare(right.title));
}

export function getCompletionStats(
  documents: ConsentDocument[],
  uploads: Record<string, UploadRecord>,
) {
  const completed = documents.filter((document) => uploads[document.id]).length;
  const total = documents.length;
  const remaining = documents.filter((document) => !uploads[document.id]);
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return { completed, total, remaining, percent };
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
