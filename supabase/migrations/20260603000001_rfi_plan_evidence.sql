-- RFI ↔ plan linking + per-item evidence trail.
--
-- An RFI letter responds to a specific submitted plan version. Persisting
-- that link is what lets the drafter ground responses in the plan instead
-- of running a fresh blanket analysis. The evidence table records, per RFI
-- item, where on the plan we located the matter being raised.

alter table public.rfi_letters
  add column if not exists plan_upload_id uuid
    references public.plan_uploads (id) on delete set null,
  add column if not exists cad_upload_id  uuid
    references public.cad_uploads (id) on delete set null;

-- Exactly one source plan per letter (or none, for legacy / RFI-only flow).
alter table public.rfi_letters
  drop constraint if exists rfi_letters_one_plan_link;
alter table public.rfi_letters
  add constraint rfi_letters_one_plan_link
  check (plan_upload_id is null or cad_upload_id is null);

create index if not exists rfi_letters_plan_upload_idx
  on public.rfi_letters (plan_upload_id) where plan_upload_id is not null;
create index if not exists rfi_letters_cad_upload_idx
  on public.rfi_letters (cad_upload_id) where cad_upload_id is not null;

-- Per-item evidence: which flag (or vision lookup) on the linked plan
-- matched this RFI item, with confidence + reasoning so the UI can show
-- "matched flag …" / "vision-located …" / "no match — needs your input".
create table if not exists public.rfi_item_plan_evidence (
  id              uuid primary key default gen_random_uuid(),
  rfi_item_id     uuid not null references public.rfi_items (id) on delete cascade,
  source          text not null check (source in ('flag', 'vision', 'none')),
  -- A flag-source row references the analysed plan upload + the index of
  -- the flag inside its analysis JSON; vision-source rows leave them null.
  plan_upload_id  uuid references public.plan_uploads (id) on delete set null,
  cad_upload_id   uuid references public.cad_uploads (id) on delete set null,
  flag_index      integer,
  -- Denormalised payload from whichever source we used so the drafter
  -- doesn't have to re-resolve at draft time.
  evidence        jsonb not null default '{}'::jsonb,
  confidence      double precision,
  rationale       text,
  matcher_version text,
  created_at      timestamptz not null default now(),
  unique (rfi_item_id)
);

create index if not exists rfi_item_plan_evidence_item_idx
  on public.rfi_item_plan_evidence (rfi_item_id);
