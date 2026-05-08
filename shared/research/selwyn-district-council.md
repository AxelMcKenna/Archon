---
council: Selwyn District Council
researched: 2026-05-08
sources: official only (selwyn.govt.nz, building.govt.nz)
note: Selwyn's website is behind Cloudflare bot protection — direct WebFetch/curl returned "Just a moment... Enable JavaScript and cookies" challenge pages. Findings below are drawn from Google-indexed snippets of the official pages plus MBIE. Re-verify against live pages before relying on them.
---

# Selwyn District Council — RFI Rules & Practice

## 1. Statutory framework

- Operates under the **Building Act 2004**. Statutory processing window is **20 working days**, beginning **after** the application is accepted (i.e. after vetting clears) [1][2].
- "An RFI can only be raised in order to establish reasonable grounds that the proposed building work complies with the provisions of the building code." [1]
- "The 20 working day statutory clock only restarts the day after sufficient information has been received from the RFI to make a decision." [1]
- "All information should be supplied within 20 working days or the application may be refused." [1]

## 2. Published RFI / pre-application guidance

Key official pages [SDC site map]:
- *Processing of Your Consent* — `/property-And-building/building/processing-of-your-application/processing-of-your-consent`
- *Textual process of how the building consent 20 working day statutory clock works* — `/.../processing-timeframes/textual-process-of-how-...`
- *Forms & Checklists* — `/property-And-building/building/applying-for-approvals/forms-and-checklists`
- *Information Required* — `/property-And-building/building/applying-for-approvals/information-required`
- *Requirements For All Applications* — `/.../information-required/requirements-for-all-applications`
- *Information & Considerations For Specific Approvals* — `/.../information-required/information-and-considerations-for-specific-approvals`
- *How to Supply Your Supporting Documents* — `/.../information-required/how-to-supply-your-supporting-documents`
- *Geotechnical/Ground Condition Reports* — `/property-And-building/building/planning-your-build/geotechnicalground-condition-reports`
- *Engineering Acceptance* — `/property-And-building/development-engineering/engineering-approval`
- *Changes to Your Application* — `/.../processing-of-your-application/changes-to-your-application`

SDC's published guidance to avoid RFIs is general, not enumerated category-by-category like CCC's:
- "Your application should have sufficient detail so the builder can construct a compliant building from the approved consent documentation." [1]
- "By providing all owner details upfront, you will avoid unnecessary delays with your application." [1]

*Not found in public sources: a CCC-style "Avoiding RFIs" page enumerating common categories.*

## 3. Vetting & acceptance process

SDC operates a clear two-stage model:

1. **Vetting (pre-acceptance)** — "After you submit your application it is vetted for completeness, which involves checking your application against the requirements of **section 45 of the Building Act**. Your application is allocated a unique number (your building consent number) during the vetting process." [2][3]
2. "Where there is missing information you'll be sent a **vetting request for further information**, which will tell you what information still needs to be supplied. Vetting is completed only after all the information we need has been received, and your application is accepted at this point and **the 20 working day timeframe begins**." [2][3]

So: vetting RFIs do **not** count against the 20-day clock; they precede acceptance. Only post-acceptance technical RFIs suspend the 20-day clock.

## 4. Common RFI categories

Official SDC enumeration was not retrievable (Cloudflare). From snippets and topic pages, SDC explicitly cares about:

- **Owner details / Form 2 completeness** [1]
- **Producer statements** — PS1 (design) and PS4 (construction monitoring). SDC may make CPEng PS4 monitoring a **condition of consent** [4].
- **Geotechnical / ground condition reports** — "Most building consent applications will need a geotechnical report or shallow soil investigation report." [4][5]
- **Specific engineering design (SED)** — "verifiable evidence of building code compliance for specific engineering design, including producer statement design (PS1), calculations, sketches/drawings or a combination of these." [4]
- **Flooding Assessment Certificate (FAC)** — "An SDC flooding assessment certificate (FAC) is required if the dwelling principal building or alteration is >25m²" [1] — **Selwyn-specific gate**.
- **Engineering acceptance** — required for projects in urban zones to confirm "lawful outfall and service layout requirements" [1] — must be in place before/with the consent application.
- **Wastewater connection / septic decommissioning** — new sewer connection approval form, registered drainlayer, inspection before CCC; for additions on existing septic, capacity assessment for new bedrooms required [6].
- **Solid fuel heaters** — controlled by the National Emission Standard (clean-air approved heaters); rules vary by property location/size; ECan resource [6].
- **MultiProof** — site-specific consent still required each time even with MBIE multiproof [6].

## 5. Canterbury-specific overlays (TC zones, foundations, rural servicing)

- **TC1/TC2/TC3 foundation categories** apply across the Canterbury flat residential green zone, including parts of Selwyn. TC3 requires site-specific geotech and specific engineering foundation design tolerating ≥300 mm global lateral displacement [7][8].
- **Rural servicing matters heavily for SDC** — large rural and greenfield growth (Rolleston, Lincoln, West Melton, Prebbleton). Engineering acceptance (urban) and wastewater pathway (urban sewer vs on-site septic) are explicit gates.
- **ECan dependencies** — solid fuel appliance compliance, on-site wastewater, bores all flow through ECan; SDC explicitly directs applicants to ECan for these [6].

## 6. Processing KPIs / published stats

*Not found in public sources.* SDC pages describe the statutory 20-day window and clock-suspension rule but do not publish RFI rate / average hold time / acceptance failure rate.

## 7. RFI delivery mechanism

- **Selwyn uses AlphaOne** as their BCA processing system. RFIs are delivered/responded to via AlphaOne email addresses of the form **`21XXXX@sdc.abcs.co.nz`** (where 21XXXX is the consent number) [1][3].
- "To help make processing of your consent more efficient, provide all your responses to an RFI in one go, using AlphaOne email only ... to avoid messages getting lost and creating delays." [1][3]

> **Key signal for ConsentIQ ingestion**: SDC RFIs flow through AlphaOne; the address pattern `^21\d{4}@sdc\.abcs\.co\.nz$` is identifying.

## 8. Fees / re-vetting

- Exemptions: minimum charge **$300.00**, with additional charges at actual time and cost if processing exceeds [6].
- *Specific re-vetting / RFI fees not extracted; need to fetch SDC fees schedule directly.*

## 9. Open questions / gaps in public info

- **Cloudflare blocks automated fetching** of selwyn.govt.nz — need a manual scrape or an authenticated path to extract the *Information & Considerations For Specific Approvals* page in full. This page likely contains the closest equivalent to CCC's "Avoiding RFIs" enumeration.
- No published common-RFI category list comparable to CCC's.
- No published RFI rate / acceptance fail rate.
- "Engineering Acceptance" sits in **Development Engineering**, not Building — coordination between BCA RFIs and DE conditions is worth confirming.
- FAC threshold "25m" is ambiguous in the snippet — likely 25 m² but verify from live page.

---

## Citations

[1] SDC — Processing of Your Consent. https://www.selwyn.govt.nz/property-And-building/building/processing-of-your-application/processing-of-your-consent

[2] SDC — Textual process of how the building consent 20 working day statutory clock works. https://www.selwyn.govt.nz/property-And-building/building/processing-of-your-application/processing-timeframes/textual-process-of-how-the-building-consent-20-working-day-statutory-clock-works

[3] SDC — Changes to Your Application. https://www.selwyn.govt.nz/property-And-building/building/processing-of-your-application/changes-to-your-application

[4] SDC — Requirements For All Applications. https://www.selwyn.govt.nz/property-And-building/building/applying-for-approvals/information-required/requirements-for-all-applications

[5] SDC — Geotechnical/Ground Condition Reports. https://www.selwyn.govt.nz/property-And-building/building/planning-your-build/geotechnicalground-condition-reports

[6] SDC — Information & Considerations For Specific Approvals. https://www.selwyn.govt.nz/property-And-building/building/applying-for-approvals/information-required/information-and-considerations-for-specific-approvals

[7] MBIE — Repairing and rebuilding foundations in TC3. https://www.building.govt.nz/building-code-compliance/canterbury-rebuild/repairing-and-rebuilding-foundations-in-tc3

[8] MBIE — TC3 foundation options. https://www.building.govt.nz/building-code-compliance/canterbury-rebuild/tc3-foundation-options
