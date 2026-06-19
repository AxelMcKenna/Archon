/**
 * Single source of truth for legal/company details used across the legal pages.
 *
 * These documents are tailored templates, not legal advice. Have the policies
 * reviewed by a lawyer before relying on them.
 */
export const legal = {
  product: "Arro",
  /** Registered legal entity that operates the service. */
  entity: "Arro Technologies Limited",
  website: "https://arro.co.nz",
  contactEmail: "arrotechnology@gmail.com",
  supportEmail: "arrotechnology@gmail.com",
  address: "Auckland, New Zealand",
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
