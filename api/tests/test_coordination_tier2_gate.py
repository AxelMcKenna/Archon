"""Auto-once Tier-2 trigger decision (pure, no DB)."""

from __future__ import annotations

import pytest

from app.coordination.engine import _should_run_tier2


@pytest.mark.parametrize(
    "mode,enabled,cross,already,expected",
    [
        # force: runs whenever gate on + cross-checkable, regardless of history.
        ("force", True, True, True, True),
        ("force", True, True, False, True),
        ("force", True, False, False, False),  # not cross-checkable
        ("force", False, True, False, False),  # gate off
        # auto: runs once, only when it hasn't run before.
        ("auto", True, True, False, True),
        ("auto", True, True, True, False),  # already ran -> skip
        ("auto", False, True, False, False),  # gate off
        ("auto", True, False, False, False),  # not cross-checkable
        # off: never.
        ("off", True, True, False, False),
        ("off", True, True, True, False),
    ],
)
def test_should_run_tier2(mode, enabled, cross, already, expected) -> None:
    assert (
        _should_run_tier2(
            mode=mode, enabled=enabled, cross_checkable=cross, already_ran=already
        )
        is expected
    )
