"""Pytest suite for the Tier 0 findings pipeline.

Runs the full recomputation once per session and asserts every published
number in public/data/findings.json, public/data/model_card.json, and
docs/findings.md against it, mirroring the checksum discipline of the
offline pipeline.

    uv run pytest
"""

from __future__ import annotations

from pathlib import Path

import pytest

from scripts.analysis.build_findings import ComputedFindings, compute_all
from scripts.analysis.ledger import FINDINGS_PATH, MODEL_CARD_PATH, REPORT_PATH
from scripts.analysis.verify_findings import (
    check_baseline_cross_check,
    check_file_matches,
    check_report_and_data_no_dashes,
    check_report_headlines,
    check_seed_logged,
    iter_mismatches,
    run_verification,
)


@pytest.fixture(scope="session")
def computed() -> ComputedFindings:
    """Recompute every finding once for the whole session."""
    return compute_all()


def test_findings_json_matches_recomputation(computed: ComputedFindings) -> None:
    """public/data/findings.json equals a fresh run of F1 to F5."""
    result = check_file_matches("findings", FINDINGS_PATH, computed.findings)
    assert result.passed, result.details


def test_model_card_matches_recomputation(computed: ComputedFindings) -> None:
    """public/data/model_card.json equals a fresh refit of the F3 model."""
    result = check_file_matches("model_card", MODEL_CARD_PATH, computed.model_card)
    assert result.passed, result.details


def test_report_contains_this_runs_headlines(computed: ComputedFindings) -> None:
    """docs/findings.md carries the headline numbers of this run."""
    result = check_report_headlines(REPORT_PATH, computed.findings)
    assert result.passed, result.details


def test_baseline_matches_world_json(computed: ComputedFindings) -> None:
    """Simulated baseline month ends equal world.json monthly_balance_series."""
    result = check_baseline_cross_check(computed.findings)
    assert result.passed, result.details


def test_seeds_logged(computed: ComputedFindings) -> None:
    """The mock ledger seed appears in both emitted artifacts."""
    result = check_seed_logged(computed.findings, computed.model_card)
    assert result.passed, result.details


def test_generated_artifacts_have_no_dash_equivalents() -> None:
    """AGENTS.md forbids em dashes, en dashes, and double hyphens."""
    result = check_report_and_data_no_dashes(FINDINGS_PATH, MODEL_CARD_PATH, REPORT_PATH)
    assert result.passed, result.details


def test_all_verification_checks_pass() -> None:
    """The full verify_findings run passes end to end."""
    results = run_verification()
    failures = [
        f"{result.name}: {result.details}" for result in results if not result.passed
    ]
    assert not failures, failures


def test_iter_mismatches_detects_numeric_drift() -> None:
    """The comparator itself must catch a one cent change (meta test)."""
    problems = iter_mismatches({"a": 100}, {"a": 101})
    assert problems, "comparator failed to detect a mismatch"
    assert not iter_mismatches({"a": 100.0}, {"a": 100.0 + 1e-9})
    assert not iter_mismatches({"a": [1, {"b": "x"}]}, {"a": [1, {"b": "x"}]})


def test_artifacts_exist() -> None:
    """All three Tier 0 artifacts were written by the pipeline."""
    for path in (FINDINGS_PATH, MODEL_CARD_PATH, REPORT_PATH):
        assert Path(path).is_file(), f"{path} is missing"
