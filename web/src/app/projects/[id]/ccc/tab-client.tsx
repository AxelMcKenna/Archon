"use client";

import { useMemo, useState } from "react";

type Status = "not_started" | "in_progress" | "complete" | "action_required";
type FeeStage = "Consent lodgement" | "During build" | "CCC application";

interface FeeRow {
  id: string;
  name: string;
  stage: FeeStage;
  amount: string;
  invoiceDate: string;
  invoiceNumber: string;
  paid: boolean;
  notes: string;
}

interface ChecklistRow {
  id: string;
  name: string;
  description: string;
  mandatory: boolean;
  status: "not_started" | "uploaded" | "accepted";
  fileName?: string;
}

const statusWeight: Record<Status, number> = {
  complete: 0,
  in_progress: 1,
  not_started: 2,
  action_required: 3,
};

const badgeClasses: Record<Status, string> = {
  not_started: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-amber-100 text-amber-800 border-amber-200",
  complete: "bg-emerald-100 text-emerald-800 border-emerald-200",
  action_required: "bg-red-100 text-red-800 border-red-200",
};

const checklistStatusBadge = (status: ChecklistRow["status"]): Status =>
  status === "accepted" ? "complete" : status === "uploaded" ? "in_progress" : "not_started";

function Collapsible({
  title,
  status,
  defaultOpen = true,
  children,
}: {
  title: string;
  status: Status;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-ink-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <span className={`rounded-full border px-2 py-0.5 text-xs ${badgeClasses[status]}`}>
            {status.replaceAll("_", " ")}
          </span>
        </div>
        <span className="text-ink-500" aria-hidden="true">
          {open ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m18 15-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </button>
      {open && <div className="border-t border-ink-100 p-4">{children}</div>}
    </section>
  );
}

export function CccTabClient({ projectId }: { projectId: string }) {
  const [submittedDocs, setSubmittedDocs] = useState<ChecklistRow[]>([
    { id: "2", name: "Record of Building Work", description: "From each LBP trade involved.", mandatory: true, status: "not_started" },
    { id: "3", name: "Certificate of Design Work", description: "From each LBP design practitioner.", mandatory: true, status: "not_started" },
    { id: "3a", name: "PS3 — Construction Statement", description: "From each contractor or installer who completed specialist work.", mandatory: true, status: "not_started" },
    { id: "4", name: "PS4 — Construction Review", description: "Final engineer review.", mandatory: true, status: "not_started" },
    { id: "5", name: "Electrical Code of Compliance", description: "Required for electrical work.", mandatory: true, status: "not_started" },
    { id: "6", name: "Gasfitting Code of Compliance", description: "Only if gas work included.", mandatory: false, status: "not_started" },
    { id: "7", name: "Test certificate for potable water", description: "Required where potable water testing applies.", mandatory: false, status: "not_started" },
    { id: "8", name: "Site inspection reports conducted by an engineer", description: "Required if engineering inspections were part of consented work.", mandatory: false, status: "not_started" },
    { id: "9", name: "Form B-068 — Specified Systems Declaration", description: "Required if specified systems exist.", mandatory: false, status: "not_started" },
    { id: "10", name: "Form B-065 — Accessible Facilities Upgrade Report", description: "Required if accessible facilities were included or modified.", mandatory: false, status: "not_started" },
  ]);

  const [fees, setFees] = useState<FeeRow[]>([
    { id: "fee-1", name: "Building consent processing fee", stage: "Consent lodgement", amount: "", invoiceDate: "", invoiceNumber: "", paid: false, notes: "" },
    { id: "fee-2", name: "MBIE building levy", stage: "Consent lodgement", amount: "", invoiceDate: "", invoiceNumber: "", paid: false, notes: "" },
    { id: "fee-3", name: "BRANZ levy", stage: "Consent lodgement", amount: "", invoiceDate: "", invoiceNumber: "", paid: false, notes: "" },
    { id: "fee-4", name: "Base inspection fee", stage: "During build", amount: "", invoiceDate: "", invoiceNumber: "", paid: false, notes: "" },
    { id: "fee-5", name: "CCC processing fee", stage: "CCC application", amount: "", invoiceDate: "", invoiceNumber: "", paid: false, notes: "" },
  ]);
  const [showPaidFees, setShowPaidFees] = useState(true);

  const inspections: Array<{ type: string; scheduled: string; status: string; notes: string }> = [];

  const mandatory = submittedDocs.filter((d) => d.mandatory);
  const conditional = submittedDocs.filter((d) => !d.mandatory);
  const doneCount = submittedDocs.filter((d) => d.status !== "not_started").length;
  const totalCount = submittedDocs.length;
  const inspectionsPassed = inspections.every((i) => i.status === "passed");
  const feeAmounts = fees.map((f) => Number(f.amount || 0));
  const totalInvoiced = feeAmounts.reduce((s, a) => s + (Number.isFinite(a) ? a : 0), 0);
  const totalPaid = fees.reduce((sum, fee, idx) => sum + (fee.paid ? Number(fee.amount || 0) || 0 : 0), 0);
  const outstandingTotal = Math.max(totalInvoiced - totalPaid, 0);
  const mandatoryReady = mandatory.every((d) => d.status !== "not_started");

  const sectionStatus = useMemo(() => {
    const docsStatus: Status = mandatoryReady ? "in_progress" : "action_required";
    const inspectionsStatus: Status = inspectionsPassed ? "complete" : "in_progress";
    const feesStatus: Status = outstandingTotal === 0 ? "complete" : "action_required";
    const submitStatus: Status = mandatoryReady && inspectionsPassed && outstandingTotal === 0 ? "complete" : "not_started";
    const statusBar: Status = "in_progress";
    return {
      statusBar,
      docs: docsStatus,
      inspections: inspectionsStatus,
      fees: feesStatus,
      submit: submitStatus,
    };
  }, [mandatoryReady, inspectionsPassed, outstandingTotal]);

  const overall: Status = (Object.values(sectionStatus) as Status[]).reduce((worst, current) =>
    statusWeight[current] > statusWeight[worst] ? current : worst,
  );

  const stageOrder: Record<FeeStage, number> = {
    "Consent lodgement": 0,
    "During build": 1,
    "CCC application": 2,
  };
  const sortedFees = [...fees].sort((a, b) => stageOrder[a.stage] - stageOrder[b.stage]);
  const outstandingFees = sortedFees.filter((f) => !f.paid);
  const paidFees = sortedFees.filter((f) => f.paid);

  function updateFee(id: string, patch: Partial<FeeRow>) {
    setFees((prev) => prev.map((fee) => (fee.id === id ? { ...fee, ...patch } : fee)));
  }
  function addFee() {
    setFees((prev) => [
      ...prev,
      {
        id: `fee-${Date.now()}`,
        name: "",
        stage: "During build",
        amount: "",
        invoiceDate: "",
        invoiceNumber: "",
        paid: false,
        notes: "",
      },
    ]);
  }
  function deleteFee(id: string) {
    setFees((prev) => prev.filter((fee) => fee.id !== id));
  }
  function formatNZD(value: number) {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: "NZD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">Code Compliance Certificate</h1>
        <p className="mt-1 text-sm text-ink-600">Project {projectId} · Christchurch City Council</p>
      </header>

      <Collapsible title="1. Status Bar" status={sectionStatus.statusBar}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Documents submitted" value={`${doneCount} of ${totalCount}`} />
          <Metric label="Consent issue date" value="Not set" />
          <Metric label="Consent expiry (2 years)" value="Not set" />
          <Metric label="CCC application submitted" value="Not submitted" />
          <Metric label="Overall tab status" value={overall.replaceAll("_", " ")} />
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-ink-900" style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }} />
        </div>
      </Collapsible>

      <Collapsible title="2. Document Checklist" status={sectionStatus.docs}>
        <h3 className="mb-2 text-sm font-semibold text-ink-900">Mandatory</h3>
        <ChecklistTable rows={mandatory} onUpload={(id) => setSubmittedDocs((prev) => prev.map((d) => d.id === id ? { ...d, status: "uploaded", fileName: "document_upload.pdf" } : d))} />
        <h3 className="mb-2 mt-4 text-sm font-semibold text-ink-900">Conditional</h3>
        <ChecklistTable rows={conditional} onUpload={(id) => setSubmittedDocs((prev) => prev.map((d) => d.id === id ? { ...d, status: "uploaded", fileName: "document_upload.pdf" } : d))} />
        <p className="mt-3 text-xs text-ink-500">Unassigned files can be assigned to checklist rows from the Documents tab.</p>
      </Collapsible>

      <Collapsible title="3. Inspections Tracker" status={sectionStatus.inspections}>
        <div className="rounded-md border border-dashed border-ink-300 bg-ink-50/40 px-4 py-6 text-center text-sm text-ink-600">
          No inspections loaded yet.
        </div>
      </Collapsible>

      <Collapsible title="4. Fees Summary" status={sectionStatus.fees}>
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          All outstanding fees must be cleared before a Code Compliance Certificate can be issued. This includes any fees incurred during the build that may not have been invoiced at consent lodgement. Note: administration costs are payable even if a CCC application is not accepted.
        </p>

        <div className="mb-3">
          <button
            type="button"
            onClick={addFee}
            className="rounded-md border border-ink-200 px-3 py-2 text-sm hover:bg-ink-50"
          >
            Add fee
          </button>
        </div>

        <div className="space-y-3">
          {outstandingFees.map((fee) => (
            <FeeRowEditor
              key={fee.id}
              fee={fee}
              muted={false}
              onUpdate={updateFee}
              onDelete={deleteFee}
            />
          ))}

          {paidFees.length > 0 && (
            <div className="rounded-md border border-ink-200 bg-slate-50 p-3">
              <button
                type="button"
                onClick={() => setShowPaidFees((v) => !v)}
                className="text-sm font-medium text-ink-700"
              >
                {showPaidFees ? "Hide paid fees" : `Show paid fees (${paidFees.length})`}
              </button>
              {showPaidFees && (
                <div className="mt-2 space-y-2">
                  {paidFees.map((fee) => (
                    <FeeRowEditor
                      key={fee.id}
                      fee={fee}
                      muted
                      onUpdate={updateFee}
                      onDelete={deleteFee}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 mt-4 rounded-md border border-ink-200 bg-white p-3 shadow-sm">
          <div className="grid gap-2 text-sm sm:grid-cols-4">
            <div>
              <p className="text-ink-500">Total invoiced</p>
              <p className="font-semibold">{formatNZD(totalInvoiced)}</p>
            </div>
            <div>
              <p className="text-ink-500">Total paid</p>
              <p className="font-semibold">{formatNZD(totalPaid)}</p>
            </div>
            <div>
              <p className="text-ink-500">Total outstanding</p>
              <p className={`font-semibold ${outstandingTotal > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                {formatNZD(outstandingTotal)}
              </p>
            </div>
            <div>
              <p className="text-ink-500">Status</p>
              <p className={`font-semibold ${outstandingTotal > 0 ? "text-red-700" : "text-emerald-700"}`}>
                {outstandingTotal > 0
                  ? "Fees outstanding — CCC cannot be submitted"
                  : "All fees cleared — ready to proceed"}
              </p>
            </div>
          </div>
        </div>
      </Collapsible>

      <Collapsible title="5. Submit Application" status={sectionStatus.submit}>
        <p className="text-sm text-ink-700">
          {sectionStatus.submit === "complete"
            ? "Ready to submit."
            : "Submission locked until all mandatory documents are uploaded, inspections passed, and fees cleared."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="https://onlineservices.ccc.govt.nz"
            target="_blank"
            rel="noreferrer"
            className={`rounded-md px-3 py-2 text-sm ${sectionStatus.submit === "complete" ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-500 pointer-events-none"}`}
          >
            Submit via CCC Online Services
          </a>
          <button
            type="button"
            disabled={sectionStatus.submit !== "complete"}
            className="rounded-md border border-ink-200 px-3 py-2 text-sm disabled:opacity-50"
          >
            Download B-011
          </button>
        </div>
      </Collapsible>

    </div>
  );
}

function FeeRowEditor({
  fee,
  muted,
  onUpdate,
  onDelete,
}: {
  fee: FeeRow;
  muted: boolean;
  onUpdate: (id: string, patch: Partial<FeeRow>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={`rounded-md border p-3 ${muted ? "border-slate-200 bg-slate-100 text-slate-600" : "border-ink-200 bg-white"}`}>
      <div className="grid gap-2 md:grid-cols-8">
        <input
          value={fee.name}
          onChange={(e) => onUpdate(fee.id, { name: e.target.value })}
          placeholder="Fee name / description"
          className="md:col-span-2 rounded border border-ink-200 px-2 py-1.5 text-sm"
        />
        <select
          value={fee.stage}
          onChange={(e) => onUpdate(fee.id, { stage: e.target.value as FeeStage })}
          className="rounded border border-ink-200 px-2 py-1.5 text-sm"
        >
          <option>Consent lodgement</option>
          <option>During build</option>
          <option>CCC application</option>
        </select>
        <input
          type="number"
          min="0"
          step="0.01"
          value={fee.amount}
          onChange={(e) => onUpdate(fee.id, { amount: e.target.value })}
          placeholder="0.00"
          className="rounded border border-ink-200 px-2 py-1.5 text-sm"
        />
        <input
          type="date"
          value={fee.invoiceDate}
          onChange={(e) => onUpdate(fee.id, { invoiceDate: e.target.value })}
          className="rounded border border-ink-200 px-2 py-1.5 text-sm"
        />
        <input
          value={fee.invoiceNumber}
          onChange={(e) => onUpdate(fee.id, { invoiceNumber: e.target.value })}
          placeholder="Invoice #"
          className="rounded border border-ink-200 px-2 py-1.5 text-sm"
        />
        <label className="inline-flex items-center gap-2 rounded border border-ink-200 px-2 py-1.5 text-sm">
          <input
            type="checkbox"
            checked={fee.paid}
            onChange={(e) => onUpdate(fee.id, { paid: e.target.checked })}
          />
          Paid
        </label>
        <button
          type="button"
          onClick={() => onDelete(fee.id)}
          className="rounded border border-red-200 px-2 py-1.5 text-sm text-red-700 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
      <input
        value={fee.notes}
        onChange={(e) => onUpdate(fee.id, { notes: e.target.value })}
        placeholder="Notes (optional)"
        className="mt-2 w-full rounded border border-ink-200 px-2 py-1.5 text-sm"
      />
      <div className="mt-2">
        <span className={`rounded-full border px-2 py-0.5 text-xs ${fee.paid ? "bg-emerald-100 text-emerald-800 border-emerald-200" : fee.amount ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-slate-100 text-slate-700 border-slate-200"}`}>
          {fee.paid ? "Paid" : fee.amount ? "Invoiced, unpaid" : "Not yet invoiced"}
        </span>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink-100 px-3 py-2">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink-900">{value}</p>
    </div>
  );
}

function ChecklistTable({
  rows,
  onUpload,
}: {
  rows: ChecklistRow[];
  onUpload: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-ink-100">
      <table className="min-w-full text-sm">
        <thead className="bg-ink-50 text-left text-ink-500">
          <tr>
            <th className="px-3 py-2">Document</th>
            <th className="px-3 py-2">Description</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const badge = checklistStatusBadge(row.status);
            return (
              <tr key={row.id} className="border-t border-ink-100">
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{row.description}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${badgeClasses[badge]}`}>
                    {row.status.replaceAll("_", " ")}
                  </span>
                  {row.fileName && <div className="mt-1 text-xs text-ink-700">✓ {row.fileName}</div>}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onUpload(row.id)}
                    className="rounded-md border border-ink-200 px-2 py-1 text-xs hover:bg-ink-50"
                  >
                    Upload
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
