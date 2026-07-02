# [0003] Hybrid retrieval rank ties have no tiebreaker in the inner CTEs

- **Severity:** High
- **Area:** retrieval (MBIE clause grounding)
- **Status:** **Fixed 2026-07-02** — migration
  `supabase/migrations/20260702000001_mbie_hybrid_retrieval_tiebreak.sql`
  re-creates the function with `, f.id` on both inner window/CTE orderings and
  `, c.id` on the outer sort. `_vec_literal` also widened `%.7g` → `%.9g`
  (see [0010]c) so formatting can't nudge borderline distances.
- **Client impact:** Yes — a different clause set can surface between runs, flipping a flag's verdict (AS-compliant drop / alt-solution annotation).

## Summary

`match_mbie_clauses_hybrid` ranks a `dense` CTE and a `sparse` CTE with
`row_number() over (order by <distance|ts_rank>)` and **no secondary sort key**.
When two clauses tie on cosine distance or `ts_rank`, Postgres assigns the row
numbers in an arbitrary (and over time, shifting) order → different RRF ranks →
different fused scores → a **different top-k clause set** reaches the verifier.
The outer `order by fused.score desc, c.clause_number` only stabilises the final
sort, not the rank assignment that feeds RRF.

Because the retrieved AS clauses drive AS-compliant *drops* and alt-solution
pathways, a tie that resolves differently can change whether a flag is kept.

## Evidence

- `supabase/migrations/20260613000003_mbie_hybrid_retrieval.sql:58-72` — `dense` and `sparse` CTE `ORDER BY` have no `, id` tiebreaker.
- Same file `:87` — outer `order by fused.score desc, c.clause_number nulls last` (stabilises only the final projection).
- Consumers: `api/app/vision/plans/vision_pass.py:125-148` (`_classify_flag` AS-compliant drop), `api/app/mbie/retriever.py:168-247`.

## Why it breaks determinism

Equal sort keys → undefined row order in SQL. The order is not random per-query
but it shifts with table physical layout (vacuum, page splits, inserts), so the
top-k is non-reproducible across time and environments.

## Proposed fix

Add a deterministic secondary sort to **both** inner CTEs:

```sql
-- dense
order by f.embedding <=> p_embedding, f.id
-- sparse
order by ts_rank(f.fts, q.tsq) desc, f.id
```

`f.id` (or `f.clause_number, f.id`) is a stable, unique tiebreaker. New migration;
the function is `create or replace`.

## Effort / risk

- Low. One new migration replacing the function. No app change. Worth a
  before/after check in `test_mbie_retriever_hybrid.py` to lock the ordering.
</content>
