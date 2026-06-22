-- User-authored RFI pins on a CAD drawing (Phase 3 Tier-1 UX).
--
-- A pin is a point/region a human flags for follow-up, optionally citing an
-- MBIE clause, with a resolve lifecycle. Distinct from the AI-generated flags
-- stored in cad_uploads.analysis — these are human-authored review notes.

create table cad_rfi_pins (
  id uuid primary key default gen_random_uuid(),
  cad_id uuid not null references cad_uploads(id) on delete cascade,
  -- Normalised [x0, y0, x1, y1] in 0..1 image space (matches the overlay
  -- coordinate system used by CadOverlayImage). A point pin has x0==x1.
  bbox jsonb not null,
  -- Optional handle the pin is anchored to (survives re-rendering).
  handle text,
  clause text,
  comment text,
  status text not null default 'open',  -- open | resolved | dismissed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cad_rfi_pins_cad_idx on cad_rfi_pins (cad_id, created_at desc);

create trigger cad_rfi_pins_updated_at before update on cad_rfi_pins
  for each row execute function set_updated_at();

alter table cad_rfi_pins enable row level security;

-- Mirror the permissive single-user policy used across the app's CAD/plan
-- tables (see 20260613000002_cad_single_user_policy.sql).
create policy "allow_all_single_user" on public.cad_rfi_pins
  for all to anon, authenticated
  using (true)
  with check (true);
