/**
 * Per-tab llm-gateway configuration: opener question and suggestion chips.
 *
 * Each suggestion is grounded in the actual tool the llm-gateway will invoke:
 *   - get_project_workflow → cross-domain status (RFIs, wiki, plans, inspections)
 *   - get_forecast → cost / duration / risk dimensions
 *   - read_tab → per-tab list reads
 *   - get_plan_flags → full flag list with severity/category/page-refs
 *   - get_rfi_letter → letter contents
 *   - classify_rfi_letter / draft_rfi_response → AI ops on RFI items
 *
 * Hardcoded for predictability + zero latency on hover.
 */

import type { TabSlug } from "@/lib/tab-summaries";

export interface TabAgentConfig {
  defaultOpener: string;
  suggestions: string[];
}

export const TAB_AGENT_CONFIG: Record<TabSlug, TabAgentConfig> = {
  overview: {
    defaultOpener:
      "Give me a cross-domain snapshot — RFIs, documents, plan flags, inspections, plus the consent forecast.",
    suggestions: [
      "What's outstanding right now across RFIs, documents, plan flags, and inspections?",
      "Walk me through the forecast — total cost, P50/P90 timeline, and the highest risk dimension",
      "What's the latest activity — most recent RFI, document, plan, and inspection?",
    ],
  },
  drawings: {
    defaultOpener: "Walk me through the latest plan upload and the flags on it.",
    suggestions: [
      "List the must-resolve flags from the latest plan with page refs and quotes",
      "Group the latest plan's flags by category (fire, structural, accessibility)",
      "Compare must-resolve flag counts across my last few plan uploads",
    ],
  },
  inspections: {
    defaultOpener:
      "Summarize my inspection schedule — what's done, what's next, what's overdue.",
    suggestions: [
      "Which inspections are overdue based on due_date?",
      "What's the next pending inspection and is it booked?",
      "Which inspections still don't have a booking date?",
    ],
  },
  rfis: {
    defaultOpener: "Summarize all RFI letters and their response deadlines.",
    suggestions: [
      "Open the most recent letter, classify the items, and flag the most urgent",
      "Which letters are still open and how soon are the deadlines?",
      "Draft a response for the most urgent open item",
    ],
  },
  ccc: {
    defaultOpener:
      "List the CCC certificates I've uploaded and their review status.",
    suggestions: [
      "Which CCC certificates are still pending review?",
      "What's the most recent CCC certificate uploaded?",
    ],
  },
  "application-prep": {
    defaultOpener:
      "Summarize the documents I've uploaded for lodgement and their review status.",
    suggestions: [
      "Which uploaded documents are pending review?",
      "Break down what I've uploaded by document_type",
      "What did I upload most recently, and what was it linked to?",
    ],
  },
  documents: {
    defaultOpener:
      "Give me an overview of all uploaded attachments — counts by status and document type.",
    suggestions: [
      "Show me documents that aren't approved yet",
      "Break attachments down by document_type",
      "What were the last few documents uploaded?",
    ],
  },
};
