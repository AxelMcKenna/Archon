---
council: Waimakariri District Council
researched: 2026-05-08
sources: official only (waimakariri.govt.nz, building.govt.nz)
primary_sources:
  - WDC "Let's Get it Right — Building Consents" guide v3, December 2023 (master process guide)
  - WDC Building Inspections Fact Sheet v2, September 2025
  - WDC Code Compliance Certificate Checklist v2, May 2025
  - WDC Building on a Rural Site v1, November 2022
  - WDC Certificate of Acceptance Fact Sheet v2, December 2025
  - WDC Building Change of Use v1, November 2022
  - WDC Building Location Certificate v1, May 2023
raw_pdfs: /shared/research/wdc-raw/
---

# Waimakariri District Council — RFI Rules & Practice

## 1. Statutory framework

- Operates under the **Building Act 2004**. Statutory window: **20 working days** (10 working days for MultiProof) [1][2].
- *"If your plans are not compliant with the Building Code or further detail is required, you will be sent a Request for Further Information (RFI). The 20 day processing period is then suspended until the requested information is received."* [2]
- Same suspension rule applies to amendments [2].
- CCC issuance also has a 20-working-day clock with RFI suspension [2].

## 2. Published RFI / pre-application guidance

The canonical published process guide is **"Let's Get it Right — Building Consents" v3, December 2023** (QD-BU-Guide-001) [2]. 17 numbered steps from "Do you need a building consent?" through Code Compliance Certificate audit.

WDC publishes a series of **building Fact Sheets** [3]. Eight cover building consent topics; the rest cover unrelated services. Building-related sheets pulled and extracted to `/wdc-raw/`:

| Code | Title | Version |
|---|---|---|
| QD-BU-Guide-001 | Let's Get it Right — Building Consents | v3, Dec 2023 |
| QD-BU-Information-006 | Building Inspections | v2, Sep 2025 |
| QD-BU-Information-004 | Code Compliance Certificate Checklist | v2, May 2025 |
| QD-BU-Information-007 | Building on a Rural Site | v1, Nov 2022 |
| QD-BU-Information-008 | Certificate of Acceptance | v2, Dec 2025 |
| QD-BU-Information-009 | Building Change of Use | v1, Nov 2022 |
| QD-BU-Information-014 | Building Location Certificate | v1, May 2023 |
| (no code) | Access Around House Building Sites | (scanned image PDF — needs OCR) |
| (no code) | Amendments and Minor Variations | Jan 2024 (scanned image PDF — needs OCR) |

WDC does **not** publish a CCC-style "Avoiding RFIs" enumerative page. Guidance is dispersed across the master guide and topic fact sheets.

## 3. Vetting & acceptance — three-stage RFI surface

WDC has an unusual **three-gate** structure where additional information requests can occur. Each is its own surface for ARRO to classify:

### Gate 1 — Lodgement vetting (Step 4) [2]
- Applications vetted by Council staff for completeness on lodgement.
- *"Application forms with incomplete information or that are incorrectly filled in will cause your application to be rejected and you will then have to re-apply with complete/correct information."* [2]
- This is **rejection, not RFI** — applicant must restart the lodgement process.

### Gate 2 — Application Assessment RFI (Step 5) [2]
- BCO-issued. *"If your plans are not compliant with the Building Code or further detail is required, you will be sent a Request for Further Information (RFI). The 20 day processing period is then suspended until the requested information is received."* [2]
- Standard mid-processing RFI. Suspends the 20-day clock.

### Gate 3 — Validation QA RFI (Step 6) [1][2]
- **Senior Building Officer** quality-assurance check after BCO is satisfied.
- *"Please note: Not all jobs require validation, this will be determined at the time the consent is allocated to a Building Consent Officer."* [2]
- WDC's website explicitly notes validation can produce further RFIs: *"may be sent for a final quality assurance check, known as validation, and depending on the findings, **further information may be requested**."* [1]

### Gate 4 — CCC Audit RFI (Step 17) [2]
- Code Compliance Certificate auditor reviews all inspections + photos + docs after final inspection.
- *"If outstanding items are found, you may be requested by the Council's Code Compliance Auditor to supply additional information or carry out additional works. A Code Compliance Certificate cannot be issued until all of the outstanding issues are resolved."* [2]
- 20-day CCC clock with RFI suspension.

> **Key signal for ARRO**: WDC RFIs come from at least three distinct queues — BCO assessment (Step 5), Senior BO Validation (Step 6), and CCC Auditor (Step 17). These are different stages with different remediation patterns. Classifier should label which gate emitted the RFI.

## 4. Common RFI categories (derived from fact sheets)

WDC doesn't enumerate them as RFI categories per se, but the fact sheets reveal the highest-friction topics:

### A. Building Code compliance pathway [2]
Application must show compliance via one of:
- Acceptable Solution / Verification Method
- Determination
- Current national multi-use approval (MultiProof)
- Current product certificate (CodeMark)
- Alternative Solution

### B. Rural site requirements [4] — heaviest topic-specific surface

- **Effluent fields** — site-specific design **including fencing**; Canterbury Land and Water Regional Plan compliance; **ECan approval may be required**. Bedrooms-for-effluent-volume calculation includes "study"/"office" rooms.
- **Stormwater** — site-specific design where soil doesn't support a soak pit (swales, ponds, or specifically designed systems). Barns/sheds may have no SW system if **>10 m from boundaries**.
- **Potable water (private well)** — full chem + micro test per WDC suite, complying with **Drinking Water Standards for NZ 2005 (Revised 2018)**. **Second microbiological test required before CCC** or before occupation, whichever comes first. If non-potable: design treatment system + post-install full test.
- **Floor level** — must address potential flooding hazards and **freeboard** requirements.
- **Solid fuel burners** — generally OK on rural sites >2 ha (verify with ECan).
- **Earthworks** — must maintain a **secondary flow path** for water run-off around dwelling.
- **Garages** — vehicle access must be formed for CCC. Vehicle crossing permit may be needed.
- **Caravans / second dwellings** — caravan permitted as temporary site accom only if not connected to services; cannot be permanently inhabited.

### C. Change of Use [6] — distinct compliance trigger
- **Owner must give written notice; approval required BEFORE project commences.**
- Caravan / house bus / shipping container becomes a "building" once **immovable** or **connected to services** (power, water, effluent, or wheels removed / on piles).
- Triggers compliance with: means of escape from fire, protection of other property, sanitary facilities, structural performance, fire rating, accessibility.
- New household unit created → must comply "as nearly as reasonably practicable" with **the full Building Code**.
- WDC explicitly notes complaints about unconsented habitation of converted shipping containers, garages, farm sheds.

### D. Certificate of Acceptance (COA) [5] — for work without consent
- Form 8 application.
- Council **under no obligation to issue** — refusal is allowed and recorded on LIM.
- Council Compliance Officer inspection required; invasive areas to be left exposed.
- Exempt work (Sch 1) doesn't qualify (no basis to issue).
- Cannot be issued for work pre-1 July 1992.
- Deposit non-refundable; fees payable even if refused.

### E. Building Location Certificate (BLC) [7] — survey gate
- Required from **Registered Professional Surveyor or Licensed Cadastral Surveyor** for FFL, recession planes, boundary setbacks.
- Vertical datums: **NZVD2016** or **Lyttelton Vertical Datum 1937 (LVD1937)** depending on District Plan / Resource Consent.
- **Two established benchmarks** required (one to set out levels, second to close the circuit).
- LBP must sign endorsed site plan confirming slab no lower than approved FFL.
- BLC may be waived for FFL if surveyor-prepared site plan + FFL ≥300 mm above required minimum + datum referenced + sufficient internal/external spot levels.
- BLC may be waived for recession plane / setback if ≥200 mm clearance shown in plans + external wall ≥200 mm clear of 1 m fire-spread minimum + fire-rated wall.
- **Surveyor identifying differences from approved plans triggers an amendment requirement** — likely RFI surface.

### F. Producer Statements
WDC accepts the standard PS1/PS2/PS3/PS4 framework but adds specific PS3 sub-types in CCC checklist [8]:
- PS3 Wet Area Seal-Tanking
- PS3 Septic Tank and Effluent Disposal field
- PS3 Solid Fuel Burner installer (+ plumber/gasfitter if wetback)
- Wet Area Tanking PS (tiler, specifying product + areas)
- Septic Tank / Effluent Field PS (for pressurised systems e.g. E-One)
- Roofing Membrane Installation PS + warranty (e.g. Butynol)
- Engineers Site Notes + PS4 (where engineered, e.g. foundations)

> Producer Statement legal status note (per Glossary [2]): *"It is up to the Building Consent Authority to decide whether to rely on such a statement."* — same baseline as SDC.

## 5. Inspection schedule (likely RFI / NTF triggers post-issue) [9]

WDC publishes an explicit list of inspection types that any consent's Schedule of Inspections may draw from:

- **Foundations** — before concrete pour; checks siting, floor height, steel reinforcing, polythene/DPC, punch pads, trench cleanliness.
- **Slab / structural concrete** — steel reinforcing, DPC, control joints.
- **Retaining walls** — before back-fill; waterproof membranes + subsoil drainage visible.
- **Drainage** — before back-fill; correct size, fall, venting, bedding. Underfloor waste before slab pour. **As-built drainage plan required.**
- **Structure** — timber grade + treatment, sizes, spans, fixing of studs, beams, joists, rafters, trusses, purlins; bracing straps, rafter/truss fixings — **before building wrap**.
- **Cladding** — installed per manufacturer specification.
- **Mid-height veneer** — partial brick lay; brick ties, fixings, weep holes, cavity clear of mortar/debris.
- **Preline** — before linings; framing moisture content, insulation, bracing layout, lintels, fixings; plumbing inspection at this stage.
- **Prestop** — bracing panels, wet area fixings, fire-lining fixings (last chance before plaster/paint hides them).
- **Pool** — F9 + Subpart 7A compliance; barriers, doors/windows, backflow preventer.
- **Heating unit** — 2 inspections for inbuilts (pre-install chimney check + post-install); 1 for freestanding.
- **Specialist** — by engineers, usually covered by PS4.
- **Final** — safety barriers, hand rails, smoke alarms, painting/sealing, landscaping to ground level. Commercial: fire signage, carpark marking, accessibility, specified systems.

**Quote**: *"Inspections are critical to your consent... A missed inspection can make it difficult to gain the Code Compliance Certificate."* [9] → **missed inspections become CCC-stage RFIs**.

## 6. CCC application checklist (exhaustive) [8]

Documents required for Form 6 CCC application (only those applicable):

- Form 6 — owner-completed; build completion date on p2; signature/date on p4.
- Form 6A — Memorandum / Record of Works.
- LBP Record of Works (for restricted building work — cladding, roofing, carpentry, etc.).
- Engineer's site notes + PS4 (foundations or other SED).
- Wet Area Tanking PS.
- Roofing Membrane Installation PS + warranty.
- Solid Fuel Burner Installer PS3 (+ plumber if wetback).
- Electrical Certificate of Compliance + Electrical Safety Certificate.
- Plumbers Pressure Test.
- Gas Certificate.
- PS3 Wet Area Seal-Tanking.
- PS3 Septic Tank and Effluent Disposal field.
- Potable Water Test (private well) — second test required; **full test if >18 months since first or first was non-compliant**.
- Any other applicable PSs (extra cladding, solar, etc.).

WDC notes: *"After an audit is carried out by our CCC Auditor, there may be further information we ask you to supply."* [8] — explicit RFI surface at CCC stage.

## 7. Canterbury-specific overlays (TC zones, foundations, flood)

- **WDC has significant TC2 and TC3 land** — Kaiapoi, Pines Beach, Kairaki and surrounding areas (heavily 2010–2011 quake-affected; portions are former residential red zone) [10][11].
- **TC3 foundation rule**: site-specific geotech + specific engineering foundation design tolerating ≥300 mm global lateral displacement [10][11].
- **Floor levels** are an explicit rural-site fact-sheet topic — *"Finished Floor level will need to be designed for any potential flooding hazards and 'freeboard' requirements of the site."* [4]
- **PIM s37 hazard flagging** — PIM flags flooding, erosion, subsidence, slippage [2].
- **District / Regional Plan dependencies** — WDC may issue s37 notice halting or staging work until Resource Consent obtained [2].

## 8. Processing KPIs / published stats

*Not found in public WDC sources.* No published RFI rate, hold time, validation-stage RFI rate, vetting-rejection rate, or CCC-audit RFI rate.

## 9. Other process detail

- **MultiProof**: 10 working days instead of 20 [2].
- **Fees**: deposit/fees per Schedule of Fees; full fees due before consent issued [2]. Development Contributions, additional inspection fees, and amendment processing fees due before CCC [2].
- **12-month lapse**: consent lapses if work not started in 12 months unless work-start extension paid [2].
- **Amendments**: 20-working-day clock applies; major changes (e.g. cladding change) require Form 2 Amendment; minor variations may be approved on-site by inspector [2].
- **Notice to Fix (NTF)**: issued for serious deficiencies on inspection; max fine $200,000 + $20,000/day continuing [2]. Likely material for response drafting.

## 10. RFI delivery mechanism

- **Online portal** — WDC has an online lodgement portal (registration required); electronic submissions must be PDF [12].
- Inspection booking: phone (03 311 8906) or `bcbooking@wmk.govt.nz`.
- Building enquiries: `buildinginfo@wmk.govt.nz`.
- General office: `office@wmk.govt.nz`; main 0800 965 468.
- *Not stated explicitly: which BCA software (Objective Build / AlphaOne / GoGet / Datacom IS) WDC uses to deliver RFIs, nor the consent-number-keyed RFI email pattern (compare SDC's `21XXXX@sdc.abcs.co.nz`).* This is the highest-priority remaining unknown for ingestion.

## 11. Open questions / gaps

- BCA software / RFI delivery channel not named in public guidance — needs OIA or design-partner confirmation.
- The two **scanned-image fact sheets** (Access Around House Building Sites, Amendments & Minor Variations Jan 2024) have no text layer — would need OCR if their content matters; topics suggest moderate priority.
- Validation-stage RFI rate vs assessment-stage RFI rate not published.
- CCC-audit RFI rate not published.
- The closest WDC has to a B-062-style residential checklist appears to be embedded in the master guide rather than a standalone form.
- Fact sheets currently uncovered (worth fetching): solid fuel heater, decks, retaining walls, swimming pools, secondary dwellings (granny flats), specified systems, fire safety, H1 energy.

---

## Citations

[1] WDC — Building Consent Process. https://www.waimakariri.govt.nz/building-services/building-services/processing-of-your-building-consent

[2] WDC — *Let's Get it Right: Building Consents* (Guide QD-BU-Guide-001 v3, Dec 2023, PDF). `/wdc-raw/QD-BU-Guide-001-Lets-Get-It-Right-Building-Consents-Book.PDF` + `.txt`. https://www.waimakariri.govt.nz/__data/assets/pdf_file/0018/134127/QD-BU-Guide-001-Lets-Get-It-Right-Building-Consents-Book.PDF

[3] WDC — Building Fact Sheets index (page 1 of 1 for building topics). https://www.waimakariri.govt.nz/consents-and-licences/building-consents-and-information/building-consents/building-fact-sheets

[4] WDC — *Building on a Rural Site* (QD-BU-Information-007 v1, Nov 2022). `/wdc-raw/QD-BU-Information-007-Building-on-a-Rural-Site-Fact-Sheet.pdf`.

[5] WDC — *Certificate of Acceptance* (QD-BU-Information-008 v2, Dec 2025). `/wdc-raw/QD-BU-Information-008-Certificate-of-Acceptance-COA-Fact-Sheet_20260116.PDF`.

[6] WDC — *Building Change of Use* (QD-BU-Information-009 v1, Nov 2022). `/wdc-raw/QD-BU-Information-009-Building-change-of-Use-Fact-Sheet.pdf`.

[7] WDC — *Building Location Certificate* (QD-BU-Information-014 v1, May 2023). `/wdc-raw/QD-BU-Information-014-Building-Location-Certificate-Fact-Sheet.PDF`.

[8] WDC — *Code Compliance Certificate Checklist* (QD-BU-Information-004 v2, May 2025). `/wdc-raw/QD-BU-Information-004-Code-Compliance-Certificate-Checklist-Fact-Sheet.PDF`.

[9] WDC — *Building Inspections* (QD-BU-Information-006 v2, Sep 2025). `/wdc-raw/Building-Inspections-Fact-Sheet-0925.PDF`.

[10] MBIE — Repairing and rebuilding foundations in TC3. https://www.building.govt.nz/building-code-compliance/canterbury-rebuild/repairing-and-rebuilding-foundations-in-tc3

[11] MBIE — TC3 foundation options. https://www.building.govt.nz/building-code-compliance/canterbury-rebuild/tc3-foundation-options

[12] WDC — Apply for Building Consent. https://www.waimakariri.govt.nz/consents-and-licences/building-consents-and-information/building-consents/apply-for-building-consent
