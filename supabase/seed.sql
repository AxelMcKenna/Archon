-- Seed: one fully-populated sample project covering every UI surface.
--
-- Re-runnable: every insert keys off stable UUIDs / natural keys with
-- ON CONFLICT DO UPDATE, so `supabase db reset` and direct `psql -f` both
-- yield the same end state.
--
-- Layout (top → bottom mirrors FK dependency order):
--   projects → plan_uploads / cad_uploads → rfi_letters →
--   rfi_extractions / rfi_items → classifications / responses /
--   reconciliation_log / rfi_item_plan_evidence / attachments →
--   project_inspections → checklist_items / inspection_pdfs → audit_log

-- ---------------------------------------------------------------------------
-- project
-- ---------------------------------------------------------------------------
insert into public.projects (
  id, address, city, postalcode, bca, project_type, description,
  application_ref, status,
  estimated_floor_area_m2, estimated_construction_value_nzd,
  involves_structural_work, involves_earthworks, existing_structure_demolished,
  new_road_access, service_connection_water, service_connection_wastewater,
  service_connection_stormwater
) values (
  '00000000-0000-0000-0000-0000000000a1',
  '42 Riccarton Road',
  'Christchurch',
  '8011',
  'ccc',
  'new_dwelling',
  'Two-storey timber-framed dwelling with attached garage and rear deck. Includes new vehicle crossing and full three-waters connection.',
  'BC/2026/00471',
  'rfi-responded',
  214.50, 985000.00,
  true, true, true, true, true, true, true
) on conflict (id) do update set
  address = excluded.address,
  city = excluded.city,
  postalcode = excluded.postalcode,
  bca = excluded.bca,
  project_type = excluded.project_type,
  description = excluded.description,
  application_ref = excluded.application_ref,
  status = excluded.status,
  estimated_floor_area_m2 = excluded.estimated_floor_area_m2,
  estimated_construction_value_nzd = excluded.estimated_construction_value_nzd,
  involves_structural_work = excluded.involves_structural_work,
  involves_earthworks = excluded.involves_earthworks,
  existing_structure_demolished = excluded.existing_structure_demolished,
  new_road_access = excluded.new_road_access,
  service_connection_water = excluded.service_connection_water,
  service_connection_wastewater = excluded.service_connection_wastewater,
  service_connection_stormwater = excluded.service_connection_stormwater;

-- ---------------------------------------------------------------------------
-- plan upload (analysed) + CAD upload + revision
-- ---------------------------------------------------------------------------
insert into public.plan_uploads (
  id, project_id, filename, storage_path, mime_type, size_bytes,
  status, analyser_version, prompt_version, analysis_version,
  verification_prompt_version, verification_drops, image_count, dpi_breakdown,
  content_hash, provider, model_id,
  analysis, processing_ms, cost_usd, error
) values (
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000a1',
  '42-riccarton-road-architectural-set-r3.pdf',
  'plans/00000000-0000-0000-0000-0000000000a1/42-riccarton-road-architectural-set-r3.pdf',
  'application/pdf', 4823104,
  'analysed', 'flagger-2.3.1', 'plan-flag-v7', '2.0',
  'plan-verify-v3',
  '[{"flag_index":4,"reason":"duplicate of flag 1"}]'::jsonb,
  18,
  '{"150":2,"300":14,"600":2}'::jsonb,
  'sha256:9f3b1c0f4d8e2a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b',
  'anthropic', 'claude-opus-4-7',
  $$
{
  "summary": "18 plan pages analysed. 6 likely RFI matters identified across structural, fire, and three-waters disciplines.",
  "flags": [
    {
      "id": "F1", "page": 3, "discipline": "structural", "severity": "must_resolve",
      "title": "Lintel size missing for opening O-04",
      "rationale": "Opening O-04 (3.6m span) has no lintel callout. NZS 3604 table 8.x required.",
      "bbox": [120, 220, 410, 280]
    },
    {
      "id": "F2", "page": 5, "discipline": "fire", "severity": "must_resolve",
      "title": "FRR not specified at garage/dwelling separation",
      "rationale": "C/AS2 requires 30/30/30 minimum at attached garage to habitable space.",
      "bbox": [60, 330, 510, 410]
    },
    {
      "id": "F3", "page": 7, "discipline": "three-waters", "severity": "must_resolve",
      "title": "Stormwater discharge point unclear",
      "rationale": "Site plan shows downpipes but no run to council connection or soak pit.",
      "bbox": [200, 90, 480, 200]
    },
    {
      "id": "F4", "page": 7, "discipline": "three-waters", "severity": "nice_to_have",
      "title": "Backflow prevention device not annotated",
      "rationale": "G12/AS1 cl.3.3.2 requires testable device on toby for residential connection.",
      "bbox": [40, 410, 240, 470]
    },
    {
      "id": "F5", "page": 11, "discipline": "weathertightness", "severity": "must_resolve",
      "title": "Cavity batten depth not noted on cladding detail",
      "rationale": "E2/AS1 fig.71 requires 20mm minimum cavity for direct-fixed cladding.",
      "bbox": [80, 60, 380, 180]
    },
    {
      "id": "F6", "page": 14, "discipline": "accessibility", "severity": "nice_to_have",
      "title": "Step at front entry exceeds 190mm",
      "rationale": "D1/AS1 recommends 190mm max riser; entry shown at 215mm.",
      "bbox": [150, 250, 460, 340]
    }
  ],
  "verification": {
    "passes": 5,
    "drops": 1,
    "notes": "F1 was duplicated as F1b on page 3; merged."
  },
  "stats": {"pages": 18, "tokens_in": 18420, "tokens_out": 3110}
}
  $$::jsonb,
  18432, 1.247, null
) on conflict (id) do update set
  status = excluded.status,
  analysis = excluded.analysis,
  analysis_version = excluded.analysis_version,
  verification_drops = excluded.verification_drops,
  image_count = excluded.image_count,
  dpi_breakdown = excluded.dpi_breakdown,
  processing_ms = excluded.processing_ms,
  cost_usd = excluded.cost_usd;

insert into public.cad_uploads (
  id, project_id, filename, storage_path, size_bytes, content_hash,
  status, analyser_version, prompt_version, analysis, processing_ms, error
) values (
  '00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-0000000000a1',
  '42-riccarton-road-floorplan.dxf',
  'cad/00000000-0000-0000-0000-0000000000a1/42-riccarton-road-floorplan.dxf',
  286120,
  'sha256:1a2b3c4d5e6f70819293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9',
  'analysed', 'cad-1.0', 'cad-flag-v2',
  '{"layers":["A-WALL","A-DOOR","A-WIND","A-DIM"],"entities":1284,"unit":"mm"}'::jsonb,
  4210, null
) on conflict (id) do update set
  status = excluded.status,
  analysis = excluded.analysis;

insert into public.cad_revisions (id, cad_id, applied_ops, dxf_path, changelog_path)
values (
  '00000000-0000-0000-0000-0000000000c2',
  '00000000-0000-0000-0000-0000000000c1',
  '[{"op":"resize_opening","id":"O-04","from":3000,"to":3600}]'::jsonb,
  'cad/00000000-0000-0000-0000-0000000000a1/rev/r2.dxf',
  'cad/00000000-0000-0000-0000-0000000000a1/rev/r2.changelog.json'
) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RFI letter + extraction + items
-- ---------------------------------------------------------------------------
insert into public.rfi_letters (
  id, project_id, rfi_number, issue_date, response_deadline, officer_name,
  original_storage_path, canonical_json, rendered_markdown, extraction_metadata,
  status, plan_upload_id, cad_upload_id
) values (
  '00000000-0000-0000-0000-0000000000d1',
  '00000000-0000-0000-0000-0000000000a1',
  1,
  '2026-04-22',
  '2026-05-20',
  'Hannah Tipene',
  'rfi-uploads/00000000-0000-0000-0000-0000000000a1/rfi-001.pdf',
  $${"reference":"RFI-1","officer":"Hannah Tipene","items":[
    {"id":"1","matter":"Lintel sizing for O-04","clause":"NZS 3604"},
    {"id":"2","matter":"Fire separation rating at garage","clause":"C/AS2"},
    {"id":"3","matter":"Stormwater discharge point","clause":"E1/AS1"}
  ]}$$::jsonb,
  E'## RFI #1 — 42 Riccarton Road\n\n**Officer:** Hannah Tipene  \n**Issued:** 22 April 2026  \n**Response due:** 20 May 2026\n\n1. Lintel sizing for opening O-04 not shown on structural plans.\n2. Fire separation rating between garage and dwelling not specified.\n3. Stormwater discharge point unclear; please confirm connection.\n',
  '{"extractor":"claude-vision","pages":2,"items_found":3}'::jsonb,
  'extracted',
  '00000000-0000-0000-0000-0000000000b1',
  null
) on conflict (id) do update set
  status = excluded.status,
  rendered_markdown = excluded.rendered_markdown,
  canonical_json = excluded.canonical_json,
  plan_upload_id = excluded.plan_upload_id;

insert into public.rfi_extractions (
  id, rfi_letter_id, extractor, extractor_version, raw_output, processing_ms, cost_usd
) values (
  '00000000-0000-0000-0000-0000000000d2',
  '00000000-0000-0000-0000-0000000000d1',
  'claude-vision', 'vision-1.4',
  '{"items":[{"id":"1","text":"Lintel..."},{"id":"2","text":"Fire..."},{"id":"3","text":"Stormwater..."}]}'::jsonb,
  9120, 0.412
) on conflict (id) do nothing;

insert into public.rfi_items (id, rfi_letter_id, item_id, raw_number, raw_text, page, bbox, extracted, ordering)
values
  (
    '00000000-0000-0000-0000-0000000000e1',
    '00000000-0000-0000-0000-0000000000d1',
    '1', '1.',
    'Lintel sizing for opening O-04 (3.6m span) is not shown on the structural plans. Please provide member size and fixings to NZS 3604 Table 8.x.',
    1, '{"x":60,"y":180,"w":480,"h":120}'::jsonb,
    '{"matter":"Lintel sizing","span_m":3.6,"clause":"NZS 3604 Table 8"}'::jsonb,
    1
  ),
  (
    '00000000-0000-0000-0000-0000000000e2',
    '00000000-0000-0000-0000-0000000000d1',
    '2', '2.',
    'Fire resistance rating between attached garage and habitable space is not specified. C/AS2 requires 30/30/30 minimum.',
    1, '{"x":60,"y":320,"w":480,"h":110}'::jsonb,
    '{"matter":"FRR garage/dwelling","clause":"C/AS2"}'::jsonb,
    2
  ),
  (
    '00000000-0000-0000-0000-0000000000e3',
    '00000000-0000-0000-0000-0000000000d1',
    '3', '3.',
    'Stormwater discharge point unclear. Confirm connection to council main or onsite soak pit per E1/AS1.',
    2, '{"x":60,"y":120,"w":480,"h":150}'::jsonb,
    '{"matter":"Stormwater discharge","clause":"E1/AS1"}'::jsonb,
    3
  )
on conflict (rfi_letter_id, item_id) do update set
  raw_text = excluded.raw_text,
  extracted = excluded.extracted;

-- ---------------------------------------------------------------------------
-- classifications (one rules + one ai + one final per item)
-- ---------------------------------------------------------------------------
insert into public.classifications (
  id, rfi_item_id, prong, primary_category, secondary_category,
  severity, confidence, reasoning, rule_ids, rules_version, prompt_version
) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'rules', 'structural', 'lintel',
   'must_resolve', 'high', 'Matched rule R-STR-014 (lintel callout missing).',
   array['R-STR-014'], 'rules-2026.04', null),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e1', 'ai',    'structural', 'lintel',
   'must_resolve', 'high', 'Lintel size required for 3.6m span; NZS 3604 Table 8 applicable.',
   null, null, 'classify-v9'),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000e1', 'final', 'structural', 'lintel',
   'must_resolve', 'high', 'Reconciled: rules and AI agree.',
   array['R-STR-014'], 'rules-2026.04', 'classify-v9'),

  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000e2', 'rules', 'fire', 'separation',
   'must_resolve', 'medium', 'Matched rule R-FIRE-007 (FRR not annotated).',
   array['R-FIRE-007'], 'rules-2026.04', null),
  ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000e2', 'ai',    'fire', 'separation',
   'must_resolve', 'high', 'C/AS2 cl.5.4 requires 30/30/30 at garage interface.',
   null, null, 'classify-v9'),
  ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000e2', 'final', 'fire', 'separation',
   'must_resolve', 'high', 'AI extends rules with specific clause reference.',
   array['R-FIRE-007'], 'rules-2026.04', 'classify-v9'),

  ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000e3', 'rules', 'three-waters', 'stormwater',
   'must_resolve', 'medium', 'Matched rule R-3W-022 (discharge point missing).',
   array['R-3W-022'], 'rules-2026.04', null),
  ('00000000-0000-0000-0000-0000000000f8', '00000000-0000-0000-0000-0000000000e3', 'ai',    'three-waters', 'stormwater',
   'must_resolve', 'high', 'E1/AS1 requires positive discharge documented on site plan.',
   null, null, 'classify-v9'),
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000e3', 'final', 'three-waters', 'stormwater',
   'must_resolve', 'high', 'Reconciled: agree.',
   array['R-3W-022'], 'rules-2026.04', 'classify-v9')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- reconciliation log + drafted responses
-- ---------------------------------------------------------------------------
insert into public.reconciliation_log (
  id, rfi_item_id, state, rules_output, ai_output,
  final_category, final_severity, rules_version, prompt_version,
  user_resolved_choice, user_resolved_at
) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000e1', 'agree',
   '{"category":"structural","severity":"must_resolve"}'::jsonb,
   '{"category":"structural","severity":"must_resolve"}'::jsonb,
   'structural', 'must_resolve', 'rules-2026.04', 'classify-v9',
   null, null),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-0000000000e2', 'ai_extends_rules',
   '{"category":"fire","severity":"must_resolve"}'::jsonb,
   '{"category":"fire","severity":"must_resolve","clause":"C/AS2 5.4"}'::jsonb,
   'fire', 'must_resolve', 'rules-2026.04', 'classify-v9',
   'accept_ai', '2026-04-25 09:30:00+12'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-0000000000e3', 'agree',
   '{"category":"three-waters","severity":"must_resolve"}'::jsonb,
   '{"category":"three-waters","severity":"must_resolve"}'::jsonb,
   'three-waters', 'must_resolve', 'rules-2026.04', 'classify-v9',
   null, null)
on conflict (id) do nothing;

insert into public.responses (id, rfi_item_id, draft_text, edited_text, edit_distance, prompt_version)
values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-0000000000e1',
   'Lintel for O-04 confirmed as 290x90 LVL11, fixed per NZS 3604 Table 8.16. See revised sheet S-04 issued 30/04/26.',
   'Lintel for O-04 confirmed as 290x90 LVL11, fixed per NZS 3604 Table 8.16. Refer revised structural sheet S-04 (rev C, issued 30 April 2026).',
   42, 'response-v6'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-0000000000e2',
   'Garage/dwelling separation upgraded to 30/30/30 per C/AS2 §5.4. See revised A-12 detail D-3.',
   'Garage to dwelling separation upgraded to 30/30/30 FRR per C/AS2 §5.4 — see revised architectural sheet A-12, detail D-3 (rev B).',
   38, 'response-v6'),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-0000000000e3',
   'Stormwater now discharges to council kerb-line connection at NW corner. Refer civil sheet C-02 rev B.',
   null,
   null, 'response-v6')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- per-item plan evidence
-- ---------------------------------------------------------------------------
insert into public.rfi_item_plan_evidence (
  id, rfi_item_id, source, plan_upload_id, cad_upload_id, flag_index,
  evidence, confidence, rationale, matcher_version
) values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-0000000000e1', 'flag',
   '00000000-0000-0000-0000-0000000000b1', null, 0,
   '{"flag_id":"F1","page":3,"bbox":[120,220,410,280]}'::jsonb,
   0.94, 'Direct match: flag F1 lintel callout missing for O-04.',
   'matcher-1.2'),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-0000000000e2', 'flag',
   '00000000-0000-0000-0000-0000000000b1', null, 1,
   '{"flag_id":"F2","page":5,"bbox":[60,330,510,410]}'::jsonb,
   0.91, 'Direct match: F2 FRR missing at garage/dwelling separation.',
   'matcher-1.2'),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-0000000000e3', 'vision',
   '00000000-0000-0000-0000-0000000000b1', null, null,
   '{"page":7,"region":"NE quadrant","note":"downpipes shown without run"}'::jsonb,
   0.78, 'Located via vision lookup: site plan p.7 shows downpipes only.',
   'matcher-1.2')
on conflict (rfi_item_id) do nothing;

-- ---------------------------------------------------------------------------
-- attachments (project-level + per-item) with document workflow metadata
-- ---------------------------------------------------------------------------
insert into public.attachments (
  id, project_id, rfi_item_id, filename, storage_path, mime_type, size_bytes,
  display_name, document_type, document_status,
  linked_requirement_key, linked_requirement_label, linked_requirement_source
) values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-0000000000a1', null,
   'producer-statement-ps1.pdf',
   'attachments/00000000-0000-0000-0000-0000000000a1/producer-statement-ps1.pdf',
   'application/pdf', 184220,
   'Producer Statement PS1 (Structural)', 'certificates', 'approved',
   'ps1-structural', 'PS1 — Design (Structural)', 'consent-checklist'),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-0000000000a1', null,
   'site-plan-rev-b.pdf',
   'attachments/00000000-0000-0000-0000-0000000000a1/site-plan-rev-b.pdf',
   'application/pdf', 612880,
   'Site Plan (Rev B)', 'plans', 'approved',
   'site-plan', 'Site Plan', 'consent-checklist'),
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-0000000000a1', null,
   'geotechnical-report.pdf',
   'attachments/00000000-0000-0000-0000-0000000000a1/geotechnical-report.pdf',
   'application/pdf', 2104880,
   'Geotechnical Report', 'consents', 'pending',
   'geotech', 'Geotechnical Report', 'consent-checklist'),
  ('00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1',
   's-04-rev-c.pdf',
   'attachments/00000000-0000-0000-0000-0000000000a1/s-04-rev-c.pdf',
   'application/pdf', 421140,
   'Structural Sheet S-04 (Rev C)', 'plans', 'approved',
   null, null, null),
  ('00000000-0000-0000-0000-000000000405', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e3',
   'c-02-rev-b.pdf',
   'attachments/00000000-0000-0000-0000-0000000000a1/c-02-rev-b.pdf',
   'application/pdf', 318900,
   'Civil Sheet C-02 (Rev B)', 'plans', 'approved',
   null, null, null)
on conflict (id) do update set
  document_status = excluded.document_status,
  display_name = excluded.display_name,
  document_type = excluded.document_type;

-- ---------------------------------------------------------------------------
-- inspections + checklist + uploaded inspection PDFs
-- ---------------------------------------------------------------------------
insert into public.project_inspections (
  project_id, inspection_id, base_inspection_id, inspection_type_id,
  manual, deleted, sort_order, title, category, timing, requirements,
  details, due_date, booked_date, status, result_notes, rescheduled_from
) values
  ('00000000-0000-0000-0000-0000000000a1', 'insp-siting',     'siting',     'siting',
   false, false, 1, 'Siting / Foundation setout', 'Pre-pour', 'Before pour',
   array['Boundary offsets verified','Bearing capacity confirmed','PS4 from geotech engineer'],
   'Inspector to verify setout matches approved site plan.',
   '2026-05-15', '2026-05-15', 'Passed', 'All offsets within tolerance.', null),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-foundation', 'foundation', 'foundation',
   false, false, 2, 'Foundation reinforcement', 'Pre-pour', 'Before pour',
   array['Reo placement matches engineer detail','Cover blocks used','Damp proof course'],
   'Verify reinforcement spacing and cover.',
   '2026-05-22', null, 'Not Conducted', '', null),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-frame',      'frame',      'frame',
   false, false, 3, 'Frame & wrap', 'Mid-build', 'After lining',
   array['Bracing nailed off','Wrap lapped 150mm','Window flashings installed'],
   '',
   '2026-06-12', null, 'Not Conducted', '', null),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-preline',    'preline',    'preline',
   false, false, 4, 'Pre-line plumbing & insulation', 'Mid-build', 'Before lining',
   array['Pipework pressure tested','Insulation R-values match spec','Penetrations sealed'],
   '',
   '2026-06-26', null, 'Not Conducted', '', null),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-final',      'final',      'final',
   false, false, 5, 'Final / CCC inspection', 'Pre-CCC', 'Project completion',
   array['As-builts available','PS3/PS4 received','Smoke alarms installed'],
   'CCC issuance contingent on this pass.',
   '2026-08-01', null, 'Not Conducted', '', null),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-extra-deck', 'frame',      'frame',
   true,  false, 6, 'Deck framing (manual add)', 'Mid-build', 'After deck framed',
   array['Joist hangers correct','Bearer fixings to spec'],
   'Added manually — applies to rear deck only.',
   '2026-06-19', null, 'Not Conducted', '', null)
on conflict (project_id, inspection_id) do update set
  status = excluded.status,
  due_date = excluded.due_date,
  booked_date = excluded.booked_date,
  result_notes = excluded.result_notes,
  requirements = excluded.requirements,
  details = excluded.details,
  sort_order = excluded.sort_order;

insert into public.project_inspection_checklist_items (project_id, inspection_id, requirement, checked, sort_order)
values
  ('00000000-0000-0000-0000-0000000000a1', 'insp-siting',     'Boundary offsets verified',                true,  0),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-siting',     'Bearing capacity confirmed',               true,  1),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-siting',     'PS4 from geotech engineer',                true,  2),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-foundation', 'Reo placement matches engineer detail',    false, 0),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-foundation', 'Cover blocks used',                        false, 1),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-foundation', 'Damp proof course',                        false, 2),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-frame',      'Bracing nailed off',                       false, 0),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-frame',      'Wrap lapped 150mm',                        false, 1),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-frame',      'Window flashings installed',               false, 2),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-preline',    'Pipework pressure tested',                 false, 0),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-preline',    'Insulation R-values match spec',           false, 1),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-preline',    'Penetrations sealed',                      false, 2),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-final',      'As-builts available',                      false, 0),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-final',      'PS3/PS4 received',                         false, 1),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-final',      'Smoke alarms installed',                   false, 2),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-extra-deck', 'Joist hangers correct',                    false, 0),
  ('00000000-0000-0000-0000-0000000000a1', 'insp-extra-deck', 'Bearer fixings to spec',                   false, 1)
on conflict (project_id, inspection_id, sort_order) do update set
  requirement = excluded.requirement,
  checked = excluded.checked;

insert into public.project_inspection_pdfs (
  id, project_id, inspection_id, name, size_bytes, storage_bucket, storage_path
) values
  ('insp-pdf-siting-report',
   '00000000-0000-0000-0000-0000000000a1', 'insp-siting',
   'siting-pass-report.pdf', 224110, 'inspection-pdfs',
   'inspection-pdfs/00000000-0000-0000-0000-0000000000a1/insp-siting/siting-pass-report.pdf'),
  ('insp-pdf-siting-photos',
   '00000000-0000-0000-0000-0000000000a1', 'insp-siting',
   'siting-site-photos.pdf', 1182990, 'inspection-pdfs',
   'inspection-pdfs/00000000-0000-0000-0000-0000000000a1/insp-siting/siting-site-photos.pdf')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- audit log
-- ---------------------------------------------------------------------------
insert into public.audit_log (project_id, action, metadata)
select '00000000-0000-0000-0000-0000000000a1', a.action, a.metadata::jsonb
from (values
  ('project.created',        '{"by":"seed"}'),
  ('plan.uploaded',          '{"plan_upload_id":"00000000-0000-0000-0000-0000000000b1","filename":"42-riccarton-road-architectural-set-r3.pdf"}'),
  ('plan.analysed',          '{"flags":6,"verification_drops":1}'),
  ('rfi.received',           '{"rfi_letter_id":"00000000-0000-0000-0000-0000000000d1","items":3}'),
  ('rfi.responded',          '{"rfi_letter_id":"00000000-0000-0000-0000-0000000000d1","drafts":3}'),
  ('inspection.passed',      '{"inspection_id":"insp-siting"}')
) as a(action, metadata)
where not exists (
  select 1 from public.audit_log
  where project_id = '00000000-0000-0000-0000-0000000000a1'
    and action = a.action
);
