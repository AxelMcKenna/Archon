# Plan flagger eval set

Eval harness for the v2 Building Plan RFI Flagger.

## Status: synthetic-only

This eval set currently contains **synthetic plans only**. The numbers it
produces are a **regression floor**, not a measurement of real-world
precision/recall. Treat them as: "v2 should not regress against v1 on
plans we already understand," nothing more.

The PRD's AC-3 bar (≥70% precision, ≥60% recall) is **not measurable**
until ≥20 real architect plans with their corresponding BCA RFI letters
land in `real/`. Don't quote the synthetic numbers as if they answered AC-3.

## Layout

```
eval/plan-flagger/
├── README.md              ← this file
├── run.py                 ← regression runner
├── synthetic/
│   ├── generate.py        ← generates the synthetic PDFs from templates
│   ├── *.pdf              ← committed; regenerate with `python generate.py`
│   └── *.labels.json      ← ground-truth labels per plan
└── real/                  ← (later) committed real plans, encrypted at rest
```

## Labelling protocol

Each plan has a sibling `<plan>.labels.json` of the form:

```json
{
  "plan_id": "synthetic-bracing-incomplete",
  "bca": "ccc",
  "project_type": "extension",
  "ground_truth_flags": [
    {
      "category": "building_code:B1",
      "severity": "must_resolve",
      "page": 3,
      "area_hint": "bracing schedule",
      "rationale": "Achieved BUs column intentionally omitted; canonical CCC RFI."
    }
  ]
}
```

`area_hint` is a substring/keyword match against the model's `area` field.
Matching is fuzzy: a flag is a true positive if it agrees on `category`
and `page` and any `area_hint` token appears in the model's `area`.

## Running

```
EVAL_PERSIST=0 python eval/plan-flagger/run.py
```

Set `EVAL_PERSIST=1` to write a row to `prompt_eval_runs` (requires
Supabase env). Set `--report-format=json` to emit machine-readable output
(used by CI).

## CI gate

CI runs the suite on PRs touching analyser code/prompts. While the eval
set is synthetic, the gate is **advisory only** — metrics are reported
in the PR comment but no merge is blocked. Flip `EVAL_BLOCKING=1` in the
workflow once ≥20 real labelled plans land.
