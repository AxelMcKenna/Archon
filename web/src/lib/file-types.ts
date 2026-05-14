export const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
] as const;

export const DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".jpg", ".jpeg", ".png"] as const;

export const DOCUMENT_ACCEPT =
  `${DOCUMENT_EXTENSIONS.join(",")},${DOCUMENT_MIME_TYPES.join(",")}`;

const MIME_SET: ReadonlySet<string> = new Set(DOCUMENT_MIME_TYPES);

export function isAllowedDocumentFile(file: File): boolean {
  if (MIME_SET.has(file.type)) return true;
  const lowerName = file.name.toLowerCase();
  return DOCUMENT_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}
