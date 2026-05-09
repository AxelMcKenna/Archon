/**
 * Per-tab agent configuration: opener question and suggestion chips.
 * Hardcoded for predictability + zero latency on hover.
 */

import type { TabSlug } from "@/lib/tab-summaries";

export interface TabAgentConfig {
  defaultOpener: string;
  suggestions: string[];
}

export const TAB_AGENT_CONFIG: Record<TabSlug, TabAgentConfig> = {
  overview: {
    defaultOpener: "Give me a one-paragraph status of this project.",
    suggestions: [
      "What's blocking lodgement?",
      "What should I do next?",
      "How's the overall health of this project?",
    ],
  },
  drawings: {
    defaultOpener: "Walk me through the flags on the latest plan upload.",
    suggestions: [
      "Show me only the high-severity flags",
      "Which flags relate to fire safety?",
      "What's the most recent plan analysis result?",
    ],
  },
  inspections: {
    defaultOpener: "What's the inspection status?",
    suggestions: [
      "What's overdue?",
      "What's the next inspection due?",
      "Which inspections still need bookings?",
    ],
  },
  rfis: {
    defaultOpener: "Summarize all open RFIs and their deadlines.",
    suggestions: [
      "Which items need a draft response?",
      "Anything past its response deadline?",
      "Which letter is most urgent?",
    ],
  },
  ccc: {
    defaultOpener: "What's blocking CCC sign-off?",
    suggestions: [
      "What certificates am I missing?",
      "List the documents I've already uploaded",
    ],
  },
  "application-prep": {
    defaultOpener: "What documents do I still need before lodgement?",
    suggestions: [
      "Which documents are pending review?",
      "Which are approved?",
      "What's the most common missing item for my project type?",
    ],
  },
  documents: {
    defaultOpener: "Give me an overview of all uploaded documents.",
    suggestions: [
      "Show me unapproved documents",
      "Which were uploaded most recently?",
    ],
  },
  risk: {
    defaultOpener: "Compute and explain my pre-lodgement risk score.",
    suggestions: [
      "How can I lower my risk?",
      "What's my biggest risk factor?",
    ],
  },
};
