"""Checksum verified CSV loading with integer cent parsing.

Responsibilities for the E1 profile precompute:

* verify monthly_summary.csv, loans.csv, and accounts.csv against
  data/tangerine/SHA256SUMS before any row is read (ChecksumError lists
  every mismatch in one loud message);
* read money columns with np.rint(series * 100).astype(np.int64) so no
  downstream math ever sees a float dollar;
* group monthly_summary rows per account as pure metrics.RowCents
  sequences sorted by month ascending;
* parse loans into LoanCents, including the scheduled end month derived
  from loan_start plus duration_months for the status cross check;
* record source quality facts (row counts and sha256) for the build
  report and the artifact meta.

Run from the repository root for the standalone quality report:

    uv run python -m scripts.engine.load
"""

from __future__ import annotations

import argparse
import csv
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np
import pandas as pd

from scripts.engine.metrics import RowCents
from scripts.pipeline_lib import REPO_ROOT, rel_to_root, sha256_file

DATA_DIR: Path = REPO_ROOT / "data" / "tangerine"
SUMS_PATH: Path = DATA_DIR / "SHA256SUMS"

MONTHLY_PATH: Path = DATA_DIR / "monthly_summary.csv"
LOANS_PATH: Path = DATA_DIR / "loans.csv"
ACCOUNTS_PATH: Path = DATA_DIR / "accounts.csv"


class ChecksumError(RuntimeError):
    """A source file does not match data/tangerine/SHA256SUMS."""


class DataError(RuntimeError):
    """The loaded data violates an assumption the engine relies on."""


@dataclass(frozen=True)
class LoanCents:
    """One loans.csv row with money in integer cents and the schedule."""

    loan_id: int
    status: str
    defaulted: bool
    amount_cents: int
    duration_months: int
    monthly_payment_cents: int
    loan_start: str
    scheduled_end_month: str


@dataclass(frozen=True)
class SourceRecord:
    """Quality facts for one source file: path, sha256, and row count."""

    path: str
    sha256: str
    rows: int

    def as_dict(self) -> dict[str, object]:
        """The meta.sources entry for this file."""
        return {"path": self.path, "sha256": self.sha256, "rows": self.rows}


# Money columns converted to integer cents right after reading; every one
# of them must be null free, which int_cents enforces loudly.
MONTHLY_MONEY_COLUMNS: tuple[str, ...] = (
    "money_in",
    "money_out",
    "household_bills",
    "insurance",
    "loan_payments",
    "pension_in",
    "avg_daily_balance",
)
LOAN_MONEY_COLUMNS: tuple[str, ...] = ("amount", "monthly_payment")

SOURCE_PATHS: tuple[Path, ...] = (MONTHLY_PATH, LOANS_PATH, ACCOUNTS_PATH)


def verify_source_checksums(
    paths: Sequence[Path], sums_path: Path = SUMS_PATH
) -> None:
    """Check every given file against the SHA256SUMS manifest, else raise.

    The manifest stores repository relative paths; only the file name is
    resolved, which lets tests point the same function at a temp copy.
    Every mismatch and missing file is reported in one ChecksumError.
    """
    if not sums_path.is_file():
        raise ChecksumError(f"checksum manifest not found: {rel_to_root(sums_path)}")
    expected: dict[str, str] = {}
    for line_number, line in enumerate(
        sums_path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        stripped = line.strip()
        if not stripped:
            continue
        parts = stripped.split()
        if len(parts) != 2 or len(parts[0]) != 64:
            raise ChecksumError(
                f"{rel_to_root(sums_path)} line {line_number}: "
                "expected '<sha256>  <path>'"
            )
        digest, listed_path = parts
        expected[Path(listed_path).name] = digest.lower()
    if not expected:
        raise ChecksumError(f"{rel_to_root(sums_path)} lists no files")
    problems: list[str] = []
    for path in paths:
        name = path.name
        if name not in expected:
            problems.append(f"not listed in manifest: {rel_to_root(path)}")
            continue
        if not path.is_file():
            problems.append(f"missing source file: {rel_to_root(path)}")
            continue
        digest = sha256_file(path)
        if digest != expected[name]:
            problems.append(
                f"checksum mismatch: {name} expected {expected[name]} got {digest}"
            )
    if problems:
        raise ChecksumError("; ".join(problems))


def int_cents(series: pd.Series) -> pd.Series:
    """Dollar floats to integer cents with np.rint (the E1 load recipe)."""
    dollars = series.to_numpy(dtype="float64")
    return pd.Series(
        np.rint(dollars * 100.0).astype("int64"), index=series.index
    )


def count_csv_rows(path: Path) -> int:
    """Data row count of a CSV (header excluded), naively."""
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        next(reader, None)
        return sum(1 for _ in reader)


def source_records(paths: Sequence[Path]) -> list[SourceRecord]:
    """Path, sha256, and row count for each source file, in given order."""
    records: list[SourceRecord] = []
    for path in paths:
        records.append(
            SourceRecord(
                path=rel_to_root(path),
                sha256=sha256_file(path),
                rows=count_csv_rows(path),
            )
        )
    return records


def load_monthly_summary(path: Path) -> dict[str, list[RowCents]]:
    """Read monthly_summary into {account_id: rows} sorted by month.

    account_id keys are strings (the artifact's key type) and every money
    value is integer cents. Rows within an account are ordered by month
    ascending, which is the input contract of profile_metrics.
    """
    frame = pd.read_csv(path, dtype={"account_id": "int64", "month": "str"})
    missing = [
        column
        for column in ("account_id", "month", *MONTHLY_MONEY_COLUMNS)
        if column not in frame.columns
    ]
    if missing:
        raise DataError(
            f"{rel_to_root(path)} is missing columns: {', '.join(missing)}"
        )
    if frame[list(MONTHLY_MONEY_COLUMNS)].isna().any().any():
        raise DataError(
            f"{rel_to_root(path)}: money columns contain nulls, cannot "
            "convert to integer cents"
        )
    for column in MONTHLY_MONEY_COLUMNS:
        frame[column] = int_cents(frame[column])
    frame = frame.sort_values(["account_id", "month"], kind="stable")

    ids = frame["account_id"].tolist()
    months = frame["month"].tolist()
    columns = {column: frame[column].tolist() for column in MONTHLY_MONEY_COLUMNS}
    grouped: dict[str, list[RowCents]] = {}
    for position, account_id in enumerate(ids):
        grouped.setdefault(str(account_id), []).append(
            RowCents(
                month=months[position],
                money_in=columns["money_in"][position],
                money_out=columns["money_out"][position],
                household_bills=columns["household_bills"][position],
                insurance=columns["insurance"][position],
                loan_payments=columns["loan_payments"][position],
                pension_in=columns["pension_in"][position],
                avg_daily_balance=columns["avg_daily_balance"][position],
            )
        )
    return grouped


def scheduled_end_month(loan_start: str, duration_months: int) -> str:
    """Loan end month as YYYY-MM: loan_start month plus duration_months."""
    try:
        year = int(loan_start[:4])
        month = int(loan_start[5:7])
    except (ValueError, IndexError) as error:
        raise DataError(f"bad loan_start date: {loan_start!r}") from error
    month_index = year * 12 + (month - 1) + int(duration_months)
    end_year, end_month_zero = divmod(month_index, 12)
    return f"{end_year:04d}-{end_month_zero + 1:02d}"


def load_loans(path: Path) -> dict[str, LoanCents]:
    """Read loans into {account_id: LoanCents}, one loan per account."""
    frame = pd.read_csv(
        path,
        dtype={
            "loan_id": "int64",
            "account_id": "int64",
            "loan_start": "str",
            "amount": "float64",
            "duration_months": "int64",
            "monthly_payment": "float64",
            "status": "str",
            "defaulted": "int64",
        },
    )
    needed = (
        "loan_id",
        "account_id",
        "loan_start",
        "amount",
        "duration_months",
        "monthly_payment",
        "status",
        "defaulted",
    )
    missing = [column for column in needed if column not in frame.columns]
    if missing:
        raise DataError(
            f"{rel_to_root(path)} is missing columns: {', '.join(missing)}"
        )
    if frame[list(LOAN_MONEY_COLUMNS)].isna().any().any():
        raise DataError(
            f"{rel_to_root(path)}: money columns contain nulls, cannot "
            "convert to integer cents"
        )
    for column in LOAN_MONEY_COLUMNS:
        frame[column] = int_cents(frame[column])

    loans: dict[str, LoanCents] = {}
    for row in frame.itertuples(index=False):
        key = str(int(row.account_id))
        if key in loans:
            raise DataError(
                f"{rel_to_root(path)}: multiple loans for account {key}"
            )
        loans[key] = LoanCents(
            loan_id=int(row.loan_id),
            status=str(row.status),
            defaulted=bool(int(row.defaulted)),
            amount_cents=int(row.amount),
            duration_months=int(row.duration_months),
            monthly_payment_cents=int(row.monthly_payment),
            loan_start=str(row.loan_start),
            scheduled_end_month=scheduled_end_month(
                str(row.loan_start), int(row.duration_months)
            ),
        )
    return loans


def load_account_ids(path: Path) -> list[str]:
    """Account ids from accounts.csv sorted in numeric order."""
    frame = pd.read_csv(path, dtype={"account_id": "int64"})
    if "account_id" not in frame.columns:
        raise DataError(f"{rel_to_root(path)} is missing column: account_id")
    unique = sorted({int(value) for value in frame["account_id"]})
    return [str(value) for value in unique]


def quality_lines(records: Sequence[SourceRecord]) -> list[str]:
    """Human readable source quality lines for the build stdout report."""
    lines = ["  sources (sha256 verified against data/tangerine/SHA256SUMS):"]
    for record in records:
        lines.append(
            f"    {record.path}: {record.rows:,} rows, "
            f"sha256 {record.sha256[:12]}..."
        )
    return lines


def main(argv: Sequence[str] | None = None) -> int:
    """Print the checksum verdict and the source quality report."""
    parser = argparse.ArgumentParser(
        description="Verify Tangerine source checksums and print source quality"
    )
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--sums", type=Path, default=SUMS_PATH)
    args = parser.parse_args(argv)
    paths = (
        args.data_dir / "monthly_summary.csv",
        args.data_dir / "loans.csv",
        args.data_dir / "accounts.csv",
    )
    try:
        verify_source_checksums(paths, sums_path=args.sums)
        records = source_records(paths)
    except ChecksumError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    for line in quality_lines(records):
        print(line)
    print("scripts.engine.load: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
