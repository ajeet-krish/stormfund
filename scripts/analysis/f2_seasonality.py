"""F2: seasonality decomposition (weekly, monthly, holiday) and verdict.

Method (stated in full inside the emitted finding):

1. Per category, split annual spend by day of week (7 shares), by ledger
   month (12 shares), and by the holiday window versus the rest of the year.
2. Compare each share with the share of days it covers (uniform baseline).
3. Verdict rules, stated with their thresholds:
   * holiday lift at or above HOLIDAY_LIFT_THRESHOLD: calendar driven
     holiday concentration;
   * weekly deviation (weekend share versus its 2/7 calendar baseline,
     relative) at or above WEEKLY_DEVIATION_THRESHOLD, and at least
     MIN_WEEKLY_ROWS debit rows: behavioral weekday and weekend rhythm;
   * both: mixed; neither: weak or no seasonality.

The weekend versus weekday contrast carries the behavioral reading because
it is robust to which single weekday a fixed billing date happens to land on.
Sparse categories (below MIN_WEEKLY_ROWS) skip the behavioral flag, since
their day of week pattern is sampling noise rather than a habit.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from scripts.analysis.ledger import Ledger

HOLIDAY_LIFT_THRESHOLD: float = 1.25
WEEKLY_DEVIATION_THRESHOLD: float = 0.20
MIN_WEEKLY_ROWS: int = 30
DOW_NAMES: list[str] = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]

LIMITATIONS: list[str] = [
    "Shares are computed over a single year, so month shares mix season "
    "with one off events: the Travel month shares come from seven rows, "
    "below the reliability floor for any weekday reading.",
    "The holiday window (2025-11-15 to 2025-12-31, 47 days) is the mock "
    "generator's surge period; on real data the same rule should be "
    "rewritten against declared holiday dates before it is trusted.",
    "Verdict thresholds (1.25 holiday lift, 0.20 weekend deviation, 30 row "
    "floor) are declared design choices, not hypothesis tests; nearby "
    "values would relabel borderline categories such as Dining (weekend "
    "deviation 0.24) and Groceries (0.21).",
    "Day of week shares attribute spend to the posting date, not to the "
    "moment of consumption (a late night Saturday charge counts Saturday).",
    "Calendar driven versus behavioral is an interpretation of the "
    "pattern, not a causal test of why the person spent.",
    "Subscriptions and Utilities bill on fixed dates, so their calendar "
    "recurrence shows up in F1 while F2 correctly reports their seasonal "
    "shape as weak; recurrence and seasonality are different questions.",
]


def _shares(values: np.ndarray) -> list[float]:
    """Normalize a vector of spends into 6 decimal share values."""
    total = float(values.sum())
    if total <= 0.0:
        return [0.0 for _ in values]
    return [round(float(value) / total, 6) for value in values]


def analyse_category(
    name: str,
    series: pd.Series,
    day_index: pd.DatetimeIndex,
    month_labels: list[str],
    holiday_mask: np.ndarray,
    debit_rows: int,
) -> dict[str, Any]:
    """Return the decomposition row and verdict for one category."""
    values = series.astype("float64")
    total = float(values.sum())

    dow_spend = np.array(
        [float(values[day_index.day_of_week == dow].sum()) for dow in range(7)],
        dtype="float64",
    )
    dow_shares = _shares(dow_spend)
    uniform = 1.0 / 7.0
    day_of_week_deviation = max(abs(share - uniform) for share in dow_shares) / uniform
    weekend_share = dow_shares[5] + dow_shares[6]
    weekend_lift = weekend_share / (2.0 / 7.0) if total > 0 else 0.0
    weekend_deviation = abs(weekend_lift - 1.0)
    weekly_reliable = debit_rows >= MIN_WEEKLY_ROWS

    month_periods = day_index.to_period("M")
    month_spend = np.array(
        [float(values[month_periods == label].sum()) for label in month_labels],
        dtype="float64",
    )
    month_shares = _shares(month_spend)
    month_days = np.array(
        [int((month_periods == label).sum()) for label in month_labels],
        dtype="float64",
    )
    month_day_shares = month_days / month_days.sum()
    top_month_index = int(np.argmax(month_spend))
    top_month_lift = (
        float(month_shares[top_month_index] / month_day_shares[top_month_index])
        if total > 0 and month_day_shares[top_month_index] > 0
        else 0.0
    )

    holiday_spend = float(values[holiday_mask].sum())
    holiday_share = holiday_spend / total if total > 0 else 0.0
    holiday_day_share = float(holiday_mask.sum()) / len(holiday_mask)
    holiday_lift = holiday_share / holiday_day_share if holiday_day_share > 0 else 0.0

    calendar_flag = holiday_lift >= HOLIDAY_LIFT_THRESHOLD
    behavioral_flag = weekly_reliable and weekend_deviation >= WEEKLY_DEVIATION_THRESHOLD
    if not weekly_reliable:
        verdict = (
            "structural (calendar driven)"
            if calendar_flag
            else "weak or no seasonality"
        )
        plain = (
            f"{name} has {debit_rows} debit rows, below the "
            f"{MIN_WEEKLY_ROWS} row floor for a weekday reading, so only the "
            f"calendar test applies: holiday lift {holiday_lift:.2f} gives "
            f"'{verdict}'."
        )
    elif calendar_flag and behavioral_flag:
        verdict = "mixed (calendar driven holiday plus behavioral weekly rhythm)"
        plain = (
            f"{name} concentrates spend in the holiday window at "
            f"{holiday_lift:.2f} times its calendar share while its weekend "
            f"share sits {weekend_deviation:.0%} away from the 2/7 calendar "
            "baseline, so the seasonality has both a calendar driven and a "
            "behavioral part."
        )
    elif calendar_flag:
        verdict = "structural (calendar driven)"
        plain = (
            f"{name} puts {holiday_share:.1%} of annual spend into the 47 day "
            f"holiday window ({holiday_lift:.2f} times its calendar share) "
            "while its weekend pattern stays near the calendar baseline, so "
            "the pattern follows the calendar rather than weekday habits."
        )
    elif behavioral_flag:
        verdict = "behavioral"
        plain = (
            f"{name} follows a weekday and weekend rhythm: weekend share "
            f"{weekend_share:.1%} versus a {2/7:.1%} calendar baseline "
            f"({weekend_deviation:.0%} deviation), while its holiday lift of "
            f"{holiday_lift:.2f} stays near 1.00, so the seasonality tracks "
            "behavior, not fixed calendar dates."
        )
    else:
        verdict = "weak or no seasonality"
        plain = (
            f"{name} shows neither holiday concentration (lift "
            f"{holiday_lift:.2f}) nor a weekend shift (deviation "
            f"{weekend_deviation:.0%}); spend spreads evenly across the year "
            "beyond its monthly recurrence measured in F1."
        )

    return {
        "name": name,
        "annualSpendCents": int(values.sum()),
        "debitRows": int(debit_rows),
        "dayOfWeekSpendCents": [int(value) for value in dow_spend],
        "dayOfWeekShares": dow_shares,
        "dayOfWeekDeviation": round(float(day_of_week_deviation), 6),
        "weekendShare": round(float(weekend_share), 6),
        "weekendCalendarShare": round(2.0 / 7.0, 6),
        "weekendLift": round(float(weekend_lift), 6),
        "weeklyDeviation": round(float(weekend_deviation), 6),
        "weeklyPatternReliable": bool(weekly_reliable),
        "monthShares": month_shares,
        "monthDayShares": [round(float(value), 6) for value in month_day_shares],
        "topMonth": str(month_labels[top_month_index]),
        "topMonthShare": round(float(month_shares[top_month_index]), 6),
        "topMonthLift": round(float(top_month_lift), 6),
        "holidayWindow": {
            "start": str(day_index[holiday_mask][0].date()),
            "end": str(day_index[holiday_mask][-1].date()),
            "days": int(holiday_mask.sum()),
            "spendCents": int(holiday_spend),
            "share": round(float(holiday_share), 6),
            "calendarShare": round(float(holiday_day_share), 6),
            "lift": round(float(holiday_lift), 6),
        },
        "verdict": verdict,
        "plainLanguage": plain,
    }


def run_f2(ledger: Ledger) -> dict[str, Any]:
    """Compute finding F2 as a JSON ready dict."""
    debits = ledger.frame[ledger.frame["amount_cents"] < 0]
    row_counts = debits.groupby("category").size()
    details = [
        analyse_category(
            name,
            ledger.category_daily[name],
            ledger.day_index,
            ledger.month_labels,
            ledger.holiday_mask,
            int(row_counts.get(name, 0)),
        )
        for name in ledger.categories
    ]
    by_verdict: dict[str, list[str]] = {}
    for detail in details:
        by_verdict.setdefault(str(detail["verdict"]), []).append(str(detail["name"]))
    headline = "mixed (calendar driven and behavioral, split by category)"
    if set(by_verdict) == {"weak or no seasonality"}:
        headline = "no material seasonality in any category"
    elif all(key.startswith("structural") for key in by_verdict):
        headline = "structural (calendar driven) in every category"
    elif all(key == "behavioral" for key in by_verdict):
        headline = "behavioral in every category"
    verdict_summary = "; ".join(
        f"{verdict}: {', '.join(names)}" for verdict, names in sorted(by_verdict.items())
    )
    reliable = [detail for detail in details if detail["weeklyPatternReliable"]]
    calendar_pool = reliable or details
    behavioral_pool = reliable or details
    top_calendar = max(calendar_pool, key=lambda detail: detail["holidayWindow"]["lift"])
    top_behavioral = max(behavioral_pool, key=lambda detail: detail["weeklyDeviation"])
    return {
        "question": "When in the week and the year does this person actually spend?",
        "method": (
            "Per category, annual spend is decomposed into day of week shares "
            "(7), ledger month shares (12), and the holiday window share "
            "versus the rest of the year; every share is compared with the "
            "share of days it covers. Verdict rules: holiday lift at or above "
            f"{HOLIDAY_LIFT_THRESHOLD} means calendar driven concentration; "
            "weekly deviation (weekend share versus its 2/7 calendar baseline, "
            f"relative) at or above {WEEKLY_DEVIATION_THRESHOLD} means a "
            f"behavioral rhythm, and only categories with at least "
            f"{MIN_WEEKLY_ROWS} debit rows are eligible for that flag because "
            "sparse weekday patterns are sampling noise; both means mixed; "
            "neither means weak seasonality."
        ),
        "numbers": {
            "overallVerdict": headline,
            "verdictSummary": verdict_summary,
            "holidayLiftThreshold": HOLIDAY_LIFT_THRESHOLD,
            "weeklyDeviationThreshold": WEEKLY_DEVIATION_THRESHOLD,
            "minimumWeeklyRows": MIN_WEEKLY_ROWS,
            "holidayWindowDays": int(ledger.holiday_mask.sum()),
            "strongestCalendarCategory": str(top_calendar["name"]),
            "strongestCalendarLift": top_calendar["holidayWindow"]["lift"],
            "strongestBehavioralCategory": str(top_behavioral["name"]),
            "strongestBehavioralDeviation": top_behavioral["weeklyDeviation"],
        },
        "categories": details,
        "limitations": list(LIMITATIONS),
        "chartTwin": {
            "dayOfWeekLabels": list(DOW_NAMES),
            "monthLabels": list(ledger.month_labels),
            "dayOfWeekShares": [
                {"name": str(detail["name"]), "shares": list(detail["dayOfWeekShares"])}
                for detail in details
            ],
            "monthShares": [
                {"name": str(detail["name"]), "shares": list(detail["monthShares"])}
                for detail in details
            ],
            "holidayLifts": [
                {
                    "name": str(detail["name"]),
                    "lift": detail["holidayWindow"]["lift"],
                    "weeklyDeviation": detail["weeklyDeviation"],
                    "verdict": str(detail["verdict"]),
                }
                for detail in details
            ],
        },
    }
