-- Hybrid retrieval for RFI clause grounding: dense (pgvector cosine) +
-- sparse (Postgres FTS ts_rank), fused with Reciprocal Rank Fusion.
--
-- Why hybrid: building-code text needs both — dense embeddings catch
-- paraphrase ("DPC" ~ "damp-proof course") while FTS nails exact tokens
-- (clause refs like E2/AS1, standards like AS/NZS 2918, dims like 35mm).
-- RRF fuses on rank (not score), so the two incomparable scales never need
-- normalising.
--
-- Scale note: ~2k clauses, each query pre-filtered to a clause family (a few
-- hundred rows), so an exact scan is sub-millisecond — no ANN index needed.
-- Add HNSW only if the corpus grows ~100x.
--
-- Dense vectors come from OpenRouter (openai/text-embedding-3-small, 1536-d);
-- embeddings are populated by app.ingestion.mbie.backfill / the extractor.

create extension if not exists vector;

alter table public.mbie_clauses
  add column if not exists embedding vector(1536);

-- match_mbie_clauses_hybrid: family filter (same single-letter-prefix rule as
-- match_mbie_clauses) → dense top-N + sparse top-N → RRF → top-k.
-- Degrades gracefully: null p_embedding → sparse-only; empty query → dense-only.
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
    select plainto_tsquery('english', coalesce(p_query, '')) as tsq
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
    where f.fts @@ q.tsq
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
