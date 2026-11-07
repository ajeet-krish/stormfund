"""Goal plan and backup plan, the engine's own definitions.

DEFERRED TO PHASE E4: the E1 profile precompute does not use this
module. The draft below stays importable and tested by nothing yet so
Phase E4 can finish it against the profiles.json contract in
docs/profiles-schema.md; the E1 build writes goal and backup plans
nowhere.

The brief allows our own definitions as long as we can explain them. Both
plans are pure functions of the judge metrics, computed in integer cents:

Goal plan (emergency fund):
* target = 3 times typical spending S (three months of runway money)
* monthly contribution = max(I - S, 5 percent of I), the pay yourself first
  floor when income does not exceed spending
* months to goal = ceil(target / contribution)
* when I <= S the plan also states the exact monthly cut needed to make the
  goal reachable: cut = S - I + contribution, the amount that turns the
  forced floor into a real surplus. When contribution is 0 (no income) the
  plan reports the goal as unreachable until income starts.

Backup plan:
* runway under the standard EI twist (job loss, EI at 55 percent) judged
  against a stated horizon of 6 months, matching the brief's EI duration
* the cut floor is fixed costs F plus loan payment P: those are the bills
  that cannot be cut away, named so the plan never suggests skipping them

Run from the repository root:

    uv run python -m scripts.engine.build
"""

from __future__ import annotations

import numpy as np

from scripts.engine.shocks import scale_cents

GOAL_TARGET_MONTHS: int = 3
GOAL_CONTRIBUTION_FLOOR_PCT: int = 5
BACKUP_HORIZON_MONTHS: int = 6
BACKUP_SCENARIO_LABEL: str = "job loss, EI at 55 percent for 6 months"

# Sentinel arrays use these for values that publish as JSON null: a goal
# with no contribution has no month count and no cut (it needs income).
MONTHS_UNREACHABLE: int = -1
CUT_NOT_APPLICABLE: int = -1


def goal_plans(
    income_cents: int | np.ndarray, spending_cents: int | np.ndarray
) -> dict[str, np.ndarray]:
    """Vectorized goal plans for every account at once.

    Returns target, contribution, months (or MONTHS_UNREACHABLE), and
    monthly cut (0 when no cut is needed, CUT_NOT_APPLICABLE when the goal
    needs income first), all integer cents except the month counts.
    """
    income = np.asarray(income_cents, dtype="int64")
    spending = np.asarray(spending_cents, dtype="int64")
    target = np.int64(GOAL_TARGET_MONTHS) * spending
    floor = np.asarray(
        scale_cents(income, GOAL_CONTRIBUTION_FLOOR_PCT, 100), dtype="int64"
    )
    contribution = np.maximum(income - spending, floor)

    months = np.full(income.shape, MONTHS_UNREACHABLE, dtype="int64")
    funded = contribution > 0
    months[funded] = (
        target[funded] + contribution[funded] - np.int64(1)
    ) // contribution[funded]

    cut = np.zeros(income.shape, dtype="int64")
    needs_cut = (income <= spending) & funded
    cut[needs_cut] = spending[needs_cut] - income[needs_cut] + contribution[needs_cut]
    cut[~funded] = CUT_NOT_APPLICABLE

    return {
        "target": target,
        "contribution": contribution,
        "months": months,
        "cut": cut,
    }


def goal_status(
    income_cents: int | np.ndarray,
    contribution: int | np.ndarray,
    cut: int | np.ndarray,
) -> np.ndarray:
    """Status string per account: needs income, cut needed, or on track."""
    income = np.asarray(income_cents, dtype="int64")
    contribution_array = np.asarray(contribution, dtype="int64")
    cut_array = np.asarray(cut, dtype="int64")
    status = np.full(income.shape, "on track", dtype=object)
    needs_cut = cut_array > 0
    status[needs_cut] = "cut needed"
    status[contribution_array <= 0] = "needs income"
    return status


def backup_plans(
    fixed_cents: int | np.ndarray,
    loan_cents: int | np.ndarray,
    state: np.ndarray,
    tenths: np.ndarray,
    horizon_months: int = BACKUP_HORIZON_MONTHS,
) -> dict[str, np.ndarray]:
    """Vectorized backup plans: horizon verdict plus the named cut floor.

    survives = no shortfall, or numeric runway at or beyond the horizon.
    shortfall_tenths is how far the runway falls under the horizon (0 when
    it clears), and cut_floor = F + P names what cannot be cut.
    """
    fixed = np.asarray(fixed_cents, dtype="int64")
    loan = np.asarray(loan_cents, dtype="int64")
    horizon_tenths = np.int64(horizon_months * 10)
    state_array = np.asarray(state, dtype=np.int8)
    tenths_array = np.asarray(tenths, dtype="int64")

    survives = (state_array == 1) | ((state_array == 2) & (tenths_array >= horizon_tenths))
    shortfall = np.zeros(state_array.shape, dtype="int64")
    zero_buffer = state_array == 0
    short_numeric = (state_array == 2) & (tenths_array < horizon_tenths)
    shortfall[zero_buffer] = horizon_tenths
    shortfall[short_numeric] = horizon_tenths - tenths_array[short_numeric]

    return {
        "cutFloor": fixed + loan,
        "survives": survives,
        "shortfallTenths": shortfall,
    }
