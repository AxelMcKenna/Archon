import { taxonomy } from "@consentiq/shared";
import { AddressAutocompleteInput } from "@/components/address-autocomplete-input";
import { ProjectCreateButton } from "@/components/project-create-button";
import type { ProjectFormValues } from "@/lib/project-details";

interface ProjectFormProps {
  action: (formData: FormData) => void | Promise<void>;
  initialValues: ProjectFormValues;
  submitLabel: string;
  pendingLabel: string;
}

export function ProjectForm({
  action,
  initialValues,
  submitLabel,
  pendingLabel,
}: ProjectFormProps) {
  return (
    <form action={action} className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Core project information</h2>
          <p className="mt-1 text-sm text-ink-500">
            These details are used throughout the project and drive consent requirement generation.
          </p>
        </div>

        <Field label="Project address">
          <AddressAutocompleteInput
            name="address"
            required
            initialValue={initialValues.address}
          />
        </Field>
        <Field label="BCA">
          <select
            name="bca"
            required
            defaultValue={initialValues.bca}
            className="w-full rounded border border-ink-700/20 px-3 py-2"
          >
            {taxonomy.bcas.map((bca) => (
              <option key={bca.id} value={bca.id}>
                {bca.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Project type">
          <select
            name="project_type"
            required
            defaultValue={initialValues.projectType}
            className="w-full rounded border border-ink-700/20 px-3 py-2"
          >
            {taxonomy.project_types.map((projectType) => (
              <option key={projectType.id} value={projectType.id}>
                {projectType.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description (optional)">
          <textarea
            name="description"
            rows={4}
            defaultValue={initialValues.description}
            className="w-full rounded border border-ink-700/20 px-3 py-2"
          />
        </Field>
      </section>

      <section className="space-y-4 rounded-2xl border border-ink-700/10 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Project details information</h2>
          <p className="mt-1 text-sm text-ink-500">
            These details are stored on the project and used by Consent Assessment when generating
            required consent documents.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Estimated floor area (m²)">
            <input
              type="number"
              min={0}
              name="estimated_floor_area_m2"
              defaultValue={initialValues.projectDetails.estimatedFloorAreaM2 ?? ""}
              className="w-full rounded border border-ink-700/20 px-3 py-2"
            />
          </Field>
          <Field label="Estimated construction value (NZD)">
            <input
              type="number"
              min={0}
              name="estimated_construction_value_nzd"
              defaultValue={initialValues.projectDetails.estimatedConstructionValueNZD ?? ""}
              className="w-full rounded border border-ink-700/20 px-3 py-2"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
          <CheckboxField
            name="involves_structural_work"
            label="Involves structural work"
            defaultChecked={initialValues.projectDetails.involvesStructuralWork}
          />
          <CheckboxField
            name="involves_earthworks"
            label="Involves earthworks"
            defaultChecked={initialValues.projectDetails.involvesEarthworks}
          />
          <CheckboxField
            name="existing_structure_demolished"
            label="Existing structure demolished"
            defaultChecked={initialValues.projectDetails.existingStructureDemolished}
          />
          <CheckboxField
            name="new_road_access"
            label="New road access"
            defaultChecked={initialValues.projectDetails.newRoadAccess}
          />
        </div>

        <div>
          <p className="mb-2 text-sm text-ink-500">New service connections</p>
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
            <CheckboxField
              name="new_service_connection_water"
              label="Water"
              defaultChecked={initialValues.projectDetails.newServiceConnections.water}
            />
            <CheckboxField
              name="new_service_connection_wastewater"
              label="Wastewater"
              defaultChecked={initialValues.projectDetails.newServiceConnections.wastewater}
            />
            <CheckboxField
              name="new_service_connection_stormwater"
              label="Stormwater"
              defaultChecked={initialValues.projectDetails.newServiceConnections.stormwater}
            />
          </div>
        </div>
      </section>

      <ProjectCreateButton idleLabel={submitLabel} pendingLabel={pendingLabel} />
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-ink-500">{label}</span>
      {children}
    </label>
  );
}

function CheckboxField({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      <span>{label}</span>
    </label>
  );
}
