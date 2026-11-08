"""Goal plan, backup plan, and backup levers: the engine's own definitions.

Phase E4 finished this module as a test side twin of src/lib/planMath.ts:
it is asserted by scripts/engine/test_plans.py against the frozen
scripts/engine/golden_plans.json, and nothing in the E1 build or the
verify gate imports it (no build/verify coupling, user confirmed
decision in docs/decisions.md). Every plan rule change now needs a
TypeScript edit and a Python edit, with a missed edit failing pytest.

The brief allows our own definitions as long as we can explain them. Both
plans are pure functions of the judge metrics, computed in integer cents:

Goal plan (emergency fund):
* target = 3 times typical spending S (three months of runway money)
* monthly contribution = max(I minus S, 5 percent of I), the pay yourself first
  floor when income does not exceed spending
* months to goal = ceil(target / contribution)
* when I <= S the plan also states the exact monthly cut needed to make the
  goal reachable: cut = S minus I plus contribution, the amount that turns the
  forced floor into a real surplus. When contribution is 0 (no income) the
  plan reports the goal as unreachable until income starts.
* goal_milestones adds the 1, 2, 3, and 6 month cushion chips with
  months_to_reach counted from zero new savings (the E2 invariant).

Backup plan:
* runway under the standard EI twist (job loss, EI at 55 percent) judged
  against a stated horizon of 6 months, matching the brief's EI duration
* the cut floor is fixed costs F plus loan payment P: those are the bills
  that cannot be cut away, named so the plan never suggests skipping them

Backup levers (lever_ladder):
* an ordered cumulative ladder, free moves first: shop_insurance, then
  trim_discretionary (spending above the F plus P floor), then defer_loan
* every lever is sized from profile metrics, keeps income and the buffer
  untouched, and re runs the shocks.runway formula for its +N months, so
  each gain is the difference of two runway answers

Run from the repository root:

    uv run pytest scripts/engine/test_plans.py
"""

from __future__ import annotations

import numpy as np

from scripts.engine.shocks import runway, scale_cents

GOAL_TARGET_MONTHS: int = 3
GOAL_STRETCH_MONTHS: int = 6
GOAL_CONTRIBUTION_FLOOR_PCT: int = 5
BACKUP_HORIZON_MONTHS: int = 6
BACKUP_SCENARIO_LABEL: str = "job loss, EI at 55 percent for 6 months"

# Milestone cushions in months of spending, matching planMath.ts.
GOAL_MILESTONE_MONTHS: tuple[int, ...] = (1, 2, 3, 6)

# Ladder order, free moves first (user confirmed decision).
LEVER_ORDER: tuple[str, ...] = ("shop_insurance", "trim_discretionary", "defer_loan")

LEVER_LABELS: dict[str, str] = {
    "shop_insurance": "Shop insurance",
    "trim_discretionary": "Trim discretionary",
    "defer_loan": "Defer loan",
}

LEVER_CAVEATS: dict[str, str] = {
    "shop_insurance": (
        "simulated counterfactual: premiums re-shopped, upper bound of renegotiation"
    ),
    "trim_discretionary": (
        "simulated counterfactual: all discretionary spending above the fixed "
        "cost floor trimmed"
    ),
    "defer_loan": (
        "simulated counterfactual: hardship deferral, the payment resumes later "
        "and interest cost is not modeled"
    ),
}

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
    floor = np.asarray(scale_cents(income, GOAL_CONTRIBUTION_FLOOR_PCT), dtype="int64")
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


def goal_milestones(income_cents: int, spending_cents: int) -> list[dict[str, int | bool]]:
    """Cushion milestones for one account, mirroring goalMilestones.

    Rows follow GOAL_MILESTONE_MONTHS (1, 2, 3, and 6 months of
    spending). months_to_reach counts new savings from zero using the
    same contribution rule and ceil division as goal_plans, so the 3
    month chip always equals the goal_plans month count for the same
    account (the E2 invariant), and reports MONTHS_UNREACHABLE when the
    contribution is 0.
    """
    income = int(income_cents)
    spending = int(spending_cents)
    floor = int(scale_cents(income, GOAL_CONTRIBUTION_FLOOR_PCT))
    contribution = max(income - spending, floor)

    milestones: list[dict[str, int | bool]] = []
    for months_of_spending in GOAL_MILESTONE_MONTHS:
        amount_cents = months_of_spending * spending
        if contribution <= 0:
            months_to_reach = MONTHS_UNREACHABLE
        else:
            months_to_reach = (amount_cents + contribution - 1) // contribution
        milestones.append(
            {
                "months_of_spending": months_of_spending,
                "amount_cents": amount_cents,
                "months_to_reach": months_to_reach,
                "is_goal": months_of_spending == GOAL_TARGET_MONTHS,
                "is_stretch": months_of_spending == GOAL_STRETCH_MONTHS,
            }
        )
    return milestones


def lever_ladder(
    shocked_income_cents: int,
    shocked_spending_cents: int,
    one_off_cents: int,
    buffer_cents: int,
    fixed_costs_cents: int,
    loan_payment_cents: int,
    insurance_cents: int,
    typical_spending_cents: int,
) -> dict[str, object]:
    """Cumulative lever ladder for one shocked account, scalar only.

    Mirrors leverLadder in src/lib/planMath.ts: levers appear in
    LEVER_ORDER (insurance, discretionary trim, loan deferral) only when
    their profile input allows them, spending keeps a defensive floor of
    0 after each cumulative delta, and every step re runs shocks.runway
    over the same buffer, one off cost, and income. plus_deci_months and
    step_deci_months are differences of two runway answers, never a
    formula of their own.
    """
    income = int(shocked_income_cents)
    shocked_spending = int(shocked_spending_cents)
    one_off = int(one_off_cents)
    buffer = int(buffer_cents)
    fixed = int(fixed_costs_cents)
    loan = int(loan_payment_cents)
    insurance = int(insurance_cents)
    typical = int(typical_spending_cents)

    baseline = runway(buffer, one_off, income, shocked_spending)
    discretionary_cents = max(0, typical - (fixed + loan))

    available_effects: dict[str, int] = {}
    if insurance > 0:
        available_effects["shop_insurance"] = -insurance
    if discretionary_cents > 0:
        available_effects["trim_discretionary"] = -discretionary_cents
    if loan > 0:
        available_effects["defer_loan"] = -loan
    available = [
        (lever_id, available_effects[lever_id])
        for lever_id in LEVER_ORDER
        if lever_id in available_effects
    ]

    steps: list[dict[str, object]] = []
    spending_after_cents = shocked_spending
    previous = baseline
    for lever_id, spending_delta_cents in available:
        spending_after_cents = max(0, spending_after_cents + spending_delta_cents)
        runway_after = runway(buffer, one_off, income, spending_after_cents)
        steps.append(
            {
                "id": lever_id,
                "label": LEVER_LABELS[lever_id],
                "caveat": LEVER_CAVEATS[lever_id],
                "spending_delta_cents": spending_delta_cents,
                "income_after_cents": income,
                "spending_after_cents": spending_after_cents,
                "buffer_left_cents": buffer - one_off,
                "state": runway_after.state,
                "deci_months": runway_after.deci_months,
                "plus_deci_months": runway_after.deci_months - baseline.deci_months,
                "step_deci_months": runway_after.deci_months - previous.deci_months,
            }
        )
        previous = runway_after

    return {
        "baseline_state": baseline.state,
        "baseline_deci_months": baseline.deci_months,
        "steps": steps,
    }
