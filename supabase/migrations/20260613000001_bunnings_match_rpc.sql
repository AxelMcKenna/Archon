-- Full-text search over bunnings_materials so the Value-Engineering pipeline
-- can attach an indicative retail price to each opportunity by matching the
-- model's material keywords against product names + category path.
--
-- Mirrors match_mbie_clauses (20260610000002): a stable SQL function ranking
-- rows by ts_rank, called once per opportunity from the enrichment service.

-- Generated tsvector (name weighted above category path) + GIN index. A
-- generated column keeps the crawler's plain upserts oblivious to FTS.
alter table public.bunnings_materials
  add column if not exists fts tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A')
    || setweight(to_tsvector('english', coalesce(category_path, '')), 'C')
  ) stored;

create index if not exists idx_bunnings_materials_fts
  on public.bunnings_materials using gin (fts);

create or replace function public.match_bunnings_materials(
  p_query text,
  p_limit int default 3
)
returns table (
  sku text,
  name text,
  category text,
  category_path text,
  price numeric,
  unit_price numeric,
  unit_of_measure text,
  currency text,
  url text,
  rank real
)
language sql
stable
set search_path = public
as $$
  with q as (
    -- OR the normalized lexemes so the best *partial* match ranks highest
    -- (plainto_tsquery ANDs them, which is too strict for material specs
    -- like "SG8 H1.2 90x45 kiln dried radiata framing").
    select nullif(
      replace(plainto_tsquery('english', coalesce(p_query, ''))::text, '&', '|'),
      ''
    )::tsquery as tsq
  )
  select
    m.sku,
    m.name,
    m.category,
    m.category_path,
    m.price,
    m.unit_price,
    m.unit_of_measure,
    m.currency,
    m.url,
    ts_rank(m.fts, q.tsq) as rank
  from public.bunnings_materials m, q
  where m.price_listed
    and q.tsq is not null
    and m.fts @@ q.tsq
  order by rank desc nulls last, m.price asc nulls last
  limit greatest(1, least(p_limit, 20));
$$;

grant execute on function public.match_bunnings_materials(text, int)
  to anon, authenticated, service_role;
