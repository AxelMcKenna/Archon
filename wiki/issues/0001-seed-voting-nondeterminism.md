# [0001] No seed + temperature 0 + 2-of-3 voting → borderline flags flicker

- **Severity:** Critical
- **Area:** flagger (plan analyser)
- **Status:** **Open — "gut the voting" attempt REVERTED.** Disabling voting (`voting_n=1`) was tried and rolled back: a direct determinism test showed it made reproducibility *worse*, not better (results below). Voting stays at 3/2. Seed plumbing kept (inert at temp 0; infra for option B).
- **Client impact:** Yes — the same plan re-uploaded gains/loses ~40–50% of its flags run-to-run at *any* tested N. Voting damps this (n=3 more stable than n=1) but does not remove it.

## Summary

The analyser runs `plan_analyser_voting_n = 3` passes per sheet and keeps a flag
only if it appears in `>= 2` of them (`plan_analyser_voting_threshold = 2`). The
passes are pinned to `temperature = 0.0` with **no seed**. At true temp 0 all
three passes should be identical, making the vote a 3×-cost no-op — they differ
only because the provider is non-deterministic at temp 0 (MoE routing, batched
GPU float non-associativity). So the design **relies on uncontrolled provider
jitter** for voting to mean anything, and the `2-of-3` threshold sits exactly
where that jitter flips a flag in or out.

A flag the model emits in 1-of-3 (or 2-of-3) passes is on the knife-edge:
re-run the same plan and it crosses the threshold the other way.

## Evidence

- `api/app/vision/core/invoker.py` — `invoke_tool(..., temperature=0.0)` default; `run_tool_pass` did not override it.
- `api/app/llm/gemini.py` — `GenerateContentConfig` set only `temperature` (no `seed`, no `topP`/`topK`).
- `api/app/llm/openrouter.py` — request body had no `seed`.
- `api/app/config.py:63-64` — `plan_analyser_voting_n=3`, `plan_analyser_voting_threshold=2`.
- `api/app/plans/vote.py:102-145` — `vote_flags` keeps buckets present in `>= threshold` runs.
- `api/app/plans/analyzer.py` — per-sheet pass loop `for pass_idx in range(voting_n)`.

## Why it breaks determinism

`temperature=0` is greedy decoding — there is no sampling RNG for a seed to pin,
so a seed alone barely moves temp-0 jitter. The voting machinery only does
something *because* of that jitter, which is uncontrolled and non-reproducible.
Net: borderline flags are a coin-flip per run.

## What landed (partial)

`seed` is now threaded end-to-end and set per voting pass (`seed = pass_idx`):
`call_gemini_tool` / `call_openrouter_tool` (+ async) → `invoke_tool` →
`run_tool_pass` → `run_single_vision_pass` → analyser loop. Temperature is
unchanged (`0.0`). This is infrastructure: it makes the *intended* design
(diverse-but-reproducible passes) possible but does not by itself fix the
flicker, because at temp 0 the seed is nearly inert.

## Proposed fix (the real decision)

Pick one:

- **(A) Reproducibility-first:** keep `temperature=0`, drop `voting_n` to 1.
  Cheapest and most stable; slightly lower recall. Makes the seed irrelevant and
  the vote honest (there is no vote).
- **(B) Recall-first:** raise `temperature` (~0.4–0.7) so the 3 passes are
  genuinely diverse, with the per-pass seed (already wired) making them
  reproducible. Keeps voting's recall benefit *and* makes it deterministic.

(B) is the design the voting always implied. Either is shippable on the current
providers. Caveat: even seeded reproducibility is best-effort and breaks when the
provider updates the model under us (see [0002]).

## Effort / risk

- Decision + 1-line config change. Risk: (B) shifts flag recall/precision — needs
  an eval-harness run (`vision-eval/plan-flagger/`) before/after to confirm the
  flag set doesn't regress.

## Decision (2026-07-01)

Took **option A** — disabled voting rather than deleting the machinery:

- `api/app/config.py` — `plan_analyser_voting_n: 3 → 1`, `plan_analyser_voting_threshold: 2 → 1`.
- Seed plumbed end-to-end (`seed=pass_idx` per analyser/verifier pass; `seed=0`
  for single-shot RFI extraction + reconciliation). Temperature left at `0.0`.
- The voting code (`app/plans/vote.py`, the pass loop) is **kept, not deleted** —
  at `voting_n=1` it is inert (loop runs once, `vote_flags` is a passthrough), and
  it is exactly what option B would re-enable. Reversing is a config flip.

Rationale: at temp 0 the multi-pass vote only denoised uncontrolled provider
jitter, which was also the source of the borderline-flag flicker. One greedy
seeded pass is the most reproducible config and removes the 2-of-N knife-edge.
For a client-facing flagger, consistency was judged to outweigh the *accidental*
recall the extra passes provided. The verifier (a separate precision gate) is
unchanged.

## Determinism test (2026-07-01) — REVERSES the decision below

The accuracy eval (further down) measures precision/recall vs ground truth — NOT
run-to-run reproducibility. A direct determinism test was run afterward: the same
plan (`synthetic-commercial-coordination.pdf`) analysed K times per config, flag
sets compared by mean pairwise Jaccard (1.0 = identical every run) and "core"
flags (present in *every* run). On the `eden-495408` box (OpenRouter analyser):

| config | round 1 (K=4) | round 2 (K=5) | core flags |
|--------|---------------|---------------|------------|
| n=1 (gutted) | J=0.493 | J=0.517 | 3 |
| n=3 (voting) | **J=0.615** | **J=0.551** | 3–4 |
| n=5 | — | J=0.492 | 3 |

**Finding: voting is a stabiliser. n=3 is consistently MORE reproducible than
n=1** — the `>=2-of-3` threshold filters per-pass provider jitter toward a
consensus. Gutting the voting removed that filter and let each single pass's full
jitter through, *lowering* reproducibility. (n=5 gives no further gain; the
measurement is noisy at this K.) So the earlier mental model — "at temp 0 the
passes are identical, voting is a pointless no-op" — was **wrong**: at temp 0 this
provider is *not* identical across passes, and voting genuinely damps it.

**Decision reversed:** `voting_n` restored to 3/2. The accuracy eval below stands
(gutting was accuracy-neutral) but is moot — the goal was determinism, and on that
axis n=3 wins.

**Caveat that matters:** even n=3 sits at ~0.55–0.62 Jaccard — ~40% of flags still
flicker run-to-run, and only ~3 flags are stable across every run. Voting damps
the jitter; it does not make the engine reproducible. Real reproducibility needs
temp>0 + per-pass seed (best-effort; seed wiring already in place) or
provider-level determinism guarantees that don't currently exist.

## Eval results (2026-07-01) — voting disabled was accuracy-neutral (but moot, see above)

Ran the synthetic harness (`vision-eval/plan-flagger/`, 4 plans) on the
`eden-495408` GCE box (`instance-20260509-023042`, the live ARRO host — analyser
provider there is **OpenRouter**), three A/B rounds, `voting_n` overridden via env,
no DB persist:

| round | n=3 (old) P / R / H | n=1 (gutted) P / R / H |
|-------|---------------------|------------------------|
| 1 | 0.196 / **0.625** / 0.742 | 0.208 / **0.625** / 0.729 |
| 2 | 0.188 / **0.625** / 0.750 | 0.196 / **0.625** / 0.721 |
| 3 | 0.229 / **0.625** / 0.708 | 0.181 / **0.625** / 0.756 |

**Recall = 0.625 in all six runs**, identical across configs. Precision and
hallucination jitter a few pp in both directions with no consistent edge to
either config — that jitter across identical-config runs *is* this issue's
non-determinism, and it buys no recall. n=1 also ran in ~half the wall time
(~34s vs ~69s per run).

**Conclusion:** dropping the 2nd/3rd analyser passes has zero recall cost on the
synthetic set → **option A stands, issue resolved.** Caveat: the synthetic set is
a 4-plan regression floor, not a real-world precision/recall measurement (see
`vision-eval/plan-flagger/README.md`). Recall is stable at 0.625 likely because
these plans carry a fixed set of obvious flags a single pass reliably catches.
Re-check against the `real/` set once ≥20 labelled real plans land; if real-world
recall turns out pass-count-sensitive, escalate to option B (the seed wiring is
already in place for it).

## Prep landed (2026-07-02) — ready for the option-B eval

- **Sampling shape pinned:** `top_p=1.0` is now set explicitly on both
  provider arms (`gemini.py`, `openrouter.py`), so provider-default changes
  can't alter sampling under us and a cross-provider fallback doesn't change
  the sampling shape. Combined with the per-pass seed already wired, flipping
  `PLAN_ANALYSER_TEMPERATURE` is the *only* remaining change option B needs.
- **Scope clarification (good news):** the service layer already
  content-addresses analyses — `plan_pipeline.py` reuses the persisted
  analysis for `(content_hash, analyser_version, provider, model_id)`. So an
  exact re-upload of the same file is **already deterministic by
  construction**. This issue's flicker applies to first analyses, edited
  files, and direct `analyse_plan()` callers (the eval harness) — which is
  what the option-B decision governs.

**One-command validation on a keyed box (eden / CI):**

```bash
cd api  # use the project venv (uv sync); needs GEMINI/OPENROUTER key in env
# determinism A/B — mean pairwise Jaccard, higher is better (baseline ~0.55-0.62)
python ../vision-eval/plan-flagger/determinism.py --repeats 5
PLAN_ANALYSER_TEMPERATURE=0.5 python ../vision-eval/plan-flagger/determinism.py --repeats 5
# accuracy guard — recall must hold at the 0.625 synthetic floor
python ../vision-eval/plan-flagger/run.py --report-format=json > /tmp/eval-t0.json
PLAN_ANALYSER_TEMPERATURE=0.5 python ../vision-eval/plan-flagger/run.py --report-format=json > /tmp/eval-t05.json
```

Adopt (set `plan_analyser_temperature: 0.5` in `config.py`) if Jaccard
improves materially with recall flat; revert the env var and close as
"voting-only" if not.

## Option-B A/B results (2026-07-02) — ADOPTED

Run on the eden box (throwaway container from `arro-api:latest` + the
`feat/rfi-engine` code, live env/keys, OpenRouter analyser), K=5 repeats on
`synthetic-commercial-coordination`:

| config | mean pairwise Jaccard | core flags | accuracy (4-plan run.py) |
|--------|----------------------|------------|--------------------------|
| temp 0 (baseline) | 0.584 | 3 | P 0.196 / **R 0.625** / H 0.742 |
| temp 0.5 + seed (option B) | **0.700** | 3 | P 0.188 / **R 0.625** / H 0.750 |

Both decision-rule conditions met: Jaccard up ~0.12 absolute (~28% less
flicker), recall identical at 0.625, precision/hallucination inside the known
run-to-run jitter band (0.181–0.229 across identical configs in earlier
rounds). **`plan_analyser_temperature` default flipped to 0.5.**

Honest residual: J=0.70 is not J=1.0 — the provider honours `seed` only
best-effort, so borderline flags still flicker at a reduced rate. Full
determinism for the *exact same file* comes from the service-level
content-hash cache (`plan_pipeline.py`), which serves the persisted analysis
on re-upload. Status: **closed as mitigated** — the remaining gap is
provider-side and tracked by the caveat in [0002].

## Validation procedure (for re-runs)

The eval calls the real vision model via `analyse_plan()`, so it can only run
where `GEMINI_API_KEY`/`OPENROUTER_API_KEY` exist (CI `plan-vision-eval`, or a dev
box with keys) — **not** in the audit session this was authored in.

Measure the recall delta the disabled passes were providing. `voting_n` is
env-overridable (`pydantic-settings`, no prefix):

```bash
cd api && uv sync --frozen --no-dev   # or your venv
# baseline: old 3-pass voting
PLAN_ANALYSER_VOTING_N=3 PLAN_ANALYSER_VOTING_THRESHOLD=2 \
  .venv/bin/python ../vision-eval/plan-flagger/run.py --report-format=json > /tmp/eval-n3.json
# new: voting disabled (matches the committed default)
PLAN_ANALYSER_VOTING_N=1 PLAN_ANALYSER_VOTING_THRESHOLD=1 \
  .venv/bin/python ../vision-eval/plan-flagger/run.py --report-format=json > /tmp/eval-n1.json
# compare summary.recall_avg / precision_avg / hallucination_rate
```

Decision rule:
- **Recall delta negligible** (≲ a few pp on the synthetic set) → keep A; this
  issue is closed.
- **Recall delta material** → escalate to **B** (restore `voting_n=3`, raise
  `temperature` ~0.5 in `run_tool_pass`/`invoke_tool` so the passes are
  *purposefully* diverse; the per-pass seed already makes them reproducible).

Caveat: the synthetic eval set is a regression floor, not a real-world
precision/recall measurement (see `vision-eval/plan-flagger/README.md`); and the
CI workflow currently exports only `ANTHROPIC_API_KEY`, so it needs a
`GEMINI_API_KEY`/`OPENROUTER_API_KEY` secret added before it can exercise the
default Gemini provider. Treat the delta as directional.
</content>
