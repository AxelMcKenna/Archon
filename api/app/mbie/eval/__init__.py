"""MBIE retrieval-quality evaluation harness.

``harness`` holds the pure recall@k / MRR scoring; ``run_live`` wires it to the
real retriever against the configured Supabase corpus and compares the hybrid
arm against sparse-only. Run live with::

    python -m app.mbie.eval.run_live
"""

from app.mbie.eval.harness import EvalResult, Label, evaluate, load_labels

__all__ = ["EvalResult", "Label", "evaluate", "load_labels"]
