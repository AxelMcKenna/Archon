# [0010] Misc low-severity determinism notes

- **Severity:** Low
- **Area:** misc
- **Status:** **Fixed 2026-07-02** — 10a: both summary picks tiebreak
  lexicographically (`key=lambda s: (len(s), s)`); 10b: `_process` accumulates
  into a per-sheet `Metrics` returned in the sheet result and merged on the
  main thread after the pool joins; 10c: `_vec_literal` widened to `%.9g`
  (float32 round-trip).
- **Status:** Open

Bundled minor findings not worth their own file. None change the client-visible
flag set on their own; listed for completeness.

## 10a. Summary / label selection by `max(..., key=len)`

`max(summaries, key=len, default="")` returns the first on an equal-length tie,
so the chosen sheet/analysis summary can change between runs.

- `api/app/plans/analyzer.py:286` (cross-sheet summary), `:564` (per-sheet summary).
- Fix: tiebreak on a stable field (e.g. lexicographic) or just accept — cosmetic.

## 10b. Metrics token-count race across worker threads

`metrics.input_tokens += ...` runs inside the per-sheet `ThreadPoolExecutor`
workers. `obj.attr += x` is read-modify-write, not atomic under the GIL, so token
totals can undercount under concurrency. Affects **reported metrics only**, never
flags.

- `api/app/plans/analyzer.py:522-523` (inside `_process`, runs in worker threads).
- Fix: accumulate per-sheet token counts in the returned result dict and sum them
  on the main thread after `pool.map` (ordering already deterministic), instead of
  mutating shared `metrics` from workers.

## 10c. Embedding literal truncated to 7 significant figures

`_vec_literal` formats each vector component with `%.7g`, discarding precision
before the dense retrieval distance is computed.

- `api/app/mbie/retriever.py:36-37`.
- Harmless given the exact (non-ANN) scan and the re-rank, but combined with the
  missing inner-CTE tiebreaker ([0003]) it can nudge borderline orderings. Fix is
  optional: widen to `%.9g` / full repr, or just rely on [0003]'s tiebreaker.

## Confirmed deterministic (no action)

- `pool.map` preserves sheet order → flag aggregation order is stable given sheet order.
- Entity extractor (`api/app/extractors/entities.py`) — `sorted(set(...))` throughout.
- bbox/OCR refiners (`api/app/plans/bbox_refiner.py`, `ocr_refiner.py`) — pure given fixed inputs.
- Classification reconciler (`api/app/classifier/reconciler.py:46-50`) — deliberately avoids first-in-list-order tie bias with `max(...)`.
</content>
