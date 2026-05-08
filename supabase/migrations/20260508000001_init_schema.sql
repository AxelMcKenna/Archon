-- ConsentIQ RFI Module — initial schema
-- Phase 1 foundations: projects, RFI ingestion, classification, reconciliation, versioning.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────────

create type bca_id as enum ('ccc', 'selwyn', 'waimakariri');

create type project_type as enum ('new_dwelling', 'extension', 'accessory', 'deck');

create type project_status as enum (
  'pre-lodgement',
  'lodged',
  'rfi-open',
  'rfi-responded',
  'decision-pending',
  'granted',
  'declined'
);

create type severity as enum ('must_resolve', 'nice_to_have');

create type confidence as enum ('low', 'medium', 'high');

create type reconciliation_state as enum (
  'agree',
  'ai_extends_rules',
  'disagree',
  'rules_override'
);

create type extractor_kind as enum ('pdfplumber', 'claude-vision');

-- ─────────────────────────────────────────────────────────────────────────────
-- Versioning (rules + prompts) — global, not user-scoped
-- ─────────────────────────────────────────────────────────────────────────────

create table rules_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,           -- semver, e.g. "1.0.0"
  content_hash text not null,             -- sha256 of yaml file contents
  yaml_content text not null,             -- snapshot of rules at deploy time
  deployed_at timestamptz not null default now()
);

create table prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_key text not null,               -- e.g. "classifier", "drafter", "extractor"
  version text not null,
  content_hash text not null,
  prompt_content text not null,
  model text not null,                    -- e.g. "claude-opus-4-7"
  deployed_at timestamptz not null default now(),
  unique (prompt_key, version)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Projects + RFI letters + items
-- ─────────────────────────────────────────────────────────────────────────────

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  address text not null,
  bca bca_id not null,
  project_type project_type not null,
  description text,
  application_ref text,
  status project_status not null default 'pre-lodgement',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_user_id_idx on projects (user_id);
create index projects_status_idx on projects (status);

create table rfi_letters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  rfi_number int,
  issue_date date,
  response_deadline date,
  officer_name text,
  original_storage_path text not null,    -- supabase storage path
  canonical_json jsonb,                   -- canonical RFI JSON (Appendix C)
  rendered_markdown text,                 -- deterministic md derived from canonical_json
  extraction_metadata jsonb,              -- {extractor, version, processed_at, warnings}
  status text not null default 'uploaded',-- uploaded | extracting | extracted | classified | drafted
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rfi_letters_project_id_idx on rfi_letters (project_id);

create table rfi_items (
  id uuid primary key default gen_random_uuid(),
  rfi_letter_id uuid not null references rfi_letters(id) on delete cascade,
  item_id text not null,                  -- letter-local id (e.g. "rfi1-item3")
  raw_number text,
  raw_text text not null,
  page int,
  bbox jsonb,                             -- [x1,y1,x2,y2]
  extracted jsonb not null,               -- ExtractedEntities
  ordering int not null,
  created_at timestamptz not null default now(),
  unique (rfi_letter_id, item_id)
);

create index rfi_items_letter_idx on rfi_items (rfi_letter_id, ordering);

-- raw extraction artefact (audit, debugging)
create table rfi_extractions (
  id uuid primary key default gen_random_uuid(),
  rfi_letter_id uuid not null references rfi_letters(id) on delete cascade,
  extractor extractor_kind not null,
  extractor_version text not null,
  raw_output jsonb not null,
  processing_ms int,
  cost_usd numeric(10, 6),
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Classification (per prong) + reconciliation
-- ─────────────────────────────────────────────────────────────────────────────

create table classifications (
  id uuid primary key default gen_random_uuid(),
  rfi_item_id uuid not null references rfi_items(id) on delete cascade,
  prong text not null check (prong in ('rules', 'ai', 'final')),
  primary_category text not null,
  secondary_category text,
  severity severity not null,
  confidence confidence not null,
  reasoning text,
  rule_ids text[],                        -- which rules fired (for prong='rules')
  rules_version text,
  prompt_version text,
  created_at timestamptz not null default now()
);

create index classifications_item_idx on classifications (rfi_item_id);
create index classifications_prong_idx on classifications (prong);

create table reconciliation_log (
  id uuid primary key default gen_random_uuid(),
  rfi_item_id uuid not null references rfi_items(id) on delete cascade,
  state reconciliation_state not null,
  rules_output jsonb not null,
  ai_output jsonb not null,
  final_category text not null,
  final_severity severity not null,
  rules_version text not null,
  prompt_version text not null,
  user_resolved_choice text,              -- if state=disagree and user picked
  user_resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index reconciliation_log_state_idx on reconciliation_log (state, created_at desc);
create index reconciliation_log_item_idx on reconciliation_log (rfi_item_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Drafted responses + attachments
-- ─────────────────────────────────────────────────────────────────────────────

create table responses (
  id uuid primary key default gen_random_uuid(),
  rfi_item_id uuid not null references rfi_items(id) on delete cascade,
  draft_text text not null,               -- original Claude-generated draft
  edited_text text,                       -- user's edits
  edit_distance int,                      -- Levenshtein from draft to final
  prompt_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rfi_item_id)
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  rfi_item_id uuid references rfi_items(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_at timestamptz not null default now(),
  check (rfi_item_id is not null or project_id is not null)
);

create index attachments_item_idx on attachments (rfi_item_id);
create index attachments_project_idx on attachments (project_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- BCA RFI corpus (synthetic + OIA-sourced)
-- ─────────────────────────────────────────────────────────────────────────────

create table bca_corpus (
  id uuid primary key default gen_random_uuid(),
  bca bca_id not null,
  project_type project_type,
  category text not null,
  severity severity not null,
  example_text text not null,
  trigger_description text,
  resolution_hint text,
  source text not null,                   -- 'synthetic' | 'oia' | 'branz' | 'determination'
  created_at timestamptz not null default now()
);

create index bca_corpus_bca_idx on bca_corpus (bca, project_type);
create index bca_corpus_category_idx on bca_corpus (category);

-- ─────────────────────────────────────────────────────────────────────────────
-- Audit log (NFR-7)
-- ─────────────────────────────────────────────────────────────────────────────

create table audit_log (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  project_id uuid references projects(id) on delete cascade,
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_project_idx on audit_log (project_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at triggers
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end
$$ language plpgsql;

create trigger projects_updated_at before update on projects
  for each row execute function set_updated_at();
create trigger rfi_letters_updated_at before update on rfi_letters
  for each row execute function set_updated_at();
create trigger responses_updated_at before update on responses
  for each row execute function set_updated_at();
