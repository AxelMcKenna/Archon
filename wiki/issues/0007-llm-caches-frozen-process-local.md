# [0007] In-memory LLM caches freeze the first result, process-local

- **Severity:** Medium
- **Area:** letter pipeline (classifier, drafter)
- **Status:** **Fixed 2026-07-02** (see "Fix landed" below)
- **Client impact:** Yes across workers/restarts — two workers (or the same worker after a redeploy) can return different "cached" answers for identical inputs.

## Summary

The AI classifier and the drafter cache results in a process-local dict keyed on
`content + context + prompt_version` (SHA-256) — **not** on the model output. The
first call for a given key captures whatever the (un-seeded, temp-0-but-jittery,
see [0001]) model returned and reuses it for the process lifetime. This *looks*
deterministic but is really "whatever the first roll of the dice was," and
because the cache is in-memory and per-process (explicit TODO to move to Redis),
different workers freeze different answers.

## Evidence

- `api/app/classifier/ai.py:66-101` — `_cache_key` (sha256 of item+context+prompt_version), `_AI_CACHE` lookup/store.
- `api/app/classifier/ai.py:85` — comment: "In-memory cache (process-local). Real cache lives in DB / redis in prod. TODO: set redis up".
- `api/app/drafter.py:176-181` — `_DRAFT_CACHE` keyed by sha256 of `item_text|category|bca|project_type|version|evidence_source|evidence_flag_idx`.

## Why it breaks determinism

The cache hides the upstream variance instead of removing it, and does so
inconsistently across processes. Same input → answer depends on which worker
served the *first* request and whether it has restarted.

## Proposed fix

- Move the cache to a **shared, durable store** (Redis/DB) keyed the same way, so
  all workers agree on one answer per key.
- Address the root cause via [0001] (seed + temperature decision) so what gets
  cached is reproducible in the first place.
- Consider caching at the API/result layer (the persisted classification/draft
  rows already exist) rather than an ephemeral in-process dict.

## Effort / risk

- Medium. Shared cache is infra work; until then, document that classification/
  draft answers are not stable across workers.

## Fix landed (2026-07-02)

Shared write-once cache in Postgres (no new infra — reuses the Supabase
service client):

- Migration `supabase/migrations/20260702000002_llm_cache.sql` — `llm_cache`
  table keyed on the callers' sha256 keys, RLS-enabled with no policies
  (service-role only).
- `api/app/llm/result_cache.py` — `get`/`put` helpers; `put` is
  insert-on-conflict-do-nothing followed by a read-back, so the **first
  persisted answer wins globally** and later writers adopt it. Every path is
  failure-tolerant: a broken DB degrades to the old process-local behaviour.
- `classifier/ai.py` and `drafter.py` wired: the in-process dicts remain as
  an L1 in front, and provider+model were folded into both cache keys so a
  model config change can never serve another model's answer.

Tests: `test_llm_result_cache.py` (write-once, race-winner adoption, failure
tolerance, no-model-call on shared hit). Root-cause note still applies: what
gets cached first is only as reproducible as [0001] makes it — but it is now
*one* durable answer for all workers and restarts.
</content>
