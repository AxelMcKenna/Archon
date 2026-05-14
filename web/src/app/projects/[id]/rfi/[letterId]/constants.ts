import type { ReconLog } from "./types";

export const STATE_STYLE: Record<ReconLog["state"], string> = {
  agree: "bg-emerald-100 text-emerald-800",
  ai_extends_rules: "bg-sky-100 text-sky-800",
  disagree: "bg-amber-100 text-amber-800",
  rules_override: "bg-violet-100 text-violet-800",
};

export const STATE_LABEL: Record<ReconLog["state"], string> = {
  agree: "AI agrees with rules",
  ai_extends_rules: "AI added detail",
  disagree: "Disagreement — pick one",
  rules_override: "Rules override",
};

export const SEV_DOT: Record<"must_resolve" | "nice_to_have", string> = {
  must_resolve: "bg-red-500",
  nice_to_have: "bg-amber-500",
};
