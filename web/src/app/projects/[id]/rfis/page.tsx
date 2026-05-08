export default function RFIs({ params }: { params: { id: string } }) {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-semibold mb-8">RFIs</h1>
      <div className="bg-white p-8 rounded-lg border border-ink-200">
        <p className="text-ink-600">RFI letters and responses will appear here.</p>
      </div>
    </div>
  );
}
