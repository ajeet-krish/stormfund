"""Boundary unit tests for the F1 classifier and the F4 counterfactual.

The artifact level suite in test_findings.py proves the shipped findings
equal a recomputation; these tests pin the decision boundaries that real
data rarely lands on exactly:

* F1 eligibility at exactly MIN_DEBIT_ROWS debit rows (20 in, 19 out);
* F1 classification when the peak autocorrelation equals the threshold
  exactly (the rule is strictly greater than, so equality stays
  discretionary);
* F1 threshold selection between the white noise band and the control
  band;
* F4 aligned and anti aligned date moves at the phase 7 boundary;
* F4 with a category that has zero debit rows (nothing to move, every
  delta zero) and a category whose rows are all already inside the
  income window (the aligned rule moves nothing).

    uv run pytest scripts/analysis/test_boundaries.py
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from scripts.analysis import f1_structural, f4_plane_change
from scripts.analysis.ledger import ALIGNED_PHASE_MAX, Ledger

DAY_INDEX = pd.date_range("2025-11-01", "2026-10-31", freq="D").astype("datetime64[ns]")

def seasonal_series() -> pd.Series:
    """365 daily cents with a large spike every 30 days (monthly recurrence)."""
    values = np.full(len(DAY_INDEX), 100, dtype="int64")
    values[::30] = 1_000_000
    return pd.Series(values, index=DAY_INDEX, dtype="int64")

def no_holidays() -> np.ndarray:
    """Holiday mask with no flagged days (deseasonalize skips the effect)."""
    return np.zeros(len(DAY_INDEX), dtype=bool)

# F1: classification boundaries

def test_f1_eligibility_boundary_is_exactly_minimum_debit_rows() -> None:
    """20 debit rows is eligible (and structural here); 19 is never tested."""
    series = seasonal_series()
    holiday = no_holidays()
    minimum = f1_structural.MIN_DEBIT_ROWS

    at_limit = f1_structural.analyse_category("Monthly", series, holiday, minimum)
    assert at_limit["eligibleForLagTest"] is True
    assert at_limit["classification"] == "structural"
    assert at_limit["reason"].startswith("significant peak")
    assert at_limit["peakAcf"] > at_limit["threshold"]

    below = f1_structural.analyse_category("Monthly", series, holiday, minimum - 1)
    assert below["eligibleForLagTest"] is False
    assert below["classification"] == "discretionary"
    assert f"below the minimum of {minimum}" in below["reason"]

def test_f1_peak_equal_to_threshold_is_discretionary(monkeypatch: pytest.MonkeyPatch) -> None:
    """Boundary equality: the rule is peak > threshold, so peak == threshold loses.

    Real data cannot hit float equality on demand, so the autocorrelation
    collaborator is stubbed to place the peak exactly on the control band.
    """

    def constant_acf(_values: np.ndarray, lag: int) -> float:
        if f1_structural.CONTROL_LAGS[0] <= lag <= f1_structural.CONTROL_LAGS[1]:
            return 0.5
        if f1_structural.LAG_WINDOW[0] <= lag <= f1_structural.LAG_WINDOW[1]:
            return 0.5
        return 0.1

    monkeypatch.setattr(f1_structural, "autocorrelation", constant_acf)
    detail = f1_structural.analyse_category(
        "Boundary", seasonal_series(), no_holidays(), f1_structural.MIN_DEBIT_ROWS
    )
    assert detail["eligibleForLagTest"] is True
    assert detail["peakAcf"] == 0.5
    # The control band (0.5) dominates the white noise band (about 0.1027).
    assert detail["threshold"] == 0.5
    assert detail["classification"] == "discretionary"
    assert "does not exceed threshold" in detail["reason"]

def test_f1_peak_strictly_above_threshold_is_structural(monkeypatch: pytest.MonkeyPatch) -> None:
    """One float step above the same threshold flips the classification."""

    def just_above(_values: np.ndarray, lag: int) -> float:
        if f1_structural.CONTROL_LAGS[0] <= lag <= f1_structural.CONTROL_LAGS[1]:
            return 0.5
        if f1_structural.LAG_WINDOW[0] <= lag <= f1_structural.LAG_WINDOW[1]:
            return 0.5000001
        return 0.1

    monkeypatch.setattr(f1_structural, "autocorrelation", just_above)
    detail = f1_structural.analyse_category(
        "Boundary", seasonal_series(), no_holidays(), f1_structural.MIN_DEBIT_ROWS
    )
    assert detail["threshold"] == 0.5
    assert detail["classification"] == "structural"
    assert detail["reason"].startswith("significant peak")

def test_f1_threshold_falls_back_to_the_white_noise_band(monkeypatch: pytest.MonkeyPatch) -> None:
    """When every control lag autocorrelation is below the band, max() picks the band."""

    def quiet_control(_values: np.ndarray, lag: int) -> float:
        if f1_structural.CONTROL_LAGS[0] <= lag <= f1_structural.CONTROL_LAGS[1]:
            return 0.0
        if f1_structural.LAG_WINDOW[0] <= lag <= f1_structural.LAG_WINDOW[1]:
            return 0.05
        return 0.01

    monkeypatch.setattr(f1_structural, "autocorrelation", quiet_control)
    detail = f1_structural.analyse_category(
        "Quiet", seasonal_series(), no_holidays(), f1_structural.MIN_DEBIT_ROWS
    )
    band = round(1.96 / np.sqrt(len(DAY_INDEX)), 6)
    assert detail["controlBand"] == 0.0
    assert detail["whiteNoiseBand"] == band
    assert detail["threshold"] == band
    assert detail["classification"] == "discretionary"

# F4: synthetic ledger with a zero debit row category

def paydays() -> pd.DatetimeIndex:
    """The 25th of each month across the fixture window (the mock cadence)."""
    months = pd.period_range("2025-11", "2026-10", freq="M")
    return pd.DatetimeIndex(
        [pd.Timestamp(year=ts.year, month=ts.month, day=25) for ts in months.to_timestamp()]
    )

def make_ledger() -> Ledger:
    """Minimal ledger: Income has credits only, Dining rows sit in the income
    window (phase 1), and one Travel debit sits at phase 25 where the aligned
    rule can move it. The first row opens day_index[0] so the simulated
    balance path has no leading gap."""
    frame = pd.DataFrame(
        [
            ("T-1", "2025-11-01", 260_000, "Income"),
            ("T-2", "2025-11-26", -5_000, "Dining"),
            ("T-3", "2025-12-26", -3_000, "Dining"),
            ("T-4", "2025-12-20", -7_000, "Travel"),
        ],
        columns=["row_id", "date", "amount_cents", "category"],
    )
    frame["date"] = pd.to_datetime(frame["date"]).astype("datetime64[ns]")
    frame["amount_cents"] = frame["amount_cents"].astype("int64")
    frame["balance_cents"] = 0
    frame["order"] = np.arange(len(frame), dtype="int64")

    zeros = pd.Series(np.zeros(len(DAY_INDEX), dtype="int64"), index=DAY_INDEX)
    return Ledger(
        frame=frame,
        world={},
        day_index=DAY_INDEX,
        daily_close=zeros,
        daily_amount=zeros,
        daily_spend=zeros,
        category_daily=pd.DataFrame(
            0, index=DAY_INDEX, columns=["Dining", "Income", "Travel"], dtype="int64"
        ),
        paydays=paydays(),
        holiday_mask=np.zeros(len(DAY_INDEX), dtype=bool),
        start_balance_cents=500_000,
        month_labels=[str(period) for period in pd.unique(DAY_INDEX.to_period("M"))],
    )

def f1_stub() -> dict[str, object]:
    """F1 categories without an Income entry: F4 must default it to discretionary."""
    return {
        "categories": [
            {"name": "Dining", "classification": "discretionary"},
            {"name": "Travel", "classification": "structural"},
        ]
    }

def scenario_deltas(block: dict[str, object]) -> dict[str, int]:
    keys = (
        "peakDeltaCents",
        "troughDeltaCents",
        "minMonthEndDeltaCents",
        "drawdownImprovementCents",
    )
    return {key: int(block[key]) for key in keys}

def test_f4_category_with_zero_debit_rows_reports_all_zero_deltas() -> None:
    """Income has no debits: nothing can move, so every scenario equals the baseline."""
    finding = f4_plane_change.run_f4(make_ledger(), f1_stub())
    rows = {str(row["name"]): row for row in finding["categories"]}
    assert set(rows) == {"Dining", "Income", "Travel"}

    income = rows["Income"]
    assert income is not None
    # No F1 entry means the classification defaults to discretionary.
    assert income["classification"] == "discretionary"
    baseline = finding["numbers"]["baseline"]
    for scenario in ("aligned", "observed", "antiAligned"):
        assert income[scenario]["numbers"] == baseline
        assert scenario_deltas(income[scenario]) == {
            "peakDeltaCents": 0,
            "troughDeltaCents": 0,
            "minMonthEndDeltaCents": 0,
            "drawdownImprovementCents": 0,
        }

def test_f4_rows_already_in_the_income_window_never_move_aligned() -> None:
    """Dining rows are all at phase 1: the aligned rule changes nothing, while
    the anti aligned rule still moves them (so the zero is not vacuous)."""
    finding = f4_plane_change.run_f4(make_ledger(), f1_stub())
    rows = {str(row["name"]): row for row in finding["categories"]}
    dining = rows["Dining"]
    assert dining is not None
    baseline = finding["numbers"]["baseline"]

    assert dining["aligned"]["numbers"] == baseline
    assert scenario_deltas(dining["aligned"]) == {
        "peakDeltaCents": 0,
        "troughDeltaCents": 0,
        "minMonthEndDeltaCents": 0,
        "drawdownImprovementCents": 0,
    }
    # Observed deltas are zero by construction.
    assert scenario_deltas(dining["observed"]) == {
        "peakDeltaCents": 0,
        "troughDeltaCents": 0,
        "minMonthEndDeltaCents": 0,
        "drawdownImprovementCents": 0,
    }
    # Anti aligned does move both Dining debits to the day before the next
    # deposit: the monthly closes shift even though this monotone ledger
    # keeps the headline deltas at zero (the trough equals the conserved
    # final balance either way). The movement itself is pinned by the
    # anti_dates_for_mask unit test below.
    anti = dining["antiAligned"]
    assert anti["numbers"]["monthlyCents"] != baseline["monthlyCents"]

def test_f4_headline_numbers_are_present_and_integral() -> None:
    """run_f4 still emits the headline the report and the game option card read."""
    finding = f4_plane_change.run_f4(make_ledger(), f1_stub())
    numbers = finding["numbers"]
    assert numbers["bestAlignedCategory"] in {"Dining", "Income", "Travel"}
    assert isinstance(numbers["bestAlignedDrawdownImprovementCents"], int)
    assert isinstance(numbers["sumOfAlignedDrawdownImprovementsCents"], int)
    assert numbers["baselineTroughDate"]
    assert len(finding["chartTwin"]["bars"]) == 3
    assert len(finding["chartTwin"]["monthlySeries"]) == 12

# F4: pure date move helpers at the phase boundary

def test_aligned_dates_move_only_rows_at_or_past_phase_seven() -> None:
    """phase 6 stays (already in the window), phase 7 moves to the payday,
    phase 25 moves to payday + (25 mod 7) days, and NaT next payday never moves."""
    dates = pd.Series(
        pd.to_datetime(["2025-12-20", "2025-12-26", "2025-12-30", "2026-01-01", "2026-11-05"])
    )
    phase = np.array([25, 1, 5, 7, 11], dtype="int64")
    next_payday = np.array(
        ["2025-12-25", "2026-01-25", "2026-01-25", "2026-01-25", "NaT"],
        dtype="datetime64[ns]",
    )
    mask = np.ones(len(dates), dtype=bool)

    moved = f4_plane_change.aligned_dates_for_mask(dates, phase, next_payday, mask)
    assert moved.iloc[0] == pd.Timestamp("2025-12-29")  # 25th + 4 days
    assert moved.iloc[1] == pd.Timestamp("2025-12-26")  # phase 1 stays
    assert moved.iloc[2] == pd.Timestamp("2025-12-30")  # phase 5 stays
    assert moved.iloc[3] == pd.Timestamp("2026-01-25")  # phase 7 moves onto the payday
    assert moved.iloc[4] == pd.Timestamp("2026-11-05")  # no next payday, never moves

    # An empty mask leaves every input date untouched.
    untouched = f4_plane_change.aligned_dates_for_mask(
        dates, phase, next_payday, np.zeros(len(dates), dtype=bool)
    )
    assert list(untouched) == list(dates)

def test_anti_dates_move_masked_rows_and_leave_unmasked_ones() -> None:
    """The anti aligned rule targets the day before the next deposit for every
    masked row with a next payday, and never touches the rest."""
    dates = pd.Series(pd.to_datetime(["2025-12-20", "2025-12-26"]))
    next_payday = np.array(["2025-12-25", "2026-01-25"], dtype="datetime64[ns]")
    mask = np.array([True, False])

    moved = f4_plane_change.anti_dates_for_mask(dates, next_payday, mask)
    assert moved.iloc[0] == pd.Timestamp("2025-12-24")
    assert moved.iloc[1] == pd.Timestamp("2025-12-26")

    empty = f4_plane_change.anti_dates_for_mask(
        dates, next_payday, np.zeros(len(dates), dtype=bool)
    )
    assert list(empty) == list(dates)
