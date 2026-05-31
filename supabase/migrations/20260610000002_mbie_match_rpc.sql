-- Server-side FTS ranking helper called from the verifier per flag.

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
    select plainto_tsquery('english', coalesce(p_query, '')) as tsq
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
  where c.code_clause = p_code_clause
    and (q.tsq is null or c.fts @@ q.tsq)
  order by rank desc nulls last, c.clause_number nulls last
  limit greatest(1, least(p_limit, 20));
$$;

grant execute on function public.match_mbie_clauses(text, text, int)
  to anon, authenticated, service_role;
