"""Pure judge metrics over integer cent row sequences.

Every function in this module is pure: no pandas, no numpy, no file IO.
All money values are integer CAD cents and rounding happens once at the
metric boundary with ROUND_HALF_UP (ties away from zero).

Judge definitions from docs/tangerine-challenge.md:

* I = median of money_in over all monthly rows
* F = median over months of the per month row sum household_bills +
  insurance + loan_payments (per row sums first, never a sum of medians)
* S = median of money_out over all monthly rows
* B = mean of avg_daily_balance over the last min(6, n) rows sorted by
  month, rounded half up; fewer than 6 rows uses every available row
* H = median of household_bills over all monthly rows
* P = monthly_payment from loans.csv when status is C or D (running at
  the end of 2025), otherwise 0; P comes from the loan record in build.py
* gap = S minus I

Run from the repository root:

    uv run python -m scripts.engine.build
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

# Rule versions recorded in the artifact meta.
METRIC_RULE_VERSION: str = "judge-metrics-v1"

# The buffer window is the last 6 rows by month (the judge rule for B).
BUFFER_WINDOW_ROWS: int = 6

# The thin_history flag threshold: fewer than 18 monthly rows, a quarter
# of the 72 month dataset span (2020-01 to 2025-12). Every real account
# has at least 12 rows, so a 6 row threshold would never fire; 18 fires
# on the genuinely short histories (rationale recorded in the Phase E1
# decision record, docs/decisions.md). The flag is separate from
# BUFFER_WINDOW_ROWS, which only decides how many rows B averages.
THIN_HISTORY_ROWS: int = 18

# The single swappable rule deciding which loan statuses count as running
# at the end of 2025 (user confirmed decision, docs/decisions.md E1).
RUNNING_STATUS_RULE: frozenset[str] = frozenset({"C", "D"})
DEFAULTED_STATUS: str = "D"
END_OF_2025_MONTH: str = "2025-12"


@dataclass(frozen=True)
class RowCents:
    """One monthly_summary row with every money value in integer cents."""

    month: str
    money_in: int
    money_out: int
    household_bills: int
    insurance: int
    loan_payments: int
    pension_in: int
    avg_daily_balance: int


@dataclass(frozen=True)
class Metrics:
    """The six judge numbers plus the F decomposition and the gap."""

    income_cents: int
    fixed_costs_cents: int
    spending_cents: int
    buffer_cents: int
    household_bills_cents: int
    insurance_cents: int
    loan_payments_median_cents: int
    pension_in_cents: int
    gap_cents: int


def round_half_up(numerator: int, denominator: int) -> int:
    """Divide with ROUND_HALF_UP: ties away from zero (decimal semantics).

    The positive case is (numerator + denominator // 2) // denominator;
    the sign split makes negative operands round away from zero on ties
    as well, which matches Python's decimal ROUND_HALF_UP.
    """
    if denominator <= 0:
        raise ValueError(f"denominator must be positive, got {denominator}")
    sign = 1 if numerator >= 0 else -1
    magnitude = (abs(numerator) + denominator // 2) // denominator
    return sign * magnitude


def median_cents(values: Sequence[int]) -> int:
    """Median of integer cents: middle value, or half up mean of two middles."""
    if not values:
        raise ValueError("median_cents requires at least one value")
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[middle]
    return round_half_up(ordered[middle - 1] + ordered[middle], 2)


def mean_cents(values: Sequence[int]) -> int:
    """Mean of integer cents rounded half up (ties away from zero)."""
    if not values:
        raise ValueError("mean_cents requires at least one value")
    return round_half_up(sum(values), len(values))


def profile_metrics(rows: Sequence[RowCents]) -> Metrics:
    """Compute I, F, S, B, H plus the F decomposition for one account.

    rows are the account's monthly rows; they are re sorted by month
    ascending inside so the last 6 row buffer window is exact no matter
    what order the caller passes.
    """
    if not rows:
        raise ValueError("profile_metrics requires at least one row")
    ordered = sorted(rows, key=lambda row: row.month)

    income = median_cents([row.money_in for row in ordered])
    spending = median_cents([row.money_out for row in ordered])
    fixed = median_cents(
        [
            row.household_bills + row.insurance + row.loan_payments
            for row in ordered
        ]
    )
    household = median_cents([row.household_bills for row in ordered])
    insurance = median_cents([row.insurance for row in ordered])
    loan_payments = median_cents([row.loan_payments for row in ordered])
    pension_total = sum(row.pension_in for row in ordered)
    window = ordered[-min(BUFFER_WINDOW_ROWS, len(ordered)):]
    buffer_cents = mean_cents([row.avg_daily_balance for row in window])
    gap = spending - income

    return Metrics(
        income_cents=income,
        fixed_costs_cents=fixed,
        spending_cents=spending,
        buffer_cents=buffer_cents,
        household_bills_cents=household,
        insurance_cents=insurance,
        loan_payments_median_cents=loan_payments,
        pension_in_cents=pension_total,
        gap_cents=gap,
    )


def derive_flags(
    metric: Metrics, row_count: int, loan_status: str | None
) -> dict[str, bool]:
    """Derive the five edge flags from metrics, history, and loan status.

    * pensioner: pension money in summed over all rows is above zero
    * thin_history: fewer than 18 monthly rows (a quarter of the 72
      month dataset span; the B window itself still averages min(6, n)
      rows regardless of this flag)
    * zero_income: median income I is exactly zero
    * defaulted_loan: the account has a loan with status D
    * negative_buffer: buffer B is below zero
    """
    return {
        "pensioner": metric.pension_in_cents > 0,
        "thin_history": row_count < THIN_HISTORY_ROWS,
        "zero_income": metric.income_cents == 0,
        "defaulted_loan": loan_status is not None and loan_status == DEFAULTED_STATUS,
        "negative_buffer": metric.buffer_cents < 0,
    }


def loan_payment_cents(monthly_payment_cents: int, status: str) -> int:
    """P: the loan payment when the loan runs at the end of 2025, else 0."""
    if status in RUNNING_STATUS_RULE:
        return monthly_payment_cents
    return 0
