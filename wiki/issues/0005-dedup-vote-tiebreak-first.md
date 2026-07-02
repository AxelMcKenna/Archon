# [0005] dedup / vote representative chosen by first-seen on ties

- **Severity:** Medium
- **Area:** flagger (vote + verify)
- **Status:** **Fixed 2026-07-02** — `vote.py` gained `_rep_key` (confidence →
  quote length → canonical JSON of the flag), used by `dedup_flags`,
  `dedup_cross_view` and `vote_flags`; the verifier's kept-row representative
  is picked by `(has alt_solution_pathway, canonical JSON)` instead of
  `keep_payloads[0]`. The representative is now a pure function of bucket
  contents. Tests: `test_determinism_fixes.py`.
- **Client impact:** Cosmetic but visible — the displayed wording / bbox of a flag can change run-to-run even when the flag set is stable.

## Summary

When several candidates collapse into one flag, the surviving *representative*
row (its `area` / `reason` / `recommended_action` / `bbox`) is picked by
first-seen on ties:

- `dedup_flags` keeps the first on a confidence tie.
- `vote_flags` uses `max(hits, key=_score)`, which returns the **first** max.
- the verifier picks `keep_payloads[0]` when no payload carries an alt-solution.

"First" depends on pass order and within-pass order, both of which come from the
non-deterministic model. So the same flag can show different prose/geometry to
the client across runs.

## Evidence

- `api/app/plans/vote.py:37-41` (`dedup_flags`), `:143` (`vote_flags` `max(...)`).
- `api/app/vision/plans/vision_pass.py:320-325` — `rep = next((p ... alt_solution_pathway), None) or keep_payloads[0]`.

## Why it breaks determinism

Python `max` / first-wins tie handling is deterministic *given a fixed input
order*, but the input order here is LLM-emission order, which is not fixed.

## Proposed fix

Add an explicit, content-derived tiebreaker so the representative is a pure
function of the bucket contents, independent of arrival order. E.g. among equal
confidence, prefer the longest `verbatim_quote`, then lexicographically smallest
`area` — any total order over stable fields works.

## Effort / risk

- Low. A comparison-key change in `vote.py` / the verifier rep selection. No
  behaviour change to *which* flags survive, only *which wording* represents them.
</content>
