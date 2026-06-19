export default function Help() {
  return (
    <div className="max-w-6xl mx-auto px-8 py-10 space-y-8">
      <header className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-ink-500">
          Resources
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Help & Documentation
        </h1>
      </header>
      <div className="space-y-5">
        <section className="rounded-sm bg-surface-raised shadow-depth p-6">
          <h2 className="text-base font-semibold tracking-tight text-ink-900">
            Getting Started
          </h2>
          <p className="mt-2 text-sm text-ink-600">
            Learn the basics of using Arro.
          </p>
        </section>
        <section className="rounded-sm bg-surface-raised shadow-depth p-6">
          <h2 className="text-base font-semibold tracking-tight text-ink-900">FAQ</h2>
          <p className="mt-2 text-sm text-ink-600">
            Find answers to common questions.
          </p>
        </section>
        <section className="rounded-sm bg-surface-raised shadow-depth p-6">
          <h2 className="text-base font-semibold tracking-tight text-ink-900">
            Support
          </h2>
          <p className="mt-2 text-sm text-ink-600">
            Contact support for additional help.
          </p>
        </section>
      </div>
    </div>
  );
}
