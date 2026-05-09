export default function Settings() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-semibold mb-8">Settings</h1>
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-sm border border-ink-200">
          <h2 className="text-lg font-semibold mb-4">Account Settings</h2>
          <p className="text-ink-600">Manage your account preferences and profile.</p>
        </div>
        <div className="bg-white p-6 rounded-sm border border-ink-200">
          <h2 className="text-lg font-semibold mb-4">Notifications</h2>
          <p className="text-ink-600">Configure your notification preferences.</p>
        </div>
      </div>
    </div>
  );
}
