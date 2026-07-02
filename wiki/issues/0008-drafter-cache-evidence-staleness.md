# [0008] Drafter cache keys on evidence identity, not content

- **Severity:** Medium
- **Area:** letter pipeline (drafter)
- **Status:** **Fixed 2026-07-02** — the rendered evidence block (the exact
  text injected into the prompt) is folded into the cache key in
  `drafter.py`, so any change to the grounding content invalidates the cached
  draft. Tests: `test_determinism_fixes.py`. ([0007]'s process-local cache
  concern still applies to this cache.)
- **Client impact:** Yes — a draft can be served grounded in evidence that no longer exists.

## Summary

The drafter cache key includes `evidence_source` and `evidence_flag_index` but
**not the evidence content** (matched clause / quote / rationale). If the flagger
re-runs and the flag at that index changes its text while keeping the same source
and index, the cache returns a **stale draft** grounded in the old evidence.
Same key, different underlying data.

## Evidence

- `api/app/drafter.py:170-181` — `cache_key = sha256(f"{item_text}|{category}|{bca}|{project_type}|{version}|{evidence_source}|{evidence_flag_idx}")`.
- Comment at `:171-174` notes the key includes evidence source so re-grounded items re-draft — but a same-index content change is not covered.

## Why it breaks determinism

Determinism here should mean "same inputs → same draft". The evidence content is
an input to the draft (it is injected into the prompt via
`_render_plan_evidence_block`), but it is absent from the key, so the mapping
inputs→output is not actually keyed on all inputs.

## Proposed fix

Fold a hash of the *rendered evidence block* (or the evidence clause/quote
content) into the cache key, so any change to the grounding content invalidates
the cached draft. Cheap and self-contained.

## Effort / risk

- Low. One-line change to the cache key composition in `drafter.py`. Slightly
  lower cache hit-rate when evidence churns (correct behaviour).
</content>
