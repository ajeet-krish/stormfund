"""F5: ranked simulated interventions.

Four counterfactuals over the same 365 day ledger, all labeled as simulated
(none is observed in the data):

1. consolidate_recurring: every detected recurring charge (world.json
   subscriptions provenance rows) moves to day 27 of its month, one billing
   cycle anchored two days after the payday.
2. cap_top_surge: the category with the largest holiday excess spend has its
   holiday window spend capped at its own non holiday daily rate (scaled, not
   removed).
3. realign_top_discretionary: the largest discretionary category (from F1)
   runs through the F4 alignment shift unchanged, so the report and the game
   read the same definition.
4. auto_save_payday: a fixed 1,000.00 CAD transfer per payroll deposit into
   an intervention reserve with an emergency release that covers any day
   whose close would fall below the deficit threshold. Floor and drawdown are
   evaluated on the combined view (checking plus reserve); for a pure
   transfer this is a declared null by construction, so the auxiliary block
   reports what actually changes: deficit days and the reserve balance.

Ranking rule: primary key minMonthEndDeltaCents (higher floor first),
secondary key drawdownImprovementCents (tighter drawdown first). A
rankByDrawdown field is also emitted so a different priority is one read
away.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from scripts.analysis.f4_plane_change import aligned_dates_for_mask, phase_of_rows
from scripts.analysis.ledger import (
    AUTOSAVE_PER_PAYDAY_CENTS,
    DEFICIT_THRESHOLD_CENTS,
    SURGE_END,
    SURGE_START,
    BalanceMetrics,
    Ledger,
    metric_deltas,
    simulate_balance,
)
from scripts.pipeline_lib import cents_to_dollars

CONSOLIDATION_DAY: int = 27

LIMITATIONS: list[str] = [
    "All four rows are simulated counterfactuals. Nothing here was observed; "
    "each delta is what the stated rule would produce under fixed behavior "
    "elsewhere in the ledger.",
    "Ranking is by minimum month end balance first and drawdown improvement "
    "second; a different priority reorders the list, which is why "
    "rankByDrawdown ships alongside rank.",
    "The surge cap changes amounts, not only timing: it models spending less "
    "during the holiday window, so its delta bounds a behavior change rather "
    "than a scheduling change.",
    "The consolidation row blends two effects (one cycle plus a post payday "
    "anchor) because a single cycle must sit somewhere; the anchor day is "
    "stated in the definition rather than hidden.",
    "The auto save row is an internal transfer: on the combined view of "
    "checking plus reserve the floor and the drawdown cannot move, which is a "
    "declared null, not an oversight. The deficit counts stay flat for an "
    "arithmetic reason: covering a genuine deficit day would require the held "
    "reserve to exceed itself plus the shortfall, because the holding that "
    "funds the release is what deepens the checking balance, so releases only "
    "reverse the dips the saving itself creates. The durable change is the "
    "reserve balance, reported in auxiliary.",
    "Intervention interactions are not modeled: applying every rule at once "
    "is not the sum of the rows, because each scenario starts from the "
    "observed ledger.",
    "All numbers come from the synthetic seed 20261107 ledger; deltas will "
    "differ on the real Tangerine dataset, though the simulation recipe is "
    "unchanged.",
]


def holiday_debit_mask(ledger: Ledger) -> np.ndarray:
    """Boolean mask over rows: holiday window debits.

    The window bounds come from scripts.generate_mock_ledger (SURGE_START and
    SURGE_END, re exported by the ledger module), so the F5 cap can never
    drift from the surge window the mock ledger was generated with.
    """
    window_start = pd.Timestamp(SURGE_START)
    window_end = pd.Timestamp(SURGE_END)
    in_window = (
        (ledger.frame["date"] >= window_start) & (ledger.frame["date"] <= window_end)
    ).to_numpy(dtype=bool)
    return in_window & (ledger.frame["amount_cents"] < 0).to_numpy(dtype=bool)


def holiday_excess(ledger: Ledger) -> tuple[str, dict[str, int]]:
    """Return the top surge category and every category's holiday excess cents."""
    holiday_debits = holiday_debit_mask(ledger)
    category = ledger.frame["category"].to_numpy()
    amounts = ledger.frame["amount_cents"].to_numpy(dtype="int64")
    holiday_days = int(ledger.holiday_mask.sum())
    normal_days = ledger.day_count - holiday_days
    excess: dict[str, int] = {}
    for name in ledger.categories:
        is_category = category == name
        holiday_spend = int(abs(amounts[is_category & holiday_debits].sum()))
        non_holiday_spend = int(abs(amounts[is_category & ~holiday_debits & (amounts < 0)].sum()))
        daily_rate = non_holiday_spend / normal_days if normal_days else 0.0
        excess[name] = int(round(holiday_spend - daily_rate * holiday_days))
    top = max(excess, key=lambda name: excess[name])
    return top, excess


def consolidate_dates(ledger: Ledger, row_mask: np.ndarray) -> pd.Series:
    """Move masked rows to day 27 of their own calendar month."""
    dates = ledger.frame["date"]
    values = dates.to_numpy(dtype="datetime64[ns]", copy=True)
    stamp = pd.DatetimeIndex(dates.to_numpy(dtype="datetime64[ns]")[row_mask])
    target = pd.to_datetime(
        {
            "year": stamp.year,
            "month": stamp.month,
            "day": [CONSOLIDATION_DAY] * len(stamp),
        }
    ).to_numpy(dtype="datetime64[ns]")
    values[row_mask] = target
    return pd.Series(values, index=dates.index)


def capped_amounts(
    ledger: Ledger, category: str
) -> tuple[np.ndarray, dict[str, object]]:
    """Scale a category's holiday debits to its non holiday daily rate."""
    amounts = ledger.frame["amount_cents"].to_numpy(dtype="int64").copy()
    holiday_debits = holiday_debit_mask(ledger) & (
        ledger.frame["category"] == category
    ).to_numpy(dtype=bool)
    is_category = (ledger.frame["category"] == category).to_numpy(dtype=bool)
    is_debit = (ledger.frame["amount_cents"] < 0).to_numpy(dtype=bool)
    holiday_days = int(ledger.holiday_mask.sum())
    normal_days = ledger.day_count - holiday_days
    holiday_spend = int(abs(amounts[holiday_debits].sum()))
    non_holiday_spend = int(abs(amounts[is_category & is_debit & ~holiday_debits].sum()))
    daily_rate = non_holiday_spend / normal_days if normal_days else 0.0
    target = daily_rate * holiday_days
    factor = target / holiday_spend if holiday_spend else 1.0
    scaled = np.rint(amounts[holiday_debits] * factor).astype("int64")
    amounts[holiday_debits] = scaled
    detail: dict[str, object] = {
        "category": category,
        "holidayRows": int(holiday_debits.sum()),
        "holidaySpendCents": holiday_spend,
        "nonHolidayDailyRateCents": int(round(daily_rate)),
        "capTargetCents": int(round(target)),
        "scaleFactor": round(float(factor), 6),
        "removedCents": int(holiday_spend - int(abs(scaled.sum()))),
    }
    return amounts, detail


def autosave_paths(ledger: Ledger) -> dict[str, int]:
    """Run the auto save rule and return auxiliary numbers.

    The combined view (checking plus reserve) must equal the baseline daily
    close exactly, which is asserted: an internal transfer cannot move ledger
    totals. Deficit days are measured on the checking side after releases.
    """
    # Payroll days come from world.json income events through ledger.paydays
    # (payroll_dates is the single payroll detector in the pipeline).
    payroll_days = {pd.Timestamp(day) for day in ledger.paydays}
    daily_amount = ledger.daily_amount
    balance = ledger.start_balance_cents
    reserve = 0
    released_total = 0
    released_days = 0
    saved_total = 0
    lifted_days = 0
    created_days = 0
    simulated_deficit_days = 0
    combined_values: list[int] = []
    for day in ledger.day_index:
        balance += int(daily_amount.loc[day])
        if day in payroll_days:
            saved = min(AUTOSAVE_PER_PAYDAY_CENTS, max(balance, 0))
            balance -= saved
            reserve += saved
            saved_total += saved
        pre_release_deficit = balance < DEFICIT_THRESHOLD_CENTS
        if pre_release_deficit:
            gap = DEFICIT_THRESHOLD_CENTS - balance
            give = min(reserve, gap)
            balance += give
            reserve -= give
            released_total += give
            if give > 0:
                released_days += 1
        combined_day = balance + reserve
        baseline_day = int(ledger.daily_close.loc[day])
        if combined_day != baseline_day:
            raise AssertionError(
                f"auto save combined view differs from baseline on {day.date()}"
            )
        post_deficit = balance < DEFICIT_THRESHOLD_CENTS
        if post_deficit:
            simulated_deficit_days += 1
        if (
            pre_release_deficit
            and not post_deficit
            and baseline_day < DEFICIT_THRESHOLD_CENTS
        ):
            lifted_days += 1
        if post_deficit and baseline_day >= DEFICIT_THRESHOLD_CENTS:
            created_days += 1
        combined_values.append(combined_day)

    baseline = ledger.daily_close.to_numpy(dtype="int64")
    combined = np.array(combined_values, dtype="int64")
    if not np.array_equal(combined, baseline):
        raise AssertionError("auto save combined view must equal the baseline exactly")
    deficit_days_baseline = int((baseline < DEFICIT_THRESHOLD_CENTS).sum())
    expected = deficit_days_baseline - lifted_days + created_days
    if simulated_deficit_days != expected:
        raise AssertionError(
            f"deficit day accounting broken: {simulated_deficit_days} versus {expected}"
        )
    return {
        "deficitDaysBaseline": deficit_days_baseline,
        "deficitDaysSimulated": int(simulated_deficit_days),
        "deficitDaysLifted": int(lifted_days),
        "deficitDaysCreated": int(created_days),
        "savedTotalCents": int(saved_total),
        "releasedTotalCents": int(released_total),
        "releasedDays": int(released_days),
        "reserveEndCents": int(reserve),
        "savedPerPaydayCents": AUTOSAVE_PER_PAYDAY_CENTS,
        "payrollDays": int(len(payroll_days)),
    }


def build_intervention(
    intervention_id: str,
    name: str,
    definition: str,
    caveat: str,
    baseline_metrics: BalanceMetrics,
    scenario_metrics: BalanceMetrics,
    auxiliary: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Assemble one intervention row (rank fields are added after sorting)."""
    row: dict[str, Any] = {
        "id": intervention_id,
        "name": name,
        "label": "simulated counterfactual (not observed in the data)",
        "definition": definition,
        "caveat": caveat,
        "metrics": {
            **metric_deltas(baseline_metrics, scenario_metrics),
            "minMonthEndAfterCents": scenario_metrics.min_month_end_cents,
            "drawdownAfterCents": scenario_metrics.drawdown_cents,
            "troughAfterCents": scenario_metrics.trough_cents,
        },
    }
    if auxiliary is not None:
        row["auxiliary"] = auxiliary
    return row


def run_f5(ledger: Ledger, f1: dict[str, Any], f4: dict[str, Any]) -> dict[str, Any]:
    """Compute finding F5 as a JSON ready dict."""
    baseline = simulate_balance(ledger)
    debits_mask = (ledger.frame["amount_cents"] < 0).to_numpy(dtype=bool)
    holiday_window_days = int(ledger.holiday_mask.sum())

    subscription_ids: set[str] = set()
    for entity in ledger.world.get("subscriptions", []):
        subscription_ids.update(str(row_id) for row_id in entity["provenance"]["rowIds"])
    recurring_mask = ledger.frame["row_id"].isin(subscription_ids).to_numpy(dtype=bool) & debits_mask
    scenario_1 = simulate_balance(ledger, consolidate_dates(ledger, recurring_mask))

    surge_category, excess = holiday_excess(ledger)
    amounts_2, detail_2 = capped_amounts(ledger, surge_category)
    scenario_2 = simulate_balance(ledger, amounts=amounts_2)

    discretionary = [
        str(detail["name"])
        for detail in f1["categories"]
        if detail["classification"] == "discretionary"
    ]
    spend_by_category = {
        str(detail["name"]): int(detail["annualSpendCents"]) for detail in f1["categories"]
    }
    top_discretionary = max(discretionary, key=lambda name: spend_by_category[name])
    phase, next_payday = phase_of_rows(ledger)
    realign_mask = (ledger.frame["category"] == top_discretionary).to_numpy(dtype=bool) & debits_mask
    aligned_dates = aligned_dates_for_mask(ledger.frame["date"], phase, next_payday, realign_mask)
    scenario_3 = simulate_balance(ledger, aligned_dates)

    f4_row = next(
        (
            row
            for row in f4.get("categories", [])
            if str(row["name"]) == top_discretionary
        ),
        None,
    )
    if f4_row is None:
        raise AssertionError("F4 result for the realign category is missing")
    shared_gain = int(f4_row["aligned"]["drawdownImprovementCents"])
    own_gain = int(metric_deltas(baseline, scenario_3)["drawdownImprovementCents"])
    if shared_gain != own_gain:
        raise AssertionError("F5 realign must reproduce the F4 aligned deltas exactly")

    autosave = autosave_paths(ledger)
    scenario_4 = baseline

    rows = [
        build_intervention(
            "consolidate_recurring",
            "Consolidate subscriptions to a single cycle",
            (
                f"Every detected recurring charge ({int(recurring_mask.sum())} "
                f"debit rows from the {len(subscription_ids)} subscription runs "
                "in world.json provenance) moves to day "
                f"{CONSOLIDATION_DAY} of its month, one billing cycle anchored "
                "two days after the 25th payday. Amounts unchanged."
            ),
            "Blends consolidation with a post payday anchor; the anchor day is "
            "part of the definition.",
            baseline,
            scenario_1,
        ),
        build_intervention(
            "cap_top_surge",
            "Cap the top surge category at its baseline rate",
            (
                f"{surge_category} has the largest holiday excess spend "
                f"(${cents_to_dollars(excess[surge_category])} above its non "
                f"holiday daily rate across the {holiday_window_days} day "
                f"window); every "
                f"{surge_category} debit inside the window is scaled by "
                f"{detail_2['scaleFactor']} so holiday spend equals "
                f"${cents_to_dollars(int(detail_2['capTargetCents']))}, capped "
                "not removed, rounded to integer cents."
            ),
            "This is an amount change (spend less in the window), not a timing "
            "change, so it bounds a behavior change.",
            baseline,
            scenario_2,
        ),
        build_intervention(
            "realign_top_discretionary",
            f"Realign {top_discretionary} to the income phase",
            (
                f"The largest discretionary category by annual spend "
                f"({top_discretionary}, "
                f"${cents_to_dollars(spend_by_category[top_discretionary])} per "
                "year) runs through the exact F4 alignment shift: debits with "
                "pay cycle phase 7 or more move to (next payday) + (p mod 7)."
            ),
            "Same modeling choice and the same caveats as F4; timing only, "
            "amounts conserved exactly.",
            baseline,
            scenario_3,
        ),
        build_intervention(
            "auto_save_payday",
            "Fixed auto save on payday with emergency release",
            (
                f"${cents_to_dollars(AUTOSAVE_PER_PAYDAY_CENTS)} leaves the "
                "checking account on every payroll deposit into an intervention "
                "reserve; any day whose close would fall below the deficit "
                "threshold draws from the reserve up to the threshold. Floor "
                "and drawdown are evaluated on the combined view (checking "
                "plus reserve), where a pure transfer is a declared null."
            ),
            "Combined view deltas are zero by construction; the full "
            "accounting (released days, lifted and created counts, reserve "
            "balance) is listed in auxiliary.",
            baseline,
            scenario_4,
            autosave,
        ),
    ]

    rows.sort(
        key=lambda row: (
            -int(row["metrics"]["minMonthEndDeltaCents"]),
            -int(row["metrics"]["drawdownImprovementCents"]),
        )
    )
    for index, row in enumerate(rows, start=1):
        row["rank"] = index
    by_drawdown = sorted(rows, key=lambda row: -int(row["metrics"]["drawdownImprovementCents"]))
    for index, row in enumerate(by_drawdown, start=1):
        row["rankByDrawdown"] = index
    ordered = sorted(rows, key=lambda row: int(row["rank"]))

    best = ordered[0]
    return {
        "question": (
            "Which intervention lifts the balance floor and tightens the "
            "drawdown the most?"
        ),
        "method": (
            "Each intervention rebuilds the 365 day balance path from the "
            "observed ledger with one rule applied, then recomputes peak, "
            "trough, drawdown and month end closes. Deltas are scenario minus "
            "baseline except drawdownImprovementCents (baseline minus "
            "scenario). Auto save uses the combined view (checking plus "
            "reserve); equality with the baseline is asserted in code."
        ),
        "rankingRule": (
            "Primary key: minMonthEndDeltaCents descending. Secondary key: "
            "drawdownImprovementCents descending. rankByDrawdown gives the "
            "alternative ordering directly."
        ),
        "numbers": {
            "bestInterventionId": str(best["id"]),
            "bestInterventionName": str(best["name"]),
            "bestMinMonthEndImprovementCents": int(
                best["metrics"]["minMonthEndDeltaCents"]
            ),
            "bestDrawdownImprovementCents": int(
                best["metrics"]["drawdownImprovementCents"]
            ),
            "rankingOrder": [str(row["id"]) for row in ordered],
            "topSurgeCategory": surge_category,
            "topSurgeExcessCents": int(excess[surge_category]),
            "realignCategory": top_discretionary,
            "recurringRowCount": int(recurring_mask.sum()),
        },
        "interventions": ordered,
        "limitations": list(LIMITATIONS),
        "chartTwin": {
            "bars": [
                {
                    "id": str(row["id"]),
                    "name": str(row["name"]),
                    "rank": int(row["rank"]),
                    "minMonthEndDeltaCents": int(row["metrics"]["minMonthEndDeltaCents"]),
                    "drawdownImprovementCents": int(
                        row["metrics"]["drawdownImprovementCents"]
                    ),
                    "troughDeltaCents": int(row["metrics"]["troughDeltaCents"]),
                }
                for row in ordered
            ],
            "autoSaveAuxiliary": {key: int(value) for key, value in autosave.items()},
        },
    }
