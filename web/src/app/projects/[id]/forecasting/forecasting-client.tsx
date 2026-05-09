"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  address,
  projectType,
}: {
  projectId: string;
  address: string;
  projectType: string;
}) {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestPayload, setRequestPayload] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(`forecast-context:${projectId}`);
    if (!raw) {
      setLoading(false);
      setError("Forecast data is unavailable until consent requirements are generated at least once.");
      return;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    setRequestPayload(parsed);
  }, [projectId]);

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
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <header className="rounded-2xl border border-ink-700/10 bg-white p-6">
        <h1 className="text-2xl font-semibold text-ink-900">Forecasting</h1>
        <p className="mt-1 text-sm text-ink-500">{address} · {projectType}</p>
        {data && (
          <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
            <span>MBIE data freshness: {new Date(data.dataFreshness).toLocaleString()}</span>
            {requestPayload && (
              <button
                onClick={() => void fetchForecast(requestPayload)}
                className="rounded border border-ink-700/20 px-2 py-1 hover:bg-ink-50"
              >
                Refresh
              </button>
            )}
          </div>
        )}
      </header>

      {loading && <div className="rounded-xl border border-ink-700/10 bg-white p-6 text-sm">Generating forecast...</div>}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          <p>{error}</p>
          <div className="mt-3 flex gap-3">
            {requestPayload && (
              <button
                onClick={() => void fetchForecast(requestPayload)}
                className="rounded-lg bg-red-700 px-3 py-2 text-xs font-medium text-white"
              >
                Retry
              </button>
            )}
            <Link href={`/projects/${projectId}/consent-assessment`} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium">
              Go to Consent Assessment
            </Link>
          </div>
        </div>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-ink-700/10 bg-white p-6">
            <h2 className="text-lg font-semibold">Consent Costs</h2>
            {data.costs ? (
              <>
                <p className="mt-3 text-3xl font-semibold">${data.costs.total.toLocaleString()}</p>
                <p className="text-xs text-ink-500">Council: {data.costs.councilName}</p>
                <ul className="mt-4 space-y-2 text-sm">
                  {data.costs.breakdown.map((item) => (
                    <li key={item.label} className="flex justify-between">
                      <span>{item.label}</span>
                      <span>${item.amount.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
                <ul className="mt-3 space-y-1 text-xs text-ink-500">
                  {data.costs.notes.map((note) => <li key={note}>• {note}</li>)}
                </ul>
              </>
            ) : (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Construction value is missing. Add it in project details to see cost estimates.
                <div className="mt-2">
                  <Link href={`/projects/${projectId}/consent-assessment`} className="text-xs font-medium underline">
                    Go to project details
                  </Link>
                </div>
              </div>
            )}
            <p className="mt-4 text-xs text-ink-500">{data.disclaimer}</p>
          </section>

          <section className="rounded-2xl border border-ink-700/10 bg-white p-6">
            <h2 className="text-lg font-semibold">Consent Duration</h2>
            <p className="mt-3 text-sm">P50: <strong>{data.duration.calendarWeeksP50}</strong> weeks</p>
            <p className="text-sm">P90: <strong>{data.duration.calendarWeeksP90}</strong> weeks</p>
            <div className="mt-4 rounded-lg bg-ink-50 p-3 text-xs text-ink-600">
              Lodgement → Consent ({data.duration.p50TotalElapsedDays} wd) → CCC (+{data.duration.cccAdditionalDays} wd)
            </div>
            <p className="mt-4 text-sm">
              There is a <strong>{Math.round(data.duration.rfiProbability * 100)}%</strong> chance of an RFI, typically adding{" "}
              <strong>{data.duration.expectedRfiSuspensionDays}</strong> working days.
            </p>
            <ul className="mt-3 space-y-1 text-xs text-ink-500">
              {data.duration.notes.map((note) => <li key={note}>• {note}</li>)}
            </ul>
          </section>

          <section className="rounded-2xl border border-ink-700/10 bg-white p-6">
            <h2 className="text-lg font-semibold">Risk Profile</h2>
            <div className="mt-4 space-y-3">
              {riskCards.map((card) => (
                <details key={card.name} className="rounded-lg border border-ink-700/10 p-3">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{card.name}</span>
                      <span className={`rounded px-2 py-1 text-xs ${riskBadgeClass(card.level)}`}>
                        {card.level}
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded bg-ink-100">
                      <div className="h-2 rounded bg-ink-900" style={{ width: `${card.score}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-ink-500">{card.summary}</p>
                  </summary>
                  <div className="mt-2 space-y-2 text-xs text-ink-600">
                    <div>
                      <p className="font-medium">Factors</p>
                      {card.factors.map((factor) => <p key={factor}>• {factor}</p>)}
                    </div>
                    <div>
                      <p className="font-medium">Mitigations</p>
                      {card.mitigations.map((item) => <p key={item}>• {item}</p>)}
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

function riskBadgeClass(level: RiskDimension["level"]) {
  if (level === "LOW") return "bg-emerald-100 text-emerald-800";
  if (level === "MEDIUM") return "bg-amber-100 text-amber-800";
  if (level === "HIGH") return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}
