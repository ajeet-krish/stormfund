"""Pytest suite for the Storm Atlas artifact and the band helper.

Three groups:

* band helper parity: scripts/engine/atlas.py band_for_runway against
  hand derived vectors transcribed from the verdictBand contract in
  src/lib/verdict.ts, no raw data needed, runs everywhere including CI;
* committed artifact contract: atlas.json schema, 77 districts, five
  band counts, count sum invariants, account_district coverage,
  no_data flags, and the preset ids parsed straight from
  src/lib/shockPresets.ts, all checked from committed files only,
  runs everywhere including CI;
* recompute from raw and determinism: skipped in CI through the
  _require_raw_data helper borrowed from test_build_profiles, because
  data/tangerine/*.csv is gitignored.

Run from the repository root:

    uv run pytest scripts/engine/test_atlas.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

from scripts.engine import atlas, build
from scripts.engine.test_build_profiles import _require_raw_data
from scripts.pipeline_lib import REPO_ROOT, sha256_file

ATLAS_PATH: Path = build.ENGINE_DIR / atlas.OUTPUT_NAME
PROFILES_PATH: Path = build.ENGINE_DIR / build.OUTPUT_NAME
SHOCK_PRESETS_PATH: Path = REPO_ROOT / "src" / "lib" / "shockPresets.ts"

# The five verdict band ids in severity order, verbatim from
# VERDICT_BANDS in src/lib/verdict.ts. Hardcoded here on purpose: if
# atlas.py, the artifact, or the TS ladder ever drift apart, this
# constant is where the suite fails.
BAND_IDS: tuple[str, ...] = (
    "critical",
    "storm_warning",
    "watch",
    "fair_skies",
    "clear",
)
BAND_KEYS: frozenset[str] = frozenset(BAND_IDS)

# Vectors transcribed from src/lib/verdict.ts and verdict.test.ts: the
# two special states are decided before any threshold, then the finite
# ladder cuts at 10, 30, 60, and 120 tenths of a month, first match
# wins.
BAND_VECTORS: tuple[tuple[str, int, str], ...] = (
    ("buffer_depleted", 0, "critical"),
    ("no_shortfall", 0, "clear"),
    ("no_shortfall", 1200, "clear"),
    ("finite", 0, "critical"),
    ("finite", 9, "critical"),
    ("finite", 10, "storm_warning"),
    ("finite", 29, "storm_warning"),
    ("finite", 30, "watch"),
    ("finite", 59, "watch"),
    ("finite", 60, "fair_skies"),
    ("finite", 119, "fair_skies"),
    ("finite", 120, "clear"),
    ("finite", 1200, "clear"),
)

DISTRICT_KEYS: frozenset[str] = frozenset(
    {
        "district_id",
        "district_name",
        "region",
        "inhabitants",
        "unemployment_rate_2023",
        "average_salary",
        "account_count",
        "no_data",
    }
)
ATLAS_KEYS: frozenset[str] = frozenset(
    {
        "schema_version",
        "generated_by",
        "states",
        "sources",
        "districts",
        "account_district",
        "baseline",
        "scenarios",
    }
)


@pytest.fixture(scope="session")
def atlas_document() -> dict[str, Any]:
    """The shipped atlas.json document."""
    if not ATLAS_PATH.is_file():
        pytest.fail(
            f"{ATLAS_PATH} is missing, run "
            "uv run python -m scripts.engine.build first"
        )
    return json.loads(ATLAS_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def profiles_document() -> dict[str, Any]:
    """The shipped profiles.json document."""
    if not PROFILES_PATH.is_file():
        pytest.fail(
            f"{PROFILES_PATH} is missing, run "
            "uv run python -m scripts.engine.build first"
        )
    return json.loads(PROFILES_PATH.read_text(encoding="utf-8"))


def _ts_presets() -> dict[str, dict[str, Any]]:
    """Parse the preset ids and twist fields out of shockPresets.ts.

    Only the fields the math reads: jobLoss, incomeFactor,
    billsDeltaPct, oneOffMonthsTenths. durationMonths is display only.
    """
    text = SHOCK_PRESETS_PATH.read_text(encoding="utf-8")
    blocks = re.findall(r"id: '([a-z_]+)'.*?twist: \{([^}]*)\}", text, re.S)
    parsed: dict[str, dict[str, Any]] = {}
    for preset_id, body in blocks:
        fields: dict[str, Any] = {
            "jobLoss": False,
            "incomeFactor": 0.55,
            "billsDeltaPct": 0,
            "oneOffMonthsTenths": 0,
        }
        for key, value in re.findall(r"(\w+):\s*([0-9.]+|true|false)", body):
            if value == "true":
                fields[key] = True
            elif value == "false":
                fields[key] = False
            elif "." in value:
                fields[key] = float(value)
            else:
                fields[key] = int(value)
        parsed[preset_id] = fields
    return parsed


# Band helper parity with src/lib/verdict.ts: no raw data needed.

@pytest.mark.parametrize("state,deci_months,expected", BAND_VECTORS)
def test_band_for_runway_matches_verdict_ts(
    state: str, deci_months: int, expected: str
) -> None:
    """One runway answer maps to the band src/lib/verdict.ts picks."""
    assert atlas.band_for_runway(state, deci_months) == expected


def test_band_ids_match_the_five_verdict_bands() -> None:
    """The helper ships exactly the five ids, in ladder order."""
    assert atlas.BANDS == BAND_IDS
    assert {expected for _, _, expected in BAND_VECTORS} == BAND_KEYS


def test_band_for_profile_reads_the_stored_runway_answer() -> None:
    """The profile helper bands the stored state and deci months."""
    profile = {"runway_state": "finite", "runway_deci_months": 30}
    assert atlas.band_for_profile(profile) == "watch"
    depleted = {"runway_state": "buffer_depleted", "runway_deci_months": 0}
    assert atlas.band_for_profile(depleted) == "critical"


# Committed artifact contract: schema, districts, joins, sums.

def test_atlas_top_level_schema(atlas_document: dict[str, Any]) -> None:
    """The document is exactly the fixed schema version 1 keys."""
    assert set(atlas_document) == ATLAS_KEYS
    assert atlas_document["schema_version"] == atlas.SCHEMA_VERSION
    assert atlas_document["generated_by"] == atlas.GENERATED_BY
    assert atlas_document["states"] == list(BAND_IDS)


def test_atlas_sources_schema(atlas_document: dict[str, Any]) -> None:
    """Three sources with canonical paths, sha256, and row counts."""
    sources = atlas_document["sources"]
    assert isinstance(sources, list)
    assert [source["path"] for source in sources] == [
        atlas.PROFILES_SOURCE_PATH,
        "data/tangerine/accounts.csv",
        "data/tangerine/districts.csv",
    ]
    for source in sources:
        assert set(source) == {"path", "sha256", "rows"}
        assert len(source["sha256"]) == 64
        assert source["sha256"] == source["sha256"].lower()
        assert isinstance(source["rows"], int) and source["rows"] > 0
    # The profiles source hashes the committed artifact itself.
    assert sources[0]["sha256"] == sha256_file(PROFILES_PATH)
    assert sources[2]["rows"] == len(atlas_document["districts"])


def test_atlas_districts_block(atlas_document: dict[str, Any]) -> None:
    """All 77 districts, sorted ascending, with honest no_data flags."""
    districts = atlas_document["districts"]
    assert len(districts) == 77
    ids = [entry["district_id"] for entry in districts]
    assert ids == sorted(ids)
    assert len(ids) == len(set(ids))
    for entry in districts:
        assert set(entry) == DISTRICT_KEYS, entry["district_id"]
        assert isinstance(entry["district_id"], int)
        assert isinstance(entry["district_name"], str) and entry["district_name"]
        assert isinstance(entry["region"], str) and entry["region"]
        assert isinstance(entry["inhabitants"], int) and entry["inhabitants"] > 0
        for field in ("unemployment_rate_2023", "average_salary"):
            value = entry[field]
            assert value is None or isinstance(value, float), entry["district_id"]
        assert isinstance(entry["account_count"], int)
        assert entry["account_count"] >= 0
        assert isinstance(entry["no_data"], bool)
    # District 69 carries the missing 2022 columns, the only no_data row.
    no_data_ids = [entry["district_id"] for entry in districts if entry["no_data"]]
    assert no_data_ids == [69]
    assert sum(entry["account_count"] for entry in districts) == 4500


def test_account_district_covers_profiles(
    atlas_document: dict[str, Any], profiles_document: dict[str, Any]
) -> None:
    """Every profile account sits in exactly one known district."""
    account_district = atlas_document["account_district"]
    profile_ids = set(profiles_document["profiles"])
    assert set(account_district) == profile_ids
    district_ids = {
        entry["district_id"] for entry in atlas_document["districts"]
    }
    per_district: dict[int, int] = {}
    for account_id, district_id in account_district.items():
        assert account_id.isdigit(), account_id
        assert isinstance(district_id, int) and not isinstance(district_id, bool)
        assert district_id in district_ids, account_id
        per_district[district_id] = per_district.get(district_id, 0) + 1
    for entry in atlas_document["districts"]:
        assert per_district.get(entry["district_id"], 0) == entry["account_count"]


def test_baseline_and_scenario_counts_sum_per_district(
    atlas_document: dict[str, Any]
) -> None:
    """Every bucket covers every district with the five band keys,
    and each district's counts sum to its account_count."""
    district_keys = {
        str(entry["district_id"]) for entry in atlas_document["districts"]
    }
    account_counts = {
        str(entry["district_id"]): entry["account_count"]
        for entry in atlas_document["districts"]
    }
    buckets: list[tuple[str, dict[str, Any]]] = [
        ("baseline", atlas_document["baseline"]),
        *atlas_document["scenarios"].items(),
    ]
    for name, bucket in buckets:
        assert set(bucket) == district_keys, name
        for district_key, counts in bucket.items():
            assert set(counts) == BAND_KEYS, f"{name}.{district_key}"
            assert list(counts) == list(BAND_IDS), f"{name}.{district_key}"
            for band, count in counts.items():
                assert isinstance(count, int) and not isinstance(count, bool)
                assert count >= 0, f"{name}.{district_key}.{band}"
            assert sum(counts.values()) == account_counts[district_key], (
                f"{name}.{district_key}"
            )


def test_baseline_counts_match_the_band_helper(
    atlas_document: dict[str, Any], profiles_document: dict[str, Any]
) -> None:
    """The shipped baseline equals band_for_profile over the profiles."""
    profiles = profiles_document["profiles"]
    account_district = atlas_document["account_district"]
    zero = {band: 0 for band in BAND_IDS}
    recomputed: dict[str, dict[str, int]] = {}
    for account_id, district_id in account_district.items():
        bucket = recomputed.setdefault(str(district_id), dict(zero))
        bucket[atlas.band_for_profile(profiles[account_id])] += 1
    for district_key, counts in atlas_document["baseline"].items():
        assert recomputed.get(district_key, dict(zero)) == counts, district_key
    assert set(recomputed) <= set(atlas_document["baseline"])


def test_scenarios_match_shock_presets_ts(atlas_document: dict[str, Any]) -> None:
    """Scenario ids and twist fields match src/lib/shockPresets.ts."""
    ts_presets = _ts_presets()
    assert list(ts_presets) == list(atlas.PRESETS)
    assert set(atlas_document["scenarios"]) == set(ts_presets)
    assert list(atlas_document["scenarios"]) == list(ts_presets)
    for preset_id, fields in ts_presets.items():
        preset = atlas.PRESETS[preset_id]
        assert preset["job_loss"] is fields["jobLoss"], preset_id
        if fields["jobLoss"]:
            assert preset["ei_pct"] == round(fields["incomeFactor"] * 100), preset_id
        assert preset["bills_delta_pct"] == fields["billsDeltaPct"], preset_id
        assert preset["one_off_tenths"] == fields["oneOffMonthsTenths"], preset_id
        assert preset["extra_monthly_cents"] == 0, preset_id


# Recompute from raw CSVs and determinism: skip gated for CI.

def test_recompute_from_raw_reproduces_committed_atlas(tmp_path: Path) -> None:
    """One full build into a temp dir writes the shipped bytes."""
    _require_raw_data(
        "monthly_summary.csv", "loans.csv", "accounts.csv", "districts.csv"
    )
    out_dir = tmp_path / "out"
    assert build.main(["--out-dir", str(out_dir)]) == 0
    assert (out_dir / atlas.OUTPUT_NAME).read_bytes() == ATLAS_PATH.read_bytes()


def test_two_consecutive_builds_produce_identical_atlas(tmp_path: Path) -> None:
    """No timestamps, no dict order luck: same input, same bytes."""
    _require_raw_data(
        "monthly_summary.csv", "loans.csv", "accounts.csv", "districts.csv"
    )
    first = tmp_path / "first"
    second = tmp_path / "second"
    assert build.main(["--out-dir", str(first)]) == 0
    assert build.main(["--out-dir", str(second)]) == 0
    first_bytes = (first / atlas.OUTPUT_NAME).read_bytes()
    second_bytes = (second / atlas.OUTPUT_NAME).read_bytes()
    assert first_bytes == second_bytes
    assert first_bytes == ATLAS_PATH.read_bytes()
