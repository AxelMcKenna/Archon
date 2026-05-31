/**
 * Single source of truth for legal/company details used across the legal pages.
 *
 * ⚠️ Replace the [PLACEHOLDER] values with your real registered details before
 * publishing, and have the policies reviewed by a lawyer. These documents are
 * tailored templates, not legal advice.
 */
export const legal = {
  product: "Atlas",
  /** Registered legal entity that operates the service. */
  entity: "[Atlas Technologies Limited]",
  /** NZ Companies Office number, if registered. */
  companyNumber: "[NZBN / Company No.]",
  website: "https://atlas.build",
  contactEmail: "privacy@atlas.build",
  supportEmail: "support@atlas.build",
  address: "[Registered office address], Auckland, New Zealand",
  jurisdiction: "New Zealand",
  governingLaw: "New Zealand",
  /** Shown on every policy. Update lastUpdated whenever you change a policy. */
  effectiveDate: "30 May 2026",
  lastUpdated: "30 May 2026",
} as const;

/** The legal pages, used for the cross-page nav and the site footer. */
export const legalPages = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/acceptable-use", label: "Acceptable Use" },
  { href: "/subprocessors", label: "Sub-processors" },
] as const;
