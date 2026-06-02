-- Fix the FTS arm: AND-semantics -> OR-semantics (ranked).
--
-- Both clause-match RPCs built their text query with plainto_tsquery, which
-- ANDs every lexeme. The retriever's query is the flag's verbatim_quote +
-- reason + recommended_action concatenated — many tokens — so the `fts @@ tsq`
-- filter required a single clause to contain ALL of them and therefore matched
-- almost nothing. Measured on the retrieval-eval set (app.mbie.eval): sparse
-- recall@5 was 0.09, i.e. the FTS arm was effectively dead — the dense arm was
-- carrying retrieval alone, the RRF fusion wasn't fusing, and the documented
-- "embeddings down -> sparse-only" fallback would have collapsed to ~9% recall.
--
-- Fix: OR the lexemes. plainto_tsquery already sanitises/stems the input into
-- 'a' & 'b' & 'c'; we cast to text, swap ' & ' for ' | ', and cast back to get
-- 'a' | 'b' | 'c'. A clause matching ANY term now qualifies, and ts_rank still
-- orders by how many / how rare the matched terms are, so the best clause leads.
-- nullif(..., '') preserves the null-query guard (empty query -> null tsq).
--
-- Re-measured after this change in the same eval run; see commit message.

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
  order by rank desc nulls last, c.clause_number nulls last
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
           row_number() over (order by f.embedding <=> p_embedding) as rnk
    from fam f
    where p_embedding is not null and f.embedding is not null
    order by f.embedding <=> p_embedding
    limit greatest(p_limit * 4, 20)
  ),
  sparse as (
    select f.id,
           row_number() over (order by ts_rank(f.fts, q.tsq) desc) as rnk
    from fam f, q
    where q.tsq is not null and f.fts @@ q.tsq
    order by ts_rank(f.fts, q.tsq) desc
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
  order by fused.score desc, c.clause_number nulls last
  limit greatest(1, least(p_limit, 20));
$$;

grant execute on function public.match_mbie_clauses_hybrid(text, text, vector, int, int)
  to anon, authenticated, service_role;
