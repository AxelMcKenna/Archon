"use client";

import { useState } from "react";
import {
  ValueEngineeringReview,
  type VESourceKind,
} from "@/app/plans/value-engineering-review";
import { UploadDrawingPanel } from "@/app/plans/upload-drawing-panel";

type DrawingOption = {
  id: string;
  filename: string;
  status: string;
  kind: VESourceKind;
};
type Project = { id: string; address: string; bca: string; project_type: string };

export function ValueEngineeringSection({
  drawings,
  project,
  initialId,
}: {
  drawings: DrawingOption[];
  project: Project;
  initialId?: string;
}) {
  const [pickedId, setPickedId] = useState<string>(
    initialId && drawings.some((d) => d.id === initialId)
      ? initialId
      : drawings[0]?.id ?? "",
  );
  const [showUpload, setShowUpload] = useState(drawings.length === 0);

  const picked = drawings.find((d) => d.id === pickedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm flex-1 min-w-[220px]">
          <span className="text-ink-500 block mb-1">Drawing</span>
          <select
            value={pickedId}
            onChange={(e) => setPickedId(e.target.value)}
            disabled={!drawings.length}
            className="w-full rounded-sm border border-ink-700/10 px-2 py-2 disabled:opacity-50"
          >
            {drawings.length === 0 && <option value="">No drawings yet</option>}
            {drawings.map((d) => (
              <option key={`${d.kind}-${d.id}`} value={d.id}>
                [{d.kind.toUpperCase()}] {d.filename}
                {d.status !== "analysed" ? ` · ${d.status}` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setShowUpload((s) => !s)}
          className="rounded-sm border border-ink-700/15 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 transition-colors cursor-pointer"
        >
          {showUpload ? "Cancel" : "Upload new"}
        </button>
      </div>

      {showUpload && (
        <UploadDrawingPanel
          projects={[project]}
          title="Upload a drawing"
          analyseRfi={false}
          onUploaded={(id) => {
            setPickedId(id);
            setShowUpload(false);
          }}
        />
      )}

      {picked ? (
        <ValueEngineeringReview
          key={`${picked.kind}-${picked.id}`}
          sourceId={picked.id}
          sourceKind={picked.kind}
        />
      ) : (
        !showUpload && (
          <p className="rounded-sm border border-ink-700/10 p-4 text-sm text-ink-500 italic">
            Upload or select a PDF or DXF drawing to run value engineering.
          </p>
        )
      )}
    </div>
  );
}
