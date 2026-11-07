"""Build public/data/players.json from an IBM HR style CSV.

Reads data/mock/ibm_hr.csv (or any CSV with the same columns, headers
normalized case insensitively) and emits player entities for the Attrition FC
backup game. Run from the repository root:

    uv run python -m scripts.build_players [--input CSV] [--out-dir DIR]

TRUST MODEL
Both flags are contained to the repository root (REPO_ROOT): each path is
resolved first and a path outside the repo fails before any read or write.
Source CSVs above 50 MB (MAX_INPUT_CSV_BYTES) are rejected before parsing.

EXPECTED INPUT SCHEMA
Required columns after header normalization (EmployeeNumber becomes
employee_number):

* employee_number: unique row id. The value must be integer valued (1001
  or "1001") because the emitted employeeNumber field is an integer; the
  string form also becomes the provenance rowId.
* age, department, distance_from_home, job_satisfaction,
  environment_satisfaction, over_time, years_at_company, monthly_income,
  performance_rating, training_times_last_year, attrition: the IBM HR mold
  columns (OverTime becomes over_time). over_time and attrition accept
  Yes/No or True/False.

PROVENANCE
Every player carries the same Provenance {rowIds, filter, agg, checkSum}
pattern as the Ledger Odyssey world (see docs/architecture.md). The checksum
covers the single source row with value = monthlyIncomeCents and follows the
recipe in scripts/pipeline_lib.py. All checksums are verified a second time
after writing the file; the build exits non zero on any mismatch.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, Sequence

import numpy as np
import pandas as pd

from scripts.pipeline_lib import (
    INT64_LIMIT_FLOAT,
    INT64_MIN_FLOAT,
    MAX_INPUT_CSV_BYTES,
    REPO_ROOT,
    canonical_column,
    make_provenance,
    preview_ids,
    rel_to_root,
    sha256_file,
    unique_id,
    verify_provenance,
)

DEFAULT_INPUT: Path = REPO_ROOT / "data" / "mock" / "ibm_hr.csv"
DEFAULT_OUT_DIR: Path = REPO_ROOT / "public" / "data"

REQUIRED_COLUMNS: tuple[str, ...] = (
    "employee_number",
    "age",
    "department",
    "distance_from_home",
    "job_satisfaction",
    "environment_satisfaction",
    "over_time",
    "years_at_company",
    "monthly_income",
    "performance_rating",
    "training_times_last_year",
    "attrition",
)

INCOME_VALUE_FIELD: str = "monthlyIncomeCents"


def fail(message: str) -> None:
    """Print a pipeline error and stop with exit code 1."""
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def income_to_cents(income: Any, row_id: str) -> int:
    """Convert monthly_income dollars to integer cents, failing cleanly on overflow.

    round() raises a raw OverflowError on values like 1e308 and an int64
    range check keeps the checksum value representable, so both paths go
    through the friendly fail with the offending row id (docs/reviews.md
    security review, Nov 05 2026).
    """
    try:
        cents = round(float(income) * 100.0)
    except (OverflowError, ValueError):
        fail(f"monthly_income in row {row_id} cannot convert to integer cents")
        raise AssertionError("unreachable")
    if not math.isfinite(cents) or not INT64_MIN_FLOAT <= cents < INT64_LIMIT_FLOAT:
        fail(f"monthly_income in row {row_id} does not fit the int64 cents range")
        raise AssertionError("unreachable")
    return int(cents)


def employee_number(value: Any, row_id: str) -> int:
    """Cast employee_number to the emitted integer field, failing cleanly.

    The module docstring accepts a string row id, but a value that is not
    integer valued cannot populate the integer employeeNumber field, so it
    fails through fail() instead of raising a raw ValueError.
    """
    try:
        return int(value)
    except (TypeError, ValueError, OverflowError):
        fail(
            f"employee_number {row_id} must be integer valued for the "
            "employeeNumber field"
        )
        raise AssertionError("unreachable")


def parse_yes_no(value: Any, column: str, row_id: str) -> bool:
    """Parse Yes/No or True/False style values into a boolean."""
    normalized = str(value).strip().lower()
    if normalized in {"yes", "y", "true", "1"}:
        return True
    if normalized in {"no", "n", "false", "0"}:
        return False
    fail(f"column {column} in row {row_id} holds unsupported value {value!r}")
    raise AssertionError("unreachable")


def load_people(path: Path) -> pd.DataFrame:
    """Read and validate the IBM HR style CSV."""
    if not path.is_file():
        fail(f"input CSV not found: {rel_to_root(path)}")
    size = path.stat().st_size
    if size > MAX_INPUT_CSV_BYTES:
        fail(
            f"input CSV too large: {rel_to_root(path)} is {size / (1024 * 1024):.1f} MB, "
            f"limit is {MAX_INPUT_CSV_BYTES // (1024 * 1024)} MB"
        )
    # Same guard as load_frame in build_world: a zero byte or comment-only
    # CSV raises pandas EmptyDataError and a read failure raises OSError, and
    # both must exit through the friendly fail() with the path instead of
    # escaping as a raw traceback (docs/tests.md, Nov 05 2026).
    try:
        raw = pd.read_csv(path, comment="#")
    except pd.errors.EmptyDataError:
        fail(f"{rel_to_root(path)}: No columns to parse (empty or comment-only CSV)")
    except OSError as exc:
        fail(f"cannot read {rel_to_root(path)}: {exc}")
    raw.columns = [canonical_column(column) for column in raw.columns]
    missing = [column for column in REQUIRED_COLUMNS if column not in raw.columns]
    if missing:
        fail(f"{rel_to_root(path)} is missing required columns: {', '.join(missing)}")
    if raw.empty:
        fail(f"{rel_to_root(path)} has no data rows")
    if raw["employee_number"].isna().any():
        fail("employee_number contains empty values")
    frame = raw.copy()
    frame["row_id"] = frame["employee_number"].astype(str).str.strip()
    duplicated = frame.loc[frame["row_id"].duplicated(), "row_id"].tolist()
    if duplicated:
        fail(f"employee_number values are not unique (first: {', '.join(duplicated[:5])})")
    # Coerce first with NaN on bad input, report every offending column
    # through fail(), and only then cast, so bad input fails with the
    # friendly pipeline error instead of a pandas traceback.
    integer_columns = (
        "age",
        "distance_from_home",
        "job_satisfaction",
        "environment_satisfaction",
        "years_at_company",
        "performance_rating",
        "training_times_last_year",
    )
    numeric_columns = (*integer_columns, "monthly_income")
    for column in numeric_columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    non_numeric = [column for column in numeric_columns if frame[column].isna().any()]
    if non_numeric:
        fail(f"columns must hold numeric values: {', '.join(non_numeric)}")
    # "inf" and "1e999" parse to infinities that the isna guard above
    # cannot see, and astype("int64") would wrap them silently, so check
    # finiteness and the int64 range before any cast (docs/reviews.md
    # security review, Nov 05 2026).
    row_ids = frame["row_id"].to_numpy()
    for column in numeric_columns:
        values = frame[column].to_numpy(dtype=float)
        bad = ~np.isfinite(values)
        if bad.any():
            fail(
                f"column {column} holds non finite values (nan or inf) in rows: "
                f"{preview_ids(row_ids, bad)}"
            )
    for column in integer_columns:
        values = frame[column].to_numpy(dtype=float)
        bad = (values >= INT64_LIMIT_FLOAT) | (values < INT64_MIN_FLOAT)
        if bad.any():
            fail(
                f"column {column} values out of int64 range in rows: "
                f"{preview_ids(row_ids, bad)}"
            )
        frame[column] = frame[column].astype("int64")
    return frame


def build_players(frame: pd.DataFrame, source_label: str) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Create one provenance carrying player entity per source row."""
    income_values = {
        str(row_id): income_to_cents(income, str(row_id))
        for row_id, income in zip(frame["row_id"], frame["monthly_income"])
    }
    used_ids: set[str] = set()
    value_maps = {INCOME_VALUE_FIELD: income_values}
    players: list[dict[str, Any]] = []
    for row in frame.itertuples(index=False):
        row_id = str(row.row_id)
        entity_id = unique_id(f"emp-{row_id}", used_ids)
        over_time = parse_yes_no(row.over_time, "over_time", row_id)
        attrition = parse_yes_no(row.attrition, "attrition", row_id)
        provenance = make_provenance(
            [row_id],
            INCOME_VALUE_FIELD,
            value_maps,
            f"row with employee_number == {row_id} in {source_label}",
            "monthly_income of that row in cents (monthlyIncomeCents)",
        )
        players.append(
            {
                "id": entity_id,
                "employeeNumber": employee_number(row.employee_number, row_id),
                "age": int(row.age),
                "department": str(row.department),
                "distanceFromHome": int(row.distance_from_home),
                "jobSatisfaction": int(row.job_satisfaction),
                "environmentSatisfaction": int(row.environment_satisfaction),
                "overTime": over_time,
                "yearsAtCompany": int(row.years_at_company),
                "monthlyIncomeCents": income_values[row_id],
                "performanceRating": int(row.performance_rating),
                "trainingTimesLastYear": int(row.training_times_last_year),
                "attrition": attrition,
                "provenance": provenance,
            }
        )
    return players, income_values


def build_summary(frame: pd.DataFrame, players: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate headline numbers for the meta block."""
    attrition_count = sum(1 for player in players if player["attrition"])
    overtime_count = sum(1 for player in players if player["overTime"])
    overtime_attrition = sum(
        1 for player in players if player["overTime"] and player["attrition"]
    )
    departments: dict[str, int] = {}
    for player in players:
        name = str(player["department"])
        departments[name] = departments.get(name, 0) + 1
    return {
        "rowCount": int(len(frame)),
        "attritionCount": attrition_count,
        "attritionRate": round(attrition_count / len(players), 4),
        "overTimeShare": round(overtime_count / len(players), 4),
        "overTimeAttritionRate": round(overtime_attrition / overtime_count, 4)
        if overtime_count
        else 0.0,
        "departments": dict(sorted(departments.items())),
    }


def verify_players(path: Path, income_values: dict[str, int]) -> tuple[int, int]:
    """Re-read players.json and recompute every provenance checksum."""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return 0, 0
    players = payload.get("players", [])
    value_maps = {INCOME_VALUE_FIELD: income_values}
    passed = sum(
        1 for player in players if verify_provenance(player["provenance"], value_maps)
    )
    return passed, len(players)


def run(input_path: Path, out_dir: Path) -> int:
    """Execute the full build and verification, returning a process exit code."""
    frame = load_people(input_path)
    source_label = rel_to_root(input_path)
    players, income_values = build_players(frame, source_label)
    summary = build_summary(frame, players)

    payload = {
        "meta": {
            "schemaVersion": 1,
            "generatedBy": "scripts/build_players.py",
            "source": source_label,
            "sourceSha256": sha256_file(input_path),
            "synthetic": True,
            "moneyUnit": "integer cents CAD",
            "checksumRecipe": (
                "sha256 hex of LF joined '{rowId}:{valueCents}' lines sorted ascending by "
                f"rowId; valueCents is {INCOME_VALUE_FIELD} for player entities"
            ),
        },
        "summary": summary,
        "players": players,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    players_path = out_dir / "players.json"
    players_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    passed, total = verify_players(players_path, income_values)
    checksums_ok = passed == total and total > 0

    print("build_players summary")
    print(f"  source: {source_label} (sha256 {payload['meta']['sourceSha256'][:16]}...)")
    print(f"  rows: {len(frame)}")
    print(f"  players: {len(players)}")
    print(
        f"  attrition: {summary['attritionCount']} "
        f"({summary['attritionRate']:.1%}), OverTime attrition "
        f"{summary['overTimeAttritionRate']:.1%} vs overall "
        f"{summary['attritionRate']:.1%}"
    )
    print(f"  provenance checksums: {passed}/{total} {'PASS' if checksums_ok else 'FAIL'}")
    print(
        f"  wrote {rel_to_root(players_path)} "
        f"({players_path.stat().st_size / 1024:.1f} kB)"
    )
    print(f"checksum verification: {'PASS' if checksums_ok else 'FAIL'}")
    return 0 if checksums_ok else 1


def contained(raw: Path, flag: str) -> Path:
    """Resolve a CLI path and require it to stay inside the repository root.

    The builders run with the operator's privileges, so a stray or scripted
    flag must not read or write outside REPO_ROOT. Symlinks are followed by
    resolve() first, so a link pointing out of the repo fails too.
    """
    resolved = raw.expanduser().resolve()
    if not resolved.is_relative_to(REPO_ROOT):
        fail(f"{flag} must resolve inside the repository root: {resolved}")
    return resolved


def main(argv: Sequence[str] | None = None) -> int:
    """Parse CLI arguments and run the build."""
    parser = argparse.ArgumentParser(description="Build players.json from an IBM HR style CSV")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="source employees CSV")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR, help="output directory")
    args = parser.parse_args(argv)
    return run(contained(args.input, "--input"), contained(args.out_dir, "--out-dir"))


if __name__ == "__main__":
    raise SystemExit(main())
