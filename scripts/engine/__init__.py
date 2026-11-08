"""Tangerine resilience engine data pipeline.

Answers the research questions of docs/tangerine-challenge.md and emits the
product data for the financial resilience engine as static JSON under
public/data/engine/.

Run from the repository root:

    uv run python -m scripts.engine.build
    uv run python -m scripts.engine.verify

Modules:

* load.py: checksum verified CSV loading, integer cent parsing with
  np.rint, and source quality records (path, sha256, rows) for the meta
  block and the build report.
* metrics.py: pure judge metrics (I, F, S, B, H) over integer cent row
  sequences, the F decomposition, the gap, and edge flag derivation.
* shocks.py: the judge runway formula as one pure function returning
  state plus tenths of a month.
* plans.py: goal plan and backup plan, shipped test side twin (kept
  importable, unused by the E1 build).
* build.py: entry point that writes public/data/engine/profiles.json and
  the stdout report.
* verify.py: independent naive csv recomputation, field by field drift
  diff, dash scan, and the artifact SHA256.
* golden_fixtures.json: hand computed fixture accounts with visible
  workings, asserted by test_build_profiles.py.
"""
