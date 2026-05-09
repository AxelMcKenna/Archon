---
council: Selwyn District Council
researched: 2026-05-08
sources: official only (selwyn.govt.nz raw pastes captured 2026-05-08, building.govt.nz)
raw_pastes: /shared/research/selwyn-raw/
note: SDC's website is behind Cloudflare bot protection — direct WebFetch/curl returned JS challenge. Content below was captured via in-browser copy-paste from a logged-in session and stored verbatim in /shared/research/selwyn-raw/.
---

# Selwyn District Council — RFI Rules & Practice

## 1. Statutory framework

- Operates under the **Building Act 2004**. Statutory processing window: **20 working days** [1].
- **Two distinct clock-stop mechanisms** (this is unusual and important — see §3):
  - **s45 vetting RFI**: stops the clock and **resets it back to zero** [2]. *"If there is information missing, a request for further information will be sent, which stops the clock and resets it back to zero days. Once all information in the RFI has been supplied the clock restarts."* [2]
  - **Processing RFI** (post-vetting): pauses the clock at its current count [1][2]. *"The clock pauses on this day and will not recommence until all requested information has been supplied."* [2]
- Applicants must respond within 20 working days or the application **may be refused** [1].
- Statutory clock only restarts *"the day after we have received sufficient information from the RFI to make a decision"* [1].

## 2. Published RFI / pre-application guidance

Key official pages (all captured to `/selwyn-raw/`):

| File | Page | URL |
|---|---|---|
| `_01` | Processing of Your Consent | `/property-And-building/building/processing-of-your-application/processing-of-your-consent` |
| `_02` | 20 working day clock textual process | `/property-And-building/building/processing-of-your-application/processing-timeframes/textual-process-of-how-the-building-consent-20-working-day-statutory-clock-works` |
| `_03` | Forms & Checklists | `/property-And-building/building/applying-for-approvals/forms-and-checklists` |
| `_05` | Requirements For All Applications | `/property-And-building/building/applying-for-approvals/information-required/requirements-for-all-applications` |
| `_06` | Information & Considerations For Specific Approvals | `/property-And-building/building/applying-for-approvals/information-required/information-and-considerations-for-specific-approvals` |
| `_07` | How to Supply Your Supporting Documents | `/property-And-building/building/applying-for-approvals/information-required/how-to-supply-your-supporting-documents` |
| `_09` | Geotechnical / Ground Condition Reports | `/property-And-building/building/planning-your-build/geotechnicalground-condition-reports` |
| `_10` | Building Consent Requirements | `/property-And-building/building/planning-your-build/building-consent-requirements` |
| `_11` | Engineering Acceptance | `/property-And-building/development-engineering/engineering-approval` |
| `_12` | Changes to Your Application | `/property-And-building/building/processing-of-your-application/changes-to-your-application` |
| `_13` | Other Application Considerations | `/property-And-building/building/processing-of-your-application/other-application-considerations` |

Sibling pages on "Information Required" identified but not yet captured: *Record of Title Requirements*, *What to Show on Your Site Plan*, *Checking That You've Supplied a Quality Application*, *Ways to Show Compliance on Your Application*, *Building Location & Setout Certificates*, *Withdrawing Your Building Consent Application*, *Waivers & Modifications*. Worth a follow-up paste pass.

SDC does **not** publish a CCC-style "Avoiding RFIs" page. Guidance is dispersed across the *Specific Approvals* page (§4) and the *Requirements For All Applications* page (§3).

## 3. Vetting & acceptance process

SDC's process is more elaborate than the other two Canterbury BCAs and has **two RFI gates** before processing even begins. The full sequence per the textual process [2]:

1. Application received → imported into **AlphaOne**. Statutory clock starts.
2. **s45 vetting check** for completeness against Building Act s45 [1][2].
3. If incomplete → **vetting RFI** issued → **clock stops and resets to zero** [2].
4. Vetting RFI may iterate — *"If information is still found to be missing, another request for further information may be requested. This will again stop the clock and reset it to zero."* [2]
5. Once all info confirmed → vetting completes, application **accepted**, clock continues counting [2].
6. **Assessment phase** — circulated to specialities (planning, engineering, building, water, drainage); also checked for development contributions, FENZ referrals, Heritage NZ referrals, professional opinions, warnings/bans [1].
7. If processing finds gaps → **processing RFI** issued → **clock pauses** at current count [1][2].
8. Processing RFIs may iterate; clock pauses again each time [2].
9. Once compliant on reasonable grounds → consent documents produced, fees invoiced, consent granted on payment [1].

> **Key signal for ConsentIQ**: Selwyn produces three RFI subtypes that should be classified separately:
> - **Vetting RFI (s45)** — completeness gate; clock-resetting
> - **Processing RFI** — Building Code compliance gate; clock-pausing
> - **PIM RFI** — applies to PIM-only applications, must be issued within 10 days of receipt [4]

Consent cannot be paused outside an RFI — applicants who need a pause must **withdraw** and re-apply, with charges for processing-to-date applying [11].

## 4. Pre-application gates (must be obtained BEFORE submission)

These are explicit blockers — application not accepted until these are in hand [3]:

1. **SDC Flooding Assessment Certificate (FAC)** — required for new principal buildings, new residential units, or alterations of **≥25 m² floor area** to existing residential units / principal buildings [3][7].
2. **ECan flood assessment report** — for rural properties in the Plains Flood Management Overlay [3].
3. **Engineering Acceptance** — required for **urban-zone** projects (residential, commercial/mixed, industrial) in these cases [3][9]:
   - More than one dwelling on a single allotment (medium-density / multi-unit). **From 7 April 2025: minor residential units in residential zones are exempt — EXCEPT in MRZ where it remains required for all multi-units.**
   - Multi-unit commercial (e.g. paired shops).
   - Multi-unit industrial (multi-tenancy).
4. **Specified systems information form** — for projects with specified systems; uses SDC's Specified Systems Information Form (DOCX, 105 KB) and Guidance Document (DOCX, 1761 KB) [3][8].
5. **External authority approvals** — ECan (discharges to land/air/water), Food & Health (food/liquor outlets), MPI (meat works, aquaculture, etc.) [3].
6. **PLG1 form** (NES + earthworks) — required where land is on/near the HAIL list, or earthworks fall in the Plains Flood Management Overlay [3].

## 5. Document submission rules

SDC enforces a **specific upload structure** distinct from CCC/WDC [7]. Each upload area takes **one combined PDF** in a **specified order**:

- **Record of title** — applicant's name, ≤6 months old, plus consent notices/easements; sale & purchase if not yet owned; for new subdivisions >10 lots, proposed Land Transfer Plan first then title before grant.
- **SDC FAC or ECan flood report**
- **Engineering Acceptance** (where required)
- **PLG1 form**
- **Restricted building work memorandum** — all LBP RBW memorandums (designer, engineer)
- **Plans** — site/location, foundation/setout, plumbing/drainage, floor, bracing, electrical, roof/roof framing, elevations, cross sections, construction details (incl. weathertightness + wet area), window/door schedule
- **Specifications** — written, set out in trade sections
- **Supporting documents** — proposed inspection regime, ground bearing/soil report, stormwater percolation testing, engineering documentation (PS1, calcs, plans), buildable truss layout, bracing calcs + fixings, CodeMark + BRANZ appraisals, supporting product literature *"in logical build sequence from ground up"*
- **Commercial/industrial additions** — fire report (often separate file), structural docs (PS1, inspection schedule, calcs, sketches), specified systems form

Files **must be searchable PDFs** [7]. *"Applications that are not compiled appropriately may be rejected."* [7]

**RFI response format rules** (non-compliant responses are deemed incomplete) [1]:
- Use AlphaOne email only: **`21XXXX@sdc.abcs.co.nz`** (where 21XXXX is the consent number)
- Identify changes with **revision clouds + document version numbering**
- Include **document transmittal / updated cover page** with sheet numbers + version refs
- Attachments saved as PDF, printable at correct scale, **A3 maximum**

## 6. Common RFI categories

SDC does not publish a CCC-style enumeration. From the *Specific Approvals* page [4], the topic-specific gates and common requirements are:

### Universal (Requirements For All Applications) [3]
- Owner contact details — *"Applications will not be accepted until all owner details are provided"*
- Scaled drawings (site plan with boundaries+layout+north, dimensioned floor plan, elevations, services, cross sections + details)
- Record of title
- Flood certificate
- Intended use of building
- Restricted building work memorandum / owner-builder declaration
- Resource consents / other authorisations
- Construction details + specifications
- Supply only what is needed (relevant manufacturer pages, not full brochures)
- **Verifiable evidence for SED** — PS1, calculations, sketches/drawings or combination

### Topic-specific [4]
- **PIM** — site plan + floor plan + elevations (PIM-only); RFIs on PIM must be issued within 10 working days
- **Marquees** — exempt if <100 m² AND <1 month; otherwise BC or discretionary exemption ($300 minimum charge)
- **Solid fuel heaters** — clean-air approved per ECan/National Emission Standard; specified intended life **50 years**; SDC publishes a solid fuel checklist (Form 2H)
- **Swimming pools** — pool barrier compliance (separate page); geotech may not be required for some pools; pool fencing checklist published
- **Solar** — PV generally no consent; solar hot water always needs BC (full plumbing schematic + safe tray details)
- **Alterations** — must comply "as nearly as reasonably practicable" with means of escape + accessibility; must continue to comply with Code at least to same extent as before
- **Septic tanks** — site-specific design + **ECan approval** required upfront; capacity reassessment for additions; conversion to council sewer requires sewer connection approval form + registered drainlayer
- **Subdivision of building (s116A)** — must satisfy means of escape, accessibility (s118), protection of other property, and continued compliance test
- **MultiProof** — site-specific BC still required; **10 working days** instead of 20
- **Specified systems** — performance standards + inspection/maintenance/reporting procedures form
- **Pallet racking** — separate guidance (PDF, 96 KB)

### Building Code compliance pathway [1]
Applications must clearly demonstrate compliance via:
- Building Act 2004
- NZ Building Code
- Relevant NZ Standards
- Alternative solutions (where applicable)
- Resource Management Act
- Selwyn District Plan
- Regional Authority consents

### Cross-referrals (clock impact) [13]
- **FENZ Fire Engineering Unit (FEU)** — 10 working days for review under Building Act s46 (means of escape from fire, firefighter access)
- **Heritage New Zealand** — 5 days notification for items on the NZ Heritage List (Rārangi Kōrero)
- **Professional opinions** (PS, design feature reports) — *"have no legal status under the Building Act"*; SDC recommends backing with verifiable calculations [13]
- **MBIE warnings & bans** — published bans on products/methods can block consent issue [13]

## 7. Engineering Acceptance — own RFI cycle [9]

Engineering Acceptance (DE) is **a separate process from BCA processing** with its own queue, vetting, and RFI cycle:

- **Vetting** on receipt; if incomplete, application returned with explanation
- **20 working days** target processing (initial review can take 2+ weeks)
- **RFIs issued separately** — *"If additional information is needed, an RFI will be issued. All questions in the RFI must be answered in full before the application can be approved."*
- **Multiple feedback rounds** typical for complex projects
- Outputs: Engineering Acceptance letter + stamped plans with general + special conditions
- **Hourly fees**:
  - Development Engineer — **$190/hr**
  - Senior Development Engineer / Manager — **$210/hr**
  - Development Engineering Technical Advisor — **$150/hr**
- Application emails: `development.engineer@selwyn.govt.nz`, `water.services@selwyn.govt.nz`
- Triggered by: alterations to Council infrastructure, new connections, extensions of Council infrastructure
- For multi-unit residential: must be obtained **before lodging the building consent**

> **Key signal for ConsentIQ**: An Engineering Acceptance RFI lives outside the BCA RFI flow. If a customer is in the urban multi-unit pathway, they will likely receive RFIs from **two separate council processes** with **two separate clocks**.

## 8. Canterbury-specific overlays (TC zones, foundations, geotech) [10]

- **Geotech is a near-universal requirement** — *"Most building consent applications will need a geotechnical report or shallow soil investigation report."* [10]
- A PIM will confirm whether a **shallow soil investigation** or a **full geotechnical report** is needed [10].
- **Site investigation** typically involves boreholes, test pits, and **scala penetrometer tests** [10].
- Full geotech is required where:
  - Land is in an area susceptible to **liquefaction**, OR
  - Other natural hazards: land instability, rockfall, faultlines [10]
- Liquefaction zones reference: ECan 2012 liquefaction hazard report, page 17 [10].
- TC1/TC2/TC3 foundation framework applies (MBIE Canterbury rebuild guidance) [14][15].
- Pools may be exempt from geotech requirements due to inherent earthquake-deformation tolerance [4].

## 9. Building consent triggers (Selwyn-published list) [12]

Worth keeping for ingestion / triage logic:
- Structural building (additions, alterations, re-piling, some demolitions)
- Plumbing/drainage where new sanitary fixture created
- Relocating a building
- Installing a woodburner or air-conditioning system
- **Retaining walls >1.5 m** (>3.0 m in rural areas if designed by CPEng)
- **Fences/walls >2.5 m**, all swimming pools + their fences
- **Decks/platforms/bridges >1.5 m above ground**
- **Sheds >30 m²** (10–30 m² needs LBP/engineer or lightweight per B1/AS1)
- Some earthworks
- Cannot be issued retrospectively — use Certificate of Acceptance for completed work [12]

## 10. RFI delivery mechanism

- **AlphaOne** is SDC's BCA system [1][2].
- RFI email pattern: **`21XXXX@sdc.abcs.co.nz`** (consent number prefix) [1].
- AlphaOne has an applicant-facing **"front portal"** for tracking + contact updates [1][11].
- All RFI responses must come through AlphaOne email; alternative channels are deprecated [1].
- Engineering Acceptance uses separate inboxes (`development.engineer@`, `water.services@`) [9].

## 11. Forms & checklists published [3]

| Form | Type | Purpose |
|---|---|---|
| Form 2 | PDF, 274 KB | PIM/BC/Amendment/Exemption application |
| Form 2AA | — | PIM for non-consented small standalone dwelling (granny flat) |
| Form 2R | PDF, 81 KB | **Residential BC application checklist** — closest SDC equivalent to CCC's B-062 |
| Form 2CI | DOCX, 91 KB | Commercial/Industrial BC checklist — closest SDC equivalent to CCC's B-063 |
| Form 2H | PDF, 124 KB | Solid fuel heater BC checklist |
| Form 2RB | PDF, 86 KB | Relocated building checklist |
| Form 2B | — | Statutory declaration (owner-builder) |
| Form 2C | — | Notice of owner-builder (RBW) |
| Form 6 | PDF, 434 KB | Code Compliance Certificate |
| Form 6C | PDF, 233 KB | CCC application checklist |
| Form 8 | PDF, 226 KB | Certificate of Acceptance |
| Form 11 | PDF, 91 KB | Amendment to Compliance Schedule |
| Form 14 | — | Application for Determination |
| Form 15 | PDF, 152 KB | Certificate of Public Use |
| PLG1 | PDF, 322 KB | NES contaminants + earthworks |
| PLG-1A | PDF, 134 KB | PLG1 guidance |
| — | PDF, 280 KB | Minor variation to approved BC |
| — | PDF, 110 KB | Request to file record of exempt building work |
| — | PDF, 110 KB | Staged project approval |
| — | DOCX, 105 KB | Specified systems information form |
| — | DOCX, 1761 KB | Specified systems guidance |
| — | DOCX, 740 KB | Building location certificate |
| — | DOCX, 738 KB | Building setout certificate |
| — | DOCX, 149 KB | Swimming pool registration |
| — | DOCX, 139 KB | Swimming pool fencing checklist |

**Construction (PS3) statement templates published by SDC:** General, Drainage, Emergency lighting, Onsite wastewater disposal, Above-ground sanitary plumbing pipework testing, Plumbing pressure test, Waterproofing [3].

**Note**: Selwyn does **not** publish PS1/PS2/PS4 templates (CCC does — B-086/B-087/B-088). Producer Statements are accepted but the standard MBIE/Engineering NZ templates are presumably expected.

## 12. Processing KPIs / published stats

*Not found in published SDC sources.* No published RFI rate, average days on hold, vetting fail rate, or category breakdown.

## 13. Fees

- **Engineering Acceptance**: $150–$210/hr (see §7) [9]
- **Discretionary exemption minimum**: $300, plus actual time/cost if processing exceeds [4]
- BC fees: schedule referenced but not pasted; need separate fetch.

## 14. Open questions / gaps

- *Information Required* sibling pages not captured: Record of Title Requirements, What to Show on Your Site Plan, Checking That You've Supplied a Quality Application, Ways to Show Compliance on Your Application, Building Location & Setout Certificates, Withdrawing Your BC Application, Waivers & Modifications.
- No published RFI rate / hold-time stats.
- Form 2R + Form 2CI checklists not yet downloaded — these are the closest SDC equivalent to CCC's B-062/B-063 and would massively help taxonomy.
- 7 April 2025 rule change for Engineering Acceptance on minor residential units — confirm whether MRZ exception is still in force.
- Specified systems guidance document not pulled (1.7 MB DOCX, contains the master list of system types).

---

## Citations

[1] SDC — Processing of Your Consent. `/selwyn-raw/_01-processing-of-your-consent.md`. https://www.selwyn.govt.nz/property-And-building/building/processing-of-your-application/processing-of-your-consent

[2] SDC — Textual process of how the building consent 20 working day statutory clock works. `/selwyn-raw/_02-20-day-clock-textual.md`. https://www.selwyn.govt.nz/.../textual-process-of-how-the-building-consent-20-working-day-statutory-clock-works

[3] SDC — Requirements For All Applications. `/selwyn-raw/_05-requirements-for-all-applications.md`. https://www.selwyn.govt.nz/property-And-building/building/applying-for-approvals/information-required/requirements-for-all-applications

[4] SDC — Information & Considerations For Specific Approvals. `/selwyn-raw/_06-specific-approvals.md`. https://www.selwyn.govt.nz/.../information-and-considerations-for-specific-approvals

[7] SDC — How to Supply Your Supporting Documents. `/selwyn-raw/_07-how-to-supply-supporting-docs.md`. https://www.selwyn.govt.nz/.../how-to-supply-your-supporting-documents

[8] SDC — Forms & Checklists. `/selwyn-raw/_03-forms-checklists.md`. https://www.selwyn.govt.nz/property-And-building/building/applying-for-approvals/forms-and-checklists

[9] SDC — Engineering Acceptance. `/selwyn-raw/_11-engineering-acceptance.md`. https://www.selwyn.govt.nz/property-And-building/development-engineering/engineering-approval

[10] SDC — Geotechnical / Ground Condition Reports. `/selwyn-raw/_09-geotechnical-ground-condition-reports.md`. https://www.selwyn.govt.nz/property-And-building/building/planning-your-build/geotechnicalground-condition-reports

[11] SDC — Changes to Your Application. `/selwyn-raw/_12-changes-to-application.md`. https://www.selwyn.govt.nz/.../changes-to-your-application

[12] SDC — Building Consent Requirements. `/selwyn-raw/_10-building-consent-requirements.md`. https://www.selwyn.govt.nz/property-And-building/building/planning-your-build/building-consent-requirements

[13] SDC — Other Application Considerations. `/selwyn-raw/_13-other-application-considerations.md`. https://www.selwyn.govt.nz/.../other-application-considerations

[14] MBIE — Repairing and rebuilding foundations in TC3. https://www.building.govt.nz/building-code-compliance/canterbury-rebuild/repairing-and-rebuilding-foundations-in-tc3

[15] MBIE — TC3 foundation options. https://www.building.govt.nz/building-code-compliance/canterbury-rebuild/tc3-foundation-options
