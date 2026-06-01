-- Bunnings materials / pricing catalogue for the Value-Engineering engine.
-- Sourced by the category-scoped crawler in app/ingestion/bunnings/.
--
-- Complements archipro_materials: ArchiPro is a spec marketplace skewed to
-- premium FF&E (~24% priced; its "Building" category only ~6% priced),
-- whereas Bunnings is a retail trade supplier where nearly every product
-- carries a real NZD price AND a per-unit comparison price -- the
-- granularity VE costs material substitutions at. We scope the crawl to
-- VE-relevant category trees (building, plumbing, flooring, paint), not
-- the full ~100k-SKU catalogue.
create table if not exists public.bunnings_materials (
    sku             text primary key,       -- Bunnings itemNumber / article id
    url             text not null,
    name            text not null,
    brand           text,
    description     text,
    category        text,
    subcategory     text,
    category_path   text,
    price           numeric,                -- pack/length total; NULL = quote-only
    unit_price      numeric,                -- per-unit comparison price
    unit_of_measure text,                   -- e.g. 'linear metre', 'each', 'm2'
    currency        text,
    price_listed    boolean not null default false,
    first_seen      timestamptz not null default now(),
    last_seen       timestamptz not null default now()
);

create index if not exists idx_bunnings_materials_category on public.bunnings_materials(category);
create index if not exists idx_bunnings_materials_price_listed on public.bunnings_materials(price_listed);

alter table public.bunnings_materials enable row level security;

-- Read access for any authenticated app user (matches archipro_materials and
-- the other read-mostly reference-data tables); writes go through the
-- service role / MCP only.
drop policy if exists bunnings_materials_read on public.bunnings_materials;
create policy bunnings_materials_read on public.bunnings_materials
    for select to authenticated using (true);

-- Crawl-run bookkeeping (mirrors archipro_crawl_runs).
create table if not exists public.bunnings_crawl_runs (
    id           bigint generated always as identity primary key,
    started_at   timestamptz not null default now(),
    finished_at  timestamptz,
    categories   integer not null default 0,
    discovered   integer not null default 0,
    skipped      integer not null default 0,
    upserted     integer not null default 0,
    priced       integer not null default 0,
    errors       integer not null default 0,
    notes        text
);

alter table public.bunnings_crawl_runs enable row level security;

drop policy if exists bunnings_crawl_runs_read on public.bunnings_crawl_runs;
create policy bunnings_crawl_runs_read on public.bunnings_crawl_runs
    for select to authenticated using (true);
