import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getCccViewModel } from "@/lib/ccc";
import { CccValidationForm } from "./ccc-validation-form";

export const dynamic = "force-dynamic";

function statusTone(status: "green" | "amber" | "red") {
  if (status === "green") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "amber") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

function checklistTone(status: "complete" | "pending" | "missing") {
  if (status === "complete") return "text-emerald-700";
  if (status === "pending") return "text-amber-700";
  return "text-red-700";
}

function checklistIcon(status: "complete" | "pending" | "missing") {
  if (status === "complete") return "✓";
  if (status === "pending") return "•";
  return "✗";
}

export default async function CCC({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const ccc = await getCccViewModel(supabase, id);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Code Compliance Certificate</h1>
          <p className="mt-2 text-sm text-ink-600">
            Aggregated from consent, inspections, and uploaded project documents.
          </p>
        </div>
        <Link
          href={`/projects/${id}/ccc/export`}
          className={`rounded-sm px-4 py-2 text-sm font-medium border ${
            ccc.readinessStatus === "green"
              ? "bg-ink-900 text-white border-ink-900 hover:bg-ink-700"
              : "bg-ink-100 text-ink-500 border-ink-200 pointer-events-none"
          }`}
          aria-disabled={ccc.readinessStatus !== "green"}
        >
          Export CCC Package
        </Link>
      </header>

      {ccc.deadlineStatus !== "ok" && (
        <section
          className={`rounded-sm border px-4 py-3 ${
            ccc.deadlineStatus === "overdue"
              ? "border-red-300 bg-red-50 text-red-900"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          <p className="text-sm font-medium">
            {ccc.deadlineStatus === "overdue"
              ? `CCC deadline overdue by ${Math.abs(ccc.daysUntilDeadline ?? 0)} days.`
              : `CCC deadline is within 3 months (${ccc.daysUntilDeadline} days remaining).`}
          </p>
          {ccc.deadlineDate && (
            <p className="text-xs mt-1">
              Deadline: {ccc.deadlineDate} (2 years from grant date {ccc.consentGrantDate ?? "unknown"})
            </p>
          )}
        </section>
      )}

      <section className={`rounded-sm border p-5 ${statusTone(ccc.readinessStatus)}`}>
        <h2 className="text-xl font-semibold">CCC Readiness</h2>
        <p className="mt-2 text-sm">
          {ccc.readinessStatus === "green"
            ? "Ready to apply. All required inspections and documents are complete."
            : "Not ready to apply yet."}
        </p>
        <p className="mt-2 text-sm">
          Inspections: {ccc.completedInspections}/{ccc.totalInspections} complete · Required documents:{" "}
          {ccc.completedRequiredDocuments}/{ccc.totalRequiredDocuments} uploaded
        </p>
        {ccc.blockers.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {ccc.blockers.map((blocker) => (
              <li key={blocker}>• {blocker}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-sm border border-ink-200 p-5">
        <h2 className="text-xl font-semibold">Consent Reference Panel</h2>
        <p className="mt-3 text-sm text-ink-700">{ccc.consentPromise}</p>
        <p className="mt-2 text-xs text-ink-500">
          Grant date: {ccc.consentGrantDate ?? "Unknown"} · {ccc.consentGrantSource}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold mb-2">Required Inspection Schedule</h3>
            <ul className="space-y-1 text-sm text-ink-700">
              {ccc.requiredInspections.map((item) => (
                <li key={item}>• {item}</li>
              ))}
              {ccc.requiredInspections.length === 0 && <li>No inspection schedule extracted.</li>}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Required Documentation</h3>
            <ul className="space-y-1 text-sm text-ink-700">
              {ccc.requiredDocumentItems.map((item) => (
                <li key={item.key}>• {item.label}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-sm border border-ink-200 p-5">
        <h2 className="text-xl font-semibold">Inspection Checklist</h2>
        <ul className="mt-4 space-y-2">
          {ccc.inspectionChecklist.map((inspection) => (
            <li key={inspection.name} className="flex justify-between gap-4 text-sm">
              <span>{inspection.name}</span>
              <span className={`font-semibold ${checklistTone(inspection.status)}`}>
                {checklistIcon(inspection.status)} {inspection.status}
              </span>
            </li>
          ))}
          {ccc.inspectionChecklist.length === 0 && (
            <li className="text-sm text-ink-500">No inspection items extracted from consent notes.</li>
          )}
        </ul>
      </section>

      <section className="bg-white rounded-sm border border-ink-200 p-5">
        <h2 className="text-xl font-semibold">Document Checklist (Christchurch City Council)</h2>
        <ul className="mt-4 space-y-2">
          {[...ccc.requiredDocumentItems, ...ccc.conditionalDocumentItems].map((doc) => (
            <li key={doc.key} className="flex justify-between gap-4 text-sm">
              <span className="flex items-center gap-2">
                {doc.label}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    doc.requirementType === "required"
                      ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {doc.requirementType === "required" ? "Required" : "If Applicable"}
                </span>
              </span>
              <span className={`font-semibold ${checklistTone(doc.status === "complete" ? "complete" : "missing")}`}>
                {checklistIcon(doc.status === "complete" ? "complete" : "missing")}{" "}
                {doc.status === "missing" ? `${doc.label} — not uploaded` : `${doc.matchedDocuments.length} uploaded`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <CccValidationForm
        requiredItems={ccc.requiredDocumentItems}
        conditionalItems={ccc.conditionalDocumentItems}
        inspectionBlockers={ccc.blockers.filter((blocker) => blocker.startsWith("Inspection incomplete:"))}
      />
    </div>
  );
}
