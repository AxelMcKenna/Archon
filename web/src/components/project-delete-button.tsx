"use client";

import { SettingsDeleteProjectButton } from "@/app/settings/project-row-delete";

export function ProjectDeleteButton({
  onDelete,
}: {
  onDelete: () => Promise<void>;
}) {
  return (
    <SettingsDeleteProjectButton
      onDelete={onDelete}
      projectLabel="this project"
      triggerLabel="Delete Project"
      triggerClassName="rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100"
    />
  );
}
