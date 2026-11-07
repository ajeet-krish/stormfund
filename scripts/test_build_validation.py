"""Negative tests for the CSV builder guards added by the security review.

docs/reviews.md (Nov 05 2026, security review) flagged three classes of
ingestion bugs: non finite or overflowing floats crossing an int64 cast
silently, CLI flags escaping the repository root, and unbounded CSV input
size. Every test here proves the friendly fail() catches its class instead
of letting the value through or raising a raw traceback.

    uv run pytest
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import pytest

from scripts import build_players, build_world

WORLD_HEADER = "transaction_id,date,amount,merchant_category,account_balance\n"
WORLD_ROW = "TAN-000001,2025-01-05,12.50,Groceries,1000.00"

PLAYERS_HEADER = (
    "employee_number,age,department,distance_from_home,job_satisfaction,"
    "environment_satisfaction,over_time,years_at_company,monthly_income,"
    "performance_rating,training_times_last_year,attrition\n"
)

def write_world_csv(path: Path, amount: str, hour: str | None = None) -> Path:
    """Write a one row transactions CSV with the given amount (and hour)."""
    header = WORLD_HEADER.rstrip("\n")
    row = f"TAN-000001,2025-01-05,{amount},Groceries,1000.00"
    if hour is not None:
        header += ",hour"
        row += f",{hour}"
    path.write_text(f"{header}\n{row}\n", encoding="utf-8")
    return path

def write_players_csv(path: Path, employee_number: str = "1001",
                      monthly_income: str = "5000") -> Path:
    """Write a one row IBM HR style CSV with the given id and income."""
    row = f"{employee_number},30,Sales,5,3,4,No,5,{monthly_income},3,2,No\n"
    path.write_text(PLAYERS_HEADER + row, encoding="utf-8")
    return path

def expect_fail(action: Callable[[], object], capsys: pytest.CaptureFixture[str],
                *fragments: str) -> None:
    """Run action and require a clean fail(): exit code 1 and all fragments on stderr."""
    with pytest.raises(SystemExit) as excinfo:
        action()
    assert excinfo.value.code == 1
    err = capsys.readouterr().err
    assert err.startswith("error: "), err
    for fragment in fragments:
        assert fragment in err, err

def build_players_from(path: Path) -> None:
    """Load and build in one step so a late fail() (inside the build) is reachable."""
    frame = build_players.load_people(path)
    build_players.build_players(frame, "bad.csv")

@pytest.mark.parametrize("amount", ["inf", "-inf", "nan", "1e999"])
def test_world_amount_non_finite_fails_cleanly(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], amount: str
) -> None:
    """nan, inf, and 1e999 in amount must exit 1 through fail(), never reach the int64 cast."""
    csv = write_world_csv(tmp_path / "bad.csv", amount)
    expect_fail(lambda: build_world.load_frame(csv), capsys, "amount")

def test_world_amount_inf_names_the_offending_row(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """The finiteness error names the offending transaction_id row."""
    csv = write_world_csv(tmp_path / "bad.csv", "inf")
    expect_fail(
        lambda: build_world.load_frame(csv), capsys, "non finite", "TAN-000001"
    )

@pytest.mark.parametrize("amount", ["1e20", "1e308"])
def test_world_amount_out_of_int64_range_fails_cleanly(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], amount: str
) -> None:
    """A dollar amount whose cents exceed int64 fails before the cast, not after."""
    csv = write_world_csv(tmp_path / "bad.csv", amount)
    expect_fail(
        lambda: build_world.load_frame(csv), capsys, "integer cents", "TAN-000001"
    )

def test_world_hour_non_finite_fails_cleanly(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """A non finite hour fails with the row id instead of clipping into a garbage int."""
    csv = write_world_csv(tmp_path / "bad.csv", "12.50", hour="inf")
    expect_fail(lambda: build_world.load_frame(csv), capsys, "hour", "TAN-000001")

def test_world_minute_non_finite_fails_cleanly(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """A non finite minute fails with the row id instead of clipping into a garbage int."""
    csv = write_world_csv(tmp_path / "bad.csv", "12.50")
    text = csv.read_text(encoding="utf-8")
    csv.write_text(text.replace("account_balance", "account_balance,minute")
                   .replace("1000.00", "1000.00,nan"), encoding="utf-8")
    expect_fail(lambda: build_world.load_frame(csv), capsys, "minute", "TAN-000001")

def test_world_valid_csv_still_loads(tmp_path: Path) -> None:
    """Positive control: a clean CSV still parses to integer cents."""
    csv = write_world_csv(tmp_path / "ok.csv", "12.50")
    frame, value_maps = build_world.load_frame(csv)
    assert frame["amount_cents"].tolist() == [1250]
    assert value_maps["amountCents"]["TAN-000001"] == 1250

def test_world_rejects_oversized_input(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """pd.read_csv is never reached for a file above the documented size cap."""
    csv = write_world_csv(tmp_path / "big.csv", "12.50")
    monkeypatch.setattr(build_world, "MAX_INPUT_CSV_BYTES", 10)
    expect_fail(lambda: build_world.load_frame(csv), capsys, "too large")

def test_players_income_inf_fails_cleanly(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """inf monthly_income passes the isna guard but must still fail before any cast."""
    csv = write_players_csv(tmp_path / "bad.csv", monthly_income="inf")
    expect_fail(lambda: build_players.load_people(csv), capsys, "monthly_income", "1001")

def test_players_income_huge_value_fails_cleanly(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """1e308 dollars times 100 overflows; the cents conversion fails instead of raising."""
    csv = write_players_csv(tmp_path / "bad.csv", monthly_income="1e308")
    expect_fail(lambda: build_players_from(csv), capsys, "monthly_income", "1001")

def test_players_non_numeric_integer_column_fails_cleanly(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """A non numeric age must fail through fail(), not a pandas ValueError traceback."""
    csv = write_players_csv(tmp_path / "bad.csv")
    text = csv.read_text(encoding="utf-8")
    csv.write_text(text.replace(",30,Sales", ",old,Sales"), encoding="utf-8")
    expect_fail(lambda: build_players.load_people(csv), capsys, "age")

def test_players_employee_number_non_numeric_fails_cleanly(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """int(row.employee_number) is wrapped: a string id fails through fail(), not ValueError."""
    csv = write_players_csv(tmp_path / "bad.csv", employee_number="EMP-7")
    expect_fail(lambda: build_players_from(csv), capsys, "employee_number", "EMP-7")

def test_players_valid_csv_still_loads(tmp_path: Path) -> None:
    """Positive control: a clean people CSV still parses to the emitted fields."""
    csv = write_players_csv(tmp_path / "ok.csv")
    frame = build_players.load_people(csv)
    players, income_values = build_players.build_players(frame, "ok.csv")
    assert players[0]["employeeNumber"] == 1001
    assert income_values["1001"] == 500000

def test_cli_rejects_world_input_outside_the_repo(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """--input resolves outside REPO_ROOT and fails before any read."""
    outside = tmp_path / "outside.csv"
    outside.write_text(WORLD_HEADER + WORLD_ROW + "\n", encoding="utf-8")
    expect_fail(
        lambda: build_world.main(["--input", str(outside)]),
        capsys,
        "--input must resolve inside the repository root",
    )

def test_cli_rejects_world_out_dir_outside_the_repo(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """--out-dir resolves outside REPO_ROOT and fails before any write."""
    expect_fail(
        lambda: build_world.main(["--out-dir", str(tmp_path)]),
        capsys,
        "--out-dir must resolve inside the repository root",
    )

def test_cli_rejects_players_input_outside_the_repo(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """build_players applies the same containment to --input."""
    outside = tmp_path / "outside.csv"
    outside.write_text(PLAYERS_HEADER + "1001,30,Sales,5,3,4,No,5,5000,3,2,No\n",
                       encoding="utf-8")
    expect_fail(
        lambda: build_players.main(["--input", str(outside)]),
        capsys,
        "--input must resolve inside the repository root",
    )

# CSV shape guards: empty inputs and missing required columns

def test_world_header_only_csv_fails_cleanly(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """A CSV with the header but zero data rows fails through fail()."""
    csv = tmp_path / "header_only.csv"
    csv.write_text(WORLD_HEADER, encoding="utf-8")
    expect_fail(lambda: build_world.load_frame(csv), capsys, "no data rows")

def test_world_csv_missing_required_column_fails_cleanly(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Dropping account_balance reports the missing column by name."""
    csv = tmp_path / "missing_column.csv"
    csv.write_text(
        "transaction_id,date,amount,merchant_category\n"
        "TAN-000001,2025-01-05,12.50,Groceries\n",
        encoding="utf-8",
    )
    expect_fail(
        lambda: build_world.load_frame(csv),
        capsys,
        "missing required columns",
        "account_balance",
    )

def test_world_zero_byte_csv_fails_cleanly(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """A zero byte CSV must fail() like every other malformed input.

    pd.read_csv raises pandas.errors.EmptyDataError on an empty file, and
    load_frame now converts that into a friendly fail() naming the path
    instead of letting a raw traceback escape (docs/tests.md, fixed
    Nov 05 2026). The header only path one test above proves the same
    contract.
    """
    csv = tmp_path / "zero_byte.csv"
    csv.write_text("", encoding="utf-8")
    expect_fail(lambda: build_world.load_frame(csv), capsys, "No columns to parse")

def test_players_zero_byte_csv_fails_cleanly(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """A zero byte people CSV fails through fail() with the path, not a traceback."""
    csv = tmp_path / "zero_byte.csv"
    csv.write_text("", encoding="utf-8")
    expect_fail(lambda: build_players.load_people(csv), capsys, "No columns to parse")
