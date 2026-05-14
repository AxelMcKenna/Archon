"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { ChevronIcon } from "@/components/ui/chevron";
import { createClientRowId } from "@/lib/format";
import { modernSelectArrowStyle, modernSelectClassName } from "../constants";
import type { Form6AEntry, Form6ALicensingClass, Form6ANonRestrictedEntry } from "../types";

const CELL_INPUT_CLASS = "w-full min-w-0 rounded-sm border border-ink-200 px-2.5 py-2 text-xs";
const DELETE_BUTTON_CLASS = "rounded-sm border border-red-200 px-2 py-1.5 text-xs text-red-700";

function CellInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <input
      className={CELL_INPUT_CLASS}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function updateAt<T>(prev: T[], index: number, patch: Partial<T>): T[] {
  return prev.map((row, i) => (i === index ? { ...row, ...patch } : row));
}

const TRADE_OPTIONS: Form6ALicensingClass[] = [
  "Carpenter",
  "Foundation",
  "Roofing",
  "Bricklaying and Blocklaying",
  "External Plastering",
  "Design — LBP1",
  "Design — LBP2",
  "Site — SL1",
  "Site — SL2",
  "Section 291 — Treated as Licensed",
];

export function Form6AInlineTable({
  completionDate,
  onCompletionDateChange,
  entries,
  nonRestrictedEntries,
  onChange,
  onChangeNonRestricted,
}: {
  completionDate: string;
  onCompletionDateChange: (value: string) => void;
  entries: Form6AEntry[];
  nonRestrictedEntries: Form6ANonRestrictedEntry[];
  onChange: Dispatch<SetStateAction<Form6AEntry[]>>;
  onChangeNonRestricted: Dispatch<SetStateAction<Form6ANonRestrictedEntry[]>>;
}) {
  const [lbpOpen, setLbpOpen] = useState(false);
  const [personnelOpen, setPersonnelOpen] = useState(false);

  useEffect(() => {
    if (entries.length > 0) setLbpOpen(true);
    if (nonRestrictedEntries.length > 0) setPersonnelOpen(true);
  }, [entries.length, nonRestrictedEntries.length]);

  return (
    <div className="space-y-3 text-xs">
      <div className="rounded-sm border border-ink-100 bg-surface-raised p-3">
        <label className="block text-xs font-medium text-ink-800">Completion date</label>
        <p className="mt-1 text-xs text-ink-600">
          All building work to be carried out under the building consent specified on this form was completed on:
        </p>
        <input
          type="date"
          value={completionDate}
          onChange={(event) => onCompletionDateChange(event.target.value)}
          className="mt-2 w-full max-w-56 rounded-sm border border-ink-200 px-2.5 py-2 text-sm"
        />
      </div>
      <button
        type="button"
        onClick={() => setLbpOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-sm border border-ink-200 bg-surface-raised px-3 py-2 text-left"
      >
        <span className="text-sm font-medium text-ink-900">Licensed Building Practitioners</span>
        <div className="flex items-center gap-3">
          {!lbpOpen && <span className="text-xs text-ink-600">{entries.length} LBPs added</span>}
          <span className="text-ink-500">
            <ChevronIcon direction={lbpOpen ? "up" : "down"} className="h-4 w-4" />
          </span>
        </div>
      </button>
      {lbpOpen && (
      <>
      <p className="text-xs leading-tight text-ink-700">
        The licensed building practitioner(s) who carried out or supervised the restricted building work is/are as follows:
      </p>
      <div className="overflow-x-auto rounded-sm border border-ink-100">
        <table className="min-w-[900px] w-full table-fixed text-xs">
          <thead className="bg-ink-50">
            <tr className="text-left align-top text-ink-600">
              <th className="w-[16%] px-2.5 py-2 leading-tight">Name</th>
              <th className="w-[20%] px-2.5 py-2 leading-tight">Licensing class</th>
              <th className="w-[30%] px-2.5 py-2 leading-tight">
                Licensed building practitioner number
                <div className="text-[11px] text-ink-500">
                  or registration number if treated as being licensed under section 291 of Act
                </div>
              </th>
              <th className="w-[26%] px-2.5 py-2 leading-tight">Particular work carried out or supervised</th>
              <th className="w-[8%] px-2.5 py-2 leading-tight">Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={entry.id} className="border-t border-ink-100">
                <td className="px-2.5 py-2">
                  <CellInput value={entry.lbpName} onChange={(v) => onChange((prev) => updateAt(prev, index, { lbpName: v }))} />
                </td>
                <td className="px-2.5 py-2">
                  <select
                    style={modernSelectArrowStyle}
                    className={modernSelectClassName}
                    value={entry.licensingClass}
                    onChange={(e) => onChange((prev) => updateAt(prev, index, { licensingClass: e.target.value as Form6ALicensingClass }))}
                  >
                    {TRADE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </td>
                <td className="px-2.5 py-2">
                  <CellInput value={entry.lbpOrRegistrationNumber} onChange={(v) => onChange((prev) => updateAt(prev, index, { lbpOrRegistrationNumber: v }))} />
                </td>
                <td className="px-2.5 py-2">
                  <CellInput value={entry.particularWorkCarriedOutOrSupervised} onChange={(v) => onChange((prev) => updateAt(prev, index, { particularWorkCarriedOutOrSupervised: v }))} />
                </td>
                <td className="px-2.5 py-2">
                  <button type="button" className={DELETE_BUTTON_CLASS} onClick={() => onChange((prev) => prev.filter((_, i) => i !== index))}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-sm border border-ink-200 px-3 py-2 text-xs"
          onClick={() =>
            onChange((prev) => [
              ...prev,
              {
                id: createClientRowId(),
                lbpName: "",
                licensingClass: "Carpenter",
                lbpOrRegistrationNumber: "",
                particularWorkCarriedOutOrSupervised: "",
              },
            ])
          }
        >
          Add LBP
        </button>
      </div>
      </>
      )}
      <button
        type="button"
        onClick={() => setPersonnelOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-sm border border-ink-200 bg-surface-raised px-3 py-2 text-left"
      >
        <span className="text-sm font-medium text-ink-900">Other Personnel</span>
        <div className="flex items-center gap-3">
          {!personnelOpen && <span className="text-xs text-ink-600">{nonRestrictedEntries.length} people added</span>}
          <span className="text-ink-500">
            <ChevronIcon direction={personnelOpen ? "up" : "down"} className="h-4 w-4" />
          </span>
        </div>
      </button>
      {personnelOpen && (
      <>
      <p className="text-xs leading-tight text-ink-700">
        The personnel who carried out building work other than restricted building work are as follows: list names, addresses, telephone numbers, and (where relevant and if not provided above) licensed building practitioner numbers or Plumbers, Gasfitters, and Drainlayers Board registration numbers
      </p>
      <div className="overflow-x-auto rounded-sm border border-ink-100">
        <table className="min-w-[900px] w-full table-fixed text-xs">
          <thead className="bg-ink-50">
            <tr className="text-left align-top text-ink-600">
              <th className="w-[15%] px-2.5 py-2 leading-tight">Name</th>
              <th className="w-[28%] px-2.5 py-2 leading-tight">Address</th>
              <th className="w-[16%] px-2.5 py-2 leading-tight">Phone number</th>
              <th className="w-[33%] px-2.5 py-2 leading-tight">
                LBP number or PGDB registration number
                <div className="text-[11px] text-ink-500">Where relevant and if not provided above</div>
              </th>
              <th className="w-[8%] px-2.5 py-2 leading-tight">Action</th>
            </tr>
          </thead>
          <tbody>
            {nonRestrictedEntries.map((entry, index) => (
              <tr key={entry.id} className="border-t border-ink-100">
                <td className="px-2.5 py-2"><CellInput value={entry.name} onChange={(v) => onChangeNonRestricted((prev) => updateAt(prev, index, { name: v }))} /></td>
                <td className="px-2.5 py-2"><CellInput value={entry.address} onChange={(v) => onChangeNonRestricted((prev) => updateAt(prev, index, { address: v }))} /></td>
                <td className="px-2.5 py-2"><CellInput value={entry.phoneNumbers} onChange={(v) => onChangeNonRestricted((prev) => updateAt(prev, index, { phoneNumbers: v }))} /></td>
                <td className="px-2.5 py-2"><CellInput value={entry.relevantLicenceOrRegistrationNumber} onChange={(v) => onChangeNonRestricted((prev) => updateAt(prev, index, { relevantLicenceOrRegistrationNumber: v }))} /></td>
                <td className="px-2.5 py-2"><button type="button" className={DELETE_BUTTON_CLASS} onClick={() => onChangeNonRestricted((prev) => prev.filter((_, i) => i !== index))}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-sm border border-ink-200 px-3 py-2 text-xs"
          onClick={() =>
            onChangeNonRestricted((prev) => [
              ...prev,
              {
                id: createClientRowId(),
                name: "",
                address: "",
                phoneNumbers: "",
                relevantLicenceOrRegistrationNumber: "",
              },
            ])
          }
        >
          Add person
        </button>
      </div>
      </>
      )}
    </div>
  );
}
