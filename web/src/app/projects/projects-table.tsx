"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { taxonomy } from "@arro/shared";

const PROJECT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  taxonomy.project_types.map((t) => [t.id, t.label]),
);

export type Row = {
  id: string;
  address: string;
  bca: string;
  bca_name: string;
  project_type: string;
  status: string;
  updated_at: string;
  open_rfis: number;
  oldest_open_days: number | null;
};

type SortKey = "updated_at" | "status" | "bca" | "oldest_open_days";

const STATUS_STYLE: Record<string, string> = {
  "pre-lodgement": "bg-ink-700/10 text-ink-700",
  lodged: "bg-sky-100 text-sky-800",
  "rfi-open": "bg-amber-100 text-amber-800",
  "rfi-responded": "bg-violet-100 text-violet-800",
  "decision-pending": "bg-sky-100 text-sky-800",
  granted: "bg-emerald-100 text-emerald-800",
  declined: "bg-red-100 text-red-800",
};

export function ProjectsTable({ rows }: { rows: Row[] }) {
  const [sort, setSort] = useState<SortKey>("updated_at");
  const [filterBca, setFilterBca] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const filtered = useMemo(() => {
    let r = rows;
    if (filterBca !== "all") r = r.filter((x) => x.bca === filterBca);
    if (filterStatus !== "all") r = r.filter((x) => x.status === filterStatus);
    const sorted = [...r].sort((a, b) => {
      switch (sort) {
        case "updated_at":
          return b.updated_at.localeCompare(a.updated_at);
        case "status":
          return a.status.localeCompare(b.status);
        case "bca":
          return a.bca_name.localeCompare(b.bca_name);
        case "oldest_open_days":
          return (b.oldest_open_days ?? -1) - (a.oldest_open_days ?? -1);
      }
    });
    return sorted;
  }, [rows, sort, filterBca, filterStatus]);

  const bcas = Array.from(new Set(rows.map((r) => [r.bca, r.bca_name] as const)));
  const statuses = Array.from(new Set(rows.map((r) => r.status)));

  return (
    <>
      <div className="flex flex-wrap gap-3 mb-4 text-sm">
        <Filter label="BCA" value={filterBca} onChange={setFilterBca}
          options={[{ value: "all", label: "All BCAs" }, ...bcas.map(([v, l]) => ({ value: v, label: l }))]} />
        <Filter label="Status" value={filterStatus} onChange={setFilterStatus}
          options={[{ value: "all", label: "All statuses" }, ...statuses.map((s) => ({ value: s, label: s }))]} />
        <Filter label="Sort" value={sort} onChange={(v) => setSort(v as SortKey)}
          options={[
            { value: "updated_at", label: "Recently updated" },
            { value: "status", label: "Status" },
            { value: "bca", label: "BCA" },
            { value: "oldest_open_days", label: "Days since RFI" },
          ]} />
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-ink-500 border-b border-ink-700/10">
          <tr>
            <th className="py-2">Address</th>
            <th>BCA</th>
            <th>Type</th>
            <th>Status</th>
            <th>Open RFIs</th>
            <th>Days open</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id} className="border-b border-ink-700/5 hover:bg-ink-700/5">
              <td className="py-3">
                <Link href={`/projects/${p.id}`} className="hover:underline">
                  {p.address}
                </Link>
              </td>
              <td>{p.bca_name}</td>
              <td>{PROJECT_TYPE_LABELS[p.project_type] ?? p.project_type}</td>
              <td>
                <span className={`inline-block rounded-sm px-2 py-0.5 text-xs ${STATUS_STYLE[p.status] ?? "bg-ink-700/10"}`}>
                  {p.status}
                </span>
              </td>
              <td>{p.open_rfis || "—"}</td>
              <td className={p.oldest_open_days != null && p.oldest_open_days > 14 ? "text-red-700 font-medium" : ""}>
                {p.oldest_open_days ?? "—"}
              </td>
              <td className="text-ink-500">{new Date(p.updated_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex items-center gap-2 text-ink-500">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-sm border border-ink-700/10 px-2 py-1 text-ink-900"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
