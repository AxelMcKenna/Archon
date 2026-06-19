-- Landing-page waitlist signups.
--
-- Public, unauthenticated visitors submit their email from the closing CTA on
-- the marketing page. Inserts happen server-side via the service-role client
-- (see web/src/app/api/waitlist/route.ts), but we still enable RLS and mirror
-- the `allow_all_single_user` permissive policy used across the app's other
-- tables so the table is reachable under the current single-user / permissive
-- phase without leaking the full list to anon reads.

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  source     text,
  created_at timestamptz not null default now()
);

-- One row per email; the API treats a conflict as an idempotent success.
create unique index if not exists waitlist_email_key
  on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

-- Permissive single-user fallback (matches plan_*/cad_* tables). The
-- service-role client bypasses RLS for writes; this keeps the table usable for
-- any authenticated admin read during the current phase.
drop policy if exists "allow_all_single_user" on public.waitlist;
create policy "allow_all_single_user" on public.waitlist
  for all to anon, authenticated
  using (true)
  with check (true);

grant select, insert on public.waitlist to anon, authenticated, service_role;
