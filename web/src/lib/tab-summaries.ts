/**
 * Per-tab summary readers — mirror the agent's `read_tab` Python tool so the
 * sphere can compute its own intent/badge without invoking the LLM.
 *
 * Returns a TabSummary the AgentTrigger uses to:
 *   - decide intent (alert vs calm vs active)
 *   - render a badge count
 */

import { getSupabaseBrowser } from "@/lib/supabase/client";

export type TabSlug =
  | "overview"
  | "drawings"
  | "inspections"
  | "rfis"
  | "ccc"
  | "application-prep"
  | "documents"
  | "risk";

export interface TabSummary {
  intent: "calm" | "active" | "alert";
  badge?: number;
  /** Short headline like "8 inspections, 1 overdue" — used in tooltip. */
  headline?: string;
}

const EMPTY: TabSummary = { intent: "calm" };

export async function loadTabSummary(
  tab: TabSlug,
  projectId: string,
): Promise<TabSummary> {
  const sb = getSupabaseBrowser();
  try {
    switch (tab) {
      case "overview": {
        const { data } = await sb
          .from("projects")
          .select("status")
          .eq("id", projectId)
          .maybeSingle();
        const status = data?.status as string | undefined;
        const alert = status === "rfi-open" || status === "decision-pending";
        return {
          intent: alert ? "alert" : "calm",
          headline: status ? `Status: ${status}` : undefined,
        };
      }

      case "drawings": {
        const { data } = await sb
          .from("plan_uploads")
          .select("analysis")
          .eq("project_id", projectId);
        let total = 0;
        let high = 0;
        for (const row of data ?? []) {
          const flags = (row.analysis as { flags?: { severity?: string }[] } | null)?.flags ?? [];
          total += flags.length;
          high += flags.filter((f) => f.severity === "high").length;
        }
        return {
          intent: high > 0 ? "alert" : total > 0 ? "active" : "calm",
          badge: total || undefined,
          headline:
            total === 0
              ? "No flags yet"
              : `${total} flag${total === 1 ? "" : "s"}${high ? `, ${high} high` : ""}`,
        };
      }

      case "inspections": {
        const { data } = await sb
          .from("project_inspections")
          .select("status,due_date,deleted")
          .eq("project_id", projectId)
          .eq("deleted", false);
        const today = new Date().toISOString().slice(0, 10);
        let overdue = 0;
        let outstanding = 0;
        for (const r of data ?? []) {
          if (r.status !== "Conducted" && r.status !== "Passed") {
            outstanding++;
            if (r.due_date && r.due_date < today) overdue++;
          }
        }
        return {
          intent: overdue > 0 ? "alert" : outstanding > 0 ? "active" : "calm",
          badge: outstanding || undefined,
          headline:
            outstanding === 0
              ? "All inspections complete"
              : `${outstanding} outstanding${overdue ? `, ${overdue} overdue` : ""}`,
        };
      }

      case "rfis": {
        const { data, count } = await sb
          .from("rfi_letters")
          .select("response_deadline,status", { count: "exact" })
          .eq("project_id", projectId);
        const today = new Date().toISOString().slice(0, 10);
        const overdue = (data ?? []).filter(
          (r) => r.status !== "responded" && r.response_deadline && r.response_deadline < today,
        ).length;
        const open = count ?? 0;
        return {
          intent: overdue > 0 ? "alert" : open > 0 ? "active" : "calm",
          badge: open || undefined,
          headline:
            open === 0
              ? "No RFIs"
              : `${open} letter${open === 1 ? "" : "s"}${overdue ? `, ${overdue} past deadline` : ""}`,
        };
      }

      case "application-prep": {
        const { data, count } = await sb
          .from("attachments")
          .select("document_status", { count: "exact" })
          .eq("project_id", projectId);
        const missing = (data ?? []).filter(
          (r) => r.document_status === "pending" || r.document_status === "missing",
        ).length;
        return {
          intent: missing > 0 ? "alert" : (count ?? 0) > 0 ? "active" : "calm",
          badge: missing || undefined,
          headline:
            missing === 0
              ? `${count ?? 0} document${count === 1 ? "" : "s"} ready`
              : `${missing} pending`,
        };
      }

      case "ccc": {
        const { count } = await sb
          .from("attachments")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .eq("document_type", "certificates");
        const c = count ?? 0;
        return {
          intent: c === 0 ? "alert" : "calm",
          headline: c === 0 ? "No certificates yet" : `${c} certificate${c === 1 ? "" : "s"}`,
        };
      }

      case "documents": {
        const { count } = await sb
          .from("attachments")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId);
        return { intent: "calm", headline: `${count ?? 0} document${count === 1 ? "" : "s"}` };
      }

      // Tabs without a dedicated table yet.
      case "risk":
      default:
        return EMPTY;
    }
  } catch {
    return EMPTY;
  }
}
