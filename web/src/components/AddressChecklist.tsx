"use client";

import { useMemo, useState } from "react";
import type {
  ProjectDetails,
  ProjectType,
  ResolveDocumentsRequest,
  ResolveDocumentsResponse,
  ZoneCategory,
} from "@/types/consent";

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

interface ChecklistResult {
  address: string;
  coordinates: Coordinates;
  zone_info: ZoneInfo;
  overlays: Record<string, boolean>;
}

const PROJECT_TYPE_OPTIONS: Array<{ value: ProjectType; label: string }> = [
  { value: "new_dwelling", label: "New dwelling" },
  { value: "extension", label: "Extension" },
  { value: "accessory_building", label: "Accessory building" },
  { value: "deck", label: "Deck" },
];

export function AddressChecklist({
  address,
  initialProjectType = "new_dwelling",
}: {
  address: string;
  initialProjectType?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ChecklistResult | null>(null);
  const [documents, setDocuments] = useState<ResolveDocumentsResponse | null>(null);
  const normalizedType = normalizeProjectType(initialProjectType);
  const [projectDetails, setProjectDetails] = useState<ProjectDetails>({
    projectType: normalizedType,
    estimatedFloorAreaM2: null,
    estimatedConstructionValueNZD: null,
    involvesStructuralWork: false,
    involvesEarthworks: false,
    existingStructureDemolished: false,
    newRoadAccess: false,
    newServiceConnections: {
      water: false,
      wastewater: false,
      stormwater: false,
    },
  });

  const activeOverlayLabels = useMemo(() => {
    if (!result) return [];
    return Object.entries(result.overlays)
      .filter(([, isActive]) => isActive)
      .map(([overlay]) => overlay);
  }, [result]);

  const handleQuery = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setDocuments(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
      const geoResponse = await fetch(`${apiUrl}/address-to-checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, city: "", postalcode: "" }),
      });

      if (!geoResponse.ok) {
        const payload = await geoResponse.json().catch(() => null);
        throw new Error(formatApiError(payload) || "Failed to query address");
      }

      const geoData = (await geoResponse.json()) as ChecklistResult;
      setResult(geoData);

      const payload: ResolveDocumentsRequest = {
        zoneCategory: getZoneCategory(geoData.zone_info.zone_type),
        activeOverlays: Object.entries(geoData.overlays)
          .filter(([, isActive]) => isActive)
          .map(([key]) => normalizeOverlayKey(key))
          .filter((key): key is string => Boolean(key)),
        projectDetails,
      };

      const docsResponse = await fetch(`${apiUrl}/api/resolve-documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!docsResponse.ok) {
        const docsError = await docsResponse.json().catch(() => null);
        throw new Error(formatApiError(docsError) || "Failed to resolve documents");
      }

      const docsData = (await docsResponse.json()) as ResolveDocumentsResponse;
      setDocuments(docsData);
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
      </div>

      <div className="rounded-lg border border-ink-700/10 p-4 space-y-4">
        <h3 className="font-semibold">Project details</h3>

        <label className="block text-sm">
          <span className="text-ink-500 block mb-1">Project type</span>
          <select
            className="w-full rounded border border-ink-700/20 px-3 py-2"
            value={projectDetails.projectType}
            onChange={(event) =>
              setProjectDetails((prev) => ({ ...prev, projectType: event.target.value as ProjectType }))
            }
          >
            {PROJECT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-ink-500 block mb-1">Estimated floor area (m²)</span>
            <input
              type="number"
              min={0}
              className="w-full rounded border border-ink-700/20 px-3 py-2"
              value={projectDetails.estimatedFloorAreaM2 ?? ""}
              onChange={(event) =>
                setProjectDetails((prev) => ({
                  ...prev,
                  estimatedFloorAreaM2: parseNullableNumber(event.target.value),
                }))
              }
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-500 block mb-1">Estimated construction value (NZD)</span>
            <input
              type="number"
              min={0}
              className="w-full rounded border border-ink-700/20 px-3 py-2"
              value={projectDetails.estimatedConstructionValueNZD ?? ""}
              onChange={(event) =>
                setProjectDetails((prev) => ({
                  ...prev,
                  estimatedConstructionValueNZD: parseNullableNumber(event.target.value),
                }))
              }
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <Checkbox
            label="Involves structural work"
            checked={projectDetails.involvesStructuralWork}
            onChange={(checked) => setProjectDetails((prev) => ({ ...prev, involvesStructuralWork: checked }))}
          />
          <Checkbox
            label="Involves earthworks"
            checked={projectDetails.involvesEarthworks}
            onChange={(checked) => setProjectDetails((prev) => ({ ...prev, involvesEarthworks: checked }))}
          />
          <Checkbox
            label="Existing structure demolished"
            checked={projectDetails.existingStructureDemolished}
            onChange={(checked) =>
              setProjectDetails((prev) => ({ ...prev, existingStructureDemolished: checked }))
            }
          />
          <Checkbox
            label="New road access"
            checked={projectDetails.newRoadAccess}
            onChange={(checked) => setProjectDetails((prev) => ({ ...prev, newRoadAccess: checked }))}
          />
        </div>

        <div>
          <p className="text-sm text-ink-500 mb-2">New service connections</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
            <Checkbox
              label="Water"
              checked={projectDetails.newServiceConnections.water}
              onChange={(checked) =>
                setProjectDetails((prev) => ({
                  ...prev,
                  newServiceConnections: { ...prev.newServiceConnections, water: checked },
                }))
              }
            />
            <Checkbox
              label="Wastewater"
              checked={projectDetails.newServiceConnections.wastewater}
              onChange={(checked) =>
                setProjectDetails((prev) => ({
                  ...prev,
                  newServiceConnections: { ...prev.newServiceConnections, wastewater: checked },
                }))
              }
            />
            <Checkbox
              label="Stormwater"
              checked={projectDetails.newServiceConnections.stormwater}
              onChange={(checked) =>
                setProjectDetails((prev) => ({
                  ...prev,
                  newServiceConnections: { ...prev.newServiceConnections, stormwater: checked },
                }))
              }
            />
          </div>
        </div>
      </div>

      <button
        onClick={handleQuery}
        disabled={isLoading || !address}
        className="inline-flex items-center rounded-lg bg-ink-900 text-white px-4 py-2 text-sm font-medium disabled:bg-ink-700/50"
      >
        {isLoading ? "Analyzing..." : "Generate Checklist"}
      </button>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex gap-3">
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}

      {result && (
        <div className="space-y-6">
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

          {!!activeOverlayLabels.length && (
            <div className="rounded-lg border border-ink-700/10 p-4">
              <h3 className="font-semibold mb-3">Active Hazard & Character Overlays</h3>
              <ul className="space-y-2 text-sm">
                {activeOverlayLabels.map((overlay) => (
                  <li key={overlay} className="flex items-center gap-2">
                    <span className="text-amber-600">✓</span>
                    <span className="capitalize">{overlay.replace(/_/g, " ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {documents && (
            <div className="rounded-lg border border-ink-700/10 p-4">
              <h3 className="font-semibold mb-4">Required Documents</h3>
              <div className="space-y-4">
                {documents.documents.map((doc) => (
                  <div key={doc.id} className="pb-4 border-b border-ink-700/5 last:pb-0 last:border-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <p className="font-medium text-sm">{doc.title}</p>
                        <p className="text-xs text-ink-500">{doc.category}</p>
                      </div>
                    </div>
                    <p className="text-sm text-ink-600 mb-2">{doc.description}</p>
                    <p className="text-xs text-ink-500">Trigger: {doc.trigger}</p>
                    {doc.specialist && (
                      <p className="text-xs text-ink-500 mt-1">Specialist: {doc.specialist}</p>
                    )}
                    {doc.referenceClause && (
                      <p className="text-xs text-ink-500 mt-1">Reference: {doc.referenceClause}</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 rounded bg-blue-50 border border-blue-200">
                <p className="text-xs text-blue-900">
                  <strong>Total documents required:</strong> {documents.totalCount}. Specialist documents:{" "}
                  {documents.specialistCount}.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function parseNullableNumber(value: string): number | null {
  if (!value.trim()) return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : null;
}

function normalizeProjectType(value: string): ProjectType {
  if (value === "accessory") return "accessory_building";
  if (value === "new_dwelling" || value === "extension" || value === "accessory_building" || value === "deck") {
    return value;
  }
  return "new_dwelling";
}

function getZoneCategory(zoneType: string): ZoneCategory {
  const value = zoneType.toLowerCase();
  if (value.includes("residential")) return "residential";
  if (value.includes("commercial") || value.includes("city centre")) return "commercial";
  if (value.includes("industrial")) return "industrial";
  if (value.includes("rural")) return "rural";
  if (value.includes("open space") || value.includes("open")) return "openspace";
  return "general";
}

function normalizeOverlayKey(sourceKey: string): string | null {
  const map: Record<string, string> = {
    liquefaction: "liquefaction",
    flood: "floodHigh",
    flood_ponding: "floodPonding",
    slope: "slopeHazard",
    heritage_item: "heritage",
    heritage_character: "heritageChar",
    residential_character: "residentialChar",
    tsunami: "tsunami",
    coastal_erosion: "coastalErosion",
    coastal_inundation: "coastalInundation",
    protected_vegetation: "protectedVeg",
    notable_trees: "notableTree",
  };
  return map[sourceKey] ?? null;
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
