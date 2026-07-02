# [0009] Stage-A best-match ties inherit flagger ordering

- **Severity:** Low
- **Area:** letter pipeline (Stage-A grounding)
- **Status:** **Fixed 2026-07-02** (tie half) — `best_match` breaks ties by
  clause overlap → token overlap → the flag's stable content fields
  (quote/rule/rationale), so array order no longer decides. The
  `MATCH_THRESHOLD` cliff remains, mitigated upstream by [0001].
  Tests: `test_determinism_fixes.py`.
- **Client impact:** At margin — which flag (clause/quote) a drafted response grounds in can change with flagger emission order.

## Summary

`best_match` scores every flag for an RFI item and takes `max(scored,
key=score)`, which returns the **first** on a tie — i.e. the lowest index in the
`analysis.flags` array. That array's order comes from the non-deterministic
flagger, so two equally-scoring flags resolve to whichever the flagger happened
to emit first, changing the grounded clause/quote/evidence the drafter uses.

Separately, `MATCH_THRESHOLD = 0.35` is a cliff: an item scoring near 0.35 flips
between a grounded draft and `source="none"` (manual handling). That is
deterministic given fixed flag text, but the flag text is the variable thing
(see [0001]).

## Evidence

- `api/app/grounding/matcher.py:140-150` — `best = max(scored, key=lambda m: m.score)`; `MATCH_THRESHOLD = 0.35` at `:24`.
- `api/app/grounding/runner.py` — `ground_letter` consumes `best_match` per item and upserts `rfi_item_plan_evidence`.

## Why it breaks determinism

The matcher itself is pure (regex + Jaccard), but its input ordering and the flag
text feeding token overlap both come from the non-deterministic flagger. Ties and
near-threshold items therefore inherit that variance.

## Proposed fix

- Add a content-derived tiebreaker to `best_match` (e.g. on a tie prefer higher
  `clause_overlap`, then higher `token_overlap`, then a stable flag field) so the
  choice doesn't depend on array order.
- The threshold cliff is mostly resolved upstream by stabilising the flagger
  ([0001]); optionally widen to a band with a "weak match" state instead of a
  hard cutoff.

## Effort / risk

- Low. Comparison-key change in `matcher.py`; covered by `test_grounding_matcher.py`.
</content>
