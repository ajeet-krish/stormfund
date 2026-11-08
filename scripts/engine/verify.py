"""Independent verification of public/data/engine/profiles.json.

Entry point:

    uv run python -m scripts.engine.verify

This module reimplements every metric with the naive csv module and
plain integers: no pandas, no numpy, and no import of
scripts.engine.metrics, so a bug in the builder cannot hide in the
verifier. It recomputes the whole document for all accounts, diffs it
field by field against the committed artifact, checks the sibling
atlas.json schema and count invariants from committed files only, scans
every artifact string for dash violations (the verify_findings
pattern), and prints the artifact SHA256. Any mismatch exits non zero.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from decimal import ROUND_HALF_EVEN, Decimal
from pathlib import Path
from typing import Any, Iterator, Sequence

from scripts.pipeline_lib import REPO_ROOT, checksum, rel_to_root

DATA_DIR: Path = REPO_ROOT / "data" / "tangerine"
MONTHLY_PATH: Path = DATA_DIR / "monthly_summary.csv"
LOANS_PATH: Path = DATA_DIR / "loans.csv"
ACCOUNTS_PATH: Path = DATA_DIR / "accounts.csv"
ARTIFACT_PATH: Path = REPO_ROOT / "public" / "data" / "engine" / "profiles.json"

# Contract strings, duplicated on purpose: if build.py changes one of
# them without this file following, verification fails instead of
# drifting silently.
SCHEMA_VERSION: int = 1
GENERATED_BY: str = "scripts.engine.build"
MONEY_UNIT: str = "integer CAD cents"
RUNWAY_UNIT: str = "tenths of a month"
PROVENANCE_SOURCE: str = "data/tangerine/monthly_summary.csv"
PROVENANCE_AGG: str = (
    "judge metrics over all monthly rows (I, F, S, H medians; B mean over "
    "the last 6 rows; pension sum); checksum value = money_in_cents"
)
CHECKSUM_RECIPE: str = (
    "row id = account_id:month sorted ascending; value = money_in_cents "
    "per row; SHA256 of LF joined id:value lines"
)

# Atlas contract strings, duplicated on purpose like the profiles ones:
# if atlas.py changes one of them without this file following, the
# sibling artifact check fails instead of drifting silently. The band
# ids are the single five band vocabulary from src/lib/verdict.ts.
ATLAS_NAME: str = "atlas.json"
ATLAS_SCHEMA_VERSION: int = 1
ATLAS_GENERATED_BY: str = "scripts.engine.build"
ATLAS_BANDS: tuple[str, ...] = (
    "critical",
    "storm_warning",
    "watch",
    "fair_skies",
    "clear",
)
ATLAS_PRESETS: tuple[str, ...] = (
    "layoff",
    "cost_spike",
    "emergency_repair",
    "combo",
)
ATLAS_DISTRICT_COUNT: int = 77
ATLAS_SOURCE_PATHS: tuple[str, ...] = (
    "public/data/engine/profiles.json",
    "data/tangerine/accounts.csv",
    "data/tangerine/districts.csv",
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
ATLAS_DISTRICT_KEYS: frozenset[str] = frozenset(
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
ROUNDING_RULE: str = (
    "all money is integer CAD cents converted with np.rint(dollars * 100); "
    "medians of an even count average the two middle cents half up, and "
    "means and runway tenths divide with ROUND_HALF_UP (ties away from "
    "zero), applied once at the metric boundary"
)
DEFINITIONS: dict[str, str] = {
    "income_cents": (
        "I: median of money_in across all monthly rows; an even row count "
        "averages the two middle cents half up"
    ),
    "fixed_costs_cents": (
        "F: median across months of the per month row sum household_bills "
        "+ insurance + loan_payments; part 1 only, never used in the runway"
    ),
    "spending_cents": "S: median of money_out across all monthly rows",
    "buffer_cents": (
        "B: mean of avg_daily_balance over the last 6 rows sorted by month, "
        "rounded half up; thin history uses every available row"
    ),
    "household_bills_cents": "H: median of household_bills across all monthly rows",
    "loan_payment_cents": (
        "P: monthly_payment from loans.csv when status is C or D (still "
        "running at the end of 2025), otherwise 0"
    ),
    "gap_cents": "gap: typical monthly spending S minus typical monthly income I",
    "runway_deci_months": (
        "runway in tenths of a month: (buffer minus one off costs) divided "
        "by the monthly shortfall; 0 when the buffer is depleted, 1200 when "
        "there is no shortfall, otherwise rounded half up and capped at 1200"
    ),
}

FLAG_NAMES: tuple[str, ...] = (
    "pensioner",
    "thin_history",
    "zero_income",
    "defaulted_loan",
    "negative_buffer",
)
RUNNING_STATUSES: frozenset[str] = frozenset({"C", "D"})
DEFAULTED_STATUS: str = "D"
END_OF_2025_MONTH: str = "2025-12"
BUFFER_WINDOW_ROWS: int = 6
# Flag threshold, kept in sync with scripts.engine.metrics: fewer than
# 18 monthly rows is a quarter of the 72 month dataset span.
THIN_HISTORY_ROWS: int = 18
BALANCE_SERIES_ROWS: int = 12
RUNWAY_CAP_DECI_MONTHS: int = 1200

MONTHLY_MONEY_COLUMNS: tuple[str, ...] = (
    "money_in",
    "money_out",
    "household_bills",
    "insurance",
    "loan_payments",
    "pension_in",
    "avg_daily_balance",
)

# Dash scan, mirroring scripts/analysis/verify_findings.py.
DASH_CHARACTERS: tuple[str, ...] = ("—", "–", "−")


# Naive integer math (independent copies of the rounding contract).

def _round_half_up(numerator: int, denominator: int) -> int:
    """ROUND_HALF_UP on positive denominators: ties away from zero."""
    if denominator <= 0:
        raise ValueError(f"denominator must be positive, got {denominator}")
    sign = 1 if numerator >= 0 else -1
    return sign * ((abs(numerator) + denominator // 2) // denominator)


def _median(values: Sequence[int]) -> int:
    ordered = sorted(values)
    if not ordered:
        raise ValueError("median of empty sequence")
    middle = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[middle]
    return _round_half_up(ordered[middle - 1] + ordered[middle], 2)


def _mean(values: Sequence[int]) -> int:
    if not values:
        raise ValueError("mean of empty sequence")
    return _round_half_up(sum(values), len(values))


def _cents(text: str) -> int:
    """Dollar string to integer cents, exact then half even to mirror rint."""
    return int((Decimal(text) * 100).quantize(Decimal(1), rounding=ROUND_HALF_EVEN))


def _scheduled_end_month(loan_start: str, duration_months: int) -> str:
    year = int(loan_start[:4])
    month = int(loan_start[5:7])
    index = year * 12 + (month - 1) + duration_months
    end_year, end_month_zero = divmod(index, 12)
    return f"{end_year:04d}-{end_month_zero + 1:02d}"


def _month_index(month: str) -> int:
    return int(month[:4]) * 12 + int(month[5:7])


def _read_monthly(path: Path) -> dict[str, list[dict[str, Any]]]:
    """Naive monthly_summary read: {account_id: rows} sorted by month."""
    grouped: dict[str, list[dict[str, Any]]] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            account_id = raw["account_id"]
            row: dict[str, Any] = {"month": raw["month"]}
            for column in MONTHLY_MONEY_COLUMNS:
                row[column] = _cents(raw[column])
            grouped.setdefault(account_id, []).append(row)
    for rows in grouped.values():
        rows.sort(key=lambda row: row["month"])
    return grouped


def _read_loans(path: Path) -> dict[str, dict[str, Any]]:
    """Naive loans read: {account_id: loan record}."""
    loans: dict[str, dict[str, Any]] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            account_id = raw["account_id"]
            if account_id in loans:
                raise ValueError(f"multiple loans for account {account_id}")
            loans[account_id] = {
                "loan_id": int(raw["loan_id"]),
                "status": raw["status"],
                "defaulted": bool(int(raw["defaulted"])),
                "amount_cents": _cents(raw["amount"]),
                "duration_months": int(raw["duration_months"]),
                "monthly_payment_cents": _cents(raw["monthly_payment"]),
                "loan_start": raw["loan_start"],
                "scheduled_end_month": _scheduled_end_month(
                    raw["loan_start"], int(raw["duration_months"])
                ),
            }
    return loans


def _read_account_ids(path: Path) -> list[str]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        ids = sorted({int(raw["account_id"]) for raw in reader})
    return [str(value) for value in ids]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 16), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _count_rows(path: Path) -> int:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        next(reader, None)
        return sum(1 for _ in reader)


def _runway(
    buffer_cents: int, one_off_cents: int, income_cents: int, spending_cents: int
) -> tuple[str, int]:
    """Naive copy of the judge runway branches and integer rounding."""
    buffer_left = buffer_cents - one_off_cents
    gap = spending_cents - income_cents
    if buffer_left <= 0:
        return "buffer_depleted", 0
    if gap <= 0:
        return "no_shortfall", RUNWAY_CAP_DECI_MONTHS
    deci_months = (20 * buffer_left + gap) // (2 * gap)
    if deci_months > RUNWAY_CAP_DECI_MONTHS:
        deci_months = RUNWAY_CAP_DECI_MONTHS
    return "finite", deci_months


def _is_contiguous(months: Sequence[str]) -> bool:
    if len(set(months)) != len(months):
        return False
    return _month_index(months[-1]) - _month_index(months[0]) == len(months) - 1


def _recompute_profile(
    account_id: str,
    rows: Sequence[dict[str, Any]],
    loan: dict[str, Any] | None,
) -> dict[str, Any]:
    """Naive per account metrics, flags, runway, history, and provenance."""
    ordered = sorted(rows, key=lambda row: row["month"])
    income = _median([row["money_in"] for row in ordered])
    spending = _median([row["money_out"] for row in ordered])
    fixed = _median(
        [
            row["household_bills"] + row["insurance"] + row["loan_payments"]
            for row in ordered
        ]
    )
    household = _median([row["household_bills"] for row in ordered])
    insurance = _median([row["insurance"] for row in ordered])
    loan_payments = _median([row["loan_payments"] for row in ordered])
    pension_total = sum(row["pension_in"] for row in ordered)
    window = ordered[-min(BUFFER_WINDOW_ROWS, len(ordered)):]
    buffer_cents = _mean([row["avg_daily_balance"] for row in window])
    gap = spending - income
    status = loan["status"] if loan is not None else None
    payment = (
        loan["monthly_payment_cents"]
        if loan is not None and status in RUNNING_STATUSES
        else 0
    )
    state, deci_months = _runway(buffer_cents, 0, income, spending)

    months = [row["month"] for row in ordered]
    contiguous = _is_contiguous(months)
    history: dict[str, Any] = {
        "first_month": months[0],
        "last_month": months[-1],
        "row_count": len(ordered),
        "months_contiguous": contiguous,
    }
    if not contiguous:
        history["months"] = months

    tail = ordered[-min(BALANCE_SERIES_ROWS, len(ordered)):]
    row_ids = [f"{account_id}:{row['month']}" for row in ordered]
    values = {row_id: row["money_in"] for row_id, row in zip(row_ids, ordered)}

    return {
        "account_id": account_id,
        "income_cents": income,
        "fixed_costs_cents": fixed,
        "spending_cents": spending,
        "buffer_cents": buffer_cents,
        "household_bills_cents": household,
        "loan_payment_cents": payment,
        "insurance_cents": insurance,
        "loan_payments_median_cents": loan_payments,
        "pension_in_cents": pension_total,
        "gap_cents": gap,
        "runway_state": state,
        "runway_deci_months": deci_months,
        "history": history,
        "loan": dict(loan) if loan is not None else None,
        "flags": {
            "pensioner": pension_total > 0,
            "thin_history": len(ordered) < THIN_HISTORY_ROWS,
            "zero_income": income == 0,
            "defaulted_loan": status is not None and status == DEFAULTED_STATUS,
            "negative_buffer": buffer_cents < 0,
        },
        "balance_series": {
            "start_month": tail[0]["month"],
            "values_cents": [row["avg_daily_balance"] for row in tail],
        },
        "provenance": {
            "source": PROVENANCE_SOURCE,
            "filter": f"account_id = {account_id} ordered by month ascending",
            "agg": PROVENANCE_AGG,
            "check_sum": checksum(row_ids, values),
        },
    }


def recompute_profiles() -> dict[str, object]:
    """Recompute the whole profiles.json document from the raw CSVs."""
    grouped = _read_monthly(MONTHLY_PATH)
    loans = _read_loans(LOANS_PATH)
    account_ids = _read_account_ids(ACCOUNTS_PATH)
    known = set(account_ids)
    missing = [account_id for account_id in account_ids if account_id not in grouped]
    extra = [account_id for account_id in grouped if account_id not in known]
    if missing or extra:
        raise ValueError(
            "accounts.csv and monthly_summary.csv disagree on the account set: "
            f"missing rows for {missing[:5]}, unknown accounts {extra[:5]}"
        )

    profiles: dict[str, object] = {}
    flag_counts = {name: 0 for name in FLAG_NAMES}
    global_start: str | None = None
    global_end: str | None = None
    for account_id in sorted(grouped, key=int):
        profile = _recompute_profile(account_id, grouped[account_id], loans.get(account_id))
        profiles[account_id] = profile
        for name in FLAG_NAMES:
            if profile["flags"][name]:
                flag_counts[name] += 1
        months = sorted(row["month"] for row in grouped[account_id])
        if global_start is None or months[0] < global_start:
            global_start = months[0]
        if global_end is None or months[-1] > global_end:
            global_end = months[-1]

    sources = [
        {"path": rel_to_root(path), "sha256": _sha256(path), "rows": _count_rows(path)}
        for path in (MONTHLY_PATH, LOANS_PATH, ACCOUNTS_PATH)
    ]
    meta: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "generated_by": GENERATED_BY,
        "sources": sources,
        "account_count": len(profiles),
        "date_range": {"start": global_start, "end": global_end},
        "money_unit": MONEY_UNIT,
        "runway_unit": RUNWAY_UNIT,
        "rounding": ROUNDING_RULE,
        "definitions": DEFINITIONS,
        "checksum_recipe": CHECKSUM_RECIPE,
        "edge_flag_counts": flag_counts,
    }
    return {"meta": meta, "profiles": profiles}


def _diff(expected: Any, actual: Any, path: str = "root") -> list[str]:
    """Exact recursive field by field diff (the artifact holds no floats)."""
    if isinstance(expected, dict) and isinstance(actual, dict):
        problems: list[str] = []
        for key in sorted(set(expected) | set(actual)):
            child = f"{path}.{key}"
            if key not in expected:
                problems.append(f"{child}: present in artifact, missing from recomputation")
            elif key not in actual:
                problems.append(f"{child}: missing from artifact")
            else:
                problems.extend(_diff(expected[key], actual[key], child))
        return problems
    if isinstance(expected, list) and isinstance(actual, list):
        problems = []
        if len(expected) != len(actual):
            problems.append(
                f"{path}: length {len(actual)} in artifact versus "
                f"{len(expected)} recomputed"
            )
        for index, (left, right) in enumerate(zip(expected, actual)):
            problems.extend(_diff(left, right, f"{path}[{index}]"))
        return problems
    if isinstance(expected, bool) or isinstance(actual, bool):
        if expected is not actual:
            return [f"{path}: {actual!r} in artifact versus {expected!r} recomputed"]
        return []
    if expected != actual:
        return [f"{path}: {actual!r} in artifact versus {expected!r} recomputed"]
    return []


def dash_violations(text: str) -> list[str]:
    """Em dashes, en dashes, minus signs, double hyphens, spaced hyphens.

    Mirrors scripts/analysis/verify_findings.py: markdown table rows are
    skipped there because they are structural; artifact strings have no
    newlines, so the line number is informational only.
    """
    problems: list[str] = []
    for number, line in enumerate(text.splitlines(), start=1):
        for character in DASH_CHARACTERS:
            if character in line:
                problems.append(
                    f"line {number}: dash character U+{ord(character):04X} present"
                )
        if "--" in line:
            problems.append(f"line {number}: double hyphen present")
        if " - " in line:
            problems.append(f"line {number}: spaced hyphen present")
    return problems


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


def _dash_scan(document: Any) -> list[str]:
    problems: list[str] = []
    seen: set[tuple[str, str]] = set()
    for path, text in _iter_strings(document, "root"):
        if (path, text) in seen:
            continue
        seen.add((path, text))
        for violation in dash_violations(text):
            problems.append(f"{path}: {violation}")
    return problems


def atlas_problems(profiles: dict[str, Any]) -> list[str]:
    """Schema and count invariants of the sibling atlas.json artifact.

    Reads committed files only (atlas.json next to the profiles
    artifact plus the profiles mapping it already holds), so the check
    needs no raw CSV and can run wherever the artifacts are committed.
    The prose dash scan stays with profiles.json because district names
    are data, not pipeline prose, and several carry a spaced hyphen.
    """
    path = ARTIFACT_PATH.parent / ATLAS_NAME
    if not path.is_file():
        return [
            f"{rel_to_root(path)} is missing; run "
            "uv run python -m scripts.engine.build first"
        ]
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        return [f"{rel_to_root(path)} is not valid JSON: {error}"]
    if not isinstance(document, dict):
        return [f"{rel_to_root(path)}: document is not an object"]
    if set(document) != ATLAS_KEYS:
        return [
            f"atlas top level keys {sorted(document)} do not match "
            f"{sorted(ATLAS_KEYS)}"
        ]

    problems: list[str] = []
    try:
        if document["schema_version"] != ATLAS_SCHEMA_VERSION:
            problems.append(
                f"atlas schema_version {document['schema_version']!r} "
                f"!= {ATLAS_SCHEMA_VERSION}"
            )
        if document["generated_by"] != ATLAS_GENERATED_BY:
            problems.append(f"atlas generated_by {document['generated_by']!r}")
        if document["states"] != list(ATLAS_BANDS):
            problems.append(f"atlas band ids {document['states']!r} do not match")

        sources = document["sources"]
        if not isinstance(sources, list) or [
            entry.get("path") for entry in sources if isinstance(entry, dict)
        ] != list(ATLAS_SOURCE_PATHS):
            problems.append(
                "atlas sources paths do not match "
                f"{list(ATLAS_SOURCE_PATHS)}"
            )
        else:
            for entry in sources:
                if set(entry) != {"path", "sha256", "rows"}:
                    problems.append(f"atlas source {entry.get('path')} keys")
                    continue
                digest = entry["sha256"]
                if (
                    not isinstance(digest, str)
                    or len(digest) != 64
                    or digest != digest.lower()
                ):
                    problems.append(f"atlas source {entry['path']} sha256")
                if not isinstance(entry["rows"], int) or entry["rows"] <= 0:
                    problems.append(f"atlas source {entry['path']} rows")
            # The profiles source hashes the artifact being verified.
            if (
                isinstance(sources[0], dict)
                and sources[0].get("path") == ATLAS_SOURCE_PATHS[0]
                and isinstance(sources[0].get("sha256"), str)
                and ARTIFACT_PATH.is_file()
                and sources[0]["sha256"] != _sha256(ARTIFACT_PATH)
            ):
                problems.append("atlas sources profiles.json sha256 drift")

        districts = document["districts"]
        if not isinstance(districts, list) or len(districts) != ATLAS_DISTRICT_COUNT:
            problems.append(
                f"atlas districts length "
                f"{len(districts) if isinstance(districts, list) else 'n/a'} "
                f"!= {ATLAS_DISTRICT_COUNT}"
            )
            return problems
        district_ids: list[int] = []
        account_counts: dict[int, int] = {}
        for entry in districts:
            if not isinstance(entry, dict) or set(entry) != ATLAS_DISTRICT_KEYS:
                problems.append(f"atlas district entry keys {entry!r}"[:120])
                continue
            district_id = entry["district_id"]
            if (
                not isinstance(district_id, int)
                or isinstance(district_id, bool)
                or not isinstance(entry["district_name"], str)
                or not isinstance(entry["region"], str)
                or not isinstance(entry["inhabitants"], int)
                or not isinstance(entry["account_count"], int)
                or not isinstance(entry["no_data"], bool)
            ):
                problems.append(f"atlas district {district_id!r} value types")
                continue
            if entry["unemployment_rate_2023"] is not None and not isinstance(
                entry["unemployment_rate_2023"], float
            ):
                problems.append(f"atlas district {district_id} unemployment type")
            if entry["average_salary"] is not None and not isinstance(
                entry["average_salary"], float
            ):
                problems.append(f"atlas district {district_id} salary type")
            district_ids.append(district_id)
            account_counts[district_id] = entry["account_count"]
        if district_ids != sorted(district_ids) or len(set(district_ids)) != len(
            district_ids
        ):
            problems.append("atlas district ids are not unique ascending")
        no_data_ids = [
            entry["district_id"]
            for entry in districts
            if isinstance(entry, dict) and entry.get("no_data") is True
        ]
        if no_data_ids != [69]:
            problems.append(f"atlas no_data districts {no_data_ids} != [69]")

        join = document["account_district"]
        district_id_set = set(district_ids)
        if not isinstance(join, dict):
            problems.append("atlas account_district is not an object")
        else:
            if set(join) != set(profiles):
                problems.append(
                    "atlas account_district does not cover the profiles "
                    "account set"
                )
            per_district: dict[int, int] = {}
            for account_id, district_id in join.items():
                if (
                    not isinstance(district_id, int)
                    or isinstance(district_id, bool)
                    or district_id not in district_id_set
                ):
                    problems.append(
                        f"atlas account_district {account_id} -> "
                        f"{district_id!r}"
                    )
                    continue
                per_district[district_id] = per_district.get(district_id, 0) + 1
            for district_id, expected in account_counts.items():
                if per_district.get(district_id, 0) != expected:
                    problems.append(
                        f"atlas district {district_id} join count "
                        f"{per_district.get(district_id, 0)} != "
                        f"account_count {expected}"
                    )

        district_keys = {str(district_id) for district_id in district_ids}
        scenarios = document["scenarios"]
        if not isinstance(scenarios, dict) or list(scenarios) != list(ATLAS_PRESETS):
            problems.append(
                f"atlas scenario keys "
                f"{list(scenarios) if isinstance(scenarios, dict) else 'n/a'} "
                f"!= {list(ATLAS_PRESETS)}"
            )
        buckets: list[tuple[str, Any]] = [("baseline", document["baseline"])]
        if isinstance(scenarios, dict):
            buckets.extend(scenarios.items())
        for name, bucket in buckets:
            if not isinstance(bucket, dict) or set(bucket) != district_keys:
                problems.append(f"atlas {name} district keys")
                continue
            for district_key, counts in bucket.items():
                if not isinstance(counts, dict) or set(counts) != set(ATLAS_BANDS):
                    problems.append(f"atlas {name} {district_key} band keys")
                    continue
                total = 0
                for band, count in counts.items():
                    if (
                        not isinstance(count, int)
                        or isinstance(count, bool)
                        or count < 0
                    ):
                        problems.append(
                            f"atlas {name} {district_key} {band} = {count!r}"
                        )
                    total += count if isinstance(count, int) else 0
                expected_total = account_counts.get(int(district_key))
                if expected_total is None:
                    problems.append(
                        f"atlas {name} district {district_key} unknown id"
                    )
                elif total != expected_total:
                    problems.append(
                        f"atlas {name} {district_key} counts sum {total} != "
                        f"account_count {expected_total}"
                    )
    except (KeyError, TypeError, IndexError, ValueError) as error:
        problems.append(f"atlas structure error: {error}")
    return problems


def run_verification() -> list[str]:
    """Return drift messages; an empty list means the artifact is green."""
    if not ARTIFACT_PATH.is_file():
        return [
            f"{rel_to_root(ARTIFACT_PATH)} is missing; run "
            "uv run python -m scripts.engine.build first"
        ]
    try:
        actual = json.loads(ARTIFACT_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        return [f"{rel_to_root(ARTIFACT_PATH)} is not valid JSON: {error}"]
    try:
        expected = recompute_profiles()
    except (OSError, ValueError, KeyError, ArithmeticError, csv.Error) as error:
        return [f"recomputation failed: {error}"]
    problems = _diff(expected, actual)
    problems.extend(_dash_scan(actual))
    if isinstance(actual, dict) and isinstance(actual.get("profiles"), dict):
        problems.extend(atlas_problems(actual["profiles"]))
    return problems


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry: verify, print the artifact SHA256, exit on drift."""
    global ARTIFACT_PATH
    parser = argparse.ArgumentParser(
        description="Verify profiles.json against a naive recomputation"
    )
    parser.add_argument(
        "--artifact", type=Path, default=ARTIFACT_PATH, help="artifact to verify"
    )
    args = parser.parse_args(argv)
    ARTIFACT_PATH = args.artifact

    if ARTIFACT_PATH.is_file():
        digest = hashlib.sha256(ARTIFACT_PATH.read_bytes()).hexdigest()
        print(f"artifact: {rel_to_root(ARTIFACT_PATH)}")
        print(f"artifact sha256: {digest}")
    problems = run_verification()
    if problems:
        shown = problems[:40]
        for problem in shown:
            print(f"drift: {problem}", file=sys.stderr)
        if len(problems) > len(shown):
            print(f"drift: ... and {len(problems) - len(shown)} more", file=sys.stderr)
        print("scripts.engine.verify: FAIL", file=sys.stderr)
        return 1
    print("drift: none (all accounts, all fields, atlas invariants, dash scan clean)")
    print("scripts.engine.verify: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
