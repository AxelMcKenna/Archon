# Synthetic RFI Corpus — ARRO

**Purpose**: Bootstrap classifier + draft-response training before real RFI samples arrive from design partners.

**Status**: v0 — derived from published council guidance. Real RFI samples should replace synthetic entries once available.

## Files

- `taxonomy.json` — unified RFI taxonomy across CCC, SDC, WDC.
- `ccc.jsonl` — synthetic RFIs derived from CCC's "Avoiding RFIs" page (verbatim grounding).
- `sdc.jsonl` — synthetic RFIs derived from SDC specific-approvals + requirements pages.
- `wdc.jsonl` — synthetic RFIs derived from WDC fact sheets and "Let's Get it Right" guide.
- `determinations.jsonl` — verbatim RFI excerpts from MBIE determinations (real, not synthetic).
- `mbie-stats.json` — published BCA performance data for our three councils + national.

## Schema (per JSONL line)

```json
{
  "id": "ccc-001",
  "council": "CCC|SDC|WDC",
  "stage": "vetting|assessment|validation|cca_audit|engineering_acceptance",
  "category": "weather_tightness|structural|fire|h1_energy|plumbing|drainage|geotech|accessibility|specified_systems|producer_statements|planning|product_assurance|site_levels|other_authorities|cross_referrals|change_of_use|coa|owner_details|document_quality",
  "code_clause": "E2|F9|H1|B1|B2|G4|D1|...",
  "discipline": "structural|fire|h1|plumbing|drainage|geotech|architectural|civil|fire_engineering|specified_systems|...",
  "severity": "blocking|clarifying",
  "synthetic": true,
  "rfi_text": "...",
  "expected_response": "...",
  "source": "CCC Avoiding RFIs §residential.weather_tightness | SDC Specific Approvals | WDC LGIR Step 5 | etc."
}
```

## Conventions

- `synthetic: true` for derived RFIs; `false` only for verbatim quotes from determinations or real council correspondence.
- `code_clause` uses NZ Building Code naming (B1, B2, C, D1, E2, E3, F9, G4, H1, etc.).
- `rfi_text` is written in BCO voice — concise, code-clause grounded, action-requesting.
- `expected_response` describes what compliance evidence resolves the RFI.
