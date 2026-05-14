import type { ExtractedEntities } from "@atlas/shared";

export type ReconLog = {
  id: string;
  state: "agree" | "ai_extends_rules" | "disagree" | "rules_override";
  rules_output: { primary_category: string | null; hits: { rule_id: string }[] };
  ai_output: {
    primary_category: string;
    secondary_category?: string | null;
    severity: "must_resolve" | "nice_to_have";
    confidence: "low" | "medium" | "high";
    reasoning: string;
  };
  final_category: string;
  final_severity: "must_resolve" | "nice_to_have";
  user_resolved_choice: string | null;
};

export type Response = {
  id: string;
  rfi_item_id: string;
  draft_text: string;
  edited_text: string | null;
  edit_distance: number | null;
};

export type Attachment = {
  id: string;
  rfi_item_id: string;
  filename: string;
  size_bytes: number;
};

export type ProposedChange = {
  op?: string;
  anchor_handle?: string | null;
  symbol?: string | null;
  text?: string | null;
};

export type PlanEvidence = {
  source: "flag" | "vision" | "none";
  confidence: number | null;
  rationale: string | null;
  flag_index: number | null;
  plan_upload_id: string | null;
  cad_upload_id: string | null;
  evidence: {
    rule_cited?: string | null;
    rationale?: string | null;
    target_handles?: string[];
    page?: number | null;
    verbatim_quote?: string | null;
    matched_clauses?: string[];
    proposed_change?: ProposedChange | null;
  };
};

export type Item = {
  id: string;
  item_id: string;
  raw_number: string | null;
  raw_text: string;
  page: number | null;
  bbox: number[] | null;
  extracted: ExtractedEntities;
  ordering: number;
  reconciliation: ReconLog | null;
  response: Response | null;
  attachments: Attachment[];
  plan_evidence: PlanEvidence | null;
};
