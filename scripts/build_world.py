"""Build public/data/world.json and public/data/transactions.json.

Reads a Tangerine style transactions CSV and emits the Ledger Odyssey game
world plus a compact row table for the provenance Inspector. Run from the
repository root:

    uv run python -m scripts.build_world [--input CSV] [--out-dir DIR]

TRUST MODEL
Both flags are contained to the repository root (REPO_ROOT): each path is
resolved first and a path outside the repo fails before any read or write.
Source CSVs above 50 MB (MAX_INPUT_CSV_BYTES) are rejected before parsing.

EXPECTED INPUT SCHEMA
CSV headers are normalized first (case insensitive, camelCase boundaries
split, punctuation collapsed to underscores, so "Transaction ID" becomes
transaction_id). Required columns:

* transaction_id: unique row id string, for example TAN-000001. Becomes the
  provenance rowId in every emitted entity.
* date: ISO calendar date, YYYY-MM-DD.
* amount: CAD decimal. Debits are negative, deposits are positive.
* merchant_category: category label, for example Groceries or Income.
* account_balance: CAD decimal account balance after the transaction.

Optional columns:

* hour: integer 0 to 23. When absent the builder falls back to the hour of a
  timestamp column, otherwise 12 is assumed.
* timestamp: ISO datetime used only to derive hour when hour is absent.
* merchant_name: merchant label used as the subscription grouping key. When
  absent, merchant_category is used as the grouping key instead.
* transaction_type: "debit" or "credit". When absent, the sign of amount
  decides. When present, the column wins and must hold those two values.
* minute: integer 0 to 59. Used only to order same day rows, never emitted.

EMITTED FILES

* public/data/world.json: categories (annual spend, recurrence, time of day
  distribution, deterministic orbital inclination and node from the category
  id hash), subscriptions (recurring charges), splurges (large one off
  spends), income_events (positive deposits), monthly_balance_series (final
  12 month end balances for ship altitude), debt_horizon (minimum month end
  balance minus a fixed buffer), plus a meta block with the source checksum.
* public/data/transactions.json: compact column oriented row table, rows as
  arrays indexed by the columns list, every row keyed by its transaction_id.

DERIVATION RULES (all money is integer CAD cents)

* categories: one entity per merchant_category found on debit rows
  (type == debit, derived from the sign of amount when the CSV has no
  transaction_type column). Annual spend sums abs(amount) over the whole
  file, which the pipeline expects to cover one year (12 monthly balance
  points are emitted).
  recurrence is transactions per covered month plus the median day gap.
  timeOfDay is a normalized 24 bin histogram of the debit hours.
  inclinationDeg is 5 to 45 degrees, ascendingNodeDeg and orbitPhaseDeg are
  0 to 360 degrees, all three derived from sha256 of the entity id so the
  scene layout is deterministic (see orbital_params).
* subscriptions: debit rows grouped by merchant_name (or merchant_category),
  sorted by date, filtered to rows whose abs(amount) is within 25 percent of
  the group median debit amount, then cut into runs where consecutive charges
  fall 25 to 35 days apart. Runs with at least 4 charges are emitted with the
  median charge as monthlyAmountCents.
* splurges: debit rows whose abs(amount) strictly exceeds 3 times the median
  debit amount of their own category (SPLURGE_FACTOR), only for categories
  with at least MIN_DEBITS_FOR_SPLURGE debit rows so tiny samples never
  manufacture splurges. thresholdCents and ratioToMedian document the test.
* income_events: every row with type == credit (salary, refunds, any deposit).
* monthly_balance_series: account_balance of the final row of each calendar
  month over the last BALANCE_MONTHS months present in the data.
* debt_horizon: minimum balanceCents across monthly_balance_series minus
  HORIZON_BUFFER_CENTS (a fixed 500.00 CAD buffer). Ship altitude in the game
  is balance minus this horizon.

PROVENANCE AND CHECKSUMS
Every entity carries Provenance {rowIds, filter, agg, checkSum} as defined in
docs/architecture.md. checkSum follows the recipe in scripts/pipeline_lib.py:
SHA256 over LF joined "{rowId}:{valueCents}" lines sorted by row id, where the
value column is announced by the agg suffix "checksum value = <field>". The
builder verifies every checksum a second time after writing world.json and
exits non zero on any mismatch.
"""

from __future__ import annotations

import argparse
import hashlib
import json
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
    cents_to_dollars,
    make_provenance,
    preview_ids,
    rel_to_root,
    sha256_file,
    slugify,
    unique_id,
    verify_provenance,
)

DEFAULT_INPUT: Path = REPO_ROOT / "data" / "mock" / "tangerine_transactions.csv"
DEFAULT_OUT_DIR: Path = REPO_ROOT / "public" / "data"

SPLURGE_FACTOR: float = 3.0
MIN_DEBITS_FOR_SPLURGE: int = 6
SUB_MIN_GAP_DAYS: int = 25
SUB_MAX_GAP_DAYS: int = 35
SUB_MIN_CHARGES: int = 4
SUB_AMOUNT_TOLERANCE: float = 0.25
BALANCE_MONTHS: int = 12
HORIZON_BUFFER_CENTS: int = 50_000

REQUIRED_COLUMNS: tuple[str, ...] = (
    "transaction_id",
    "date",
    "amount",
    "merchant_category",
    "account_balance",
)

TRANSACTION_COLUMNS: list[str] = [
    "id",
    "date",
    "hour",
    "amountCents",
    "balanceCents",
    "type",
    "category",
    "merchant",
]

# Provenance filter text is generated from these selectors, which are the
# exact conditions the builders apply to the frame (frame["type"] == ...),
# so the human readable rule can never claim a different rule than the one
# that selected the rows. When the CSV has no transaction_type column, the
# generator derives type from the sign of amount first (see load_frame).
DEBIT_SELECTOR: str = "type == 'debit'"
CREDIT_SELECTOR: str = "type == 'credit'"


def fail(message: str) -> None:
    """Print a pipeline error and stop with exit code 1."""
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def require_finite(numeric: np.ndarray, column: str, row_ids: np.ndarray) -> None:
    """Reject nan or inf before any integer cast, naming the offending rows.

    pd.to_numeric happily parses "nan", "inf", and "1e999", and an
    astype("int64") on those values wraps silently into garbage, so the
    finiteness gate must run before every cast (docs/reviews.md security
    review, Nov 05 2026).
    """
    bad = ~np.isfinite(numeric)
    if bad.any():
        fail(
            f"column {column} holds non finite values (nan or inf) in rows: "
            f"{preview_ids(row_ids, bad)}"
        )


def dollars_to_cents(numeric: np.ndarray, column: str, row_ids: np.ndarray) -> np.ndarray:
    """Convert a CAD dollar column to int64 cents with finiteness and range checks."""
    require_finite(numeric, column, row_ids)
    # A finite dollar value times 100 can still overflow float64 to an
    # infinity; the errstate keeps that warning off stderr and the range
    # check below fails on the resulting non representable value.
    with np.errstate(over="ignore"):
        cents = np.rint(numeric * 100.0)
    bad = (cents >= INT64_LIMIT_FLOAT) | (cents < INT64_MIN_FLOAT)
    if bad.any():
        fail(
            f"column {column} values do not fit integer cents (int64 range) in rows: "
            f"{preview_ids(row_ids, bad)}"
        )
    return cents.astype("int64")


def orbital_params(entity_id: str) -> tuple[float, float, float]:
    """Derive (inclinationDeg, ascendingNodeDeg, orbitPhaseDeg) from sha256 of the entity id."""
    digest = hashlib.sha256(entity_id.encode("utf-8")).digest()
    inclination = 5.0 + 40.0 * int.from_bytes(digest[0:2], "big") / 65535.0
    node = 360.0 * int.from_bytes(digest[2:4], "big") / 65535.0
    phase = 360.0 * int.from_bytes(digest[4:6], "big") / 65535.0
    return round(inclination, 2), round(node, 2), round(phase, 2)


def load_frame(path: Path) -> tuple[pd.DataFrame, dict[str, str]]:
    """Read the CSV, validate the schema, and return the canonical frame plus value maps."""
    if not path.is_file():
        fail(f"input CSV not found: {rel_to_root(path)}")
    size = path.stat().st_size
    if size > MAX_INPUT_CSV_BYTES:
        fail(
            f"input CSV too large: {rel_to_root(path)} is {size / (1024 * 1024):.1f} MB, "
            f"limit is {MAX_INPUT_CSV_BYTES // (1024 * 1024)} MB"
        )
    # A zero byte or comment-only CSV makes pandas raise EmptyDataError
    # ("No columns to parse from file") and a read race or permission problem
    # raises OSError; both must exit through the friendly fail() with the path
    # instead of escaping as a raw traceback (docs/tests.md, Nov 05 2026).
    try:
        raw = pd.read_csv(path, comment="#")
    except pd.errors.EmptyDataError:
        fail(f"{rel_to_root(path)}: No columns to parse (empty or comment-only CSV)")
    except OSError as exc:
        fail(f"cannot read {rel_to_root(path)}: {exc}")
    raw.columns = [canonical_column(column) for column in raw.columns]
    duplicated = sorted(set(raw.columns[raw.columns.duplicated()].tolist()))
    if duplicated:
        fail(f"columns collide after normalization: {', '.join(duplicated)}")
    missing = [column for column in REQUIRED_COLUMNS if column not in raw.columns]
    if missing:
        fail(f"{rel_to_root(path)} is missing required columns: {', '.join(missing)}")
    if raw.empty:
        fail(f"{rel_to_root(path)} has no data rows")

    frame = pd.DataFrame()
    if raw["transaction_id"].isna().any():
        fail("transaction_id contains empty values")
    frame["row_id"] = raw["transaction_id"].astype(str).str.strip()
    if frame["row_id"].eq("").any():
        fail("transaction_id contains empty values")
    duplicated_ids = frame.loc[frame["row_id"].duplicated(), "row_id"].tolist()
    if duplicated_ids:
        preview = ", ".join(duplicated_ids[:5])
        fail(f"transaction_id values are not unique (first: {preview})")
    row_ids = frame["row_id"].to_numpy()

    frame["date"] = pd.to_datetime(raw["date"], errors="coerce")
    if frame["date"].isna().any():
        bad = frame.loc[frame["date"].isna(), "row_id"].head(5).tolist()
        fail(f"unparseable date in rows: {', '.join(str(b) for b in bad)}")
    frame["date"] = frame["date"].dt.normalize()

    for source, target in (("amount", "amount_cents"), ("account_balance", "balance_cents")):
        try:
            numeric = pd.to_numeric(raw[source], errors="raise").to_numpy(dtype=float)
        except (TypeError, ValueError):
            fail(f"column {source} holds non numeric values")
        frame[target] = dollars_to_cents(numeric, source, row_ids)

    if raw["merchant_category"].isna().any():
        fail("merchant_category contains empty values")
    frame["merchant_category"] = raw["merchant_category"].astype(str).str.strip()

    if "merchant_name" in raw.columns:
        frame["merchant_name"] = raw["merchant_name"].fillna("").astype(str).str.strip()
    else:
        frame["merchant_name"] = ""

    if "hour" in raw.columns:
        try:
            hour_numeric = pd.to_numeric(raw["hour"], errors="raise").to_numpy(dtype=float)
        except (TypeError, ValueError):
            fail("column hour holds non numeric values")
        require_finite(hour_numeric, "hour", row_ids)
        # The clip keeps the cast inside [0, 23] by design, so only the
        # finiteness gate is needed before astype.
        frame["hour"] = np.clip(np.rint(hour_numeric), 0, 23).astype("int64")
    elif "timestamp" in raw.columns:
        timestamps = pd.to_datetime(raw["timestamp"], errors="coerce")
        if timestamps.isna().any():
            fail("timestamp column holds unparseable values")
        frame["hour"] = timestamps.dt.hour.astype("int64")
    else:
        frame["hour"] = 12

    if "minute" in raw.columns:
        try:
            minute_numeric = pd.to_numeric(raw["minute"], errors="raise").to_numpy(dtype=float)
        except (TypeError, ValueError):
            fail("column minute holds non numeric values")
        require_finite(minute_numeric, "minute", row_ids)
        frame["minute"] = np.clip(np.rint(minute_numeric), 0, 59).astype("int64")
    else:
        frame["minute"] = 0

    if "transaction_type" in raw.columns:
        types = raw["transaction_type"].astype(str).str.strip().str.lower()
        unknown = sorted(set(types.unique()) - {"debit", "credit"})
        if unknown:
            fail(f"transaction_type must be debit or credit, found: {', '.join(unknown)}")
        frame["type"] = types
    else:
        frame["type"] = np.where(frame["amount_cents"] < 0, "debit", "credit")

    frame = frame.sort_values(["date", "hour", "minute", "row_id"]).reset_index(drop=True)
    frame["month"] = frame["date"].dt.strftime("%Y-%m")

    value_maps = {
        "amountCents": dict(zip(frame["row_id"], frame["amount_cents"])),
        "balanceCents": dict(zip(frame["row_id"], frame["balance_cents"])),
    }
    return frame, value_maps


def dominant_category(series: pd.Series) -> str:
    """Return the most frequent category, ties broken alphabetically."""
    counts = series.value_counts()
    top = int(counts.max())
    return str(sorted(counts[counts == top].index.tolist())[0])


def build_categories(
    frame: pd.DataFrame,
    months_covered: float,
    source_label: str,
    amount_values: dict[str, int],
    used_ids: set[str],
) -> list[dict[str, Any]]:
    """Aggregate debit rows into one planet entity per merchant_category."""
    debits = frame[frame["type"] == "debit"]
    categories: list[dict[str, Any]] = []
    for name in sorted(debits["merchant_category"].unique()):
        group = debits[debits["merchant_category"] == name]
        row_ids = group["row_id"].tolist()
        absolute = group["amount_cents"].abs()
        entity_id = unique_id(f"cat-{slugify(name)}", used_ids)
        hour_counts = np.bincount(group["hour"].to_numpy(), minlength=24)
        time_of_day = [round(float(count) / len(group), 6) for count in hour_counts]
        gaps = group["date"].diff().dt.days.dropna()
        median_gap = None if gaps.empty else round(float(gaps.median()), 2)
        inclination, node, phase = orbital_params(entity_id)
        provenance = make_provenance(
            row_ids,
            "amountCents",
            amount_values,
            f"rows with {DEBIT_SELECTOR} and merchant_category == '{name}' in {source_label}",
            "sum of abs(amount) per row in cents (annualSpendCents) over the whole file",
        )
        categories.append(
            {
                "id": entity_id,
                "name": str(name),
                "annualSpendCents": int(absolute.sum()),
                "transactionCount": int(len(group)),
                "medianAmountCents": int(round(float(absolute.median()))),
                "recurrencesPerMonth": round(len(group) / months_covered, 2),
                "medianGapDays": median_gap,
                "timeOfDay": time_of_day,
                "inclinationDeg": inclination,
                "ascendingNodeDeg": node,
                "orbitPhaseDeg": phase,
                "provenance": provenance,
            }
        )
    return categories


def build_subscriptions(
    frame: pd.DataFrame,
    source_label: str,
    amount_values: dict[str, int],
    used_ids: set[str],
) -> list[dict[str, Any]]:
    """Detect recurring charges: 25 to 35 day gaps, similar amounts, at least 4 charges."""
    debits = frame[frame["type"] == "debit"]
    key_column = "merchant_name" if (debits["merchant_name"] != "").any() else "merchant_category"
    keyed = debits[debits[key_column] != ""]
    subscriptions: list[dict[str, Any]] = []
    tolerance_percent = int(SUB_AMOUNT_TOLERANCE * 100)
    for key_value in sorted(keyed[key_column].unique()):
        group = keyed[keyed[key_column] == key_value]
        group = group.sort_values(["date", "minute", "row_id"]).reset_index(drop=True)
        if len(group) < SUB_MIN_CHARGES:
            continue
        absolute = group["amount_cents"].abs().to_numpy()
        group_median = float(np.median(absolute))
        if group_median <= 0:
            continue
        eligible = np.abs(absolute - group_median) <= SUB_AMOUNT_TOLERANCE * group_median
        dates = group["date"].tolist()
        runs: list[list[int]] = []
        run: list[int] = []
        index = 0
        while index < len(group):
            if not eligible[index]:
                if len(run) >= SUB_MIN_CHARGES:
                    runs.append(run)
                run = []
                index += 1
                continue
            if not run:
                run = [index]
                index += 1
                continue
            gap_days = (dates[index] - dates[run[-1]]).days
            if SUB_MIN_GAP_DAYS <= gap_days <= SUB_MAX_GAP_DAYS:
                run.append(index)
                index += 1
            else:
                if len(run) >= SUB_MIN_CHARGES:
                    runs.append(run)
                run = []
        if len(run) >= SUB_MIN_CHARGES:
            runs.append(run)

        for indices in runs:
            run_rows = group.iloc[indices]
            run_absolute = np.abs(run_rows["amount_cents"].to_numpy())
            gaps = [
                (dates[right] - dates[left]).days
                for left, right in zip(indices, indices[1:])
            ]
            entity_id = unique_id(f"sub-{slugify(key_value)}", used_ids)
            provenance = make_provenance(
                run_rows["row_id"].tolist(),
                "amountCents",
                amount_values,
                (
                    f"rows with {DEBIT_SELECTOR} and {key_column} == '{key_value}' in {source_label}, "
                    f"sorted by date, cut into runs where the gap between charges is "
                    f"{SUB_MIN_GAP_DAYS} to {SUB_MAX_GAP_DAYS} days and every abs(amount) stays "
                    f"within {tolerance_percent} percent of the group median "
                    f"({int(round(group_median))} cents), runs of at least {SUB_MIN_CHARGES} charges"
                ),
                (
                    f"median abs(amount) of the {len(indices)} run charges in cents "
                    f"(monthlyAmountCents)"
                ),
            )
            subscriptions.append(
                {
                    "id": entity_id,
                    "merchant": str(key_value),
                    "category": dominant_category(run_rows["merchant_category"]),
                    "monthlyAmountCents": int(round(float(np.median(run_absolute)))),
                    "chargeCount": int(len(indices)),
                    "firstDate": dates[indices[0]].date().isoformat(),
                    "lastDate": dates[indices[-1]].date().isoformat(),
                    "medianGapDays": round(float(np.median(gaps)), 2) if gaps else None,
                    "provenance": provenance,
                }
            )
    subscriptions.sort(key=lambda entity: entity["id"])
    return subscriptions


def build_splurges(
    frame: pd.DataFrame,
    source_label: str,
    amount_values: dict[str, int],
    used_ids: set[str],
) -> list[dict[str, Any]]:
    """Flag debit rows above 3 times the median debit amount of their own category."""
    debits = frame[frame["type"] == "debit"]
    splurges: list[dict[str, Any]] = []
    for name in sorted(debits["merchant_category"].unique()):
        group = debits[debits["merchant_category"] == name]
        if len(group) < MIN_DEBITS_FOR_SPLURGE:
            continue
        median_cents = float(group["amount_cents"].abs().median())
        threshold = int(round(SPLURGE_FACTOR * median_cents))
        if threshold <= 0:
            continue
        big = group[group["amount_cents"].abs() > threshold]
        for row in big.itertuples(index=False):
            entity_id = unique_id(
                f"spl-{row.date.date().isoformat()}-{slugify(row.merchant_category)}", used_ids
            )
            absolute = abs(int(row.amount_cents))
            provenance = make_provenance(
                [str(row.row_id)],
                "amountCents",
                amount_values,
                (
                    f"rows with {DEBIT_SELECTOR} and merchant_category == '{name}' in {source_label} "
                    f"whose abs(amount) exceeds {threshold} cents, which is "
                    f"{SPLURGE_FACTOR:g} times the category median "
                    f"({int(round(median_cents))} cents); categories need at least "
                    f"{MIN_DEBITS_FOR_SPLURGE} debit rows to be tested"
                ),
                "abs(amount) of the single row in cents, kept signed in amountCents",
            )
            splurges.append(
                {
                    "id": entity_id,
                    "date": row.date.date().isoformat(),
                    "amountCents": int(row.amount_cents),
                    "spendCents": absolute,
                    "category": str(row.merchant_category),
                    "merchant": str(row.merchant_name or row.merchant_category),
                    "thresholdCents": threshold,
                    "ratioToMedian": round(absolute / max(median_cents, 1.0), 2),
                    "provenance": provenance,
                }
            )
    splurges.sort(key=lambda entity: (entity["date"], entity["id"]))
    return splurges


def build_income_events(
    frame: pd.DataFrame,
    source_label: str,
    amount_values: dict[str, int],
    used_ids: set[str],
) -> list[dict[str, Any]]:
    """Emit one entity per positive deposit row."""
    credits = frame[frame["type"] == "credit"]
    events: list[dict[str, Any]] = []
    for row in credits.itertuples(index=False):
        entity_id = unique_id(f"inc-{row.date.date().isoformat()}", used_ids)
        label = str(row.merchant_name) if row.merchant_name else str(row.merchant_category)
        provenance = make_provenance(
            [str(row.row_id)],
            "amountCents",
            amount_values,
            f"rows with {CREDIT_SELECTOR} (deposits) in {source_label}",
            "amount of the single deposit row in cents (amountCents)",
        )
        events.append(
            {
                "id": entity_id,
                "date": row.date.date().isoformat(),
                "amountCents": int(row.amount_cents),
                "label": label,
                "category": str(row.merchant_category),
                "provenance": provenance,
            }
        )
    events.sort(key=lambda entity: (entity["date"], entity["id"]))
    return events


def build_balance_series(
    frame: pd.DataFrame,
    source_label: str,
    balance_values: dict[str, int],
) -> list[dict[str, Any]]:
    """Take the account balance of the final row of each of the last 12 months."""
    last_rows = frame.groupby("month", sort=True).tail(1)
    last_rows = last_rows.tail(BALANCE_MONTHS)
    points: list[dict[str, Any]] = []
    for row in last_rows.itertuples(index=False):
        provenance = make_provenance(
            [str(row.row_id)],
            "balanceCents",
            balance_values,
            f"final row of month {row.month} by (date, hour, minute) order in {source_label}",
            "account_balance of that final row in cents (balanceCents)",
        )
        points.append(
            {
                "month": str(row.month),
                "date": row.date.date().isoformat(),
                "balanceCents": int(row.balance_cents),
                "provenance": provenance,
            }
        )
    return points


def build_debt_horizon(
    points: Sequence[dict[str, Any]],
    source_label: str,
    balance_values: dict[str, int],
) -> dict[str, Any]:
    """Derive the debt horizon as the minimum month end balance minus a fixed buffer."""
    if not points:
        fail("monthly_balance_series is empty, cannot derive debt_horizon")
    min_cents = min(int(point["balanceCents"]) for point in points)
    provenance = make_provenance(
        [str(point["provenance"]["rowIds"][0]) for point in points],
        "balanceCents",
        balance_values,
        (
            f"month-end closing balance rows of the final {len(points)} months in {source_label}"
        ),
        (
            f"minimum balanceCents across those rows ({min_cents}) minus "
            f"bufferCents ({HORIZON_BUFFER_CENTS})"
        ),
    )
    return {
        "valueCents": min_cents - HORIZON_BUFFER_CENTS,
        "minBalanceCents": min_cents,
        "bufferCents": HORIZON_BUFFER_CENTS,
        "derivation": (
            "minimum month-end balance across monthly_balance_series (minBalanceCents) "
            f"minus a fixed buffer of {HORIZON_BUFFER_CENTS} cents (500.00 CAD)"
        ),
        "provenance": provenance,
    }


def transactions_payload(frame: pd.DataFrame) -> dict[str, Any]:
    """Build the compact column oriented row table for the Inspector."""
    rows: list[list[Any]] = []
    for row in frame.itertuples(index=False):
        rows.append(
            [
                str(row.row_id),
                row.date.date().isoformat(),
                int(row.hour),
                int(row.amount_cents),
                int(row.balance_cents),
                str(row.type),
                str(row.merchant_category),
                str(row.merchant_name),
            ]
        )
    return {
        "columns": TRANSACTION_COLUMNS,
        "rows": rows,
    }


def verify_transactions(path: Path, frame: pd.DataFrame) -> bool:
    """Re-read transactions.json and check row ids and column sums against the source frame."""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    rows = payload.get("rows", [])
    if len(rows) != len(frame):
        return False
    ids = [str(row[0]) for row in rows]
    if ids != frame["row_id"].tolist():
        return False
    amount_sum = sum(int(row[3]) for row in rows)
    balance_sum = sum(int(row[4]) for row in rows)
    return amount_sum == int(frame["amount_cents"].sum()) and balance_sum == int(
        frame["balance_cents"].sum()
    )


def collect_provenances(world: dict[str, Any]) -> list[dict[str, object]]:
    """Gather every Provenance object from a parsed world.json payload."""
    provenances: list[dict[str, object]] = []
    for key in ("categories", "subscriptions", "splurges", "income_events"):
        provenances.extend(entity["provenance"] for entity in world.get(key, []))
    provenances.extend(point["provenance"] for point in world.get("monthly_balance_series", []))
    debt_horizon = world.get("debt_horizon")
    if isinstance(debt_horizon, dict):
        provenances.append(debt_horizon["provenance"])
    return provenances


def run(input_path: Path, out_dir: Path) -> int:
    """Execute the full build and verification, returning a process exit code."""
    frame, value_maps = load_frame(input_path)
    source_label = rel_to_root(input_path)
    source_checksum = sha256_file(input_path)
    used_ids: set[str] = set()

    start_date = frame["date"].min()
    end_date = frame["date"].max()
    months_covered = max((end_date - start_date).days + 1, 1) / 30.44

    categories = build_categories(frame, months_covered, source_label, value_maps, used_ids)
    subscriptions = build_subscriptions(frame, source_label, value_maps, used_ids)
    splurges = build_splurges(frame, source_label, value_maps, used_ids)
    income_events = build_income_events(frame, source_label, value_maps, used_ids)
    balance_series = build_balance_series(frame, source_label, value_maps)
    debt_horizon = build_debt_horizon(balance_series, source_label, value_maps)

    world = {
        "meta": {
            "schemaVersion": 1,
            "generatedBy": "scripts/build_world.py",
            "source": source_label,
            "sourceSha256": source_checksum,
            "rowCount": int(len(frame)),
            "dateRange": {
                "start": start_date.date().isoformat(),
                "end": end_date.date().isoformat(),
            },
            "moneyUnit": "integer cents CAD",
            "checksumRecipe": (
                "sha256 hex of LF joined '{rowId}:{valueCents}' lines sorted ascending by "
                "rowId; valueCents is amountCents for transaction entities and balanceCents "
                "for balance series and debt horizon entities"
            ),
            "entityCounts": {
                "categories": len(categories),
                "subscriptions": len(subscriptions),
                "splurges": len(splurges),
                "income_events": len(income_events),
                "monthly_balance_series": len(balance_series),
            },
        },
        "categories": categories,
        "subscriptions": subscriptions,
        "splurges": splurges,
        "income_events": income_events,
        "monthly_balance_series": balance_series,
        "debt_horizon": debt_horizon,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    world_path = out_dir / "world.json"
    transactions_path = out_dir / "transactions.json"
    world_path.write_text(json.dumps(world, indent=2) + "\n", encoding="utf-8")
    transactions_path.write_text(
        json.dumps(transactions_payload(frame), separators=(",", ":")) + "\n", encoding="utf-8"
    )

    written_world = json.loads(world_path.read_text(encoding="utf-8"))
    provenances = collect_provenances(written_world)
    passed = sum(1 for provenance in provenances if verify_provenance(provenance, value_maps))
    total = len(provenances)
    transactions_ok = verify_transactions(transactions_path, frame)
    checksums_ok = passed == total and total > 0

    subscription_ids = ", ".join(entity["id"] for entity in subscriptions) or "none"
    splurge_ids = ", ".join(entity["id"] for entity in splurges) or "none"
    print("build_world summary")
    print(f"  source: {source_label} (sha256 {source_checksum[:16]}...)")
    print(
        f"  rows: {len(frame)} from {start_date.date().isoformat()} to "
        f"{end_date.date().isoformat()} ({months_covered:.1f} months)"
    )
    print(f"  categories: {len(categories)}")
    print(f"  subscriptions: {len(subscriptions)} ({subscription_ids})")
    print(f"  splurges: {len(splurges)} ({splurge_ids})")
    print(f"  income_events: {len(income_events)}")
    print(f"  monthly_balance_series: {len(balance_series)} points")
    print(
        f"  debt_horizon: {cents_to_dollars(debt_horizon['valueCents'])} CAD "
        f"(min month-end {cents_to_dollars(debt_horizon['minBalanceCents'])} minus "
        f"{cents_to_dollars(debt_horizon['bufferCents'])} buffer)"
    )
    print(f"  provenance checksums: {passed}/{total} {'PASS' if checksums_ok else 'FAIL'}")
    print(f"  transactions.json sanity: {'PASS' if transactions_ok else 'FAIL'}")
    print(
        f"  wrote {rel_to_root(world_path)} "
        f"({world_path.stat().st_size / 1024:.1f} kB)"
    )
    print(
        f"  wrote {rel_to_root(transactions_path)} "
        f"({transactions_path.stat().st_size / 1024:.1f} kB)"
    )
    print(f"checksum verification: {'PASS' if checksums_ok and transactions_ok else 'FAIL'}")
    return 0 if checksums_ok and transactions_ok else 1


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
    parser = argparse.ArgumentParser(description="Build world.json and transactions.json")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="source transactions CSV")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR, help="output directory")
    args = parser.parse_args(argv)
    return run(contained(args.input, "--input"), contained(args.out_dir, "--out-dir"))


if __name__ == "__main__":
    raise SystemExit(main())
