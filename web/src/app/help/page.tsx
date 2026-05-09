export default function Help() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-semibold mb-8">Help & Documentation</h1>
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg border border-ink-200">
          <h2 className="text-lg font-semibold mb-2">Getting Started</h2>
          <p className="text-ink-600">Learn the basics of using ConsentIQ.</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-ink-200">
          <h2 className="text-lg font-semibold mb-2">FAQ</h2>
          <p className="text-ink-600">Find answers to common questions.</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-ink-200">
          <h2 className="text-lg font-semibold mb-2">Support</h2>
          <p className="text-ink-600">Contact support for additional help.</p>
        </div>
      </div>
    </div>
  );
}
