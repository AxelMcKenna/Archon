"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export function DeleteRowButton({
  format,
  id,
  filename,
}: {
  format: "pdf" | "dxf";
  id: string;
  filename: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete ${filename}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const path = format === "pdf" ? `/plans/${id}` : `/cad/${id}`;
      await apiFetch(path, { method: "DELETE" });
      // Drop the ?plan= or ?cad= param if it points at the deleted row.
      router.push("/plans");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      title={`Delete ${filename}`}
      className="text-ink-400 hover:text-red-600 text-xs px-2 py-0.5 rounded disabled:opacity-50"
    >
      {busy ? "…" : "Delete"}
    </button>
  );
}
