import type { AccountProfile, RunwayState } from '../data/profiles'

/**
 * The judge shock math as pure integer functions: TypeScript twins of
 * scripts/engine/shocks.py (the runway) and scripts/engine/metrics.py
 * (round_half_up). Everything here is integer cents, branch order is
 * fixed, and no float decides a branch, so a live shock on the console
 * reproduces the precomputed baseline in public/data/engine/profiles.json
 * to the digit (docs/profiles-schema.md, docs/tangerine-challenge.md).
 *
 * This module never imports React and never touches the DOM. Components
 * call applyTwist and render the result; inline money math in a view is a
 * review failure (docs/architecture.md, frontend layering).
 */

/** Runway answer states, the artifact contract enum, re exported here. */
export type { RunwayState }

/** The 120 month cap expressed in tenths of a month (1200 = 120.0). */
export const RUNWAY_CAP_DECI_MONTHS = 1200

/** One runway answer: a state label plus tenths of a month. */
export interface RunwayAnswer {
  state: RunwayState
  deciMonths: number
}

/**
 * Divide with ROUND_HALF_UP, ties away from zero: the exact mirror of
 * scripts/engine/metrics.py round_half_up. The sign split makes negative
 * operands round away from zero on ties as well, which is what Python's
 * decimal ROUND_HALF_UP does. Operands are integer counts (cents, rows,
 * tenths), so the magnitude math below stays inside the exact integer
 * range of a double.
 */
export function roundHalfUp(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    throw new Error(`roundHalfUp denominator must be positive, got ${denominator}`)
  }
  const sign = numerator >= 0 ? 1 : -1
  const magnitude = Math.floor((Math.abs(numerator) + Math.floor(denominator / 2)) / denominator)
  return sign * magnitude
}

/**
 * A percentage of a base amount in integer cents, rounded half up:
 * scaleCents(H, 15) is the 15 percent bills increase the challenge doc
 * writes as 0.15 x H. pct is an integer count of percent (0 to 100).
 */
export function scaleCents(baseCents: number, pct: number): number {
  return roundHalfUp(baseCents * pct, 100)
}

/**
 * The judge runway, byte for byte the logic of scripts/engine/shocks.py:
 *
 *   buffer_left is B minus one_off_cents
 *   gap is spending_after_shock minus income_after_shock
 *   buffer_left at or below zero: buffer_depleted, 0 deci months
 *   gap at or below zero: no_shortfall, 1200 deci months
 *   otherwise: floor((20 * buffer_left + gap) / (2 * gap)), capped
 *   at 1200 deci months
 *
 * The finite branch is exact integer arithmetic: floor((20 * b + g) /
 * (2 * g)) for positive operands equals ROUND_HALF_UP(10 * b / g), which
 * is the one decimal the judge reads, then capped at 120 months.
 */
export function runway(
  bufferCents: number,
  oneOffCents: number,
  incomeCents: number,
  spendingCents: number,
): RunwayAnswer {
  const bufferLeft = bufferCents - oneOffCents
  const gap = spendingCents - incomeCents
  if (bufferLeft <= 0) {
    return { state: 'buffer_depleted', deciMonths: 0 }
  }
  if (gap <= 0) {
    return { state: 'no_shortfall', deciMonths: RUNWAY_CAP_DECI_MONTHS }
  }
  const deciMonths = Math.floor((20 * bufferLeft + gap) / (2 * gap))
  return { state: 'finite', deciMonths: Math.min(deciMonths, RUNWAY_CAP_DECI_MONTHS) }
}

/**
 * One twist card as typed fields (docs/tangerine-challenge.md example
 * twists). All money fields are integer cents, all percentages are
 * integer counts, and durationMonths is display only: it never enters the
 * runway math, it only tells the plan text which horizon to judge.
 */
export interface Twist {
  /** True when income is replaced by the EI factor instead of I. */
  jobLoss: boolean
  /** Share of usual income kept, 0 to 1 in steps of 0.05, default 0.55. */
  incomeFactor: number
  /** Household bills increase in percent, 0 to 100. */
  billsDeltaPct: number
  /** One off cost in tenths of a month of S, 0 to 30 (10 = one month). */
  oneOffMonthsTenths: number
  /** Recurring extra spending per month in cents. */
  extraMonthlyCents: number
  /** Display only horizon in months (0 means no horizon set). */
  durationMonths: number
}

/** The untouched console: no shock, EI factor kept at the 55 percent default. */
export const IDLE_TWIST: Twist = {
  jobLoss: false,
  incomeFactor: 0.55,
  billsDeltaPct: 0,
  oneOffMonthsTenths: 0,
  extraMonthlyCents: 0,
  durationMonths: 0,
}

/** Upper bound for the recurring extra cost slider and any programmatic input. */
export const MAX_EXTRA_MONTHLY_CENTS = 1_000_00

/** Longest horizon the console reasons about, in months. */
export const MAX_DURATION_MONTHS = 120

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.round(value)))
}

function clampFactor(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  const clamped = Math.min(1, Math.max(0, value))
  // Quantize to hundredths so a slider value and a preset value compare
  // equal after one rounding step (0.55 stays 0.55, 0.5549 becomes 0.55).
  return Math.round(clamped * 100) / 100
}

/**
 * Clamp and quantize a twist to the fields the math accepts. Missing
 * fields fall back to IDLE_TWIST, so a preset can declare only the fields
 * it changes. This is the only place slider input becomes math input.
 */
export function normalizeTwist(twist: Partial<Twist>): Twist {
  const base = { ...IDLE_TWIST, ...twist }
  return {
    jobLoss: base.jobLoss === true,
    incomeFactor: clampFactor(base.incomeFactor, IDLE_TWIST.incomeFactor),
    billsDeltaPct: clampInt(base.billsDeltaPct, 0, 100, IDLE_TWIST.billsDeltaPct),
    oneOffMonthsTenths: clampInt(base.oneOffMonthsTenths, 0, 30, IDLE_TWIST.oneOffMonthsTenths),
    extraMonthlyCents: clampInt(
      base.extraMonthlyCents,
      0,
      MAX_EXTRA_MONTHLY_CENTS,
      IDLE_TWIST.extraMonthlyCents,
    ),
    durationMonths: clampInt(
      base.durationMonths,
      0,
      MAX_DURATION_MONTHS,
      IDLE_TWIST.durationMonths,
    ),
  }
}

/** Field by field twist equality, used to recognize an untouched preset. */
export function sameTwist(left: Twist, right: Twist): boolean {
  return (
    left.jobLoss === right.jobLoss &&
    left.incomeFactor === right.incomeFactor &&
    left.billsDeltaPct === right.billsDeltaPct &&
    left.oneOffMonthsTenths === right.oneOffMonthsTenths &&
    left.extraMonthlyCents === right.extraMonthlyCents &&
    left.durationMonths === right.durationMonths
  )
}

/**
 * Unit conversions between what a slider holds and what the math holds.
 * Views call these instead of doing arithmetic in JSX: the console shows
 * income as a percent and one off cost as months of spending, while the
 * math keeps incomeFactor as a fraction and oneOffMonthsTenths as tenths.
 */
export function factorToPercent(factor: number): number {
  return Math.round(factor * 100)
}

export function percentToFactor(percent: number): number {
  return percent / 100
}

export function tenthsToMonths(tenths: number): number {
  return tenths / 10
}

export function monthsToTenths(months: number): number {
  return Math.round(months * 10)
}

/** Every number a shocked card shows, all integer cents plus the runway. */
export interface ShockResult {
  /** I after the twist (unchanged when jobLoss is false). */
  incomeAfterCents: number
  /** S after bills increase and recurring extra cost, one off excluded. */
  spendingAfterCents: number
  /** One off cost subtracted from the buffer only, never from spending. */
  oneOffCents: number
  /** B minus the one off cost. */
  bufferLeftCents: number
  /** spendingAfter minus incomeAfter. */
  gapAfterCents: number
  /** The judge runway over the shocked numbers. */
  runway: RunwayAnswer
}

/**
 * Apply one twist to one profile. The one off semantics follow the
 * challenge doc exactly: one off costs subtract from the buffer only,
 * billsDeltaPct adds scaleCents(H, pct) to spending, extraMonthlyCents is
 * recurring spending, and income becomes scaleCents(I, eiPct) only when
 * the job is lost. The twist is normalized first so no caller can feed
 * the branch math an out of range value.
 */
export function applyTwist(profile: AccountProfile, twist: Partial<Twist>): ShockResult {
  const normalized = normalizeTwist(twist)
  const eiPct = Math.round(normalized.incomeFactor * 100)

  const incomeAfterCents = normalized.jobLoss
    ? scaleCents(profile.income_cents, eiPct)
    : profile.income_cents
  const billsDeltaCents = scaleCents(profile.household_bills_cents, normalized.billsDeltaPct)
  const spendingAfterCents =
    profile.spending_cents + billsDeltaCents + normalized.extraMonthlyCents
  const oneOffCents = roundHalfUp(profile.spending_cents * normalized.oneOffMonthsTenths, 10)
  const bufferLeftCents = profile.buffer_cents - oneOffCents
  const gapAfterCents = spendingAfterCents - incomeAfterCents

  return {
    incomeAfterCents,
    spendingAfterCents,
    oneOffCents,
    bufferLeftCents,
    gapAfterCents,
    runway: runway(profile.buffer_cents, oneOffCents, incomeAfterCents, spendingAfterCents),
  }
}
