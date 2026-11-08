import { runway, scaleCents, type RunwayAnswer } from './shocks'

/**
 * Phase E4 plan engine, the pure TypeScript mirror of the goal and
 * backup plan rules drafted in scripts/engine/plans.py. Integer cents
 * in, integer cents out: no float decides a month count, a cut, or a
 * verdict, so the number a judge hand checks matches the screen.
 *
 * The brief allows our own definitions as long as we can explain them
 * (docs/tangerine-challenge.md, "You can use your own definitions"), and
 * both plans are pure functions of metrics that already exist. This
 * module never applies a twist (that is src/lib/shocks.ts) and never
 * formats a sentence (that is src/lib/planText.ts): it returns the
 * numbers and the status word the E4 view renders.
 *
 * Goal plan (emergency fund):
 *   target       = 3 x typical spending S
 *   contribution = max(I minus S, 5 percent of I), the pay yourself
 *                  first floor when income does not exceed spending
 *   months       = ceil(target / contribution), or MONTHS_UNREACHABLE
 *                  when the contribution is 0 (the goal needs income)
 *   cut          = S minus I plus contribution when I <= S, the exact
 *                  monthly cut that turns the forced floor into a real
 *                  surplus; CUT_NOT_APPLICABLE when income is missing
 *
 * Backup plan (the shock landing): the shocked runway judged against a
 * stated horizon of 6 months, matching the brief's EI duration, with
 * the cut floor named as fixed costs F plus loan payment P: the bills
 * that cannot be cut away, so the plan never suggests skipping them.
 */

/** Months of typical spending the starter cushion targets. */
export const GOAL_TARGET_MONTHS = 3

/** Stretch cushion the milestone row offers beside the 3 month goal. */
export const GOAL_STRETCH_MONTHS = 6

/** Milestone cushions the plan card prints, in months of spending. */
export const GOAL_MILESTONE_MONTHS: readonly number[] = [1, 2, 3, 6]

/** Pay yourself first floor, a percent of I rounded half up. */
export const GOAL_CONTRIBUTION_FLOOR_PCT = 5

/** Horizon the backup plan judges the shocked runway against, in months. */
export const BACKUP_HORIZON_MONTHS = 6

/** Scenario label the backup verdict speaks about (the standard EI twist). */
export const BACKUP_SCENARIO_LABEL = 'job loss, EI at 55 percent for 6 months'

/** Sentinels matching scripts/engine/plans.py: JSON null never happens here. */
export const MONTHS_UNREACHABLE = -1
export const CUT_NOT_APPLICABLE = -1

/** The three words the plan card prints, ordered from best to worst. */
export type GoalStatus = 'on track' | 'cut needed' | 'needs income'

export interface GoalPlan {
  /** 3 x S in integer cents. */
  targetCents: number
  /** Monthly contribution in integer cents, the max of surplus and floor. */
  contributionCents: number
  /** Months to the target, or MONTHS_UNREACHABLE when contribution is 0. */
  months: number
  /** Exact monthly cut when I <= S, else 0, else CUT_NOT_APPLICABLE. */
  cutCents: number
  status: GoalStatus
}

/** Non finite cents read as 0 rather than poisoning a branch with NaN. */
function cents(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.trunc(value)
}

/**
 * Goal plan for one account, all integer cents. The arithmetic is the
 * exact integer form of the vectorized python twin: ceil division is
 * integer division of target plus contribution minus 1 by
 * contribution for positive operands, which the golden tests check
 * against hand computed fixture accounts.
 */
export function goalPlan(incomeCents: number, spendingCents: number): GoalPlan {
  const income = cents(incomeCents)
  const spending = cents(spendingCents)

  const targetCents = GOAL_TARGET_MONTHS * spending
  const floorCents = scaleCents(income, GOAL_CONTRIBUTION_FLOOR_PCT)
  const contributionCents = Math.max(income - spending, floorCents)

  if (contributionCents <= 0) {
    return {
      targetCents,
      contributionCents,
      months: MONTHS_UNREACHABLE,
      cutCents: CUT_NOT_APPLICABLE,
      status: 'needs income',
    }
  }

  const months = Math.floor((targetCents + contributionCents - 1) / contributionCents)
  const needsCut = income <= spending
  const cutCents = needsCut ? spending - income + contributionCents : 0

  return {
    targetCents,
    contributionCents,
    months,
    cutCents,
    status: cutCents > 0 ? 'cut needed' : 'on track',
  }
}

/** One cushion milestone on the goal row of the plan card. */
export interface GoalMilestone {
  /** This milestone in months of typical spending (1, 2, 3, or 6). */
  monthsOfSpending: number
  /** monthsOfSpending x S in integer cents. */
  amountCents: number
  /** New savings months to reach it, or MONTHS_UNREACHABLE. */
  monthsToReach: number
  /** True on the 3 month starter cushion goal itself. */
  isGoal: boolean
  /** True on the 6 month stretch cushion. */
  isStretch: boolean
}

/**
 * The milestone cushions for one account, all integer cents. Months to
 * reach each milestone reuse the goalPlan contribution rule (the max of
 * surplus and the 5 percent floor) and the same ceil division, so the
 * 3 month chip's monthsToReach always equals goalPlan(...).months and
 * every count still starts from zero new savings (E2 invariant).
 */
export function goalMilestones(incomeCents: number, spendingCents: number): GoalMilestone[] {
  const income = cents(incomeCents)
  const spending = cents(spendingCents)
  const floorCents = scaleCents(income, GOAL_CONTRIBUTION_FLOOR_PCT)
  const contributionCents = Math.max(income - spending, floorCents)

  return GOAL_MILESTONE_MONTHS.map((monthsOfSpending) => {
    const amountCents = monthsOfSpending * spending
    const monthsToReach =
      contributionCents <= 0
        ? MONTHS_UNREACHABLE
        : Math.floor((amountCents + contributionCents - 1) / contributionCents)
    return {
      monthsOfSpending,
      amountCents,
      monthsToReach,
      isGoal: monthsOfSpending === GOAL_TARGET_MONTHS,
      isStretch: monthsOfSpending === GOAL_STRETCH_MONTHS,
    }
  })
}

export interface BackupPlanInput {
  /** F, typical fixed costs in integer cents (display only in the runway). */
  fixedCostsCents: number
  /** P, the running loan payment in integer cents, 0 when no loan runs. */
  loanPaymentCents: number
  /** The shocked runway state, straight from applyTwist or the artifact. */
  runwayState: 'finite' | 'no_shortfall' | 'buffer_depleted'
  /** The shocked runway in tenths of a month, matching the state. */
  runwayDeciMonths: number
  /** Horizon in months; defaults to the 6 month EI duration. */
  horizonMonths?: number
}

export interface BackupPlan {
  /** F plus P: what cannot be cut, the floor no lever may go under. */
  cutFloorCents: number
  /** Horizon converted to tenths, for one comparison with the runway. */
  horizonDeciMonths: number
  /** True when the shocked runway clears the horizon (or has no gap). */
  survives: boolean
  /** How far the runway falls short of the horizon, in tenths (0 when clear). */
  shortfallDeciMonths: number
}

/**
 * Backup plan verdict: runway versus horizon plus the named cut floor.
 * The branch order mirrors scripts/engine/plans.py backup_plans: no
 * shortfall always survives, a finite runway survives at or beyond the
 * horizon, and a depleted buffer is always a full horizon short. The
 * caller passes the shocked runway answer from src/lib/shocks.ts, so
 * this function stays a pure comparison and never re-derives a runway.
 */
export function backupPlan(input: BackupPlanInput): BackupPlan {
  const fixed = cents(input.fixedCostsCents)
  const loan = cents(input.loanPaymentCents)
  const horizonMonths =
    input.horizonMonths === undefined || !Number.isFinite(input.horizonMonths)
      ? BACKUP_HORIZON_MONTHS
      : Math.max(0, Math.trunc(input.horizonMonths))
  const horizonDeciMonths = horizonMonths * 10

  const deci = Number.isFinite(input.runwayDeciMonths)
    ? Math.max(0, Math.trunc(input.runwayDeciMonths))
    : 0

  let survives: boolean
  let shortfallDeciMonths: number
  if (input.runwayState === 'no_shortfall') {
    survives = true
    shortfallDeciMonths = 0
  } else if (input.runwayState === 'buffer_depleted') {
    survives = false
    shortfallDeciMonths = horizonDeciMonths
  } else if (deci >= horizonDeciMonths) {
    survives = true
    shortfallDeciMonths = 0
  } else {
    survives = false
    shortfallDeciMonths = horizonDeciMonths - deci
  }

  return {
    cutFloorCents: fixed + loan,
    horizonDeciMonths,
    survives,
    shortfallDeciMonths,
  }
}

/**
 * Backup levers (E4): an ordered, cumulative ladder of counterfactual
 * cuts, each one sized from profile numbers (judge part 1 metrics), never
 * from shocked ones. The three levers run free moves first: shop
 * insurance, trim discretionary spending above the F plus P floor, then
 * defer the loan payment. Every lever keeps income and the buffer
 * untouched, so a step only ever reduces spending, and every +N months
 * figure is the difference of two shocks.runway answers (this module
 * never re-derives a runway any other way).
 */
export type LeverId = 'shop_insurance' | 'trim_discretionary' | 'defer_loan'

export interface LeverEffect {
  /** E4 levers never move income, so this is always 0 cents. */
  incomeDeltaCents: number
  /** Spending change in integer cents, never positive. */
  spendingDeltaCents: number
  /** E4 levers never touch the buffer, so this is always 0 cents. */
  bufferDeltaCents: number
}

export interface Lever {
  id: LeverId
  /** Row label the plan card prints. */
  label: string
  /** Honest counterfactual disclaimer printed under the ladder. */
  caveat: string
  effect: LeverEffect
}

export interface LeverInputs {
  /** Income after the twist, straight from applyTwist. */
  shockedIncomeCents: number
  /** Spending after the twist (bills bump plus extra cost), one off out. */
  shockedSpendingCents: number
  /** One off cost already subtracted from the buffer by the twist. */
  oneOffCents: number
  /** profile.buffer_cents before the one off cost, the runway's B. */
  bufferCents: number
  /** F, typical fixed costs in integer cents (profile metric). */
  fixedCostsCents: number
  /** P, the running loan payment in integer cents (profile metric). */
  loanPaymentCents: number
  /** Median insurance cost in integer cents (profile metric, 0 when none). */
  insuranceCents: number
  /** S, typical monthly spending in integer cents (profile metric). */
  typicalSpendingCents: number
}

export interface LeverStep {
  lever: Lever
  /** Shocked income plus the lever income delta (always shocked income). */
  incomeAfterCents: number
  /** Shocked spending plus every delta so far, floored at 0. */
  spendingAfterCents: number
  /** B minus the one off cost, unchanged by any E4 lever. */
  bufferLeftCents: number
  /** shocks.runway re run over this step's numbers. */
  runwayAfter: RunwayAnswer
  /** Runway gain versus the baseline in tenths, never negative. */
  plusDeciMonths: number
  /** Runway gain versus the previous step in tenths, never negative. */
  stepDeciMonths: number
}

export interface LeverLadder {
  /** The shocked runway before any lever, equal to result.runway. */
  baseline: RunwayAnswer
  /** Available levers in ladder order, applied cumulatively. */
  steps: LeverStep[]
}

const SHOP_INSURANCE_CAVEAT =
  'simulated counterfactual: premiums re-shopped, upper bound of renegotiation'
const TRIM_DISCRETIONARY_CAVEAT =
  'simulated counterfactual: all discretionary spending above the fixed cost floor trimmed'
const DEFER_LOAN_CAVEAT =
  'simulated counterfactual: hardship deferral, the payment resumes later and interest cost is not modeled'

/**
 * Build the lever ladder for one shocked account. Levers appear in
 * ladder order (insurance, discretionary trim, loan deferral) only when
 * their profile input allows them, spending is recomputed with a
 * defensive floor of 0 after each cumulative delta, and each step re
 * runs shocks.runway over the same buffer, one off cost, and income.
 */
export function leverLadder(input: LeverInputs): LeverLadder {
  const income = cents(input.shockedIncomeCents)
  const shockedSpending = cents(input.shockedSpendingCents)
  const oneOff = cents(input.oneOffCents)
  const buffer = cents(input.bufferCents)
  const fixed = cents(input.fixedCostsCents)
  const loan = cents(input.loanPaymentCents)
  const insurance = cents(input.insuranceCents)
  const typical = cents(input.typicalSpendingCents)

  const baseline = runway(buffer, oneOff, income, shockedSpending)
  const discretionaryCents = Math.max(0, typical - (fixed + loan))

  const available: Lever[] = []
  if (insurance > 0) {
    available.push({
      id: 'shop_insurance',
      label: 'Shop insurance',
      caveat: SHOP_INSURANCE_CAVEAT,
      effect: { incomeDeltaCents: 0, spendingDeltaCents: -insurance, bufferDeltaCents: 0 },
    })
  }
  if (discretionaryCents > 0) {
    available.push({
      id: 'trim_discretionary',
      label: 'Trim discretionary',
      caveat: TRIM_DISCRETIONARY_CAVEAT,
      effect: { incomeDeltaCents: 0, spendingDeltaCents: -discretionaryCents, bufferDeltaCents: 0 },
    })
  }
  if (loan > 0) {
    available.push({
      id: 'defer_loan',
      label: 'Defer loan',
      caveat: DEFER_LOAN_CAVEAT,
      effect: { incomeDeltaCents: 0, spendingDeltaCents: -loan, bufferDeltaCents: 0 },
    })
  }

  const steps: LeverStep[] = []
  let spendingAfterCents = shockedSpending
  let previous = baseline
  for (const lever of available) {
    spendingAfterCents = Math.max(0, spendingAfterCents + lever.effect.spendingDeltaCents)
    const runwayAfter = runway(buffer, oneOff, income, spendingAfterCents)
    steps.push({
      lever,
      incomeAfterCents: income,
      spendingAfterCents,
      bufferLeftCents: buffer - oneOff,
      runwayAfter,
      plusDeciMonths: runwayAfter.deciMonths - baseline.deciMonths,
      stepDeciMonths: runwayAfter.deciMonths - previous.deciMonths,
    })
    previous = runwayAfter
  }

  return { baseline, steps }
}
