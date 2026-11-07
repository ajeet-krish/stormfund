"""F4: plane change cost, the load bearing counterfactual of the entry.

Definition (stated verbatim inside the emitted finding):

For a given category, every debit whose pay cycle phase p (days since the
most recent payroll deposit, anchored virtually at 2025-10-25 before the
first deposit) is 7 or more is moved forward to (next payroll date) plus
(p mod 7) days, which lands it inside the first week after the following
deposit. Debits already in that first income window (phase 0 to 6) do not
move. Amounts, counts, and the opening balance are untouched, so the yearly
total is conserved exactly; only timing changes. The daily balance path is
rebuilt and the peak, the trough, the drawdown (peak minus trough of daily
closing balances) and every month end close are recomputed over the 365 day
ledger.

Three scenarios are reported per category:

* aligned: the forward shift above.
* observed: the ledger exactly as it stands, left misaligned. Deltas are
  zero by construction and the benefit forgone equals the aligned deltas.
* antiAligned: every debit of the category moves to the day before the next
  deposit, the maximum misalignment (money leaves right before income lands).

This whole module is a modeling choice, not a causal estimate.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from scripts.analysis.ledger import (
    ALIGNED_PHASE_MAX,
    BalanceMetrics,
    Ledger,
    metric_deltas,
    simulate_balance,
)

LIMITATIONS: list[str] = [
    "This is a counterfactual simulation, not a causal estimate: real "
    "merchants, rent, and autopay bills cannot in general be moved to an "
    "arbitrary day, so the deltas bound an opportunity rather than measure "
    "an achievable effect.",
    "Only timing moves: every scenario conserves the category total exactly, "
    "so an aligned scenario never improves the ledger by spending less.",
    "Month end floors are sample points. The forward shift can only move a "
    "debit forward to days 25 to 31 of the deposit month, and a spill past "
    "a 30 day month lands on day 1 to 3 of the next month, so no month end "
    "close can ever fall under the aligned rule; the binding floor here is "
    "December, a 31 day month that no forward target can escape, which is "
    "why the floor delta is exactly zero while the true intra month trough "
    "(troughDeltaCents) moves. Floors respond to amounts, which is F5's "
    "capping intervention, not to timing.",
    "The counterfactual holds behavior fixed: moving dining dates in the "
    "simulation does not change how much the person chooses to eat out, and "
    "the model assumes the person can and would move each payment.",
    "Paydays are one monthly deposit on the 25th in this ledger; biweekly or "
    "weekly pay cycles would need a different phase definition, though the "
    "recipe (phase to deposit window) transfers unchanged.",
    "Travel carries only seven debit rows, so its aligned delta is dominated "
    "by single splurges moving across the trough; read it as an upper bound "
    "on timing effects for rare large purchases rather than a habit effect.",
    "Daily closing balances are the sampling grid: intra day ordering "
    "between a moved debit and the deposit itself is not modeled beyond the "
    "row order rule.",
]


def aligned_dates_for_mask(
    dates: pd.Series,
    phase: np.ndarray,
    next_payday: np.ndarray,
    mask: np.ndarray,
) -> pd.Series:
    """Forward shift masked rows into the first week after the next deposit."""
    values = dates.to_numpy(dtype="datetime64[ns]", copy=True)
    movable = mask & (phase >= ALIGNED_PHASE_MAX + 1) & ~np.isnat(next_payday)
    target = pd.DatetimeIndex(next_payday[movable]).to_numpy(dtype="datetime64[ns]") + (
        phase[movable] % (ALIGNED_PHASE_MAX + 1)
    ).astype("timedelta64[D]")
    values[movable] = target
    return pd.Series(values, index=dates.index)


def anti_dates_for_mask(
    dates: pd.Series,
    next_payday: np.ndarray,
    mask: np.ndarray,
) -> pd.Series:
    """Move masked rows to the day before the next deposit (maximum misalignment)."""
    values = dates.to_numpy(dtype="datetime64[ns]", copy=True)
    movable = mask & ~np.isnat(next_payday)
    values[movable] = next_payday[movable] - np.timedelta64(1, "D")
    return pd.Series(values, index=dates.index)


def scenario_block(
    baseline: BalanceMetrics, scenario: BalanceMetrics, note: str
) -> dict[str, Any]:
    """Metrics plus deltas for one scenario against the observed baseline."""
    block: dict[str, Any] = {"numbers": scenario.numbers()}
    block.update(metric_deltas(baseline, scenario))
    block["note"] = note
    return block


def run_f4(ledger: Ledger, f1: dict[str, Any]) -> dict[str, Any]:
    """Compute finding F4 as a JSON ready dict."""
    phase, next_payday = phase_of_rows(ledger)
    classification = {
        str(detail["name"]): str(detail["classification"])
        for detail in f1["categories"]
    }
    baseline = simulate_balance(ledger)
    dates = ledger.frame["date"]

    rows: list[dict[str, Any]] = []
    for name in ledger.categories:
        row_mask = (ledger.frame["category"] == name).to_numpy() & (
            ledger.frame["amount_cents"] < 0
        ).to_numpy()
        aligned = simulate_balance(ledger, aligned_dates_for_mask(dates, phase, next_payday, row_mask))
        anti = simulate_balance(ledger, anti_dates_for_mask(dates, next_payday, row_mask))
        rows.append(
            {
                "name": name,
                "classification": classification.get(name, "discretionary"),
                "aligned": scenario_block(
                    baseline,
                    aligned,
                    "moved into the first week after the following deposit",
                ),
                "observed": scenario_block(
                    baseline,
                    baseline,
                    "the ledger as observed (left misaligned); deltas are zero "
                    "by construction and the benefit forgone equals the aligned "
                    "deltas",
                ),
                "antiAligned": scenario_block(
                    baseline,
                    anti,
                    "moved to the day before the next deposit (maximum "
                    "misalignment)",
                ),
            }
        )

    def drawdown_gain(row: dict[str, Any], key: str) -> int:
        return int(row[key]["drawdownImprovementCents"])

    best = max(rows, key=lambda row: drawdown_gain(row, "aligned"))
    best_anti = max(rows, key=lambda row: int(row["antiAligned"]["minMonthEndDeltaCents"]))
    total_drawdown_gain = sum(drawdown_gain(row, "aligned") for row in rows)

    return {
        "question": (
            "What does it cost to move a category's spending onto the income "
            "phase (the plane change cost)?"
        ),
        "definition": DEFINITION,
        "method": (
            "Rebuild the daily balance path for the 365 day ledger under each "
            "scenario from the same opening balance and identical amounts, "
            "sorted by (simulated date, original row order), then recompute "
            "peak, trough, drawdown (peak minus trough of daily closes) and "
            "all 12 month end closes. Deltas are scenario minus baseline, "
            "except drawdownImprovementCents, which is baseline minus scenario "
            "so a positive value always means a tighter drawdown."
        ),
        "numbers": {
            "baseline": baseline.numbers(),
            "baselineTroughDate": str(baseline.daily.idxmin().date()),
            "bestAlignedCategory": str(best["name"]),
            "bestAlignedDrawdownImprovementCents": int(
                best["aligned"]["drawdownImprovementCents"]
            ),
            "bestAlignedTroughLiftCents": int(best["aligned"]["troughDeltaCents"]),
            "sumOfAlignedDrawdownImprovementsCents": total_drawdown_gain,
            "antiAlignedFloorCategory": str(best_anti["name"]),
            "antiAlignedFloorLiftCents": int(
                best_anti["antiAligned"]["minMonthEndDeltaCents"]
            ),
        },
        "categories": rows,
        "limitations": list(LIMITATIONS),
        "chartTwin": {
            "bars": [
                {
                    "name": str(row["name"]),
                    "alignedDrawdownImprovementCents": int(
                        row["aligned"]["drawdownImprovementCents"]
                    ),
                    "alignedTroughDeltaCents": int(row["aligned"]["troughDeltaCents"]),
                    "alignedFloorDeltaCents": int(
                        row["aligned"]["minMonthEndDeltaCents"]
                    ),
                    "antiAlignedFloorDeltaCents": int(
                        row["antiAligned"]["minMonthEndDeltaCents"]
                    ),
                }
                for row in rows
            ],
            "monthlySeries": [
                {
                    "month": month,
                    "baselineCents": baseline.monthly_cents[index],
                    "alignedCents": int(best["aligned"]["numbers"]["monthlyCents"][index]),
                    "antiAlignedCents": int(best["antiAligned"]["numbers"]["monthlyCents"][index]),
                }
                for index, month in enumerate(ledger.month_labels)
            ],
            "monthlySeriesForCategory": str(best["name"]),
        },
    }


def phase_of_rows(ledger: Ledger) -> tuple[np.ndarray, np.ndarray]:
    """Per row pay cycle phase and next deposit (shared with F5)."""
    from scripts.analysis.ledger import phase_and_next_payday

    return phase_and_next_payday(ledger)


DEFINITION: str = (
    "For a given category, every debit with pay cycle phase p (days since the "
    "most recent payroll deposit, with a virtual deposit anchored at "
    "2025-10-25) of 7 or more is moved forward to (next payroll date) + "
    "(p mod 7) days, landing it in the first week after the following "
    "deposit; debits with phase 0 to 6 are already in the income window and "
    "do not move. The daily balance path is rebuilt from the same opening "
    "balance with identical amounts, and peak, trough, drawdown, and month "
    "end closes are recomputed over the 365 day ledger. The reverse "
    "direction is computed two ways: the observed ledger (left misaligned, "
    "delta zero by construction, benefit forgone equals the aligned delta) "
    "and an anti aligned stress case that moves every debit of the category "
    "to the day before the next deposit."
)
