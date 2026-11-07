"""Generate a seeded synthetic Tangerine style ledger for one full year.

Writes data/mock/tangerine_transactions.csv with 5000 to 15000 rows covering
START_DATE to END_DATE, then feeds scripts/build_world.py. Run from the
repository root:

    uv run python -m scripts.generate_mock_ledger [--seed 20261107]

The default seed is logged on stdout and inside the CSV header comment so
every downstream artifact can name its dataset version.

WHAT THE PERSONA LOOKS LIKE
A tap happy Canadian campus spender and salaried professional: weekday
commute taps, weekend late night dining, daily small grocery and retail
buys, monthly salary, six streaming style subscriptions, three utility
bills, a handful of trips, and a holiday deficit season from mid November
through December when row rates and amounts surge.

Realism rules enforced by construction:

* Dining runs late at night (22:00 to 01:00) mostly on weekends, transit
  peaks at commute hours on weekdays, groceries and retail land daytime,
  subscription charges post between 01:00 and 04:00, utility bills between
  04:00 and 06:00, salary posts on the 25th at 06:00.
* Recurring charges add 28 to 31 days per cycle, which always falls inside
  the 25 to 35 day subscription detection window of build_world.py.
* Category amount ranges are tight enough that only the forced splurge rows
  exceed 3 times their category median (see build_world.py DERIVATION RULES).
"""

from __future__ import annotations

import argparse
import csv
import sys
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Mapping, NamedTuple, Sequence

import numpy as np

from scripts.pipeline_lib import REPO_ROOT, rel_to_root

DEFAULT_SEED: int = 20261107
DEFAULT_OUT: Path = REPO_ROOT / "data" / "mock" / "tangerine_transactions.csv"

START_DATE: date = date(2025, 11, 1)
END_DATE: date = date(2026, 10, 31)
START_BALANCE_CENTS: int = 360_000

SURGE_START: date = date(2025, 11, 15)
SURGE_END: date = date(2025, 12, 31)
SURGE_RATE_FACTOR: float = 1.35
SURGE_AMOUNT_FACTOR: float = 1.10

MIN_ROWS: int = 5000
MAX_ROWS: int = 15000

CATEGORY_INCOME: str = "Income"
MERCHANT_PAYROLL: str = "Payroll: Sheridan College"
MERCHANT_REFUND: str = "CRA Tax Refund"


class Row(NamedTuple):
    """One ledger row before balances are applied."""

    day: date
    hour: int
    minute: int
    merchant: str
    category: str
    amount_cents: int


class BalancedRow(NamedTuple):
    """One ledger row with the running balance after the transaction."""

    day: date
    hour: int
    minute: int
    merchant: str
    category: str
    amount_cents: int
    balance_cents: int


@dataclass(frozen=True)
class FlowSpec:
    """Poisson flow of spontaneous transactions for one category."""

    category: str
    weekday_lam: float
    weekend_lam: float
    amount_low: float
    amount_mode: float
    amount_high: float
    merchants: tuple[str, ...]
    weekday_hours: Mapping[int, float]
    weekend_hours: Mapping[int, float]


class Charge(NamedTuple):
    """One scheduled recurring charge (subscription or utility bill)."""

    merchant: str
    category: str
    first_date: date
    low_cents: int
    mode_cents: int
    high_cents: int
    raise_date: date | None = None
    raised_cents: int | None = None


DINING_HOURS_WEEKDAY: Mapping[int, float] = {
    7: 3, 8: 3, 9: 2, 11: 3, 12: 4, 13: 3, 15: 2, 16: 2,
    17: 3, 18: 4, 19: 4, 20: 3, 21: 2,
}
DINING_HOURS_WEEKEND: Mapping[int, float] = {
    9: 2, 10: 3, 11: 3, 12: 3, 13: 3, 14: 2, 15: 2, 16: 2,
    17: 3, 18: 4, 19: 4, 20: 4, 21: 4, 22: 3, 23: 3, 0: 2, 1: 1,
}
TRANSIT_HOURS_WEEKDAY: Mapping[int, float] = {
    6: 3, 7: 4, 8: 4, 9: 2, 12: 1, 16: 2, 17: 4, 18: 4, 19: 3, 20: 2, 21: 1,
}
TRANSIT_HOURS_WEEKEND: Mapping[int, float] = {
    10: 2, 11: 2, 12: 2, 13: 2, 14: 2, 15: 2, 16: 2, 17: 2,
    18: 2, 19: 2, 20: 2, 21: 1, 22: 1,
}
DAYTIME_HOURS: Mapping[int, float] = {
    9: 1, 10: 2, 11: 2, 12: 2, 13: 2, 14: 2, 15: 2, 16: 3,
    17: 4, 18: 4, 19: 3, 20: 2,
}
RETAIL_HOURS: Mapping[int, float] = {
    10: 2, 11: 2, 12: 3, 13: 3, 14: 2, 15: 2, 16: 2, 17: 3,
    18: 3, 19: 3, 20: 2, 21: 1,
}
TRAVEL_HOURS: Mapping[int, float] = {hour: 1 for hour in range(8, 22)}

FLOWS: tuple[FlowSpec, ...] = (
    FlowSpec(
        category="Dining",
        weekday_lam=6.2,
        weekend_lam=8.2,
        amount_low=4.0,
        amount_mode=8.0,
        amount_high=20.0,
        merchants=(
            "Tim Hortons", "Starbucks", "Subway", "Pizza Pizza",
            "Wendy's", "Chatime", "Mucho Burrito", "Fresh on Front",
        ),
        weekday_hours=DINING_HOURS_WEEKDAY,
        weekend_hours=DINING_HOURS_WEEKEND,
    ),
    FlowSpec(
        category="Transit",
        weekday_lam=4.6,
        weekend_lam=2.1,
        amount_low=3.25,
        amount_mode=5.0,
        amount_high=15.0,
        merchants=("Presto", "Uber", "TTC", "GO Transit"),
        weekday_hours=TRANSIT_HOURS_WEEKDAY,
        weekend_hours=TRANSIT_HOURS_WEEKEND,
    ),
    FlowSpec(
        category="Groceries",
        weekday_lam=1.2,
        weekend_lam=1.7,
        amount_low=12.0,
        amount_mode=28.0,
        amount_high=60.0,
        merchants=("No Frills", "Loblaws", "Sobeys", "FreshCo", "Food Basics", "Walmart"),
        weekday_hours=DAYTIME_HOURS,
        weekend_hours=DAYTIME_HOURS,
    ),
    FlowSpec(
        category="Retail",
        weekday_lam=2.7,
        weekend_lam=3.1,
        amount_low=5.0,
        amount_mode=12.0,
        amount_high=33.0,
        merchants=(
            "Amazon", "Canadian Tire", "Winners", "Shoppers Drug Mart",
            "Dollarama", "Best Buy", "Indigo", "Sport Chek",
        ),
        weekday_hours=RETAIL_HOURS,
        weekend_hours=RETAIL_HOURS,
    ),
    FlowSpec(
        category="Travel",
        weekday_lam=0.0197,
        weekend_lam=0.0197,
        amount_low=90.0,
        amount_mode=200.0,
        amount_high=560.0,
        merchants=("Air Canada", "WestJet", "Airbnb", "Expedia", "VIA Rail"),
        weekday_hours=TRAVEL_HOURS,
        weekend_hours=TRAVEL_HOURS,
    ),
)

SUBSCRIPTIONS: tuple[Charge, ...] = (
    Charge("Netflix", "Subscriptions", date(2025, 11, 8), 1999, 1999, 1999,
           date(2026, 5, 1), 2199),
    Charge("Spotify", "Subscriptions", date(2025, 11, 12), 1299, 1299, 1299),
    Charge("Disney+", "Subscriptions", date(2025, 11, 15), 1199, 1199, 1199),
    Charge("Amazon Prime", "Subscriptions", date(2025, 11, 20), 999, 999, 999),
    Charge("Microsoft 365", "Subscriptions", date(2025, 11, 22), 1250, 1250, 1250),
    Charge("Fit4Less", "Subscriptions", date(2025, 11, 24), 1000, 1000, 1000),
)

UTILITIES: tuple[Charge, ...] = (
    Charge("Hydro One", "Utilities", date(2025, 11, 5), 9500, 11500, 14000),
    Charge("Rogers", "Utilities", date(2025, 11, 9), 7999, 7999, 7999),
    Charge("Koodo", "Utilities", date(2025, 11, 14), 5800, 6500, 7200),
)

# date, hour, minute, merchant, category, amount in cents (debit, positive magnitude)
FORCED_ROWS: tuple[tuple[date, int, int, str, str, int], ...] = (
    (date(2025, 11, 20), 13, 22, "Best Buy", "Retail", 42_000),
    (date(2025, 12, 3), 15, 41, "Indigo", "Retail", 89_000),
    (date(2025, 12, 22), 9, 8, "Air Canada", "Travel", 145_000),
    (date(2026, 3, 14), 20, 15, "The Keg", "Dining", 7_500),
    (date(2026, 8, 6), 10, 30, "Airbnb", "Travel", 110_000),
)


def hour_probabilities(hours: Mapping[int, float]) -> np.ndarray:
    """Expand an hour to weight mapping into a normalized 24 bin probability vector."""
    weights = np.zeros(24, dtype=float)
    for hour, weight in hours.items():
        weights[int(hour)] = float(weight)
    total = weights.sum()
    if total <= 0:
        raise ValueError("hour weights must sum to a positive number")
    return weights / total


HOUR_PROBS: dict[tuple[str, bool], np.ndarray] = {
    (flow.category, weekend): hour_probabilities(flow.weekend_hours if weekend else flow.weekday_hours)
    for flow in FLOWS
    for weekend in (False, True)
}


def sample_cents(rng: np.random.Generator, low: int, mode: int, high: int) -> int:
    """Sample an integer cent amount from a triangular distribution (flat when low equals high)."""
    if low == high:
        return low
    return int(round(float(rng.triangular(low, mode, high))))


def is_surge(day: date) -> bool:
    """True inside the November to December holiday deficit season."""
    return SURGE_START <= day <= SURGE_END


def build_rows(rng: np.random.Generator) -> list[Row]:
    """Generate every ledger row in construction order (deterministic for a given seed)."""
    rows: list[Row] = []
    total_days = (END_DATE - START_DATE).days
    for offset in range(total_days + 1):
        day = START_DATE + timedelta(days=offset)
        weekend = day.weekday() >= 5
        surge = is_surge(day)
        rate_factor = SURGE_RATE_FACTOR if surge else 1.0
        amount_factor = SURGE_AMOUNT_FACTOR if surge else 1.0
        for flow in FLOWS:
            lam = (flow.weekend_lam if weekend else flow.weekday_lam) * rate_factor
            count = int(rng.poisson(lam))
            if count == 0:
                continue
            probs = HOUR_PROBS[(flow.category, weekend)]
            for _ in range(count):
                dollars = float(rng.triangular(flow.amount_low, flow.amount_mode, flow.amount_high))
                amount_cents = -int(round(dollars * amount_factor * 100.0))
                rows.append(
                    Row(
                        day=day,
                        hour=int(rng.choice(24, p=probs)),
                        minute=int(rng.integers(0, 60)),
                        merchant=str(rng.choice(flow.merchants)),
                        category=flow.category,
                        amount_cents=amount_cents,
                    )
                )

    for spec in SUBSCRIPTIONS + UTILITIES:
        charge_day = spec.first_date
        while charge_day <= END_DATE:
            if spec.raise_date is not None and charge_day >= spec.raise_date:
                amount_cents = int(spec.raised_cents or spec.low_cents)
            else:
                amount_cents = sample_cents(rng, spec.low_cents, spec.mode_cents, spec.high_cents)
            if spec.category == "Subscriptions":
                hour = int(rng.integers(1, 5))
            else:
                hour = int(rng.integers(4, 7))
            rows.append(
                Row(
                    day=charge_day,
                    hour=hour,
                    minute=int(rng.integers(0, 60)),
                    merchant=spec.merchant,
                    category=spec.category,
                    amount_cents=-amount_cents,
                )
            )
            charge_day = charge_day + timedelta(days=int(rng.integers(28, 32)))

    cursor = START_DATE
    while cursor <= END_DATE:
        salary_day = date(cursor.year, cursor.month, 25)
        salary_cents = int(round(float(rng.triangular(7350.0, 7600.0, 8150.0)) * 100.0))
        rows.append(
            Row(
                day=salary_day,
                hour=6,
                minute=int(rng.integers(0, 60)),
                merchant=MERCHANT_PAYROLL,
                category=CATEGORY_INCOME,
                amount_cents=salary_cents,
            )
        )
        cursor = date(cursor.year + (cursor.month == 12), cursor.month % 12 + 1, 1)

    rows.append(
        Row(
            day=date(2026, 4, 15),
            hour=10,
            minute=12,
            merchant=MERCHANT_REFUND,
            category=CATEGORY_INCOME,
            amount_cents=240_000,
        )
    )

    for day, hour, minute, merchant, category, magnitude in FORCED_ROWS:
        rows.append(Row(day=day, hour=hour, minute=minute,
                        merchant=merchant, category=category, amount_cents=-magnitude))

    rows.sort(key=lambda row: (row.day, row.hour, row.minute))
    return rows


def apply_balances(rows: Sequence[Row], start_balance_cents: int) -> list[BalancedRow]:
    """Attach the running balance after each transaction, in canonical row order."""
    balanced: list[BalancedRow] = []
    balance = start_balance_cents
    for row in rows:
        balance += row.amount_cents
        balanced.append(BalancedRow(*row, balance_cents=balance))
    return balanced


def write_ledger(path: Path, balanced: Sequence[BalancedRow], seed: int) -> None:
    """Write the CSV with a synthetic data header comment and Tangerine style columns."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        handle.write(
            f"# SYNTHETIC DATA: generated by scripts/generate_mock_ledger.py "
            f"(seed={seed}, {START_DATE.isoformat()} to {END_DATE.isoformat()}, "
            f"rows={len(balanced)}). Tangerine style test ledger, not real bank data.\n"
        )
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(
            [
                "transaction_id",
                "date",
                "hour",
                "minute",
                "amount",
                "merchant_category",
                "merchant_name",
                "account_balance",
                "transaction_type",
            ]
        )
        for index, row in enumerate(balanced, start=1):
            writer.writerow(
                [
                    f"TAN-{index:06d}",
                    row.day.isoformat(),
                    row.hour,
                    row.minute,
                    f"{row.amount_cents / 100.0:.2f}",
                    row.category,
                    row.merchant,
                    f"{row.balance_cents / 100.0:.2f}",
                    "credit" if row.amount_cents > 0 else "debit",
                ]
            )


def month_end_minima(balanced: Sequence[BalancedRow]) -> list[tuple[str, int]]:
    """Return the final balance of each calendar month as (YYYY-MM, cents)."""
    minima: dict[str, int] = {}
    for row in balanced:
        minima[row.day.strftime("%Y-%m")] = row.balance_cents
    return sorted(minima.items())


def main(argv: Sequence[str] | None = None) -> int:
    """Parse CLI arguments, generate the ledger, and print the seed log."""
    parser = argparse.ArgumentParser(description="Generate the synthetic Tangerine style ledger")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="numpy random seed")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output CSV path")
    args = parser.parse_args(argv)

    rng = np.random.default_rng(args.seed)
    rows = build_rows(rng)
    if not MIN_ROWS <= len(rows) <= MAX_ROWS:
        print(
            f"error: row count {len(rows)} outside required range {MIN_ROWS} to {MAX_ROWS}",
            file=sys.stderr,
        )
        return 1
    balanced = apply_balances(rows, START_BALANCE_CENTS)
    write_ledger(args.out, balanced, args.seed)

    category_counts: dict[str, int] = {}
    for row in balanced:
        category_counts[row.category] = category_counts.get(row.category, 0) + 1
    credits = sum(1 for row in balanced if row.amount_cents > 0)
    balances = [row.balance_cents for row in balanced]
    monthly = month_end_minima(balanced)

    print("generate_mock_ledger summary")
    print(f"  seed={args.seed} (logged in the CSV header comment)")
    print(f"  rows: {len(balanced)} (required {MIN_ROWS} to {MAX_ROWS})")
    print(f"  range: {START_DATE.isoformat()} to {END_DATE.isoformat()}")
    counts = ", ".join(f"{name} {count}" for name, count in sorted(category_counts.items()))
    print(f"  rows by category: {counts}")
    print(f"  credits: {credits}, debits: {len(balanced) - credits}")
    print(
        f"  balance: start {START_BALANCE_CENTS / 100:,.2f}, "
        f"min {min(balances) / 100:,.2f}, "
        f"min month-end {min(value for _, value in monthly) / 100:,.2f}, "
        f"end {balances[-1] / 100:,.2f}"
    )
    print(f"  wrote {rel_to_root(args.out)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
