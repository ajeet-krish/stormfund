import { scaleCents } from './shocks'

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
 * (target + contribution - 1) // contribution for positive operands,
 * which the golden tests check against hand computed fixture accounts.
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
