import type { ConsentDocument, SubmissionPackage } from "./model";

export interface SubmissionCategoryGroup {
  id: string;
  label: string;
  items: ConsentDocument[];
}

export interface SubmissionDocumentGroup {
  id: string;
  label: string;
  createdAt: string | null;
  submittedAt: string | null;
  status: string | null;
  councilUrl: string | null;
  isUnsubmitted: boolean;
  items: ConsentDocument[];
  categories: SubmissionCategoryGroup[];
}

export function groupDocumentsBySubmission(
  documents: ConsentDocument[],
  submissionPackages: SubmissionPackage[],
  documentSubmissionIds: Record<string, string>,
): SubmissionDocumentGroup[] {
  const packageOrder = new Map(submissionPackages.map((item, index) => [item.id, index]));
  const groups = new Map<
    string,
    {
      id: string;
      label: string;
      createdAt: string | null;
      submittedAt: string | null;
      status: string | null;
      councilUrl: string | null;
      isUnsubmitted: boolean;
      items: ConsentDocument[];
    }
  >();

  for (const document of documents) {
    const submissionId = documentSubmissionIds[document.id];
    const submissionPackage = submissionPackages.find((item) => item.id === submissionId);
    const key = submissionPackage?.id ?? "unsubmitted";
    const existing = groups.get(key) ?? {
      id: key,
      label: submissionPackage?.title ?? "Unsubmitted Documents",
      createdAt: submissionPackage?.createdAt ?? null,
      submittedAt: submissionPackage?.submittedAt ?? null,
      status: submissionPackage?.status ?? null,
      councilUrl: submissionPackage?.councilUrl ?? null,
      isUnsubmitted: !submissionPackage,
      items: [],
    };
    existing.items.push(document);
    groups.set(key, existing);
  }

  return Array.from(groups.values())
    .sort((left, right) => {
      if (left.isUnsubmitted && !right.isUnsubmitted) return 1;
      if (!left.isUnsubmitted && right.isUnsubmitted) return -1;
      return (
        (packageOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (packageOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      );
    })
    .map((group) => ({
      ...group,
      categories: groupDocumentsByCategory(group.items),
    }));
}

export function groupDocumentsByCategory(documents: ConsentDocument[]) {
  const categories = new Map<string, ConsentDocument[]>();
  for (const document of documents) {
    const category = normalizeCategory(document.category);
    const existing = categories.get(category) ?? [];
    existing.push(document);
    categories.set(category, existing);
  }

  return Array.from(categories.entries())
    .sort(([left], [right]) => categorySortKey(left) - categorySortKey(right))
    .map(([category, items]) => ({
      id: category.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label: category,
      items,
    }));
}

export function formatSubmissionDate(value: string | null) {
  if (!value) return "recently";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "recently";
  return parsed.toLocaleDateString();
}

function normalizeCategory(value: string) {
  const normalized = value?.trim();
  if (!normalized) return "General";
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function categorySortKey(category: string) {
  const key = category.toLowerCase();
  if (key === "baseline") return 0;
  if (key === "location") return 1;
  if (key === "project") return 2;
  if (key === "specialist") return 3;
  if (key.includes("additional")) return 9;
  return 5;
}
