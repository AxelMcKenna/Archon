"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CccDocumentStatus } from "@/lib/ccc";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Props {
  projectId: string;
  requiredItems: CccDocumentStatus[];
  conditionalItems: CccDocumentStatus[];
}

function badgeTone(type: "required" | "if_applicable") {
  return type === "required"
    ? "bg-red-100 text-red-800 border-red-200"
    : "bg-amber-100 text-amber-800 border-amber-200";
}

export function CccDocumentsWorkflow({
  projectId,
  requiredItems,
  conditionalItems,
}: Props) {
  const router = useRouter();
  const supabase = getSupabaseBrowser();
  const [applicable, setApplicable] = useState<Record<string, boolean>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccessByKey, setUploadSuccessByKey] = useState<Record<string, string>>({});

  const allItems = useMemo(
    () => [...requiredItems, ...conditionalItems],
    [requiredItems, conditionalItems],
  );

  async function uploadForRequirement(item: CccDocumentStatus, files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingKey(item.key);
    setUploadError(null);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("You need to be signed in to upload.");

      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/\s+/g, "_");
        const storagePath = `${user.id}/${projectId}/ccc-${item.key}-${Date.now()}-${safeName}`;
        const { error: storageError } = await supabase.storage
          .from("attachments")
          .upload(storagePath, file, { upsert: false, contentType: file.type });
        if (storageError) throw storageError;

        const { error: insertError } = await supabase.from("attachments").insert({
          project_id: projectId,
          filename: `${item.label} - ${file.name}`,
          storage_path: storagePath,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
        if (insertError) throw insertError;
      }
      const uploadedCount = files.length;
      setUploadSuccessByKey((prev) => ({
        ...prev,
        [item.key]: `${uploadedCount} file${uploadedCount > 1 ? "s" : ""} uploaded`,
      }));
      router.refresh();
    } catch (error) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message?: unknown }).message ?? "Upload failed.")
          : "Upload failed.";
      setUploadError(message);
    } finally {
      setUploadingKey(null);
    }
  }

  return (
    <section className="bg-surface-raised rounded-lg border border-ink-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">CCC Documents</h2>
          <p className="mt-1 text-sm text-ink-600">
            Track Code Compliance Certificate document requirements against uploaded project files.
          </p>
        </div>
        <Link
          href={`/projects/${projectId}/documents`}
          className="rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
        >
          Open Documents
        </Link>
      </div>
      {uploadError && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {uploadError}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {allItems.map((item) => {
          const isConditional = item.requirementType === "if_applicable";
          const active = !isConditional || Boolean(applicable[item.key]);
          const complete = item.status === "complete";
          return (
            <article key={item.key} className="rounded-lg border border-ink-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink-900">{item.label}</h3>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${badgeTone(item.requirementType)}`}
                    >
                      {item.requirementType === "required" ? "Required" : "If Applicable"}
                    </span>
                    {complete ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                        Complete
                      </span>
                    ) : active ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">
                        Missing
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        Not Required
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-ink-600">{item.helperText}</p>
                  <p className="mt-2 text-xs text-ink-500">
                    {item.matchedDocuments.length > 0
                      ? `Matched uploads: ${item.matchedDocuments.join(", ")}`
                      : "No matching upload found."}
                  </p>
                </div>
                {isConditional && (
                  <label className="inline-flex items-center gap-2 text-xs text-ink-700">
                    <input
                      type="checkbox"
                      checked={Boolean(applicable[item.key])}
                      onChange={(event) =>
                        setApplicable((prev) => ({
                          ...prev,
                          [item.key]: event.target.checked,
                        }))
                      }
                    />
                    Applies
                  </label>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  id={`ccc-upload-${item.key}`}
                  type="file"
                  multiple={item.supportsMultiple}
                  className="hidden"
                  onChange={(event) => uploadForRequirement(item, event.target.files)}
                />
                <label
                  htmlFor={`ccc-upload-${item.key}`}
                  className={`rounded-md border border-ink-200 px-3 py-1.5 text-xs text-ink-700 hover:bg-ink-50 ${
                    uploadingKey === item.key ? "opacity-60" : "cursor-pointer"
                  }`}
                >
                  {uploadingKey === item.key ? "Uploading..." : "Upload document"}
                </label>
                <span className="text-[11px] text-ink-500">
                  {item.supportsMultiple ? "Multiple files allowed" : "Single file expected"}
                </span>
              </div>
              {uploadSuccessByKey[item.key] && (
                <p className="mt-2 text-xs text-emerald-700">{uploadSuccessByKey[item.key]}</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
