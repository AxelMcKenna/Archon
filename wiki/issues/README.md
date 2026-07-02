# RFI engine — determinism issues

Tracking the places where the RFI engine can produce a **different result for the
same input on a re-run**, or is otherwise non-reproducible across workers /
environments / provider backends.

Context: the engine is non-deterministic *by construction* (LLM-driven). It has
real mitigation machinery — N-of-K self-consistency voting, fail-open
verification, deterministic refinement, content-keyed caches. These issues are
the **gaps that let sampling noise reach the client-visible output**, plus a few
self-contradictions in the design.

Audited on branch `feat/rfi-engine`, 2026-07-01.
Deterministic-code fixes landed 2026-07-02 (0002, 0003, 0004, 0005, 0008,
0009, 0010) — covered by `api/tests/test_determinism_fixes.py`.

## Index

| ID | Title | Severity | Area | Status |
|----|-------|----------|------|--------|
| [0001](0001-seed-voting-nondeterminism.md) | Temp 0 + no seed → ~40% of flags flicker run-to-run; voting only damps it | Critical | flagger | **Closed as mitigated 2026-07-02** — option B adopted (temp 0.5 + per-pass seed, voting 3/2): Jaccard 0.584 → 0.700 at identical recall. Residual flicker is provider-side (best-effort seeds); exact re-uploads fully deterministic via the content-hash cache |
| [0002](0002-provider-fallback-model-swap.md) | Cross-provider fallback silently swaps the model | Critical | infra | **Fixed 2026-07-02** — same-tier fallback + provenance persisted (`llm_fallback_events`) |
| [0003](0003-retrieval-rank-ties.md) | Hybrid retrieval rank ties have no tiebreaker | High | retrieval | **Fixed 2026-07-02** — migration `20260702000001` |
| [0004](0004-verifier-truncation-drops.md) | Flag drop can hinge on verifier output truncation | High | flagger | **Fixed 2026-07-02** — verifier chunked (`plan_verifier_flags_per_call`) |
| [0005](0005-dedup-vote-tiebreak-first.md) | dedup/vote representative chosen by first-seen | Medium | flagger | **Fixed 2026-07-02** — content-derived `_rep_key` |
| [0006](0006-render-cliffs.md) | Rendering DPI/tiling are version-sensitive cliffs | Medium | rendering | **Fixed 2026-07-02** — pixel-decided tiling + per-page provenance; one eval run pending |
| [0007](0007-llm-caches-frozen-process-local.md) | In-memory LLM caches freeze first result, process-local | Medium | letter-pipeline | **Fixed 2026-07-02** — shared write-once `llm_cache` table |
| [0008](0008-drafter-cache-evidence-staleness.md) | Drafter cache keys on evidence identity, not content | Medium | letter-pipeline | **Fixed 2026-07-02** — evidence block folded into key |
| [0009](0009-stage-a-match-tie-threshold.md) | Stage-A best-match ties inherit flagger ordering | Low | letter-pipeline | **Fixed 2026-07-02** — content tiebreak in `best_match` |
| [0010](0010-low-misc.md) | Misc low: summary tiebreak, metrics race, vec truncation | Low | misc | **Fixed 2026-07-02** (10a/10b/10c) |

## Ranking by client impact

Does the same plan/letter produce a different result on re-run?

1. **0001** — borderline flags flicker — *mitigated (option B adopted: J 0.584 → 0.700, recall flat)*
2. **0003** — retrieval ties flip verdicts via the clause set — *fixed*
3. **0002** — fallback swaps the model silently and unrecorded — *fixed*
4. **0007 / 0008** — caches freeze / serve stale non-deterministic results across workers — *both fixed*

All ten issues are now fixed or mitigated (validated on the eden box
2026-07-02; the 0006 tiling change was exercised in the same runs). The
remaining determinism gap is provider-side: seeds are honoured best-effort,
so first-run borderline flags still flicker at a reduced rate. Exact
re-uploads of an unchanged file are fully deterministic via the service-level
content-hash cache in `plan_pipeline.py`.
</content>
