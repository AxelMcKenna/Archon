-- Family-aware clause matching for the verifier's RFI grounding lookup.
--
-- The flag taxonomy mixes two granularities of building-code category:
--   * specific clauses  — building_code:E2, :B1, :G12, :H1  → "E2"/"B1"/...
--   * umbrella clauses   — building_code:C, :D, :F, :G       → "C"/"D"/"F"/"G"
--
-- mbie_clauses.code_clause is always the specific sub-clause the document
-- belongs to (D1, F2, F4, G1, G4, G12, G13, ...). The previous RPC matched
-- code_clause = p_code_clause exactly, so an umbrella category like
-- building_code:F ("F") matched none of the F2/F4 clauses actually ingested,
-- and the AS-compliance / Alternative-Solution checks silently never fired for
-- C (fire — the biggest source of Alternative Solutions), D, F and G.
--
-- Fix: when p_code_clause is a single letter it is a family key — match every
-- sub-clause under that letter by prefix (C → C%, F → F2/F4, G → G1/G4/G12/G13).
-- A multi-character clause ("B1", "E2", "G12") stays an exact match, so there is
-- no G1↔G12 cross-contamination. FTS rank still orders the union by relevance.

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
