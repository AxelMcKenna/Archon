export default function Settings() {
  return (
    <div className="max-w-6xl mx-auto px-8 py-10 space-y-8">
      <header className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">
          Workspace
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Settings
        </h1>
      </header>
      <div className="space-y-5">
        <section className="rounded-sm bg-surface-raised ring-1 ring-ink-700/10 shadow-card p-6">
          <h2 className="text-base font-semibold tracking-tight text-ink-900">
            Account Settings
          </h2>
          <p className="mt-2 text-sm text-ink-600">
            Manage your account preferences and profile.
          </p>
        </section>
        <section className="rounded-sm bg-surface-raised ring-1 ring-ink-700/10 shadow-card p-6">
          <h2 className="text-base font-semibold tracking-tight text-ink-900">
            Notifications
          </h2>
          <p className="mt-2 text-sm text-ink-600">
            Configure your notification preferences.
          </p>
        </section>
      </div>
    </div>
  );
}
