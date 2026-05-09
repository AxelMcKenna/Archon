export default function Dashboard() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-semibold mb-8">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg border border-ink-200">
          <div className="text-sm text-ink-600">Active Projects</div>
          <div className="text-3xl font-bold mt-2">0</div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-ink-200">
          <div className="text-sm text-ink-600">RFIs Processed</div>
          <div className="text-3xl font-bold mt-2">0</div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-ink-200">
          <div className="text-sm text-ink-600">Pending Reviews</div>
          <div className="text-3xl font-bold mt-2">0</div>
        </div>
        <div className="bg-white p-6 rounded-lg border border-ink-200">
          <div className="text-sm text-ink-600">Completion Rate</div>
          <div className="text-3xl font-bold mt-2">—</div>
        </div>
      </div>
    </div>
  );
}
