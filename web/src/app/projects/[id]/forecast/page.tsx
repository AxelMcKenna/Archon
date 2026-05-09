export default function ForecastPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <section className="rounded-2xl border border-ink-700/10 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-ink-500">
          Project Workflow
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900">Forecast</h1>
        <p className="mt-3 max-w-2xl text-sm text-ink-500">
          Coming soon. This space is reserved for forecasting consent progress, timing, and risk
          projections.
        </p>
      </section>

      <section className="rounded-2xl border border-dashed border-ink-700/20 bg-white p-12 text-center shadow-sm">
        <p className="text-base font-medium text-ink-900">Forecasting workspace</p>
        <p className="mt-2 text-sm text-ink-500">
          Placeholder shell only. Forecasting business logic has not been implemented yet.
        </p>
      </section>
    </div>
  );
}
