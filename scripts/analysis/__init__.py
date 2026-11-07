"""Findings analysis pipeline (Tier 0) for the Sheridan Datathon 2026 entry.

Computes findings F1 to F5 from the artifacts produced by
scripts/build_world.py:

* F1 structural versus discretionary spend share (lag autocorrelation).
* F2 seasonality decomposition and plain language verdict.
* F3 deficit day risk model with an emitted model card.
* F4 plane change cost (counterfactual timing simulation).
* F5 ranked simulated interventions.

Entry points:

    uv run python -m scripts.analysis.build_findings
    uv run python -m scripts.analysis.verify_findings
    uv run pytest

Every function is deterministic. The single random seed (20261107, the
mock ledger seed) is logged in every emitted artifact.
"""
