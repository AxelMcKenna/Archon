import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { taxonomy } from "@consentiq/shared";
import { ProjectCreateButton } from "@/components/project-create-button";
import { AddressAutocompleteInput } from "@/components/address-autocomplete-input";

function isMissingUserIdColumn(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "").toLowerCase()
      : "";
  const mentionsUserId = message.includes("user_id") || message.includes("projects.user_id");
  return (
    mentionsUserId &&
    (message.includes("could not find") || message.includes("does not exist"))
  );
}

async function createProject(formData: FormData) {
  "use server";
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const address = String(formData.get("address") ?? "").trim();
  const bca = String(formData.get("bca") ?? "").trim();
  const projectType = String(formData.get("project_type") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const estimatedFloorArea = parseOptionalNumber(formData.get("estimated_floor_area_m2"));
  const estimatedConstructionValue = parseOptionalNumber(formData.get("estimated_construction_value_nzd"));

  const recentThreshold = new Date(Date.now() - 15_000).toISOString();
  let existingProjectId: string | null = null;
  const existingWithUser = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .eq("address", address)
    .eq("bca", bca)
    .eq("project_type", projectType)
    .gte("created_at", recentThreshold)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingWithUser.error && !isMissingUserIdColumn(existingWithUser.error)) {
    throw new Error(existingWithUser.error.message || "Unable to check existing projects.");
  }
  if (existingWithUser.data?.id) {
    existingProjectId = existingWithUser.data.id;
  } else if (existingWithUser.error && isMissingUserIdColumn(existingWithUser.error)) {
    const existingWithoutUser = await supabase
      .from("projects")
      .select("id")
      .eq("address", address)
      .eq("bca", bca)
      .eq("project_type", projectType)
      .gte("created_at", recentThreshold)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingWithoutUser.error) {
      throw new Error(existingWithoutUser.error.message || "Unable to check existing projects.");
    }
    existingProjectId = existingWithoutUser.data?.id ?? null;
  }

  if (existingProjectId) {
    redirect(`/projects/${existingProjectId}`);
  }

  let createdProjectId: string | null = null;

  const withUserInsert = await supabase
    .from("projects")
    .insert({
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
    })
    .select("id")
    .single();

  if (withUserInsert.error && isMissingUserIdColumn(withUserInsert.error)) {
    const withoutUserInsert = await supabase
      .from("projects")
      .insert({
        address,
        bca,
        project_type: projectType,
        description,
      })
      .select("id")
      .single();
    if (withoutUserInsert.error) {
      throw new Error(withoutUserInsert.error.message || "Unable to create project.");
    }
    createdProjectId = withoutUserInsert.data.id;
  } else if (withUserInsert.error) {
    const message = withUserInsert.error.message?.toLowerCase?.() ?? "";
    const staleUserSession =
      withUserInsert.error.code === "23503" &&
      (message.includes("user_id") || message.includes("projects_user_id_fkey"));
    if (staleUserSession) {
      redirect("/auth/sign-in");
    }
    throw new Error(withUserInsert.error.message || "Unable to create project.");
  } else {
    createdProjectId = withUserInsert.data.id;
  }
  redirect(`/projects/${createdProjectId}`);
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
          <select name="bca" required className="w-full rounded border border-ink-700/20 px-3 py-2">
            {taxonomy.bcas.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Project type">
          <select name="project_type" required className="w-full rounded border border-ink-700/20 px-3 py-2">
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
            className="w-full rounded border border-ink-700/20 px-3 py-2"
          />
        </Field>
        <Field label="Estimated construction value (NZD)">
          <input
            name="estimated_construction_value_nzd"
            type="number"
            min="0"
            step="1"
            className="w-full rounded border border-ink-700/20 px-3 py-2"
          />
        </Field>
        <div className="grid gap-3 rounded border border-ink-700/10 bg-white p-4 sm:grid-cols-2">
          <CheckboxField name="involves_structural_work" label="Involves structural work" />
          <CheckboxField name="involves_earthworks" label="Involves earthworks" />
          <CheckboxField name="existing_structure_demolished" label="Existing structure demolished" />
          <CheckboxField name="new_road_access" label="New road access" />
        </div>
        <fieldset className="rounded border border-ink-700/10 bg-white p-4">
          <legend className="text-sm text-ink-500">New service connections</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <CheckboxField name="service_connection_water" label="Water" />
            <CheckboxField name="service_connection_wastewater" label="Wastewater" />
            <CheckboxField name="service_connection_stormwater" label="Stormwater" />
          </div>
        </fieldset>
        <Field label="Description (optional)">
          <textarea name="description" rows={4} className="w-full rounded border border-ink-700/20 px-3 py-2" />
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
      <input name={name} type="checkbox" className="h-4 w-4 rounded border-ink-700/30" />
      <span>{label}</span>
    </label>
  );
}
