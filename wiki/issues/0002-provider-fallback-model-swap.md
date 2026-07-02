# [0002] Cross-provider fallback silently swaps the model mid-run

- **Severity:** Critical
- **Area:** infra (`invoke_tool`)
- **Status:** **Fixed 2026-07-02** (see "Fix landed" below)
- **Client impact:** Yes, on transient errors — the same input gets scored by a different model, and which model answered is not recorded.

## Summary

On any post-retry failure, with `llm_provider_fallback = True` (default),
`invoke_tool` fails over Gemini ↔ OpenRouter to **the other provider's default
model**. The code's own comment notes this can swap an analyser-tier model in for
the verifier. So a transient 429 means the same plan/letter is processed by an
entirely different model → different flags — and nothing in the persisted result
records *which* model actually answered.

## Evidence

- `api/app/vision/core/invoker.py:72-136` — `_fallback_for` maps to the other provider's *default* model; `invoke_tool` retries the whole call there.
- `api/app/config.py:41` — `llm_provider_fallback: bool = True`.
- Comment at `_fallback_for` (lines ~76-78): "this may swap in an analyser-tier model … acceptable on a rare emergency path."

## Why it breaks determinism

Two identical runs diverge when one happens to hit a transient error and fail
over. The divergence is invisible after the fact because the answering
provider/model isn't persisted alongside the analysis.

## Proposed fix

1. **Record provenance:** persist the provider + model + (OpenAI)
   `system_fingerprint` that actually produced each analysis/verification, on the
   analysis row. Makes the swap auditable even if we keep it.
2. **Make fallback explicit, not silent:** surface a flag on the result
   ("served by fallback model X") so downstream and the UI can mark the run as
   lower-confidence / candidate for re-run.
3. **(Optional) Map fallback to a same-tier model** rather than the other
   provider's default, so a fail-over at least stays in the same capability band.

## Effort / risk

- Low-to-medium. (1) is a schema/field addition + plumbing through
  `analysis_runner`. (2)/(3) are small logic changes in `invoker.py`. No model
  behaviour change, so no eval regression risk.

## Fix landed (2026-07-02)

All three proposed pieces, scoped to the plan analyser + verifier:

- **Same-tier fallback:** `_fallback_for(provider, model)` now maps a
  verifier-tier model to the *other provider's verifier model* (and analyser →
  analyser default), so a transient error can't swap capability tiers
  (`api/app/vision/core/invoker.py`).
- **Provenance recorded:** `invoke_tool(..., provenance=...)` fills an optional
  dict with the provider/model that actually answered plus
  `fallback`/`fallback_reason`. Plumbed through `run_tool_pass` →
  `run_single_vision_pass` (analyser) and `_run_verification_pass` (verifier).
- **Surfaced, not silent:** fallback events are persisted on the analysis
  payload as `llm_fallback_events` (with `served_by_fallback: bool`), so a
  fallback-served run is auditable and re-runnable
  (`api/app/plans/analyzer.py`).

Tests: `test_llm_retry.py` (provenance on fail-over). Remaining scope (minor):
the RFI letter extractor, cross-view reconciliation and the drafter don't yet
capture provenance — same mechanism applies if needed.
</content>
