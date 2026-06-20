"use client";

import { useState } from "react";
import { taxonomy } from "@arro/shared";

type ProjectTypeEntry = { id: string; label: string; commercial?: boolean };
type RiskGroupEntry = { id: string; label: string };
type ImportanceLevelEntry = { id: string; label: string };
type Defaults = Record<string, { risk_group?: string; importance_level?: string }>;

const PROJECT_TYPES = taxonomy.project_types as ProjectTypeEntry[];
const RISK_GROUPS = ((taxonomy as { risk_groups?: RiskGroupEntry[] }).risk_groups ?? []) as RiskGroupEntry[];
const IMPORTANCE_LEVELS = ((taxonomy as { importance_levels?: ImportanceLevelEntry[] }).importance_levels ??
  []) as ImportanceLevelEntry[];
const DEFAULTS = ((taxonomy as { project_type_defaults?: Defaults }).project_type_defaults ?? {}) as Defaults;

const SELECT_CLASS = "w-full rounded-sm border border-ink-700/20 px-3 py-2";

/**
 * Project type + occupancy (fire risk group, importance level) selects.
 *
 * Client component so that choosing a project type re-defaults the risk group
 * and importance level (e.g. picking "Commercial — office" snaps risk group to
 * WB). The user can override either; the values submit as plain form fields
 * (`project_type`, `risk_group`, `importance_level`) so the server action is
 * unchanged.
 */
export function ProjectTypeOccupancyFields() {
  const initialType = PROJECT_TYPES[0]?.id ?? "new_dwelling";
  const [projectType, setProjectType] = useState(initialType);
  const [riskGroup, setRiskGroup] = useState(DEFAULTS[initialType]?.risk_group ?? "SH");
  const [importanceLevel, setImportanceLevel] = useState(
    DEFAULTS[initialType]?.importance_level ?? "IL2",
  );

  function onProjectTypeChange(next: string) {
    setProjectType(next);
    const d = DEFAULTS[next];
    if (d?.risk_group) setRiskGroup(d.risk_group);
    if (d?.importance_level) setImportanceLevel(d.importance_level);
  }

  return (
    <>
      <label className="block">
        <span className="text-sm text-ink-500 block mb-1">Project type</span>
        <select
          name="project_type"
          required
          className={SELECT_CLASS}
          value={projectType}
          onChange={(e) => onProjectTypeChange(e.target.value)}
        >
          {PROJECT_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm text-ink-500 block mb-1">
          Fire risk group <span className="text-ink-500/60">(drives C/AS1 vs C/AS2)</span>
        </span>
        <select
          name="risk_group"
          className={SELECT_CLASS}
          value={riskGroup}
          onChange={(e) => setRiskGroup(e.target.value)}
        >
          {RISK_GROUPS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm text-ink-500 block mb-1">Importance level</span>
        <select
          name="importance_level"
          className={SELECT_CLASS}
          value={importanceLevel}
          onChange={(e) => setImportanceLevel(e.target.value)}
        >
          {IMPORTANCE_LEVELS.map((il) => (
            <option key={il.id} value={il.id}>
              {il.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
