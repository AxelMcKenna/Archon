"""Plan flagger eval regression runner.

Loads each labelled plan, runs `analyse_plan()`, and computes per-plan
precision / recall / hallucination against the ground-truth labels.

Match rule: a returned flag is a TRUE POSITIVE if its `category` and
`page` match a ground-truth entry AND any whitespace token from
`area_hint` appears in the model's `area` field (case-insensitive).
Otherwise it's a FALSE POSITIVE. Ground-truth entries with no match
are FALSE NEGATIVES.

Hallucination rate = false positives that are also unverified by the
verification pass / share no taxonomy category overlap with ground
truth at all.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Allow running from repo root without installing the api package.
ROOT = Path(__file__).resolve().parents[2]
API_ROOT = ROOT / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.plan_analyzer import analyse_plan  # noqa: E402

EVAL_SET_VERSION = "0.1-synthetic"


def _load_labels(label_path: Path) -> dict[str, Any]:
    return json.loads(label_path.read_text())


def _tokens(text: str) -> set[str]:
    return {t.strip().lower() for t in text.split() if t.strip()}


def _match(flag: dict[str, Any], gt: dict[str, Any]) -> bool:
    if flag.get("category") != gt.get("category"):
        return False
    if int(flag.get("page") or 0) != int(gt.get("page") or 0):
        return False
    hint_tokens = _tokens(gt.get("area_hint", ""))
    if not hint_tokens:
        return True
    area_tokens = _tokens(flag.get("area", ""))
    return bool(hint_tokens & area_tokens)


def _score_plan(flags: list[dict[str, Any]], ground_truth: list[dict[str, Any]]) -> dict[str, Any]:
    matched_gt: set[int] = set()
    matched_flag: set[int] = set()
    for fi, flag in enumerate(flags):
        for gi, gt in enumerate(ground_truth):
            if gi in matched_gt:
                continue
            if _match(flag, gt):
                matched_gt.add(gi)
                matched_flag.add(fi)
                break

    tp = len(matched_flag)
    fp = len(flags) - tp
    fn = len(ground_truth) - len(matched_gt)
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    # A hallucinated flag is one whose category isn't anywhere in the
    # ground-truth set — the model invented a category that's not on the
    # plan at all.
    gt_cats = {gt.get("category") for gt in ground_truth}
    hallucinations = [
        f for fi, f in enumerate(flags)
        if fi not in matched_flag and f.get("category") not in gt_cats
    ]
    hallucination_rate = len(hallucinations) / len(flags) if flags else 0.0

    return {
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "precision": precision,
        "recall": recall,
        "hallucination_rate": hallucination_rate,
        "missed_categories": [
            gt.get("category")
            for gi, gt in enumerate(ground_truth)
            if gi not in matched_gt
        ],
    }


def _persist_run(payload: dict[str, Any]) -> None:
    try:
        from supabase import create_client
    except ImportError:
        print("supabase not installed; skipping persist", file=sys.stderr)
        return
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        print("SUPABASE_URL/KEY not set; skipping persist", file=sys.stderr)
        return
    db = create_client(url, key)
    db.table("prompt_eval_runs").insert(
        {
            "prompt_version": payload["prompt_version_analysis"],
            "prompt_type": "analysis",
            "eval_set_version": payload["eval_set_version"],
            "n_plans": payload["summary"]["n_plans"],
            "precision_avg": payload["summary"]["precision_avg"],
            "recall_avg": payload["summary"]["recall_avg"],
            "hallucination_rate": payload["summary"]["hallucination_rate"],
            "per_plan_results": payload["per_plan_results"],
        }
    ).execute()


def run(plan_dir: Path, *, persist: bool = False) -> dict[str, Any]:
    label_paths = sorted(plan_dir.glob("*.labels.json"))
    if not label_paths:
        raise SystemExit(f"no *.labels.json files in {plan_dir}")

    per_plan: list[dict[str, Any]] = []
    prompt_version_analysis = ""
    prompt_version_verification = ""

    for label_path in label_paths:
        labels = _load_labels(label_path)
        pdf_path = label_path.with_suffix("").with_suffix(".pdf")
        if not pdf_path.exists():
            raise SystemExit(f"missing pdf for {label_path.name}")

        analysis, prompt_version, _metrics, extras = analyse_plan(
            file_bytes=pdf_path.read_bytes(),
            media_type="application/pdf",
            bca=labels.get("bca", "ccc"),
            project_type=labels.get("project_type", "extension"),
            project_description=labels.get("description", ""),
        )
        prompt_version_analysis = prompt_version
        prompt_version_verification = extras["verification_prompt_version"]

        score = _score_plan(
            analysis.get("flags") or [],
            labels.get("ground_truth_flags") or [],
        )
        score["plan_id"] = labels["plan_id"]
        score["flags_returned"] = len(analysis.get("flags") or [])
        score["ground_truth_count"] = len(labels.get("ground_truth_flags") or [])
        per_plan.append(score)

    n = len(per_plan)
    summary = {
        "n_plans": n,
        "precision_avg": round(sum(p["precision"] for p in per_plan) / n, 4),
        "recall_avg": round(sum(p["recall"] for p in per_plan) / n, 4),
        "hallucination_rate": round(
            sum(p["hallucination_rate"] for p in per_plan) / n, 4
        ),
    }

    payload = {
        "prompt_version_analysis": prompt_version_analysis,
        "prompt_version_verification": prompt_version_verification,
        "eval_set_version": EVAL_SET_VERSION,
        "run_at": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "per_plan_results": per_plan,
    }
    if persist:
        _persist_run(payload)
    return payload


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan-dir", default=str(Path(__file__).parent / "synthetic"))
    ap.add_argument("--report-format", choices=("text", "json"), default="text")
    ap.add_argument(
        "--persist",
        action="store_true",
        default=os.environ.get("EVAL_PERSIST") == "1",
    )
    args = ap.parse_args()
    payload = run(Path(args.plan_dir), persist=args.persist)
    if args.report_format == "json":
        print(json.dumps(payload, indent=2))
    else:
        s = payload["summary"]
        print(
            f"plans={s['n_plans']}  precision={s['precision_avg']:.2f}  "
            f"recall={s['recall_avg']:.2f}  hallucination={s['hallucination_rate']:.2f}"
        )
        for p in payload["per_plan_results"]:
            print(
                f"  {p['plan_id']:40s}  P={p['precision']:.2f}  R={p['recall']:.2f}  "
                f"flags={p['flags_returned']} gt={p['ground_truth_count']}"
            )


if __name__ == "__main__":
    main()
