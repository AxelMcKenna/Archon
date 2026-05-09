"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { ProjectSettingsValues } from "@/lib/project-details";

interface OwnershipEvidenceFile {
  id: string;
  filename: string;
  storagePath: string;
  uploadedAt: string;
  sizeBytes: number | null;
  mimeType: string | null;
}

interface ProjectOwnerDetailsSettingsProps {
  projectId: string;
  initialValues: ProjectSettingsValues;
  initialOwnershipEvidenceFile: OwnershipEvidenceFile | null;
  action: (formData: FormData) => void | Promise<void>;
}

function isAllowedOwnershipEvidenceFile(file: File) {
  const allowedMimeTypes = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
  ]);
  if (allowedMimeTypes.has(file.type)) return true;
  const lowerName = file.name.toLowerCase();
  return [".pdf", ".docx", ".jpg", ".jpeg", ".png"].some((ext) => lowerName.endsWith(ext));
}

function formatFileSize(sizeBytes: number | null) {
  if (!sizeBytes || sizeBytes <= 0) return "—";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploadedDate(isoDate: string) {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "—";
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function ProjectOwnerDetailsSettings({
  projectId,
  initialValues,
  initialOwnershipEvidenceFile,
  action,
}: ProjectOwnerDetailsSettingsProps) {
  const router = useRouter();
  const supabase = getSupabaseBrowser();
  const [streetAddressDifferent, setStreetAddressDifferent] = useState(initialValues.ownerStreetAddressDifferent);
  const [ownershipEvidenceFile, setOwnershipEvidenceFile] = useState<OwnershipEvidenceFile | null>(initialOwnershipEvidenceFile);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function uploadOwnershipEvidence(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files.item(0);
    if (!file) return;
    if (!isAllowedOwnershipEvidenceFile(file)) {
      setUploadError("Unsupported file type. Use PDF, DOCX, JPG, or PNG.");
      return;
    }

    setUploadError(null);
    setPreviewError(null);
    setUploading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const storageOwner = authData.user?.id ?? "single-user";

      if (ownershipEvidenceFile) {
        await removeOwnershipEvidenceFile(ownershipEvidenceFile, false);
      }

      const safeName = file.name.replace(/\s+/g, "_");
      const storagePath = `${storageOwner}/${projectId}/owner-evidence-${Date.now()}-${safeName}`;

      const { error: storageError } = await supabase.storage
        .from("attachments")
        .upload(storagePath, file, { upsert: false, contentType: file.type });
      if (storageError) throw storageError;

      const record = {
        project_id: projectId,
        filename: `Ownership evidence - ${file.name}`,
        storage_path: storagePath,
        mime_type: file.type || null,
        size_bytes: file.size,
        linked_requirement_key: "owner_evidence",
        linked_requirement_label: "Ownership evidence",
        linked_requirement_source: "settings",
      };

      const { data: inserted, error: insertError } = await supabase
        .from("attachments")
        .insert(record)
        .select("id, filename, storage_path, uploaded_at, size_bytes, mime_type")
        .single();
      if (insertError) {
        const { data: fallbackInserted, error: fallbackInsertError } = await supabase
          .from("attachments")
          .insert({
            project_id: projectId,
            filename: `Ownership evidence - ${file.name}`,
            storage_path: storagePath,
            mime_type: file.type || null,
            size_bytes: file.size,
          })
          .select("id, filename, storage_path, uploaded_at, size_bytes, mime_type")
          .single();
        if (fallbackInsertError || !fallbackInserted) throw fallbackInsertError;
        setOwnershipEvidenceFile({
          id: fallbackInserted.id,
          filename: fallbackInserted.filename,
          storagePath: fallbackInserted.storage_path,
          uploadedAt: fallbackInserted.uploaded_at,
          sizeBytes: fallbackInserted.size_bytes,
          mimeType: fallbackInserted.mime_type,
        });
      } else if (inserted) {
        setOwnershipEvidenceFile({
          id: inserted.id,
          filename: inserted.filename,
          storagePath: inserted.storage_path,
          uploadedAt: inserted.uploaded_at,
          sizeBytes: inserted.size_bytes,
          mimeType: inserted.mime_type,
        });
      }

      router.refresh();
    } catch (error) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message?: unknown }).message ?? "Upload failed.")
          : "Upload failed.";
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  }

  async function removeOwnershipEvidenceFile(file: OwnershipEvidenceFile, refresh = true) {
    setUploadError(null);
    setPreviewError(null);
    try {
      const { error: storageError } = await supabase.storage.from("attachments").remove([file.storagePath]);
      if (storageError) throw storageError;
      const { error: deleteError } = await supabase.from("attachments").delete().eq("id", file.id);
      if (deleteError) throw deleteError;
      setOwnershipEvidenceFile(null);
      if (refresh) router.refresh();
    } catch (error) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message?: unknown }).message ?? "Delete failed.")
          : "Delete failed.";
      setUploadError(message);
    }
  }

  async function previewOwnershipEvidenceFile(file: OwnershipEvidenceFile) {
    setPreviewError(null);
    try {
      const { data, error } = await supabase.storage.from("attachments").createSignedUrl(file.storagePath, 60);
      if (error || !data?.signedUrl) throw error ?? new Error("Unable to open preview.");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as { message?: unknown }).message ?? "Preview failed.")
          : "Preview failed.";
      setPreviewError(message);
    }
  }

  return (
    <form action={action} className="space-y-6">
      <section className="rounded-2xl border border-ink-700/10 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-ink-900">Building Consent Number(s)</h2>
        <label className="block">
          <span className="mb-1 block text-sm text-ink-500">Building consent number(s)</span>
          <textarea
            name="building_consent_numbers"
            rows={3}
            defaultValue={initialValues.buildingConsentNumbers}
            placeholder="e.g. BCN-12345, BCN-12346"
            className="w-full rounded border border-ink-700/20 px-3 py-2"
          />
        </label>
      </section>

      <section className="rounded-2xl border border-ink-700/10 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-ink-900">Owner Details</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-ink-500">Preferred form of address</span>
            <select
              name="owner_preferred_form_of_address"
              defaultValue={initialValues.ownerPreferredFormOfAddress}
              className="w-full rounded border border-ink-700/20 px-3 py-2"
            >
              <option value="">—</option>
              <option value="Mr">Mr</option>
              <option value="Mrs">Mrs</option>
              <option value="Ms">Ms</option>
              <option value="Miss">Miss</option>
              <option value="Dr">Dr</option>
            </select>
          </label>

          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm text-ink-500">Owner full name</span>
            <input
              type="text"
              name="owner_full_name"
              defaultValue={initialValues.ownerFullName}
              className="w-full rounded border border-ink-700/20 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-ink-500">Include preferred form of address if an individual.</span>
          </label>

          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm text-ink-500">Contact person</span>
            <input
              type="text"
              name="owner_contact_person_full_name"
              defaultValue={initialValues.ownerContactPersonFullName}
              className="w-full rounded border border-ink-700/20 bg-slate-50 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-ink-500">Not required if owner is an individual.</span>
          </label>

          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm text-ink-500">Mailing address</span>
            <textarea
              name="owner_mailing_address"
              rows={3}
              defaultValue={initialValues.ownerMailingAddress}
              className="w-full rounded border border-ink-700/20 px-3 py-2"
            />
          </label>

          <label className="inline-flex items-center gap-2 md:col-span-2">
            <input
              type="checkbox"
              name="owner_street_address_different"
              defaultChecked={initialValues.ownerStreetAddressDifferent}
              onChange={(e) => setStreetAddressDifferent(e.target.checked)}
            />
            <span className="text-sm text-ink-700">Street address is different from mailing address</span>
          </label>

          {streetAddressDifferent && (
            <label className="block md:col-span-2">
              <span className="mb-1 block text-sm text-ink-500">Street address / Registered office</span>
              <textarea
                name="owner_street_address"
                rows={3}
                defaultValue={initialValues.ownerStreetAddress}
                required={streetAddressDifferent}
                className="w-full rounded border border-ink-700/20 px-3 py-2"
              />
            </label>
          )}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-sm text-ink-500">Phone numbers</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <label className="block">
              <span className="mb-1 block text-xs text-ink-500">Landline</span>
              <input type="text" name="owner_phone_landline" defaultValue={initialValues.ownerPhoneLandline} className="w-full rounded border border-ink-700/20 px-2 py-2" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-ink-500">Mobile</span>
              <input type="text" name="owner_phone_mobile" defaultValue={initialValues.ownerPhoneMobile} className="w-full rounded border border-ink-700/20 px-2 py-2" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-ink-500">Daytime</span>
              <input type="text" name="owner_phone_daytime" defaultValue={initialValues.ownerPhoneDaytime} className="w-full rounded border border-ink-700/20 px-2 py-2" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-ink-500">After hours</span>
              <input type="text" name="owner_phone_after_hours" defaultValue={initialValues.ownerPhoneAfterHours} className="w-full rounded border border-ink-700/20 px-2 py-2" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-ink-500">Fax</span>
              <input type="text" name="owner_phone_fax" defaultValue={initialValues.ownerPhoneFax} className="w-full rounded border border-ink-700/20 px-2 py-2" />
            </label>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-ink-500">Email address</span>
            <input type="email" name="owner_email_address" defaultValue={initialValues.ownerEmailAddress} className="w-full rounded border border-ink-700/20 px-3 py-2" />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-ink-500">Website</span>
            <input type="url" name="owner_website_url" defaultValue={initialValues.ownerWebsiteUrl} className="w-full rounded border border-ink-700/20 bg-slate-50 px-3 py-2" />
          </label>
        </div>

        <div className="mt-6 rounded-lg border border-ink-700/10 p-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-900">The following evidence of ownership is attached to this application</span>
            <span className="mb-2 block text-xs text-ink-500">Copy of certificate of title, lease, agreement for sale and purchase, or other document showing full name of legal owner(s) of the building.</span>
            <select
              name="owner_evidence_of_ownership_type"
              required
              defaultValue={initialValues.ownerEvidenceOfOwnershipType}
              className="w-full rounded border border-ink-700/20 px-3 py-2"
            >
              <option value="">Select one</option>
              <option value="Certificate of title">Certificate of title</option>
              <option value="Lease">Lease</option>
              <option value="Agreement for sale and purchase">Agreement for sale and purchase</option>
              <option value="Other document">Other document</option>
            </select>
          </label>

          <div className="mt-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => void uploadOwnershipEvidence(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full rounded-lg border border-dashed border-ink-300 bg-ink-50 px-4 py-6 text-center text-sm text-ink-700 hover:bg-ink-100 disabled:opacity-50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void uploadOwnershipEvidence(e.dataTransfer.files);
              }}
            >
              {uploading ? "Uploading..." : "Upload certificate of title or ownership evidence"}
              <span className="mt-1 block text-xs text-ink-500">Upload a copy of the document selected above</span>
            </button>

            {ownershipEvidenceFile && (
              <div className="mt-3 rounded border border-ink-200 bg-white p-3 text-sm">
                <div className="font-medium text-ink-900">{ownershipEvidenceFile.filename}</div>
                <div className="mt-1 text-xs text-ink-500">
                  {formatFileSize(ownershipEvidenceFile.sizeBytes)} · Uploaded {formatUploadedDate(ownershipEvidenceFile.uploadedAt)}
                </div>
                <div className="mt-2 flex gap-3 text-xs">
                  <button type="button" onClick={() => void previewOwnershipEvidenceFile(ownershipEvidenceFile)} className="text-ink-700 underline">
                    Preview
                  </button>
                  <button type="button" onClick={() => void removeOwnershipEvidenceFile(ownershipEvidenceFile)} className="text-red-600 underline">
                    Delete
                  </button>
                </div>
              </div>
            )}

            {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}
            {previewError && <p className="mt-2 text-xs text-red-600">{previewError}</p>}
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800"
        >
          Save settings
        </button>
      </div>
    </form>
  );
}
