"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AiThinking } from "@/components/ai-thinking";

type ForecastResponse = {
  costs: {
    consentFee: number;
    mbieLevey: number;
    developmentContribution: number;
    total: number;
    breakdown: Array<{ label: string; amount: number }>;
    notes: string[];
    councilName: string;
  } | null;
  duration: {
    statutoryProcessingDays: number;
    rfiProbability: number;
    expectedRfiSuspensionDays: number;
    p50TotalElapsedDays: number;
    p90TotalElapsedDays: number;
    cccAdditionalDays: number;
    totalProjectDaysP50: number;
    totalProjectDaysP90: number;
    calendarWeeksP50: number;
    calendarWeeksP90: number;
    notes: string[];
  };
  risk: {
    overall: RiskDimension;
    consentComplexity: RiskDimension;
    costOverrun: RiskDimension;
    timeline: RiskDimension;
    siteRisk: RiskDimension;
    additionalSpecialistCostRange: { min: number; max: number };
  };
  councilName: string;
  dataFreshness: string;
  notes?: string[];
  disclaimer: string;
};

type RiskDimension = {
  name: string;
  level: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  score: number;
  summary: string;
  factors: string[];
  mitigations: string[];
};

export function ForecastingClient({
  projectId,
  initialPayload = null,
}: {
  projectId: string;
  initialPayload?: Record<string, unknown> | null;
}) {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(initialPayload !== null);
  const [error, setError] = useState<string | null>(
    initialPayload === null
      ? "Forecast data is unavailable until consent requirements are generated at least once."
      : null,
  );
  const [requestPayload, setRequestPayload] = useState<Record<string, unknown> | null>(
    initialPayload,
  );

  useEffect(() => {
    if (initialPayload) {
      setRequestPayload(initialPayload);
      setError(null);
    }
  }, [initialPayload]);

  async function fetchForecast(payload: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Unable to generate forecast.");
      }
      const json = (await response.json()) as ForecastResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate forecast.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (requestPayload) void fetchForecast(requestPayload);
  }, [requestPayload]);

  const riskCards = useMemo(() => {
    if (!data) return [];
    return [
      data.risk.overall,
      data.risk.consentComplexity,
      data.risk.costOverrun,
      data.risk.timeline,
      data.risk.siteRisk,
    ];
  }, [data]);

  return (
    <div className="space-y-6">
      {loading && (
        <AiThinking
          label="Generating forecast"
          hint="Pulling MBIE levies, council fees, and recent RFI rates for your council."
          variant="block"
        />
      )}
      {error && (
        <div className="rounded-sm border border-red-200 bg-red-50 p-6 text-sm text-red-800 shadow-depth">
          <p>{error}</p>
          <div className="mt-4 flex gap-3">
            {requestPayload && (
              <button
                onClick={() => void fetchForecast(requestPayload)}
                className="rounded-sm bg-red-700 px-3 py-2 text-xs font-medium text-white shadow-depth transition hover:bg-red-800 cursor-pointer"
              >
                Retry
              </button>
            )}
            <Link
              href={`/projects/${projectId}/application-prep`}
              className="rounded-sm border border-red-300 bg-surface-raised px-3 py-2 text-xs font-medium transition hover:bg-red-50 cursor-pointer"
            >
              Go to Lodgement
            </Link>
          </div>
        </div>
      )}

      {data && (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className="rounded-sm bg-surface-raised shadow-depth p-6">
            <h2 className="text-base font-semibold tracking-tight text-ink-900">Consent Costs</h2>
            {data.costs ? (
              <>
                <p className="mt-4 text-[28px] leading-none font-semibold tracking-tight tabular-nums">
                  ${data.costs.total.toLocaleString()}
                </p>
                <p className="mt-2 text-xs text-ink-500">Council: {data.costs.councilName}</p>
                <ul className="mt-5 space-y-2 text-sm border-t border-ink-200/70 pt-4">
                  {data.costs.breakdown.map((item) => (
                    <li key={item.label} className="flex justify-between text-ink-700">
                      <span>{item.label}</span>
                      <span className="tabular-nums">${item.amount.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
                <ul className="mt-4 space-y-1 text-xs text-ink-500">
                  {data.costs.notes.map((note) => <li key={note}>• {note}</li>)}
                </ul>
              </>
            ) : (
              <div className="mt-4 rounded-sm border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Construction value is missing. Add it in project details to see cost estimates.
                <div className="mt-2">
                  <Link href={`/projects/${projectId}/application-prep`} className="text-xs font-medium underline">
                    Go to project details
                  </Link>
                </div>
              </div>
            )}
            <p className="mt-5 text-xs text-ink-500 leading-relaxed">{data.disclaimer}</p>
          </section>

          <section className="rounded-sm bg-surface-raised shadow-depth p-6">
            <h2 className="text-base font-semibold tracking-tight text-ink-900">Consent Duration</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-sm bg-ink-50 ring-1 ring-ink-200/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">P50</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{data.duration.calendarWeeksP50}<span className="text-xs ml-1 text-ink-500 font-normal">weeks</span></p>
              </div>
              <div className="rounded-sm bg-ink-50 ring-1 ring-ink-200/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">P90</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{data.duration.calendarWeeksP90}<span className="text-xs ml-1 text-ink-500 font-normal">weeks</span></p>
              </div>
            </div>
            <DurationTimeline
              consentDays={data.duration.p50TotalElapsedDays}
              cccDays={data.duration.cccAdditionalDays}
              rfiProbability={data.duration.rfiProbability}
              rfiDays={data.duration.expectedRfiSuspensionDays}
            />
            <ul className="mt-3 space-y-1 text-xs text-ink-500">
              {data.duration.notes.map((note) => <li key={note}>• {note}</li>)}
            </ul>
          </section>

          <section className="rounded-sm bg-surface-raised shadow-depth p-6">
            <h2 className="text-base font-semibold tracking-tight text-ink-900">Risk Profile</h2>
            <div className="mt-4 space-y-2.5">
              {riskCards.map((card) => (
                <details key={card.name} className="group rounded-sm border border-ink-200/80 bg-surface-raised p-3.5 transition hover:border-ink-300">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink-900">{card.name}</span>
                      <span className={`rounded-sm px-2 py-0.5 text-[11px] font-semibold tracking-wide ${riskBadgeClass(card.level)}`}>
                        {card.level}
                      </span>
                    </div>
                    <div className="mt-2.5 h-1.5 rounded-full bg-ink-100 overflow-hidden">
                      <div className="h-full rounded-full bg-ink-900 transition-all" style={{ width: `${card.score}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-ink-500 leading-relaxed">{card.summary}</p>
                  </summary>
                  <div className="mt-3 space-y-2 text-xs text-ink-600 border-t border-ink-200/70 pt-3">
                    <div>
                      <p className="font-semibold text-ink-900">Factors</p>
                      {card.factors.map((factor) => <p key={factor} className="mt-0.5">• {factor}</p>)}
                    </div>
                    <div>
                      <p className="font-semibold text-ink-900">Mitigations</p>
                      {card.mitigations.map((item) => <p key={item} className="mt-0.5">• {item}</p>)}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function DurationTimeline({
  consentDays,
  cccDays,
  rfiProbability,
  rfiDays,
}: {
  consentDays: number;
  cccDays: number;
  rfiProbability: number;
  rfiDays: number;
}) {
  const rfiPct = Math.round(rfiProbability * 100);
  const rfiLikely = rfiProbability >= 0.5;
  const baseTotal = consentDays + cccDays;
  const worstTotal = baseTotal + rfiDays;
  const consentPct = (consentDays / worstTotal) * 100;
  const rfiPctW = (rfiDays / worstTotal) * 100;
  const cccPctW = (cccDays / worstTotal) * 100;

  return (
    <div className="mt-5 space-y-3">
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.18em] text-ink-500">
        <span>Lodgement</span>
        <span>CCC issued</span>
      </div>

      <div className="relative h-9">
        <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-ink-100" />
        <div className="absolute inset-y-0 left-0 flex h-9 items-stretch" style={{ width: "100%" }}>
          <div
            className="relative flex items-center justify-center bg-ink-900 text-[10px] font-medium text-white"
            style={{ width: `${consentPct}%` }}
          >
            <span className="px-1 tabular-nums">{consentDays} wd</span>
          </div>
          <div
            className="relative flex items-center justify-center bg-amber-300/70 text-[10px] font-medium text-amber-950"
            style={{
              width: `${rfiPctW}%`,
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(180,83,9,0.18) 0 4px, transparent 4px 8px)",
            }}
            title={`RFI suspension — ${rfiPct}% likely`}
          >
            <span className="px-1 tabular-nums whitespace-nowrap">+{rfiDays} wd</span>
          </div>
          <div
            className="relative flex items-center justify-center bg-ink-300 text-[10px] font-medium text-ink-900"
            style={{ width: `${cccPctW}%` }}
          >
            <span className="px-1 tabular-nums">+{cccDays} wd</span>
          </div>
        </div>
        <span
          className="absolute top-0 h-9 w-px bg-ink-900"
          style={{ left: `${consentPct}%` }}
          aria-hidden
        />
      </div>

      <div className="grid grid-cols-3 gap-3 text-[11px]">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-ink-900" />
            <span className="font-medium text-ink-900">Statutory</span>
          </div>
          <p className="text-ink-500">Lodgement → consent</p>
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-sm bg-amber-300"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(180,83,9,0.4) 0 2px, transparent 2px 4px)",
              }}
            />
            <span className={`font-medium ${rfiLikely ? "text-amber-900" : "text-ink-900"}`}>
              RFI risk
            </span>
            <span
              className={`ml-auto rounded-sm px-1 text-[10px] font-semibold tabular-nums ${
                rfiLikely ? "bg-amber-100 text-amber-900" : "bg-ink-100 text-ink-700"
              }`}
            >
              {rfiPct}%
            </span>
          </div>
          <p className="text-ink-500">Adds ~{rfiDays} wd if raised</p>
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-ink-300" />
            <span className="font-medium text-ink-900">CCC</span>
          </div>
          <p className="text-ink-500">Post-consent</p>
        </div>
      </div>
    </div>
  );
}

function riskBadgeClass(level: RiskDimension["level"]) {
  if (level === "LOW") return "bg-emerald-100 text-emerald-800";
  if (level === "MEDIUM") return "bg-amber-100 text-amber-800";
  if (level === "HIGH") return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}
