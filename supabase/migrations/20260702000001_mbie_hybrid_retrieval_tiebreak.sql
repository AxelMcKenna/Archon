-- Deterministic tiebreakers for MBIE clause retrieval (wiki/issues/0003).
--
-- The hybrid function's dense/sparse CTEs ranked with row_number() over a
-- single sort key (cosine distance / ts_rank). On a tie Postgres assigns row
-- numbers in an arbitrary order that shifts with table physical layout
-- (vacuum, page splits), so tied clauses could swap RRF ranks between runs →
-- a different top-k clause set reaching the verifier → a flag's verdict
-- flipping. Adding `f.id` (unique, stable) as a secondary sort key makes the
-- rank assignment — and therefore the fused top-k — a pure function of the
-- data. The outer ORDER BYs get `c.id` as a final tiebreaker for the same
-- reason, in both the hybrid and plain functions.
--
-- Based on the 20260614000002 definitions (OR-semantics FTS) — this migration
-- changes ORDER BY clauses only.

create or replace function public.match_mbie_clauses(
  p_code_clause text,
  p_query text,
  p_limit int default 3
)
returns table (
  id uuid,
  document_id text,
  clause_number text,
  heading text,
  text text,
  page int,
  source_url text,
  rank real
)
language sql
stable
set search_path = public
as $$
  with q as (
    select nullif(
      replace(plainto_tsquery('english', coalesce(p_query, ''))::text, ' & ', ' | '),
      ''
    )::tsquery as tsq
  )
  select
    c.id,
    c.document_id,
    c.clause_number,
    c.heading,
    c.text,
    c.page,
    c.source_url,
    ts_rank(c.fts, q.tsq) as rank
  from public.mbie_clauses c, q
  where (
    case
      when char_length(p_code_clause) = 1
        then c.code_clause like p_code_clause || '%'
      else c.code_clause = p_code_clause
    end
  )
    and (q.tsq is null or c.fts @@ q.tsq)
  order by rank desc nulls last, c.clause_number nulls last, c.id
  limit greatest(1, least(p_limit, 20));
$$;

grant execute on function public.match_mbie_clauses(text, text, int)
  to anon, authenticated, service_role;

create or replace function public.match_mbie_clauses_hybrid(
  p_code_clause text,
  p_query text,
  p_embedding vector,
  p_limit int default 3,
  p_rrf_k int default 60
)
returns table (
  id uuid,
  document_id text,
  clause_number text,
  heading text,
  text text,
  page int,
  source_url text,
  rank real
)
language sql
stable
set search_path = public
as $$
  with q as (
    select nullif(
      replace(plainto_tsquery('english', coalesce(p_query, ''))::text, ' & ', ' | '),
      ''
    )::tsquery as tsq
  ),
  fam as (
    select c.*
    from public.mbie_clauses c
    where case
      when char_length(p_code_clause) = 1
        then c.code_clause like p_code_clause || '%'
      else c.code_clause = p_code_clause
    end
  ),
  dense as (
    select f.id,
           row_number() over (order by f.embedding <=> p_embedding, f.id) as rnk
    from fam f
    where p_embedding is not null and f.embedding is not null
    order by f.embedding <=> p_embedding, f.id
    limit greatest(p_limit * 4, 20)
  ),
  sparse as (
    select f.id,
           row_number() over (order by ts_rank(f.fts, q.tsq) desc, f.id) as rnk
    from fam f, q
    where q.tsq is not null and f.fts @@ q.tsq
    order by ts_rank(f.fts, q.tsq) desc, f.id
    limit greatest(p_limit * 4, 20)
  ),
  fused as (
    select
      coalesce(d.id, s.id) as id,
      coalesce(1.0 / (p_rrf_k + d.rnk), 0.0)
        + coalesce(1.0 / (p_rrf_k + s.rnk), 0.0) as score
    from dense d
    full outer join sparse s on d.id = s.id
  )
  select
    c.id, c.document_id, c.clause_number, c.heading, c.text, c.page,
    c.source_url, fused.score::real as rank
  from fused
  join public.mbie_clauses c on c.id = fused.id
  order by fused.score desc, c.clause_number nulls last, c.id
  limit greatest(1, least(p_limit, 20));
$$;

grant execute on function public.match_mbie_clauses_hybrid(text, text, vector, int, int)
  to anon, authenticated, service_role;
