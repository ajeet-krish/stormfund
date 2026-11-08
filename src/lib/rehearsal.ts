import { presetById, type PresetId } from './shockPresets'
import type { GuardFlagId } from './judgeMode'

/**
 * Phase E6 rehearsal: the five step timed dry run a judge walks before
 * the booth opens (docs/decisions.md, Phase E6). Each step names one
 * golden fixture account, the twist card to play, the guard flags the
 * edge guard must print for that account under that twist, and the
 * script line the operator says aloud. The flags are asserted against
 * the shipped profiles.json by the test, so a pipeline change that
 * moves an account's flags fails here instead of at the booth.
 *
 * The stopwatch target is two seconds per step: fast under the target,
 * ok under twice it, slow otherwise. The printed script ships in the
 * paper sheet either way (public/judge-sheet.html), and the in app
 * dock is the named cut line if time runs short.
 */

/** One rehearsal step: fixture account, card, expected guard, script. */
export interface RehearsalStep {
  /** Stable id for React keys. */
  id: string
  /** Golden fixture account this step opens. */
  accountId: string
  /** The twist card to play on that account. */
  presetId: PresetId
  /** Guard flag ids this step must print, in GUARD_FLAG_ORDER. */
  expectFlags: readonly GuardFlagId[]
  /** The line the operator reads while the stopwatch runs. */
  scriptLine: string
}

/** The stopwatch target per step, in milliseconds. */
export const REHEARSAL_TARGET_MS = 2000

/** The five step script, in the order the operator runs it. */
export const REHEARSAL_SCRIPT: readonly RehearsalStep[] = [
  {
    id: 'rehearsal-1',
    accountId: '68257',
    presetId: 'layoff',
    expectFlags: [],
    scriptLine:
      'Open account 68257, play the Laid off card, and read the verdict aloud: this account carries no guard flags.',
  },
  {
    id: 'rehearsal-2',
    accountId: '23838',
    presetId: 'cost_spike',
    expectFlags: ['no_loan'],
    scriptLine:
      'Open account 23838, play the Bills up 15% card, and say: No running loan payment: the loan deferral lever does not apply.',
  },
  {
    id: 'rehearsal-3',
    accountId: '98952',
    presetId: 'layoff',
    expectFlags: ['pensioner', 'no_loan'],
    scriptLine:
      'Open account 98952, play the Laid off card, and say: Layoff twist simulated against pension income: this account has no wage to lose, read the verdict as a stress test.',
  },
  {
    id: 'rehearsal-4',
    accountId: '49900',
    presetId: 'combo',
    expectFlags: ['zero_income', 'thin_history', 'no_loan', 'zero_household_bills'],
    scriptLine:
      'Open account 49900, play the Laid off and bills up card, and say: Zero income: money in is 0, so the layoff and EI framing does not apply. Then note the thin history and the zero bills.',
  },
  {
    id: 'rehearsal-5',
    accountId: '42988',
    presetId: 'emergency_repair',
    expectFlags: ['negative_buffer', 'defaulted_loan'],
    scriptLine:
      'Open account 42988, play the Furnace repair card, and say: Savings buffer is below zero: the baseline already reads 0.0 months of runway, and the loan is in arrears (status D).',
  },
]

/** How one timed step read against the target. */
export type RehearsalVerdict = 'fast' | 'ok' | 'slow'

/**
 * The stopwatch verdict: fast under the 2000 ms target, ok under twice
 * the target, slow at or above it. A non finite reading reads slow, so
 * a broken clock never flatters the operator.
 */
export function rehearsalVerdict(elapsedMs: number): RehearsalVerdict {
  if (!Number.isFinite(elapsedMs) || elapsedMs >= REHEARSAL_TARGET_MS * 2) {
    return 'slow'
  }
  if (elapsedMs < REHEARSAL_TARGET_MS) {
    return 'fast'
  }
  return 'ok'
}

/** The twist card sentence for one step, straight from the preset. */
export function rehearsalCard(step: RehearsalStep): string {
  return presetById(step.presetId)?.card ?? ''
}
