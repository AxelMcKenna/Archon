"use client";

import { useState } from "react";

interface Coordinates {
  nztm_x: number;
  nztm_y: number;
  lat: number;
  lon: number;
}

interface ZoneInfo {
  zone_code: string;
  zone_type: string;
  source_council: string;
}

interface RequiredDocument {
  document_type: string;
  category: string;
  reason: string;
  triggered_by: string[];
}

interface ChecklistResult {
  address: string;
  coordinates: Coordinates;
  zone_info: ZoneInfo;
  overlays: Record<string, boolean>;
  required_documents: RequiredDocument[];
}

export function AddressChecklist({ address }: { address: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ChecklistResult | null>(null);

  const handleQuery = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/address-to-checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, city: "", postalcode: "" }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(formatApiError(data) || "Failed to query address");
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-4">Resource Consent Checklist</h2>
        <button
          onClick={handleQuery}
          disabled={isLoading || !address}
          className="inline-flex items-center rounded-lg bg-ink-900 text-white px-4 py-2 text-sm font-medium disabled:bg-ink-700/50"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 mr-2 inline-block border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <span className="w-4 h-4 mr-2">📍</span>
              Generate Checklist
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex gap-3">
          <span className="text-red-600 flex-shrink-0 mt-0.5">⚠</span>
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Zone Information */}
          <div className="rounded-lg border border-ink-700/10 p-4">
            <h3 className="font-semibold mb-3">Zone & Location</h3>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-ink-500">Zone</dt>
                <dd className="font-medium">{result.zone_info.zone_type}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Code</dt>
                <dd className="font-medium">{result.zone_info.zone_code}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Council</dt>
                <dd className="font-medium capitalize">{result.zone_info.source_council}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Coordinates (NZTM)</dt>
                <dd className="font-mono text-xs">
                  {result.coordinates.nztm_x.toFixed(0)}, {result.coordinates.nztm_y.toFixed(0)}
                </dd>
              </div>
            </dl>
          </div>

          {/* Active Overlays */}
          {Object.values(result.overlays).some((v) => v) && (
            <div className="rounded-lg border border-ink-700/10 p-4">
              <h3 className="font-semibold mb-3">Active Hazard & Character Overlays</h3>
              <ul className="space-y-2 text-sm">
                {Object.entries(result.overlays)
                  .filter(([_, isActive]) => isActive)
                  .map(([overlay]) => (
                    <li key={overlay} className="flex items-center gap-2">
                      <span className="text-amber-600">✓</span>
                      <span className="capitalize">{overlay.replace(/_/g, " ")}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* Required Documents */}
          <div className="rounded-lg border border-ink-700/10 p-4">
            <h3 className="font-semibold mb-4">Required Documents</h3>
            <div className="space-y-4">
              {result.required_documents.map((doc, idx) => (
                <div key={idx} className="pb-4 border-b border-ink-700/5 last:pb-0 last:border-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <p className="font-medium text-sm">{doc.document_type}</p>
                      <p className="text-xs text-ink-500">{doc.category}</p>
                    </div>
                  </div>
                  <p className="text-sm text-ink-600 mb-2">{doc.reason}</p>
                  <div className="flex flex-wrap gap-2">
                    {doc.triggered_by.map((trigger) => (
                      <span
                        key={trigger}
                        className="inline-block rounded bg-ink-700/10 px-2 py-1 text-xs text-ink-700"
                      >
                        {trigger}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 rounded bg-blue-50 border border-blue-200">
              <p className="text-xs text-blue-900">
                <strong>Total documents required:</strong> {result.required_documents.length}. Consolidate
                overlapping assessments where possible (e.g., single geotechnical report for liquefaction + slope).
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatApiError(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: unknown; loc?: unknown } | undefined;
    if (!first) return "Validation error";
    const message = typeof first.msg === "string" ? first.msg : "Validation error";
    const loc = Array.isArray(first.loc) ? first.loc.join(".") : "";
    return loc ? `${loc}: ${message}` : message;
  }
  return "";
}
