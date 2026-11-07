"""Pytest suite for the E1 artifact: fixtures, schema, checksums, determinism.

Asserts the five hand computed golden accounts (scripts/engine/
golden_fixtures.json) against both the pure metrics pipeline and the
shipped public/data/engine/profiles.json entry, recomputes provenance
check_sum values, validates the full document schema field by field, and
proves two consecutive builds are byte identical.

Run from the repository root:

    uv run pytest scripts/engine/test_build_profiles.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterator, Sequence

import pytest

from scripts.engine import build, load, metrics, shocks, verify
from scripts.pipeline_lib import checksum

FIXTURES_PATH: Path = Path(__file__).with_name("golden_fixtures.json")
ARTIFACT_PATH: Path = build.ENGINE_DIR / build.OUTPUT_NAME

MONEY_FIELDS: tuple[str, ...] = (
    "income_cents",
    "fixed_costs_cents",
    "spending_cents",
    "buffer_cents",
    "household_bills_cents",
    "loan_payment_cents",
    "insurance_cents",
    "loan_payments_median_cents",
    "pension_in_cents",
    "gap_cents",
)

PROFILE_KEYS: frozenset[str] = frozenset(
    {
        "account_id",
        *MONEY_FIELDS,
        "runway_state",
        "runway_deci_months",
        "history",
        "loan",
        "flags",
        "balance_series",
        "provenance",
    }
)

META_KEYS: frozenset[str] = frozenset(
    {
        "schema_version",
        "generated_by",
        "sources",
        "account_count",
        "date_range",
        "money_unit",
        "runway_unit",
        "rounding",
        "definitions",
        "checksum_recipe",
        "edge_flag_counts",
    }
)

LOAN_KEYS: frozenset[str] = frozenset(
    {
        "loan_id",
        "status",
        "defaulted",
        "amount_cents",
        "duration_months",
        "monthly_payment_cents",
        "loan_start",
        "scheduled_end_month",
    }
)

FLAG_NAMES: tuple[str, ...] = build.FLAG_NAMES
RUNWAY_STATES: frozenset[str] = frozenset({"finite", "no_shortfall", "buffer_depleted"})


@pytest.fixture(scope="session")
def artifact() -> dict[str, Any]:
    """The shipped profiles.json document."""
    if not ARTIFACT_PATH.is_file():
        pytest.fail(
            f"{ARTIFACT_PATH} is missing, run "
            "uv run python -m scripts.engine.build first"
        )
    return json.loads(ARTIFACT_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def grouped() -> dict[str, list[metrics.RowCents]]:
    """All accounts' monthly rows, loaded from the checksum verified CSV."""
    load.verify_source_checksums(load.SOURCE_PATHS, sums_path=load.SUMS_PATH)
    return load.load_monthly_summary(load.MONTHLY_PATH)


@pytest.fixture(scope="session")
def loans() -> dict[str, load.LoanCents]:
    """All loans keyed by account id."""
    return load.load_loans(load.LOANS_PATH)


@pytest.fixture(scope="session")
def golden() -> dict[str, Any]:
    """The frozen hand computed golden fixture document."""
    return json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))


def _month_index(month: str) -> int:
    """Absolute month number for a YYYY-MM string."""
    return int(month[:4]) * 12 + int(month[5:7])


def _is_contiguous(months: Sequence[str]) -> bool:
    """True when the sorted unique months fill one unbroken span."""
    if len(set(months)) != len(months):
        return False
    return _month_index(months[-1]) - _month_index(months[0]) == len(months) - 1


def _fixture_view(
    account_id: str,
    rows: Sequence[metrics.RowCents],
    loan: load.LoanCents | None,
) -> dict[str, Any]:
    """The fixture subset of a profile, computed from raw rows."""
    ordered = sorted(rows, key=lambda row: row.month)
    metric = metrics.profile_metrics(ordered)
    status = loan.status if loan is not None else None
    flags = metrics.derive_flags(metric, len(ordered), status)
    payment = (
        metrics.loan_payment_cents(loan.monthly_payment_cents, status)
        if loan is not None
        else 0
    )
    baseline = shocks.runway(
        metric.buffer_cents, 0, metric.income_cents, metric.spending_cents
    )
    months = [row.month for row in ordered]
    return {
        "account_id": account_id,
        "income_cents": metric.income_cents,
        "fixed_costs_cents": metric.fixed_costs_cents,
        "spending_cents": metric.spending_cents,
        "buffer_cents": metric.buffer_cents,
        "household_bills_cents": metric.household_bills_cents,
        "insurance_cents": metric.insurance_cents,
        "loan_payments_median_cents": metric.loan_payments_median_cents,
        "pension_in_cents": metric.pension_in_cents,
        "gap_cents": metric.gap_cents,
        "loan_payment_cents": payment,
        "runway_state": baseline.state,
        "runway_deci_months": baseline.deci_months,
        "history": {
            "first_month": months[0],
            "last_month": months[-1],
            "row_count": len(ordered),
            "months_contiguous": _is_contiguous(months),
        },
        "flags": flags,
    }


def _iter_strings(value: Any, path: str) -> Iterator[tuple[str, str]]:
    """Yield (json path, string) for every key and string value."""
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            yield child_path, str(key)
            yield from _iter_strings(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _iter_strings(child, f"{path}[{index}]")
    elif isinstance(value, str):
        yield path, value


def _iter_accounts(
    grouped: dict[str, list[metrics.RowCents]],
) -> Iterator[tuple[str, list[metrics.RowCents]]]:
    """Yield (account_id, rows) in numeric key order, like the build."""
    for account_id in sorted(grouped, key=int):
        yield account_id, grouped[account_id]


# Golden fixtures against the metrics pipeline.

def test_golden_fixture_matches_metrics_output(
    golden: dict[str, Any],
    grouped: dict[str, list[metrics.RowCents]],
    loans: dict[str, load.LoanCents],
) -> None:
    """Every fixture equals profile_metrics plus flags and runway."""
    for fixture in golden["fixtures"]:
        account_id = fixture["account_id"]
        view = _fixture_view(account_id, grouped[account_id], loans.get(account_id))
        assert view == fixture["expected"], account_id


def test_golden_fixture_matches_shipped_artifact(
    golden: dict[str, Any], artifact: dict[str, Any]
) -> None:
    """Every fixture field equals the shipped profiles.json entry."""
    profiles = artifact["profiles"]
    for fixture in golden["fixtures"]:
        account_id = fixture["account_id"]
        entry = profiles[account_id]
        for key, expected in fixture["expected"].items():
            assert entry[key] == expected, f"{account_id}.{key}"


def test_golden_fixture_check_sum_recomputes(
    golden: dict[str, Any],
    grouped: dict[str, list[metrics.RowCents]],
    artifact: dict[str, Any],
) -> None:
    """provenance.check_sum equals the checksum recipe over raw rows."""
    for fixture in golden["fixtures"]:
        account_id = fixture["account_id"]
        ordered = sorted(grouped[account_id], key=lambda row: row.month)
        row_ids = [f"{account_id}:{row.month}" for row in ordered]
        values = {row_id: row.money_in for row_id, row in zip(row_ids, ordered)}
        expected = checksum(row_ids, values)
        entry = artifact["profiles"][account_id]
        assert entry["provenance"]["check_sum"] == expected, account_id


def test_every_edge_flag_is_covered_by_a_fixture(golden: dict[str, Any]) -> None:
    """The five fixtures make each of the five flags true at least once."""
    fired: set[str] = set()
    for fixture in golden["fixtures"]:
        fired.update(name for name, on in fixture["expected"]["flags"].items() if on)
    assert fired == set(FLAG_NAMES)


def test_fixtures_cover_every_runway_branch(golden: dict[str, Any]) -> None:
    """finite with and without cap, no_shortfall, and buffer_depleted."""
    states = {fixture["expected"]["runway_state"] for fixture in golden["fixtures"]}
    assert states == RUNWAY_STATES
    capped = [
        fixture
        for fixture in golden["fixtures"]
        if fixture["expected"]["runway_state"] == "finite"
        and fixture["expected"]["runway_deci_months"] == 1200
    ]
    assert capped, "a finite runway capped at 1200 deci months is required"


def test_fixture_ids_are_unique_and_present_in_artifact(
    golden: dict[str, Any], artifact: dict[str, Any]
) -> None:
    """Five distinct accounts, each present in the shipped artifact."""
    ids = [fixture["account_id"] for fixture in golden["fixtures"]]
    assert len(ids) == len(set(ids)) == 5
    for account_id in ids:
        assert account_id in artifact["profiles"]


# Artifact schema, field by field.

def test_artifact_top_level_keys(artifact: dict[str, Any]) -> None:
    """The document is exactly meta plus profiles."""
    assert set(artifact) == {"meta", "profiles"}


def test_meta_schema(artifact: dict[str, Any]) -> None:
    """The meta block carries every contract key from the build."""
    meta = artifact["meta"]
    assert set(meta) == META_KEYS
    assert meta["schema_version"] == build.SCHEMA_VERSION
    assert meta["generated_by"] == build.GENERATED_BY
    assert meta["money_unit"] == build.MONEY_UNIT
    assert meta["runway_unit"] == build.RUNWAY_UNIT
    assert meta["rounding"] == build.ROUNDING_RULE
    assert meta["checksum_recipe"] == build.CHECKSUM_RECIPE
    assert meta["definitions"] == build.DEFINITIONS
    assert set(meta["definitions"]) == {
        "income_cents",
        "fixed_costs_cents",
        "spending_cents",
        "buffer_cents",
        "household_bills_cents",
        "loan_payment_cents",
        "gap_cents",
        "runway_deci_months",
    }


def test_meta_sources_schema(artifact: dict[str, Any]) -> None:
    """Three checksum verified sources with sha256 and row counts."""
    sources = artifact["meta"]["sources"]
    assert isinstance(sources, list)
    assert len(sources) == 3
    for source in sources:
        assert set(source) == {"path", "sha256", "rows"}
        assert len(source["sha256"]) == 64
        assert source["sha256"] == source["sha256"].lower()
        assert isinstance(source["rows"], int) and source["rows"] > 0
        assert source["path"].startswith("data/tangerine/")
    paths = [source["path"] for source in sources]
    assert paths == [
        "data/tangerine/monthly_summary.csv",
        "data/tangerine/loans.csv",
        "data/tangerine/accounts.csv",
    ]


def test_meta_account_count_date_range_and_flag_counts(
    artifact: dict[str, Any], grouped: dict[str, list[metrics.RowCents]]
) -> None:
    """account_count, date_range, and edge_flag_counts agree with profiles."""
    meta = artifact["meta"]
    profiles = artifact["profiles"]
    assert meta["account_count"] == len(profiles) == len(grouped)

    firsts = [entry["history"]["first_month"] for entry in profiles.values()]
    lasts = [entry["history"]["last_month"] for entry in profiles.values()]
    assert meta["date_range"] == {"start": min(firsts), "end": max(lasts)}

    counts = {name: 0 for name in FLAG_NAMES}
    for entry in profiles.values():
        for name in FLAG_NAMES:
            if entry["flags"][name]:
                counts[name] += 1
    assert meta["edge_flag_counts"] == counts
    # Every flag must fire on at least one real account.
    assert set(meta["edge_flag_counts"]) == set(FLAG_NAMES)
    for name, count in meta["edge_flag_counts"].items():
        assert count >= 1, name


def test_account_keys_are_sorted_numerically(artifact: dict[str, Any]) -> None:
    """Profile keys ascend as integers, the numeric key order contract."""
    keys = list(artifact["profiles"])
    assert [int(key) for key in keys] == sorted(int(key) for key in keys)
    assert len(keys) == len(set(keys))


def test_profile_schema(artifact: dict[str, Any]) -> None:
    """Each profile has exactly the documented keys and value ranges."""
    for account_id, entry in artifact["profiles"].items():
        assert set(entry) == PROFILE_KEYS, account_id
        assert entry["account_id"] == account_id
        assert account_id.isdigit()

        for field in MONEY_FIELDS:
            value = entry[field]
            assert isinstance(value, int) and not isinstance(value, bool), (
                f"{account_id}.{field}"
            )

        assert entry["runway_state"] in RUNWAY_STATES, account_id
        deci = entry["runway_deci_months"]
        assert isinstance(deci, int) and not isinstance(deci, bool)
        assert 0 <= deci <= 1200, account_id

        history = entry["history"]
        assert set(history) <= {"first_month", "last_month", "row_count",
                                "months_contiguous", "months"}
        assert history["first_month"] <= history["last_month"]
        assert history["row_count"] >= 1
        assert isinstance(history["months_contiguous"], bool)
        if not history["months_contiguous"]:
            assert len(history["months"]) == history["row_count"]

        loan = entry["loan"]
        if loan is None:
            assert entry["loan_payment_cents"] == 0, account_id
        else:
            assert set(loan) == LOAN_KEYS, account_id
            assert loan["status"] in {"A", "B", "C", "D"}
            assert isinstance(loan["defaulted"], bool)
            expected_payment = (
                loan["monthly_payment_cents"] if loan["status"] in {"C", "D"} else 0
            )
            assert entry["loan_payment_cents"] == expected_payment, account_id

        flags = entry["flags"]
        assert set(flags) == set(FLAG_NAMES), account_id
        for name, value in flags.items():
            assert isinstance(value, bool), f"{account_id}.flags.{name}"

        series = entry["balance_series"]
        assert set(series) == {"start_month", "values_cents"}
        values = series["values_cents"]
        assert 1 <= len(values) <= build.BALANCE_SERIES_ROWS
        assert len(values) <= history["row_count"]
        assert all(isinstance(value, int) for value in values)

        provenance = entry["provenance"]
        assert set(provenance) == {"source", "filter", "agg", "check_sum"}
        assert len(provenance["check_sum"]) == 64
        assert provenance["source"] == build.PROVENANCE_SOURCE
        assert f"account_id = {account_id}" in provenance["filter"]


def test_every_provenance_check_sum_recomputes(
    artifact: dict[str, Any], grouped: dict[str, list[metrics.RowCents]]
) -> None:
    """All 4500 check_sum values match the checksum recipe over raw rows."""
    for account_id, rows in _iter_accounts(grouped):
        ordered = sorted(rows, key=lambda row: row.month)
        row_ids = [f"{account_id}:{row.month}" for row in ordered]
        values = {row_id: row.money_in for row_id, row in zip(row_ids, ordered)}
        entry = artifact["profiles"][account_id]
        assert entry["provenance"]["check_sum"] == checksum(row_ids, values), (
            account_id
        )


def test_artifact_strings_have_no_dash_violations(artifact: dict[str, Any]) -> None:
    """No em dash, en dash, minus sign, double hyphen, or spaced hyphen."""
    problems: list[str] = []
    for path, text in _iter_strings(artifact, "root"):
        for violation in verify.dash_violations(text):
            problems.append(f"{path}: {violation}")
    assert problems == []


def test_independent_verification_is_green() -> None:
    """The naive csv recomputation in verify.py reports no drift."""
    assert verify.run_verification() == []


# Determinism: two consecutive builds are byte identical.

def test_two_consecutive_builds_are_byte_identical(tmp_path: Path) -> None:
    """No timestamps, no dict order luck: same input, same bytes."""
    first = tmp_path / "first"
    second = tmp_path / "second"
    assert build.main(["--out-dir", str(first)]) == 0
    assert build.main(["--out-dir", str(second)]) == 0
    first_bytes = (first / build.OUTPUT_NAME).read_bytes()
    second_bytes = (second / build.OUTPUT_NAME).read_bytes()
    assert first_bytes == second_bytes
    assert first_bytes == ARTIFACT_PATH.read_bytes()
