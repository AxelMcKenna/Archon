"use client";

import { taxonomy } from "@atlas/shared";
import { SEV_DOT, STATE_LABEL, STATE_STYLE } from "../constants";
import type { ReconLog } from "../types";
import { Resolver } from "./resolver";

export function Classification({
  recon,
  onResolve,
}: {
  recon: ReconLog;
  onResolve: (user_choice: string) => Promise<void>;
}) {
  const cat = taxonomy.categories.find((c) => c.id === recon.final_category);
  return (
    <div className="mt-4 border-t border-ink-700/10 pt-3 space-y-2">
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <span className={`inline-block rounded-sm px-2 py-0.5 text-xs ${STATE_STYLE[recon.state]}`}>
          {STATE_LABEL[recon.state]}
        </span>
        <span className="text-xs text-ink-700">{cat?.label ?? recon.final_category}</span>
        <span
          className={`ml-auto inline-flex items-center gap-1 text-xs ${
            recon.final_severity === "must_resolve" ? "text-red-700" : "text-amber-700"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${SEV_DOT[recon.final_severity]}`}
          />
          {recon.final_severity === "must_resolve" ? "Must resolve" : "Nice to have"}
        </span>
      </div>
      <details className="text-xs" open={recon.state !== "agree"}>
        <summary className="cursor-pointer text-ink-500 hover:text-ink-900">
          Why this category?
        </summary>
        <p className="mt-1 text-ink-700 italic">{recon.ai_output.reasoning}</p>
      </details>
      {recon.state === "disagree" && !recon.user_resolved_choice && (
        <Resolver recon={recon} onResolve={onResolve} />
      )}
      {recon.user_resolved_choice && (
        <p className="text-xs text-ink-500">
          You resolved this as <span className="font-mono">{recon.user_resolved_choice}</span>.
        </p>
      )}
    </div>
  );
}
