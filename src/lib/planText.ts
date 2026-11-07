import type { AccountProfile } from '../data/profiles'
import { formatCents, formatDeciMonths } from './format'
import type { ShockResult, Twist } from './shocks'
import type { VerdictBand } from './verdict'

/**
 * Goal and backup plan text for one account under one twist: plain
 * sentences built from the same integer cents the verdict reads, so the
 * card a judge quotes matches the numbers on screen to the cent. All
 * arithmetic happens here (never in a component), and the templates stay
 * honest and simple in Phase E2: a starter cushion goal, a surplus or
 * deficit statement, then the baseline versus shocked runway, the shocked
 * monthly gap, and the horizon check. The backup levers with +N month
 * effects are Phase E4 (docs/architecture.md).
 */

export interface PlanText {
  /** Goal block: build the emergency fund from this account's own numbers. */
  goal: string[]
  /** Backup block: what the shock does and whether the buffer rides it out. */
  backup: string[]
}

/** Months of typical spending the starter cushion targets. */
export const CUSHION_MONTHS = 3

/**
 * Build the two plan blocks for one profile under one twist.
 *
 * profile supplies the baseline (I, S, B and the recorded runway),
 * result supplies the shocked numbers, twist supplies the display only
 * horizon, and band names the shocked verdict inside the backup line so
 * the sentence and the badge cannot disagree.
 */
export function buildPlanText(
  profile: AccountProfile,
  result: ShockResult,
  twist: Twist,
  band: VerdictBand,
): PlanText {
  const cushionCents = profile.spending_cents * CUSHION_MONTHS
  const surplusCents = profile.income_cents - profile.spending_cents

  const goal: string[] = [
    `Starter cushion: ${formatCents(cushionCents)} (${CUSHION_MONTHS} months of typical spending).`,
    surplusCents >= 0
      ? `Monthly surplus: ${formatCents(surplusCents)} (income minus spending).`
      : `Monthly deficit: ${formatCents(-surplusCents)} (spending exceeds income).`,
  ]

  if (surplusCents > 0) {
    const months = Math.max(1, Math.ceil(cushionCents / surplusCents))
    goal.push(
      `Setting aside ${formatCents(surplusCents)} a month builds the cushion in about ${months} months.`,
    )
  } else {
    goal.push('A monthly deficit means the cushion goal waits for income or spending to move.')
  }

  const baselineRunway = formatDeciMonths(profile.runway_deci_months, profile.runway_state)
  const shockedRunway = formatDeciMonths(result.runway.deciMonths, result.runway.state)

  const backup: string[] = [
    `Baseline steady state: ${baselineRunway}. Shocked steady state: ${shockedRunway} (${band.label}).`,
    result.gapAfterCents > 0
      ? `Monthly shortfall after the shock: ${formatCents(result.gapAfterCents)}.`
      : 'No monthly shortfall after the shock.',
  ]

  if (twist.durationMonths > 0) {
    const covers =
      result.runway.state === 'no_shortfall' ||
      result.runway.deciMonths >= twist.durationMonths * 10
    backup.push(
      covers
        ? `The shocked runway covers the ${twist.durationMonths} month horizon.`
        : `The shocked runway runs out before the ${twist.durationMonths} month horizon ends.`,
    )
  }

  return { goal, backup }
}
