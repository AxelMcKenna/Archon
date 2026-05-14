import type { ExtractedEntities } from "@atlas/shared";

export function Facets({ entities }: { entities: ExtractedEntities }) {
  const rows: Array<[string, string[]]> = [
    ["clauses", entities.clause_references],
    ["documents", entities.document_references],
    ["standards", entities.standards_references],
    ["professionals", entities.professional_references],
  ];
  const dims = entities.dimensions.map((d) => `${d.value}${d.unit}`);
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="text-ink-500 w-20">{k}</dt>
          <dd className="font-mono">{v.length ? v.join(", ") : <span className="text-ink-500">—</span>}</dd>
        </div>
      ))}
      <div className="flex gap-2 col-span-2">
        <dt className="text-ink-500 w-20">dimensions</dt>
        <dd className="font-mono">{dims.length ? dims.join(", ") : <span className="text-ink-500">—</span>}</dd>
      </div>
    </dl>
  );
}
