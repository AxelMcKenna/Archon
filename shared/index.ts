import taxonomy from "./taxonomy.json";
import schema from "./canonical_rfi.schema.json";

export { taxonomy, schema };

export type CategoryId = (typeof taxonomy)["categories"][number]["id"];
export type Severity = "must_resolve" | "nice_to_have";
export type ProjectStatus = (typeof taxonomy)["project_statuses"][number];
export type BcaId = "ccc" | "selwyn" | "waimakariri";
export type ProjectTypeId =
  | "new_dwelling"
  | "extension"
  | "accessory"
  | "deck"
  | "multi_unit_residential"
  | "commercial_office"
  | "retail"
  | "industrial"
  | "mixed_use";

export type RiskGroupId = "SH" | "SM" | "SI" | "CA" | "WB" | "WF" | "VP";
export type ImportanceLevelId = "IL1" | "IL2" | "IL3" | "IL4";

export interface ExtractedEntities {
  clause_references: string[];
  document_references: string[];
  professional_references: string[];
  standards_references: string[];
  dimensions: Array<{ value: number; unit: string; context?: string | null }>;
}

export interface RfiItem {
  item_id: string;
  raw_number?: string | null;
  raw_text: string;
  page?: number | null;
  bbox?: [number, number, number, number] | null;
  extracted: ExtractedEntities;
}

export interface CanonicalRfi {
  schema_version: "1.0";
  rfi_letter: {
    rfi_id: string;
    project_id: string;
    bca: string;
    application_ref?: string | null;
    rfi_number?: number | null;
    issue_date?: string | null;
    response_deadline?: string | null;
    officer_name?: string | null;
    extraction: {
      extractor: "claude-vision" | "pdfplumber";
      extractor_version: string;
      processed_at: string;
      warnings: string[];
    };
    items: RfiItem[];
  };
}

export interface Classification {
  primary_category: CategoryId;
  secondary_category?: CategoryId | null;
  severity: Severity;
  confidence: "low" | "medium" | "high";
  reasoning: string;
}

export type ReconciliationState =
  | "agree"
  | "ai_extends_rules"
  | "disagree"
  | "rules_override";
