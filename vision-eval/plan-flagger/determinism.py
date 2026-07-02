"""Run-to-run determinism check for the plan flagger (wiki/issues/0001).

Runs `analyse_plan()` K times on ONE plan and reports the mean pairwise
Jaccard similarity of the flag sets, plus the "core" flags present in every
run. Flag identity uses the same `vote_key` (page, verbatim-quote signature)
the analyser's own cross-run voting uses, so this measures the same thing
that machinery measures internally.

Deliberately single-plan, small-K: this calls the real vision model K times,
so cost scales with K x voting_n x sheets. Use --repeats to control spend.
"""

from __future__ import annotations

import argparse
import json
import sys
from itertools import combinations
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
API_ROOT = ROOT / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.plans import analyse_plan  # noqa: E402
from app.plans.vote import vote_key  # noqa: E402


def _flag_id_set(flags: list[dict[str, Any]]) -> set[tuple[int, str]]:
    return {vote_key(f) for f in flags}


def _jaccard(a: set[Any], b: set[Any]) -> float:
    if not a and not b:
        return 1.0
    return len(a & b) / len(a | b)


def run(plan_path: Path, labels: dict[str, Any], repeats: int) -> dict[str, Any]:
    file_bytes = plan_path.read_bytes()
    run_sets: list[set[tuple[int, str]]] = []
    run_flag_counts: list[int] = []

    for i in range(repeats):
        analysis, _prompt_version, _metrics, _extras = analyse_plan(
            file_bytes=file_bytes,
            media_type="application/pdf",
            bca=labels.get("bca", "ccc"),
            project_type=labels.get("project_type", "extension"),
            project_description=labels.get("description", ""),
        )
        flags = analysis.get("flags") or []
        run_flag_counts.append(len(flags))
        run_sets.append(_flag_id_set(flags))
        print(f"  run {i + 1}/{repeats}: {len(flags)} flags", file=sys.stderr)

    pairs = list(combinations(range(repeats), 2))
    jaccards = [_jaccard(run_sets[i], run_sets[j]) for i, j in pairs]
    mean_jaccard = round(sum(jaccards) / len(jaccards), 4) if jaccards else 1.0
    core = set.intersection(*run_sets) if run_sets else set()

    return {
        "plan_id": labels.get("plan_id", plan_path.stem),
        "repeats": repeats,
        "flags_per_run": run_flag_counts,
        "pairwise_jaccard": [round(j, 4) for j in jaccards],
        "mean_jaccard": mean_jaccard,
        "core_flag_count": len(core),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--plan-id",
        default="synthetic-commercial-coordination",
        help="Plan id under vision-eval/plan-flagger/synthetic/ (no extension).",
    )
    ap.add_argument(
        "--repeats",
        type=int,
        default=3,
        help="Number of analyse_plan() calls (K). Cost scales with this.",
    )
    ap.add_argument("--report-format", choices=("text", "json"), default="text")
    args = ap.parse_args()

    synthetic_dir = Path(__file__).parent / "synthetic"
    plan_path = synthetic_dir / f"{args.plan_id}.pdf"
    label_path = synthetic_dir / f"{args.plan_id}.labels.json"
    if not plan_path.exists() or not label_path.exists():
        raise SystemExit(f"missing plan/labels for {args.plan_id} in {synthetic_dir}")

    labels = json.loads(label_path.read_text())
    result = run(plan_path, labels, args.repeats)

    if args.report_format == "json":
        print(json.dumps(result, indent=2))
    else:
        print(
            f"plan={result['plan_id']}  repeats={result['repeats']}  "
            f"flags_per_run={result['flags_per_run']}  "
            f"mean_jaccard={result['mean_jaccard']}  "
            f"core_flags={result['core_flag_count']}"
        )


if __name__ == "__main__":
    main()
