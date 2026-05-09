import { createDefaultProjectDetails } from "@/lib/project-details";
import { ProjectForm } from "@/components/project-form";
import { createProject } from "../actions";

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold">New project</h1>
      <ProjectForm
        action={createProject}
        initialValues={{
          address: "",
          bca: "ccc",
          projectType: "new_dwelling",
          description: "",
          projectDetails: createDefaultProjectDetails("new_dwelling"),
        }}
        submitLabel="Create"
        pendingLabel="Creating..."
      />
    </div>
  );
}
