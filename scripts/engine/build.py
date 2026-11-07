"""Build the deterministic engine profile artifact in one run.

Entry point:

    uv run python -m scripts.engine.build

Writes one artifact: public/data/engine/profiles.json, a compact
deterministic JSON document with a meta block and one profile per
account keyed by account_id string in numeric order. The document
carries the six judge metrics (I, F, S, B, H, P), the F decomposition,
the gap, the baseline runway, the history window, the loan record, the
five edge flags, the last 12 monthly balances, and a per account
provenance checksum. No timestamps: two consecutive builds are byte
identical.

The stdout report lists source quality (sha256 and row counts), edge
flag counts, the loan status versus schedule cross check, and the
artifact size.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

from scripts.engine import load, metrics, shocks
from scripts.pipeline_lib import REPO_ROOT, checksum, rel_to_root

ENGINE_DIR: Path = REPO_ROOT / "public" / "data" / "engine"
OUTPUT_NAME: str = "profiles.json"

SCHEMA_VERSION: int = 1
GENERATED_BY: str = "scripts.engine.build"
MONEY_UNIT: str = "integer CAD cents"
RUNWAY_UNIT: str = "tenths of a month"

# Last up to 12 monthly average daily balances travel with each profile.
BALANCE_SERIES_ROWS: int = 12

FLAG_NAMES: tuple[str, ...] = (
    "pensioner",
    "thin_history",
    "zero_income",
    "defaulted_loan",
    "negative_buffer",
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

CHECKSUM_RECIPE: str = (
    "row id = account_id:month sorted ascending; value = money_in_cents "
    "per row; SHA256 of LF joined id:value lines"
)

PROVENANCE_SOURCE: str = "data/tangerine/monthly_summary.csv"
PROVENANCE_AGG: str = (
    "judge metrics over all monthly rows (I, F, S, H medians; B mean over "
    "the last 6 rows; pension sum); checksum value = money_in_cents"
)


def _month_index(month: str) -> int:
    """Absolute month number for a YYYY-MM string (calendar order)."""
    return int(month[:4]) * 12 + int(month[5:7])


def _is_contiguous(months: Sequence[str]) -> bool:
    """True when the sorted unique months fill one unbroken span."""
    if len(set(months)) != len(months):
        return False
    span = _month_index(months[-1]) - _month_index(months[0])
    return span == len(months) - 1


def _loan_record(loan: load.LoanCents) -> dict[str, object]:
    """The profile loan object for an account that has a loan."""
    return {
        "loan_id": loan.loan_id,
        "status": loan.status,
        "defaulted": loan.defaulted,
        "amount_cents": loan.amount_cents,
        "duration_months": loan.duration_months,
        "monthly_payment_cents": loan.monthly_payment_cents,
        "loan_start": loan.loan_start,
        "scheduled_end_month": loan.scheduled_end_month,
    }


def _provenance(account_id: str, rows: Sequence[metrics.RowCents]) -> dict[str, str]:
    """Provenance block: row ids are account_id:month, value is money_in."""
    row_ids = [f"{account_id}:{row.month}" for row in rows]
    values = {
        f"{account_id}:{row.month}": row.money_in for row in rows
    }
    return {
        "source": PROVENANCE_SOURCE,
        "filter": f"account_id = {account_id} ordered by month ascending",
        "agg": PROVENANCE_AGG,
        "check_sum": checksum(row_ids, values),
    }


def _profile(
    account_id: str, rows: Sequence[metrics.RowCents], loan: load.LoanCents | None
) -> dict[str, object]:
    """Assemble one account profile from its rows and optional loan."""
    ordered = sorted(rows, key=lambda row: row.month)
    metric = metrics.profile_metrics(ordered)
    status = loan.status if loan is not None else None
    flags = metrics.derive_flags(metric, len(ordered), status)
    payment = (
        metrics.loan_payment_cents(loan.monthly_payment_cents, loan.status)
        if loan is not None
        else 0
    )
    baseline = shocks.runway(
        metric.buffer_cents, 0, metric.income_cents, metric.spending_cents
    )

    months = [row.month for row in ordered]
    contiguous = _is_contiguous(months)
    history: dict[str, object] = {
        "first_month": months[0],
        "last_month": months[-1],
        "row_count": len(ordered),
        "months_contiguous": contiguous,
    }
    if not contiguous:
        history["months"] = months

    tail = ordered[-min(BALANCE_SERIES_ROWS, len(ordered)):]
    balance_series = {
        "start_month": tail[0].month,
        "values_cents": [row.avg_daily_balance for row in tail],
    }

    return {
        "account_id": account_id,
        "income_cents": metric.income_cents,
        "fixed_costs_cents": metric.fixed_costs_cents,
        "spending_cents": metric.spending_cents,
        "buffer_cents": metric.buffer_cents,
        "household_bills_cents": metric.household_bills_cents,
        "loan_payment_cents": payment,
        "insurance_cents": metric.insurance_cents,
        "loan_payments_median_cents": metric.loan_payments_median_cents,
        "pension_in_cents": metric.pension_in_cents,
        "gap_cents": metric.gap_cents,
        "runway_state": baseline.state,
        "runway_deci_months": baseline.deci_months,
        "history": history,
        "loan": None if loan is None else _loan_record(loan),
        "flags": flags,
        "balance_series": balance_series,
        "provenance": _provenance(account_id, ordered),
    }


def build_profiles(
    accounts: dict[str, list[metrics.RowCents]], loans: dict[str, load.LoanCents]
) -> dict[str, object]:
    """Build the full profiles.json document: meta plus per account data.

    accounts keys are account_id strings with rows sorted by month
    ascending (load.load_monthly_summary guarantees both). Source quality
    facts are read from the three canonical CSVs for the meta block.
    """
    profiles: dict[str, object] = {}
    flag_counts = {name: 0 for name in FLAG_NAMES}
    global_start: str | None = None
    global_end: str | None = None

    for account_id in sorted(accounts, key=int):
        rows = accounts[account_id]
        profile = _profile(account_id, rows, loans.get(account_id))
        profiles[account_id] = profile
        flags = profile["flags"]
        for name in FLAG_NAMES:
            if flags[name]:  # type: ignore[index]
                flag_counts[name] += 1
        months = sorted(row.month for row in rows)
        first, last = months[0], months[-1]
        if global_start is None or first < global_start:
            global_start = first
        if global_end is None or last > global_end:
            global_end = last

    records = load.source_records(load.SOURCE_PATHS)
    meta: dict[str, object] = {
        "schema_version": SCHEMA_VERSION,
        "generated_by": GENERATED_BY,
        "sources": [record.as_dict() for record in records],
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


def loan_cross_check(loans: dict[str, load.LoanCents]) -> dict[str, int]:
    """Count loans where status rule and schedule rule disagree.

    Status rule: status C or D means running at the end of 2025.
    Schedule rule: loan_start plus duration_months lands after 2025-12
    (scheduled_end_month past 2025-12 means the loan crosses 2025-12-31).
    """
    by_status = 0
    by_schedule = 0
    disagreements = 0
    for loan in loans.values():
        status_running = loan.status in metrics.RUNNING_STATUS_RULE
        schedule_running = loan.scheduled_end_month > metrics.END_OF_2025_MONTH
        if status_running:
            by_status += 1
        if schedule_running:
            by_schedule += 1
        if status_running != schedule_running:
            disagreements += 1
    return {
        "by_status": by_status,
        "by_schedule": by_schedule,
        "disagreements": disagreements,
    }


def write_json(path: Path, document: dict[str, object]) -> int:
    """Write the artifact as compact deterministic JSON, return byte size."""
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(document, separators=(",", ":"))
    path.write_text(text + "\n", encoding="utf-8")
    return path.stat().st_size


def report_lines(
    records: Sequence[load.SourceRecord],
    document: dict[str, object],
    cross: dict[str, int],
    row_count_range: tuple[int, int],
    out_path: Path,
    size: int,
) -> list[str]:
    """Human readable build report: sources, flags, cross check, size."""
    meta = document["meta"]
    profiles = document["profiles"]
    lines = ["engine build report"]
    lines.extend(load.quality_lines(records))
    lines.append(
        f"  profiles: {meta['account_count']:,} accounts, months "
        f"{meta['date_range']['start']} to {meta['date_range']['end']} "
        f"({rel_to_root(out_path)}, {size / 1024:.1f} kB)"
    )
    lines.append(
        f"  history: row counts {row_count_range[0]} to "
        f"{row_count_range[1]} monthly rows per account"
    )
    counts = meta["edge_flag_counts"]
    lines.append(
        "  edge flags: "
        + ", ".join(f"{name} {counts[name]}" for name in FLAG_NAMES)
    )
    lines.append(
        "  edge flag evidence: "
        + ", ".join(
            f"{name} {'yes' if counts[name] else 'no'}" for name in FLAG_NAMES
        )
        + " (a flag with 0 accounts never fires in this data)"
    )
    lines.append(
        f"  loan cross-check: status C or D running {cross['by_status']}, "
        f"schedule past {metrics.END_OF_2025_MONTH} running "
        f"{cross['by_schedule']}, disagreements {cross['disagreements']}"
    )
    lines.append(f"  profiles total: {len(profiles):,} account records")
    return lines


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry: verify sources, build the document, write, report."""
    parser = argparse.ArgumentParser(
        description="Build public/data/engine/profiles.json"
    )
    parser.add_argument(
        "--out-dir", type=Path, default=ENGINE_DIR, help="artifact directory"
    )
    args = parser.parse_args(argv)

    try:
        load.verify_source_checksums(load.SOURCE_PATHS, sums_path=load.SUMS_PATH)
        accounts = load.load_monthly_summary(load.MONTHLY_PATH)
        loans = load.load_loans(load.LOANS_PATH)
        account_ids = load.load_account_ids(load.ACCOUNTS_PATH)
        known = set(account_ids)
        missing = [account_id for account_id in account_ids if account_id not in accounts]
        extra = [account_id for account_id in accounts if account_id not in known]
        if missing or extra:
            raise load.DataError(
                "accounts.csv and monthly_summary.csv disagree on the account "
                f"set: missing rows for {missing[:5]}, unknown accounts {extra[:5]}"
            )
        document = build_profiles(accounts, loans)
        cross = loan_cross_check(loans)
        records = load.source_records(load.SOURCE_PATHS)
        row_counts = [len(rows) for rows in accounts.values()]
        row_count_range = (min(row_counts), max(row_counts))
    except (load.ChecksumError, load.DataError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    out_path = args.out_dir / OUTPUT_NAME
    size = write_json(out_path, document)

    for line in report_lines(
        records, document, cross, row_count_range, out_path, size
    ):
        print(line)
    print("scripts.engine.build: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
