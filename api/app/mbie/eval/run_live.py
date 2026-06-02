"""Live retrieval eval against the configured Supabase corpus.

Runs the labelled set through both retrieval arms and prints recall@k + MRR so
"hybrid beats sparse" is a measured claim, not an assumption. Needs DB access
(service role) and — for the hybrid arm — a working embedding key; the hybrid
arm degrades to sparse-internally if embeddings are down, which the printed
header calls out.

    python -m app.mbie.eval.run_live
    python -m app.mbie.eval.run_live --k 1 3 5 10
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

from app.auth import get_service_db
from app.mbie.eval.harness import EvalResult, evaluate, load_labels
from app.mbie.retriever import retrieve_for_flag


def _runner(db: Any, mode: str):
    def retrieve(flag: dict[str, Any], k: int):
        return retrieve_for_flag(db, flag=flag, k=k, mode=mode)

    return retrieve


def _fmt(res: EvalResult, ks: tuple[int, ...]) -> str:
    cols = "  ".join(f"R@{k}={res.recall_at[k]:.2f}" for k in ks)
    return f"n={res.n}  {cols}  MRR={res.mrr:.3f}"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="MBIE retrieval-quality eval")
    ap.add_argument("--k", nargs="+", type=int, default=[1, 3, 5])
    args = ap.parse_args(argv)
    ks = tuple(sorted(set(args.k)))

    labels = load_labels()
    db = get_service_db()

    hybrid = evaluate(_runner(db, "hybrid"), labels, ks=ks)
    sparse = evaluate(_runner(db, "sparse"), labels, ks=ks)

    print(f"labels: {len(labels)}")
    print(f"hybrid  {_fmt(hybrid, ks)}")
    print(f"sparse  {_fmt(sparse, ks)}")
    top = ks[-1]
    delta = hybrid.recall_at[top] - sparse.recall_at[top]
    print(f"delta R@{top} (hybrid - sparse): {delta:+.2f}")
    if hybrid.misses:
        print(f"hybrid misses: {', '.join(hybrid.misses)}")
    if sparse.misses:
        print(f"sparse misses: {', '.join(sparse.misses)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
