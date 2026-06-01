-- ArchiPro materials / pricing catalogue for the Value-Engineering engine.
-- Sourced by the sitemap-driven crawler in app/ingestion/archipro/.
-- price is NULL for quote-only products (ArchiPro is largely a spec
-- marketplace); price_listed distinguishes a real price from an absent one.
create table if not exists public.archipro_materials (
    product_id      text primary key,
    url             text not null,
    name            text not null,
    brand           text,
    description     text,
    category        text,
    subcategory     text,
    category_path   text,
    price           numeric,
    currency        text,
    price_listed    boolean not null default false,
    availability    text,
    image           text,
    source_lastmod  text,
    content_hash    text,
    first_seen      timestamptz not null default now(),
    last_seen       timestamptz not null default now()
);

create index if not exists idx_archipro_materials_category on public.archipro_materials(category);
create index if not exists idx_archipro_materials_brand on public.archipro_materials(brand);
create index if not exists idx_archipro_materials_price_listed on public.archipro_materials(price_listed);

alter table public.archipro_materials enable row level security;

-- Read access for any authenticated app user (matches the read-mostly
-- reference-data tables); writes go through the service role / MCP only.
drop policy if exists archipro_materials_read on public.archipro_materials;
create policy archipro_materials_read on public.archipro_materials
    for select to authenticated using (true);
