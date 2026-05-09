import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATE_COLORS: Record<string, string> = {
  agree: "bg-emerald-100 text-emerald-800",
  ai_extends_rules: "bg-sky-100 text-sky-800",
  disagree: "bg-amber-100 text-amber-800",
  rules_override: "bg-violet-100 text-violet-800",
};

export default async function ReconciliationAdmin() {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("reconciliation_log")
    .select("id, state, final_category, rules_output, ai_output, rules_version, prompt_version, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold mb-6">Reconciliation log</h1>
      <p className="text-sm text-ink-500 mb-4">
        Latest 100 entries. Use the four states to triage rule + prompt changes.
      </p>
      <table className="w-full text-sm">
        <thead className="text-left text-ink-500 border-b border-ink-700/10">
          <tr>
            <th className="py-2">When</th>
            <th>State</th>
            <th>Final category</th>
            <th>Rules vs AI</th>
            <th>Versions</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((row) => {
            const rulesCat = (row.rules_output as { primary_category?: string })?.primary_category ?? "—";
            const aiCat = (row.ai_output as { primary_category?: string })?.primary_category ?? "—";
            return (
              <tr key={row.id} className="border-b border-ink-700/5 align-top">
                <td className="py-2 text-ink-500">{new Date(row.created_at).toLocaleString()}</td>
                <td>
                  <span className={`inline-block rounded-sm px-2 py-0.5 text-xs ${STATE_COLORS[row.state] ?? ""}`}>
                    {row.state}
                  </span>
                </td>
                <td className="font-mono text-xs">{row.final_category}</td>
                <td className="font-mono text-xs">{rulesCat} → {aiCat}</td>
                <td className="text-xs text-ink-500">r{row.rules_version} / p{row.prompt_version}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
