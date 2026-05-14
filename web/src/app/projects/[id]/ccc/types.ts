export type Status = "not_started" | "in_progress" | "complete" | "action_required";

export type Form6ALicensingClass =
  | "Carpenter"
  | "Foundation"
  | "Roofing"
  | "Bricklaying and Blocklaying"
  | "External Plastering"
  | "Design — LBP1"
  | "Design — LBP2"
  | "Site — SL1"
  | "Site — SL2"
  | "Section 291 — Treated as Licensed";

export interface ChecklistRow {
  id: string;
  name: string;
  description: string;
  mandatory: boolean;
  status: "not_started" | "uploaded" | "accepted";
  fileName?: string;
}

export interface Form6AEntry {
  id: string;
  lbpName: string;
  licensingClass: Form6ALicensingClass;
  lbpOrRegistrationNumber: string;
  particularWorkCarriedOutOrSupervised: string;
}

export interface Form6ANonRestrictedEntry {
  id: string;
  name: string;
  address: string;
  phoneNumbers: string;
  relevantLicenceOrRegistrationNumber: string;
}

export interface SpecifiedSystemOption {
  code: string;
  description: string;
}

export interface LbpMemorandaFile {
  id: string;
  filename: string;
  storagePath: string;
  uploadedAt: string;
  sizeBytes: number | null;
  lbpName: string;
  mimeType: string | null;
}

export interface InspectionSettlementItem {
  id: string;
  title: string;
  status: string;
}
