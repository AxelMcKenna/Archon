# [0004] Flag drop can hinge on verifier output truncation

- **Severity:** High
- **Area:** flagger (verification pass)
- **Status:** **Fixed 2026-07-02** — `verify_flags` now verifies flags in
  chunks of `plan_verifier_flags_per_call` (default 10) with *global* flag_ids,
  so no single call can hold enough verdicts to truncate. Verdicts for ids
  outside a chunk (hallucinated) are discarded; missing verdicts are logged and
  stay fail-open. Composes with verifier voting (chunk × pass). Tests:
  `test_determinism_fixes.py`. Trade-off as predicted: each extra chunk
  re-sends the sheet images (input tokens), only on flag-heavy sheets.
- **Client impact:** At margin — whether a flag is dropped can depend on its position in the sheet's flag list, not its merits.

## Summary

The verifier drops a flag when `>= threshold` passes return a *drop* verdict for
it. But `votes` only counts passes that returned a verdict **for that specific
`flag_id`**, and verdicts go missing when the verifier's tool call truncates at
`max_output_tokens = 6000` (the trailing `flag_id`s fall off). The per-flag
threshold is `min(vote_threshold, len(votes))`. So on a sheet with many flags,
whether a given flag is kept or dropped can depend on **how many flags precede it
and the total token budget**, i.e. on ordering, not on the drawing.

The keep-on-no-verdict path (fail-open) is correct and intentional — the issue is
that a *drop* decision's stability is coupled to truncation.

## Evidence

- `api/app/vision/plans/vision_pass.py:199-203` — `max_output_tokens=6000` with a comment explaining truncation drops trailing `flag_id`s.
- `api/app/vision/plans/vision_pass.py:295-313` — `votes = [vm[idx] for vm in verdict_maps if idx in vm]`; `threshold = max(1, min(vote_threshold, len(votes)))`.
- `api/app/config.py:72-73` — `plan_verifier_voting_n=1`, `plan_verifier_voting_threshold=2`.

## Why it breaks determinism

Truncation is sensitive to flag count/order on the sheet, which is itself shaped
by the (non-deterministic) analyser. Two runs with slightly different flag
orderings can truncate at different flags → different drop sets.

## Proposed fix

- **Batch the verifier** so no single call can truncate the verdict list: chunk
  flags into groups sized to fit well under the token budget, or loop until every
  `flag_id` has a verdict.
- **Detect truncation explicitly** (finish reason / verdict-count vs flag-count)
  and re-request the missing `flag_id`s rather than silently keeping them
  unverified.
- Keep the fail-open default for genuinely absent verdicts.

## Effort / risk

- Medium. Batching changes the verifier call structure and token accounting.
  Low correctness risk (fail-open preserved); adds latency on flag-heavy sheets.
</content>
