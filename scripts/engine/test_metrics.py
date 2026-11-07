"""Pytest suite for the pure E1 metric and runway functions.

Covers the rounding contract (ROUND_HALF_UP ties away from zero), every
runway branch (buffer_left <= 0, gap <= 0, finite with and without the
1200 cap, deci half tie), the thin history buffer rule, the F
decomposition (median of per row sums, never a sum of medians), and the
five edge flag derivations including their exact thresholds.

Run from the repository root:

    uv run pytest scripts/engine/test_metrics.py
"""

from __future__ import annotations

import pytest

from scripts.engine import metrics, shocks


def make_row(
    month: str,
    money_in: int = 0,
    money_out: int = 0,
    household_bills: int = 0,
    insurance: int = 0,
    loan_payments: int = 0,
    pension_in: int = 0,
    avg_daily_balance: int = 0,
) -> metrics.RowCents:
    """One RowCents with defaults for the columns a test does not care about."""
    return metrics.RowCents(
        month=month,
        money_in=money_in,
        money_out=money_out,
        household_bills=household_bills,
        insurance=insurance,
        loan_payments=loan_payments,
        pension_in=pension_in,
        avg_daily_balance=avg_daily_balance,
    )


def make_metrics(**overrides: int) -> metrics.Metrics:
    """A Metrics instance with every field zero unless overridden."""
    fields: dict[str, int] = {
        "income_cents": 0,
        "fixed_costs_cents": 0,
        "spending_cents": 0,
        "buffer_cents": 0,
        "household_bills_cents": 0,
        "insurance_cents": 0,
        "loan_payments_median_cents": 0,
        "pension_in_cents": 0,
        "gap_cents": 0,
    }
    fields.update(overrides)
    return metrics.Metrics(**fields)


# Rounding: ROUND_HALF_UP means ties away from zero.

def test_round_half_up_positive_ties_away_from_zero() -> None:
    """Exact halves round away from zero on both signs."""
    assert metrics.round_half_up(5, 2) == 3
    assert metrics.round_half_up(4, 2) == 2
    assert metrics.round_half_up(-5, 2) == -3
    assert metrics.round_half_up(-4, 2) == -2
    assert metrics.round_half_up(1, 3) == 0
    assert metrics.round_half_up(2, 3) == 1


def test_round_half_up_rejects_non_positive_denominator() -> None:
    """A zero or negative denominator is a programming error, not a value."""
    with pytest.raises(ValueError):
        metrics.round_half_up(1, 0)
    with pytest.raises(ValueError):
        metrics.round_half_up(1, -2)


def test_median_odd_count_returns_middle_value() -> None:
    """Odd counts pick the exact middle after sorting."""
    assert metrics.median_cents([30, 10, 20]) == 20
    assert metrics.median_cents([7]) == 7


def test_median_even_count_ties_round_half_up() -> None:
    """An even count averages the two middles, half up on the tie."""
    assert metrics.median_cents([10, 20]) == 15
    assert metrics.median_cents([10, 21]) == 16
    assert metrics.median_cents([-10, -20]) == -15
    assert metrics.median_cents([-10, -21]) == -16


def test_median_rejects_empty_input() -> None:
    """An empty sequence has no median."""
    with pytest.raises(ValueError):
        metrics.median_cents([])


def test_mean_cents_rounds_half_up() -> None:
    """Means divide the sum, half up on the exact half."""
    assert metrics.mean_cents([1, 2]) == 2
    assert metrics.mean_cents([1, 2, 3]) == 2
    assert metrics.mean_cents([-1, -2]) == -2
    assert metrics.mean_cents([100, 100, 101]) == 100
    with pytest.raises(ValueError):
        metrics.mean_cents([])


# Judge metric definitions over row sequences.

def test_profile_metrics_uses_all_row_medians() -> None:
    """I, S, H and the F decomposition medians over every row."""
    rows = [
        make_row("2025-01", money_in=100, money_out=500,
                 household_bills=200, insurance=50, loan_payments=30),
        make_row("2025-02", money_in=300, money_out=100,
                 household_bills=10, insurance=0, loan_payments=0),
        make_row("2025-03", money_in=200, money_out=300,
                 household_bills=0, insurance=0, loan_payments=6),
    ]
    result = metrics.profile_metrics(rows)
    assert result.income_cents == 200
    assert result.spending_cents == 300
    assert result.household_bills_cents == 10
    assert result.insurance_cents == 0
    assert result.loan_payments_median_cents == 6
    # F is the median of per row sums (280, 10, 6), not the sum of medians.
    assert result.fixed_costs_cents == 10
    assert result.gap_cents == 100


def test_profile_metrics_f_is_median_of_row_sums_not_sum_of_medians() -> None:
    """The per row sum happens before the median, per the judge rule."""
    rows = [
        make_row("2025-01", household_bills=10),
        make_row("2025-02", insurance=5),
        make_row("2025-03", loan_payments=6),
    ]
    result = metrics.profile_metrics(rows)
    # Row sums are 10, 5, 6 so the median is 6; the sum of the column
    # medians would be 0 + 0 + 0 = 0 and is wrong by construction.
    assert result.fixed_costs_cents == 6


def test_profile_metrics_buffer_uses_every_row_when_history_is_thin() -> None:
    """Fewer than 6 rows: B is the mean over all available rows."""
    rows = [
        make_row("2025-01", avg_daily_balance=100),
        make_row("2025-02", avg_daily_balance=101),
        make_row("2025-03", avg_daily_balance=102),
    ]
    result = metrics.profile_metrics(rows)
    assert result.buffer_cents == 101


def test_profile_metrics_buffer_uses_last_six_rows() -> None:
    """Six or more rows: B averages the last 6 by month, half up."""
    rows = [make_row("2025-01", avg_daily_balance=0)]
    rows.extend(
        make_row(f"2025-{month:02d}", avg_daily_balance=1_000_000)
        for month in range(2, 8)
    )
    result = metrics.profile_metrics(rows)
    # The January row falls outside the window; six rows of 1000000 remain.
    assert result.buffer_cents == 1_000_000


def test_profile_metrics_sorts_rows_by_month_before_windowing() -> None:
    """Input order does not matter; the buffer window is by month."""
    rows = [
        make_row("2025-03", avg_daily_balance=30),
        make_row("2025-01", avg_daily_balance=10),
        make_row("2025-02", avg_daily_balance=20),
    ]
    result = metrics.profile_metrics(rows)
    assert result.buffer_cents == 20
    assert metrics.profile_metrics(list(reversed(rows))) == result


def test_profile_metrics_sums_pension_over_all_rows() -> None:
    """pension_in_cents is a total, not a median or a window."""
    rows = [
        make_row("2025-01", pension_in=100),
        make_row("2025-02", pension_in=0),
        make_row("2025-03", pension_in=250),
    ]
    result = metrics.profile_metrics(rows)
    assert result.pension_in_cents == 350


def test_profile_metrics_rejects_empty_rows() -> None:
    """At least one row is required to define a profile."""
    with pytest.raises(ValueError):
        metrics.profile_metrics([])


def test_gap_is_spending_minus_income() -> None:
    """gap = S minus I, negative when income exceeds spending."""
    rows = [
        make_row("2025-01", money_in=500, money_out=300),
        make_row("2025-02", money_in=700, money_out=900),
    ]
    result = metrics.profile_metrics(rows)
    assert result.gap_cents == result.spending_cents - result.income_cents
    assert result.gap_cents == 0


# Runway branches, exactly as the judge defines them.

def test_runway_buffer_depleted_when_buffer_left_not_positive() -> None:
    """buffer_left <= 0 wins the branch order and reports 0 deci months."""
    assert shocks.runway(0, 0, 100, 200) == shocks.Runway("buffer_depleted", 0)
    assert shocks.runway(100, 100, 100, 200) == shocks.Runway("buffer_depleted", 0)
    assert shocks.runway(-5, 0, 100, 200) == shocks.Runway("buffer_depleted", 0)
    # Buffer first, even when the gap also says no shortfall.
    assert shocks.runway(0, 0, 200, 100) == shocks.Runway("buffer_depleted", 0)


def test_runway_no_shortfall_when_gap_not_positive() -> None:
    """gap <= 0 reports the 120 month cap as no_shortfall."""
    assert shocks.runway(1_000, 0, 500, 500) == shocks.Runway("no_shortfall", 1200)
    assert shocks.runway(1_000, 0, 600, 500) == shocks.Runway("no_shortfall", 1200)


def test_runway_finite_basic_case() -> None:
    """buffer divided by gap in whole tenths of a month."""
    # 1000 / 100 = 10.0 months = 100 deci months.
    assert shocks.runway(1_000, 0, 0, 100) == shocks.Runway("finite", 100)


def test_runway_finite_tie_rounds_half_up() -> None:
    """An exact half tenth rounds away from zero (12.5 becomes 13)."""
    # 10 * 25 / 20 = 12.5 months in tenths, so 13 deci months.
    assert shocks.runway(25, 0, 0, 20) == shocks.Runway("finite", 13)
    # 10 * 15 / 10 = 15.0 months in tenths, no tie.
    assert shocks.runway(15, 0, 0, 10) == shocks.Runway("finite", 15)


def test_runway_finite_subtracts_one_off_costs_first() -> None:
    """one_off_cents reduce the buffer before the division."""
    # buffer_left = 1000 - 250 = 750, gap = 100, so 75.0 months in tenths.
    assert shocks.runway(1_000, 250, 0, 100) == shocks.Runway("finite", 75)
    # Exactly draining the buffer flips the branch to buffer_depleted.
    assert shocks.runway(1_000, 1_000, 0, 100) == shocks.Runway("buffer_depleted", 0)


def test_runway_finite_caps_at_1200_deci_months() -> None:
    """Long finite runways clamp to the 120 month cap, state stays finite."""
    assert shocks.runway(10_000_000, 0, 0, 100) == shocks.Runway("finite", 1200)
    # Just over the cap: 10 * 12005 / 100 = 1200.5 rounds to 1201, then caps.
    assert shocks.runway(12_005, 0, 0, 100) == shocks.Runway("finite", 1200)
    # Just under the tie: 10 * 12004 / 100 = 1200.4 rounds to 1200.
    assert shocks.runway(12_004, 0, 0, 100) == shocks.Runway("finite", 1200)


def test_runway_cap_boundary_is_exact() -> None:
    """Exactly 1200 deci months is finite and uncapped at the boundary."""
    # 10 * 12000 / 100 = 1200.0 exactly.
    assert shocks.runway(12_000, 0, 0, 100) == shocks.Runway("finite", 1200)


# P rule: the loan payment only counts when the loan runs at the end of 2025.

def test_loan_payment_cents_follows_status_rule() -> None:
    """Status C and D pay, status A and B do not."""
    assert metrics.loan_payment_cents(42_000, "C") == 42_000
    assert metrics.loan_payment_cents(42_000, "D") == 42_000
    assert metrics.loan_payment_cents(42_000, "A") == 0
    assert metrics.loan_payment_cents(42_000, "B") == 0


# Edge flag derivation, including exact thresholds.

def test_flag_pensioner_requires_positive_pension_total() -> None:
    """pensioner is a sum over all rows, not a window or a median."""
    assert metrics.derive_flags(make_metrics(pension_in_cents=1), 30, None)[
        "pensioner"
    ]
    assert not metrics.derive_flags(make_metrics(pension_in_cents=0), 30, None)[
        "pensioner"
    ]


def test_flag_thin_history_threshold_is_18_rows() -> None:
    """17 rows is thin, 18 rows is not (a quarter of the 72 month span)."""
    metric = make_metrics()
    assert metrics.derive_flags(metric, 17, None)["thin_history"]
    assert metrics.derive_flags(metric, 12, None)["thin_history"]
    assert not metrics.derive_flags(metric, 18, None)["thin_history"]
    assert not metrics.derive_flags(metric, 72, None)["thin_history"]


def test_flag_zero_income_is_median_exactly_zero() -> None:
    """zero_income watches the median I, not any single row."""
    assert metrics.derive_flags(make_metrics(income_cents=0), 30, None)["zero_income"]
    assert not metrics.derive_flags(make_metrics(income_cents=1), 30, None)[
        "zero_income"
    ]


def test_flag_defaulted_loan_is_status_d_only() -> None:
    """Only status D is defaulted; status B is repaid in default but not running."""
    metric = make_metrics()
    assert metrics.derive_flags(metric, 30, "D")["defaulted_loan"]
    assert not metrics.derive_flags(metric, 30, "C")["defaulted_loan"]
    assert not metrics.derive_flags(metric, 30, "B")["defaulted_loan"]
    assert not metrics.derive_flags(metric, 30, None)["defaulted_loan"]


def test_flag_negative_buffer_when_buffer_below_zero() -> None:
    """A zero buffer is not negative; only below zero fires the flag."""
    assert metrics.derive_flags(make_metrics(buffer_cents=-1), 30, None)[
        "negative_buffer"
    ]
    assert not metrics.derive_flags(make_metrics(buffer_cents=0), 30, None)[
        "negative_buffer"
    ]


def test_flag_names_match_the_artifact_contract() -> None:
    """The five flag keys are exactly the names the artifact ships."""
    names = metrics.derive_flags(make_metrics(), 30, None)
    assert sorted(names) == [
        "defaulted_loan",
        "negative_buffer",
        "pensioner",
        "thin_history",
        "zero_income",
    ]


def test_metric_rule_version_is_recorded() -> None:
    """The artifact meta cites this version so rule drift is visible."""
    assert metrics.METRIC_RULE_VERSION == "judge-metrics-v1"
