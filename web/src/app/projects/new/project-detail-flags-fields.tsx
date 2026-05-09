"use client";

import { useState } from "react";

export function ProjectDetailFlagsFields() {
  const [isDemolitionChecked, setIsDemolitionChecked] = useState(false);
  const currentYear = new Date().getFullYear();

  return (
    <div className="grid gap-3 rounded-sm border border-ink-700/10 bg-surface-raised p-4 sm:grid-cols-2">
      <CheckboxField name="involves_structural_work" label="Involves structural work" />
      <CheckboxField name="involves_earthworks" label="Involves earthworks" />

      <div className="sm:col-span-2">
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            name="existing_structure_demolished"
            type="checkbox"
            className="h-4 w-4 rounded-sm border-ink-700/30"
            checked={isDemolitionChecked}
            onChange={(event) => setIsDemolitionChecked(event.currentTarget.checked)}
          />
          <span>Existing structure demolished</span>
        </label>
        {isDemolitionChecked ? (
          <div className="mt-3 max-w-xs pl-6">
            <label className="block">
              <span className="mb-1 block text-xs text-ink-500">
                Existing structure construction year
              </span>
              <input
                name="year_of_construction"
                type="number"
                min="1800"
                max={currentYear}
                step="1"
                placeholder="e.g. 1986"
                className="w-full rounded-sm border border-ink-700/20 px-3 py-2 text-sm"
              />
            </label>
          </div>
        ) : null}
      </div>

      <CheckboxField name="new_road_access" label="New road access" />
    </div>
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
