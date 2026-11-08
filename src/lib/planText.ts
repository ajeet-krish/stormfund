import type { AccountProfile } from '../data/profiles'
import { formatCents, formatDeciMonths } from './format'
import {
  BACKUP_HORIZON_MONTHS,
  GOAL_CONTRIBUTION_FLOOR_PCT,
  GOAL_STRETCH_MONTHS,
  GOAL_TARGET_MONTHS,
  MONTHS_UNREACHABLE,
  backupPlan,
  goalMilestones,
  goalPlan,
  leverLadder,
  type GoalPlan,
  type LeverId,
} from './planMath'
import { roundHalfUp, type RunwayAnswer, type ShockResult, type Twist } from './shocks'
import type { VerdictBand } from './verdict'

/**
 * Goal, backup, lever, and definition text for one account under one
 * twist: plain sentences built from the same integer cents the verdict
 * reads, so the card a judge quotes matches the numbers on screen to
 * the cent. All arithmetic happens here (never in a component), and
 * every month count delegates to src/lib/planMath: the goal story and
 * the chips come from goalPlan and goalMilestones, and every lever row
 * comes from leverLadder, whose +N months are differences of two
 * shocks.runway answers. The component renders these strings only.
 *
 * Phase E4 string churn (approved in the phase brief): the old deficit
 * goal line is replaced by the cut story from goalPlan, and three new
 * fields appear on PlanText (goalChips, levers, definitions).
 */

/** One cushion chip on the goal row of the plan card. */
export interface GoalChip {
  /** Chip caption, for example "3 months of spending". */
  label: string
  /** The cushion size in integer cents. */
  amountCents: number
  /** New savings months to reach it, or MONTHS_UNREACHABLE. */
  monthsToReach: number
  /** Which role the chip plays in the milestone row. */
  highlight: 'goal' | 'stretch' | 'plain'
}

/** One lever row of the backup ladder, all values pre formatted. */
export interface LeverRow {
  id: LeverId
  label: string
  caveat: string
  /** Monthly spending effect in integer cents, never positive. */
  effectCents: number
  /** The step's runway, already formatted (for example "4.7 months"). */
  runwayAfter: string
  /** The +N cell text, already formatted with its special cases. */
  plusLabel: string
  /** Raw gain versus the baseline in tenths of a month. */
  plusDeciMonths: number
  /** Raw gain versus the previous step in tenths of a month. */
  stepDeciMonths: number
}

export interface PlanText {
  /** Goal block: build the emergency fund from this account's own numbers. */
  goal: string[]
  /** Backup block: what the shock does and whether the buffer rides it out. */
  backup: string[]
  /** Milestone chips: 1, 2, 3, and 6 months of spending with reach months. */
  goalChips: GoalChip[]
  /** Available backup levers in ladder order, one row per step. */
  levers: LeverRow[]
  /** The five definition lines printed under the plan. */
  definitions: string[]
}

/** Months of typical spending the starter cushion targets. */
export const CUSHION_MONTHS = GOAL_TARGET_MONTHS

/**
 * Format one chip's reach: the sentinel reads as the goal plan's own
 * "needs income" story, otherwise the count of new savings months.
 */
export function formatMonthsToReach(monthsToReach: number): string {
  if (monthsToReach === MONTHS_UNREACHABLE) {
    return 'needs income'
  }
  const noun = monthsToReach === 1 ? 'month' : 'months'
  return `${monthsToReach} ${noun} of new savings`
}

/** Chip caption for one milestone in months of spending. */
function milestoneLabel(monthsOfSpending: number): string {
  const noun = monthsOfSpending === 1 ? 'month' : 'months'
  return `${monthsOfSpending} ${noun} of spending`
}

/**
 * The +N cell for one lever step, by the approved display rules: two
 * finite runways print the gain in months, a finite baseline that the
 * step clears reads as clearing the shortfall, and a depleted baseline
 * always reads as zero with the restore first note (no gain is real
 * until the buffer holds a positive balance again).
 */
function plusLabel(baseline: RunwayAnswer, after: RunwayAnswer, plusDeciMonths: number): string {
  if (baseline.state === 'buffer_depleted') {
    return '+0.0 months (buffer depleted: restore a positive balance first)'
  }
  if (baseline.state === 'finite' && after.state === 'no_shortfall') {
    return 'clears the shortfall (120+ months)'
  }
  return `+${(plusDeciMonths / 10).toFixed(1)} months`
}

/** Savings on hand in tenths of a month of spending, floored at 0. */
function savingsMonthsDeci(bufferCents: number, spendingCents: number): number {
  if (spendingCents <= 0) {
    return 0
  }
  return Math.max(0, roundHalfUp(10 * bufferCents, spendingCents))
}

/** The goal plan's own story line, replacing the old deficit sentence. */
function goalStoryLine(goal: GoalPlan): string {
  if (goal.status === 'needs income') {
    return 'The cushion goal needs income before months can be counted.'
  }
  if (goal.status === 'cut needed') {
    return `A monthly cut of ${formatCents(goal.cutCents)} for ${goal.months} months makes the cushion reachable.`
  }
  return `Setting aside ${formatCents(goal.contributionCents)} a month builds the cushion in about ${goal.months} months.`
}

/**
 * Build the plan text for one profile under one twist.
 *
 * profile supplies the baseline (I, S, B, F, P, insurance), result
 * supplies the shocked numbers, twist supplies the display only
 * horizon, and band names the shocked verdict inside the backup line so
 * the sentence and the badge cannot disagree.
 */
export function buildPlanText(
  profile: AccountProfile,
  result: ShockResult,
  twist: Twist,
  band: VerdictBand,
): PlanText {
  const goal = goalPlan(profile.income_cents, profile.spending_cents)
  const milestones = goalMilestones(profile.income_cents, profile.spending_cents)
  const surplusCents = profile.income_cents - profile.spending_cents

  const goalLines: string[] = [
    `Starter cushion: ${formatCents(goal.targetCents)} (${GOAL_TARGET_MONTHS} months of typical spending).`,
    surplusCents >= 0
      ? `Monthly surplus: ${formatCents(surplusCents)} (income minus spending).`
      : `Monthly deficit: ${formatCents(-surplusCents)} (spending exceeds income).`,
    goalStoryLine(goal),
  ]

  const baselineRunway = formatDeciMonths(profile.runway_deci_months, profile.runway_state)
  const shockedRunway = formatDeciMonths(result.runway.deciMonths, result.runway.state)

  const backupLines: string[] = [
    `Baseline steady state: ${baselineRunway}. Shocked steady state: ${shockedRunway} (${band.label}).`,
    result.gapAfterCents > 0
      ? `Monthly shortfall after the shock: ${formatCents(result.gapAfterCents)}.`
      : 'No monthly shortfall after the shock.',
  ]

  if (twist.durationMonths > 0) {
    const covers =
      result.runway.state === 'no_shortfall' ||
      result.runway.deciMonths >= twist.durationMonths * 10
    backupLines.push(
      covers
        ? `The shocked runway covers the ${twist.durationMonths} month horizon.`
        : `The shocked runway runs out before the ${twist.durationMonths} month horizon ends.`,
    )
  }

  const goalChips: GoalChip[] = milestones.map((milestone) => ({
    label: milestoneLabel(milestone.monthsOfSpending),
    amountCents: milestone.amountCents,
    monthsToReach: milestone.monthsToReach,
    highlight: milestone.isGoal ? 'goal' : milestone.isStretch ? 'stretch' : 'plain',
  }))

  const ladder = leverLadder({
    shockedIncomeCents: result.incomeAfterCents,
    shockedSpendingCents: result.spendingAfterCents,
    oneOffCents: result.oneOffCents,
    bufferCents: profile.buffer_cents,
    fixedCostsCents: profile.fixed_costs_cents,
    loanPaymentCents: profile.loan_payment_cents,
    insuranceCents: profile.insurance_cents,
    typicalSpendingCents: profile.spending_cents,
  })
  const levers: LeverRow[] = ladder.steps.map((step) => ({
    id: step.lever.id,
    label: step.lever.label,
    caveat: step.lever.caveat,
    effectCents: step.lever.effect.spendingDeltaCents,
    runwayAfter: formatDeciMonths(step.runwayAfter.deciMonths, step.runwayAfter.state),
    plusLabel: plusLabel(ladder.baseline, step.runwayAfter, step.plusDeciMonths),
    plusDeciMonths: step.plusDeciMonths,
    stepDeciMonths: step.stepDeciMonths,
  }))

  const backupVerdict = backupPlan({
    fixedCostsCents: profile.fixed_costs_cents,
    loanPaymentCents: profile.loan_payment_cents,
    runwayState: result.runway.state,
    runwayDeciMonths: result.runway.deciMonths,
  })
  const savingsDeci = savingsMonthsDeci(profile.buffer_cents, profile.spending_cents)
  const definitions: string[] = [
    `Starter cushion: ${GOAL_TARGET_MONTHS} times typical spending, ${formatCents(goal.targetCents)}. Stretch target: ${GOAL_STRETCH_MONTHS} times typical spending, ${formatCents(GOAL_STRETCH_MONTHS * profile.spending_cents)}.`,
    `Monthly contribution: the larger of income minus spending and ${GOAL_CONTRIBUTION_FLOOR_PCT} percent of income, ${formatCents(goal.contributionCents)}.`,
    `Months to the target count new contributions from zero. Savings on hand: ${formatCents(profile.buffer_cents)} (${formatDeciMonths(savingsDeci, 'finite')} of spending), not counted in the months above.`,
    `Backup horizon: ${BACKUP_HORIZON_MONTHS} months, matching the EI twist duration.`,
    `The cut floor is fixed costs plus loan payment, ${formatCents(backupVerdict.cutFloorCents)}; the labeled levers may go under it on purpose.`,
  ]

  return {
    goal: goalLines,
    backup: backupLines,
    goalChips,
    levers,
    definitions,
  }
}
