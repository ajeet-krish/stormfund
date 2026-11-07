"""F1: structural versus discretionary spend by lag autocorrelation.

Method (stated in full inside the emitted finding):

1. Build the daily spend series per debit category over the 365 day ledger.
2. Remove the day of week mean effect and the holiday window mean effect
   (the generator's 2025-11-15 to 2025-12-31 surge), so weekly rhythm and
   the one off holiday level shift cannot masquerade as monthly recurrence.
3. Compute lag autocorrelation at lags 28 to 35 (the monthly billing window).
4. A category is significant when its peak in that window exceeds both the
   white noise band 1.96 / sqrt(365) and the 95th percentile of its own
   autocorrelation at control lags 50 to 180 (an empirical band that absorbs
   residual structure), and the category has at least 20 debit rows.
5. Structural categories carry the structural share of annual spend; all
   other categories carry the discretionary share.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from scripts.analysis.ledger import Ledger

LAG_WINDOW: tuple[int, int] = (28, 35)
CONTROL_LAGS: tuple[int, int] = (50, 180)
CHART_LAGS: tuple[int, int] = (1, 45)
BAND_Z: float = 1.96
MIN_DEBIT_ROWS: int = 20

METHOD: str = (
    "Per category, build a daily spend series over the 365 day ledger, "
    "subtract the day of week mean effect and the holiday window mean effect "
    "({SURGE_TEXT_PLACEHOLDER}), then compute lag autocorrelation at lags "
    f"{LAG_WINDOW[0]} to {LAG_WINDOW[1]} (the monthly billing window). The "
    f"significance threshold is max({BAND_Z} / sqrt(365), p95 of the same "
    f"series at control lags {CONTROL_LAGS[0]} to {CONTROL_LAGS[1]}). A "
    f"category with at least {MIN_DEBIT_ROWS} debit rows whose peak exceeds "
    "the threshold is structural; every other category is discretionary. "
    "Structural share of annual spend is the sum of structural category "
    "annual spend divided by total annual spend."
)

LIMITATIONS: list[str] = [
    "Classification is per category, not per transaction: a category counts "
    "in full as structural or discretionary, so a category that mixes fixed "
    "bills with choices cannot be split internally.",
    "The lag window tests monthly recurrence only. Weekly locked behavior "
    "(for example weekday commuting in Transit) counts as discretionary "
    "here by construction; F2 measures that weekly pattern separately.",
    "One year of daily data gives 365 samples, so statistical power near "
    "the threshold is limited and a single billing drift can move a peak.",
    "Travel has fewer than the minimum debit rows for the lag test and is "
    "counted as discretionary because it cannot demonstrate recurrence.",
    "The mock ledger was generated with 28 to 32 day billing cycles, so "
    "this detector is validated against known construction rather than a "
    "real statement; the method itself does not use the generator.",
]


def surge_text() -> str:
    """Holiday window label reused inside the method string."""
    from scripts.generate_mock_ledger import SURGE_END, SURGE_START

    return f"{SURGE_START.isoformat()} to {SURGE_END.isoformat()}"


def autocorrelation(values: np.ndarray, lag: int) -> float:
    """Pearson autocorrelation of the demeaned series at one lag."""
    centered = values - values.mean()
    variance = float(centered.var())
    if variance <= 0.0 or lag <= 0 or lag >= len(values):
        return 0.0
    left = centered[:-lag]
    right = centered[lag:]
    return float(np.dot(left, right) / (len(values) * variance))


def deseasonalize(series: pd.Series, holiday_mask: np.ndarray) -> np.ndarray:
    """Remove day of week means, then the holiday window mean effect."""
    residual = series - series.groupby(series.index.day_of_week).transform("mean")
    values = residual.to_numpy(dtype="float64")
    if holiday_mask.any():
        holiday_effect = float(values[holiday_mask].mean())
        values = values - np.where(holiday_mask, holiday_effect, 0.0)
    return values


def analyse_category(
    name: str,
    series: pd.Series,
    holiday_mask: np.ndarray,
    debit_rows: int,
) -> dict[str, Any]:
    """Classify one category and return its JSON detail row."""
    values = deseasonalize(series, holiday_mask)
    window_acf = {
        lag: autocorrelation(values, lag)
        for lag in range(LAG_WINDOW[0], LAG_WINDOW[1] + 1)
    }
    control_acf = [
        autocorrelation(values, lag)
        for lag in range(CONTROL_LAGS[0], CONTROL_LAGS[1] + 1)
    ]
    band = BAND_Z / np.sqrt(len(values))
    control_band = float(np.percentile(control_acf, 95))
    threshold = max(band, control_band)
    peak_lag = max(window_acf, key=lambda lag: window_acf[lag])
    peak = window_acf[peak_lag]
    eligible = debit_rows >= MIN_DEBIT_ROWS
    structural = eligible and peak > threshold
    chart_values = {
        lag: autocorrelation(values, lag)
        for lag in range(CHART_LAGS[0], CHART_LAGS[1] + 1)
    }
    if not eligible:
        reason = (
            f"not tested: {debit_rows} debit rows is below the minimum of "
            f"{MIN_DEBIT_ROWS}, counted as discretionary"
        )
    elif structural:
        reason = (
            f"significant peak {peak:.3f} at lag {peak_lag} exceeds threshold "
            f"{threshold:.3f}"
        )
    else:
        reason = (
            f"peak {peak:.3f} at lag {peak_lag} does not exceed threshold "
            f"{threshold:.3f}"
        )
    return {
        "name": name,
        "annualSpendCents": int(series.sum()),
        "debitRows": int(debit_rows),
        "eligibleForLagTest": bool(eligible),
        "peakLag": int(peak_lag),
        "peakAcf": round(float(peak), 6),
        "threshold": round(float(threshold), 6),
        "whiteNoiseBand": round(float(band), 6),
        "controlBand": round(float(control_band), 6),
        "acfAtWindowLags": {str(lag): round(window_acf[lag], 6) for lag in window_acf},
        "acfAtLag7": round(autocorrelation(values, 7), 6),
        "classification": "structural" if structural else "discretionary",
        "reason": reason,
        "acfSeries": [round(chart_values[lag], 6) for lag in chart_values],
    }


def run_f1(ledger: Ledger) -> dict[str, Any]:
    """Compute finding F1 as a JSON ready dict."""
    debits = ledger.frame[ledger.frame["amount_cents"] < 0]
    row_counts = debits.groupby("category").size()
    details = [
        analyse_category(
            name,
            ledger.category_daily[name].astype("float64"),
            ledger.holiday_mask,
            int(row_counts.get(name, 0)),
        )
        for name in ledger.categories
    ]
    total = sum(int(detail["annualSpendCents"]) for detail in details)
    structural_total = sum(
        int(detail["annualSpendCents"])
        for detail in details
        if detail["classification"] == "structural"
    )
    structural_names = [
        str(detail["name"]) for detail in details if detail["classification"] == "structural"
    ]
    discretionary_names = [
        str(detail["name"]) for detail in details if detail["classification"] == "discretionary"
    ]
    structural_share = structural_total / total if total else 0.0
    return {
        "question": (
            "Which dollars are locked by the calendar and which are choices?"
        ),
        "method": METHOD.replace("{SURGE_TEXT_PLACEHOLDER}", surge_text()),
        "numbers": {
            "structuralShareOfAnnualSpend": round(structural_share, 6),
            "discretionaryShareOfAnnualSpend": round(1.0 - structural_share, 6),
            "totalAnnualSpendCents": total,
            "structuralSpendCents": structural_total,
            "discretionarySpendCents": total - structural_total,
            "structuralCategories": structural_names,
            "discretionaryCategories": discretionary_names,
            "lagWindowDays": list(LAG_WINDOW),
            "minimumDebitRows": MIN_DEBIT_ROWS,
        },
        "categories": details,
        "limitations": list(LIMITATIONS),
        "chartTwin": {
            "lags": list(range(CHART_LAGS[0], CHART_LAGS[1] + 1)),
            "lagWindow": list(LAG_WINDOW),
            "series": [
                {
                    "name": str(detail["name"]),
                    "classification": str(detail["classification"]),
                    "acf": list(detail["acfSeries"]),
                    "threshold": detail["threshold"],
                }
                for detail in details
            ],
        },
    }
