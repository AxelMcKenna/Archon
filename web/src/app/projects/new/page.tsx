import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { taxonomy } from "@arro/shared";
import { ProjectCreateButton } from "@/components/project-create-button";
import { AddressAutocompleteInput } from "@/components/address-autocomplete-input";
import { bootstrapConsentAssessment } from "@/lib/consent-assessment-bootstrap";
import { ProjectDetailFlagsFields } from "./project-detail-flags-fields";

async function createProject(formData: FormData) {
  "use server";
  const supabase = await getSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const address = String(formData.get("address") ?? "").trim();
  const bca = String(formData.get("bca") ?? "").trim();
  const projectType = String(formData.get("project_type") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const estimatedFloorArea = parseOptionalNumber(formData.get("estimated_floor_area_m2"));
  const estimatedConstructionValue = parseOptionalNumber(formData.get("estimated_construction_value_nzd"));
  const yearOfConstruction = parseOptionalYear(formData.get("year_of_construction"));

  // Idempotency: if an identical project was created within the last 15s, reuse it.
  const recentThreshold = new Date(Date.now() - 15_000).toISOString();
  const existing = await supabase
    .from("projects")
    .select("id")
    .eq("address", address)
    .eq("bca", bca)
    .eq("project_type", projectType)
    .gte("created_at", recentThreshold)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    throw new Error(existing.error.message || "Unable to check existing projects.");
  }
  if (existing.data?.id) {
    redirect(`/projects/${existing.data.id}`);
  }

  const inserted = await insertProjectCompatible(supabase, {
      user_id: user.id,
      address,
      bca,
      project_type: projectType,
      description,
      estimated_floor_area_m2: estimatedFloorArea,
      estimated_construction_value_nzd: estimatedConstructionValue,
      involves_structural_work: formData.get("involves_structural_work") === "on",
      involves_earthworks: formData.get("involves_earthworks") === "on",
      existing_structure_demolished: formData.get("existing_structure_demolished") === "on",
      new_road_access: formData.get("new_road_access") === "on",
      service_connection_water: formData.get("service_connection_water") === "on",
      service_connection_wastewater: formData.get("service_connection_wastewater") === "on",
      service_connection_stormwater: formData.get("service_connection_stormwater") === "on",
    });
  if (inserted.error) {
    throw new Error(inserted.error.message || "Unable to create project.");
  }
  if (!inserted.data?.id) {
    throw new Error("Unable to create project.");
  }

  const newProjectId = inserted.data.id;
  const intake = {
    projectType,
    estimatedFloorAreaM2: estimatedFloorArea,
    estimatedConstructionValueNZD: estimatedConstructionValue,
    involvesStructuralWork: formData.get("involves_structural_work") === "on",
    involvesEarthworks: formData.get("involves_earthworks") === "on",
    existingStructureDemolished: formData.get("existing_structure_demolished") === "on",
    yearOfConstruction,
    newRoadAccess: formData.get("new_road_access") === "on",
    serviceConnectionWater: formData.get("service_connection_water") === "on",
    serviceConnectionWastewater: formData.get("service_connection_wastewater") === "on",
    serviceConnectionStormwater: formData.get("service_connection_stormwater") === "on",
  };

  await bootstrapConsentAssessment(supabase, newProjectId, address, intake);

  redirect(`/projects/${newProjectId}`);
}

export default function NewProjectPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold mb-6">New project</h1>
      <form action={createProject} className="space-y-4">
        <Field label="Project address">
          <AddressAutocompleteInput name="address" required />
        </Field>
        <Field label="BCA">
          <select name="bca" required className="w-full rounded-sm border border-ink-700/20 px-3 py-2">
            {taxonomy.bcas.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Project type">
          <select name="project_type" required className="w-full rounded-sm border border-ink-700/20 px-3 py-2">
            {taxonomy.project_types.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Estimated floor area (m2)">
          <input
            name="estimated_floor_area_m2"
            type="number"
            min="0"
            step="0.1"
            className="w-full rounded-sm border border-ink-700/20 px-3 py-2"
          />
        </Field>
        <Field label="Estimated construction value (NZD)">
          <input
            name="estimated_construction_value_nzd"
            type="number"
            min="0"
            step="1"
            className="w-full rounded-sm border border-ink-700/20 px-3 py-2"
          />
        </Field>
        <ProjectDetailFlagsFields />
        <fieldset className="rounded-sm border border-ink-700/10 bg-surface-raised p-4">
          <legend className="text-sm text-ink-500">New service connections</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <CheckboxField name="service_connection_water" label="Water" />
            <CheckboxField name="service_connection_wastewater" label="Wastewater" />
            <CheckboxField name="service_connection_stormwater" label="Stormwater" />
          </div>
        </fieldset>
        <Field label="Description (optional)">
          <textarea name="description" rows={4} className="w-full rounded-sm border border-ink-700/20 px-3 py-2" />
        </Field>
        <ProjectCreateButton />
      </form>
    </div>
  );
}

function parseOptionalNumber(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalYear(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? "").trim());
  const currentYear = new Date().getFullYear();
  return Number.isInteger(parsed) && parsed >= 1800 && parsed <= currentYear ? parsed : null;
}

type InsertProjectResult = {
  data: { id: string } | null;
  error: { code?: string; message?: string } | null;
};

async function insertProjectCompatible(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  payload: Record<string, unknown>,
): Promise<InsertProjectResult> {
  const insertPayload: Record<string, unknown> = { ...payload };
  const requiredColumns = new Set(["address", "bca", "project_type", "description"]);
  let legacyOwnerId: string | null | undefined;

  for (let i = 0; i < 20; i++) {
    const inserted = await supabase
      .from("projects")
      .insert(insertPayload)
      .select("id")
      .single<{ id: string }>();
    if (!inserted.error) {
      return inserted;
    }

    if (requiresLegacyProjectsOwner(inserted.error) && !("user_id" in insertPayload)) {
      legacyOwnerId ??= await resolveLegacyProjectsOwnerId(supabase);
      insertPayload.user_id = legacyOwnerId;
      continue;
    }

    const missingColumn = extractMissingProjectsColumn(inserted.error);
    if (!missingColumn || !(missingColumn in insertPayload) || requiredColumns.has(missingColumn)) {
      return inserted;
    }

    delete insertPayload[missingColumn];
  }

  return {
    data: null,
    error: {
      code: "PROJECT_INSERT_RETRY_EXHAUSTED",
      message: "Unable to create project after schema compatibility retries.",
    },
  };
}

function extractMissingProjectsColumn(error: { code?: string; message?: string }) {
  const message = error.message ?? "";
  const pgrst = message.match(/Could not find the '([^']+)' column of 'projects'/);
  if (pgrst?.[1]) return pgrst[1];
  const postgres = message.match(/column \"([^\"]+)\" does not exist/);
  if (postgres?.[1]) return postgres[1];
  return null;
}

function requiresLegacyProjectsOwner(error: { code?: string; message?: string }) {
  const message = String(error.message ?? "");
  return (
    message.includes('null value in column "user_id"') ||
    message.includes("new row violates row-level security policy")
  );
}

async function resolveLegacyProjectsOwnerId(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
) {
  const configured = process.env.SUPABASE_DEFAULT_USER_ID?.trim();
  if (configured) {
    return configured;
  }

  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    throw new Error(
      `Unable to create project. Legacy projects schema requires a real Supabase auth user_id, and listing auth users failed: ${error.message}`,
    );
  }

  const users = data.users ?? [];
  if (users.length === 1) {
    return users[0].id;
  }

  if (users.length === 0) {
    throw new Error(
      "Unable to create project. Legacy projects schema requires user_id, but no Supabase auth users exist yet.",
    );
  }

  throw new Error(
    "Unable to create project. Legacy projects schema requires user_id, but multiple auth users exist and this app has no request-scoped auth session. Set SUPABASE_DEFAULT_USER_ID for local writes.",
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-ink-500 block mb-1">{label}</span>
      {children}
    </label>
  );
}

function CheckboxField({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-700">
      <input name={name} type="checkbox" className="h-4 w-4 rounded-sm border-ink-700/30" />
      <span>{label}</span>
    </label>
  );
}
