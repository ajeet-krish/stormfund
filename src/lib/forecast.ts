import type { AccountProfile } from '../data/profiles'
import { formatDeciMonths } from './format'
import { SHOCK_PRESETS } from './shockPresets'
import {
  IDLE_TWIST,
  normalizeTwist,
  runway,
  sameTwist,
  type RunwayAnswer,
  type ShockResult,
  type Twist,
} from './shocks'
import { verdictBand, type VerdictBandId } from './verdict'

/**
 * The E3 forecast projection: one pure function that turns a profile,
 * one shock result, and the live twist into the finished numbers the
 * weather surfaces render (docs/architecture.md, frontend layering).
 * Every figure here is integer cents and integer months decided by
 * src/lib/shocks.ts and src/lib/verdict.ts, so a component can only
 * format what this module computed and can never disagree with the
 * verdict badge on screen.
 *
 * The projection is a straight line over integer cents: the buffer at
 * month m is bufferLeft minus m times the monthly gap, evaluated for
 * m from 0 to the horizon, and each month's runway answer is the judge
 * function run over that month's balance alone. The anchors are
 * asserted against the profile and the ShockResult before anything is
 * built, so a caller that hands in drifted numbers fails loudly here
 * instead of drawing a wrong sky.
 *
 * Vocabulary: the five verdict bands from src/lib/verdict.ts are the
 * only band vocabulary on every E3 surface. The seven state ladder in
 * src/lib/weatherState.ts is quarantined (E5 rework pending) and this
 * module never imports it.
 *
 * Display only branches, never headlines: the EI cliff (income stops
 * after month 6 under a job loss twist) and the dashed worst case
 * continuation live in their own block, and the headline answer at
 * month 0 is always applyTwist's own runway by construction. History
 * rows are context only: the projection anchors on buffer B, the judge
 * definition (mean of the last 6 recorded balances), never on the last
 * recorded balance.
 */

/** The default axis length when landfall is near or absent. */
export const DEFAULT_HORIZON_MONTHS = 12

/** The longest axis the console reasons about, in months. */
export const MAX_HORIZON_MONTHS = 120

/** Zero based month where Employment Insurance income stops. */
export const EI_CLIFF_MONTH_INDEX = 6

/** Printed pin text when no finite landfall sits inside the view. */
export const NO_LANDFALL_LABEL = 'no landfall in view'

/** The one label on the EI cliff line, the dashed continuation, and the second pin. */
export const EI_CLIFF_LABEL = 'Beyond the answer key: EI income stops after month 6'

/** Legend text for the recorded balance line left of the projection. */
export const HISTORY_LEGEND_LABEL = 'Recorded average balances'

/** Storm front caption when a shock is live but no preset card matches it. */
export const SHOCK_LANDS_LABEL = 'Shock lands this month'

/** One month of the projection: the balance, the judge answer, the band. */
export interface ForecastMonthPoint {
  /** Zero based month index, 0 is the shock landing month. */
  index: number
  /** YYYY-MM label continued from profile.history.last_month. */
  labelMonth: string
  /** Projected buffer in integer cents at the start of this month. */
  balanceCents: number
  /** The judge runway over this month's balance and the shocked flow. */
  answer: RunwayAnswer
  /** The verdict band of this month's answer (the single vocabulary). */
  bandId: VerdictBandId
}

/** One recorded balance row drawn left of the projection. */
export interface ForecastHistoryPoint {
  /** YYYY-MM label from the balance series itself. */
  labelMonth: string
  /** Recorded balance in integer cents (context only, never an anchor). */
  balanceCents: number
}

/** One point of a balance line (projection or dashed continuation). */
export interface ForecastBalancePoint {
  /** Zero based month index on the shared axis. */
  monthIndex: number
  /** Balance in integer cents at the start of this month. */
  balanceCents: number
}

/** The storm front marker sitting at month 0. */
export interface ForecastStormFront {
  /** True when a shock (preset or custom) is live. */
  active: boolean
  /** The active preset card sentence, or the plain fallback. */
  label: string
}

/** The landfall pin: where the buffer hits zero inside this view. */
export interface ForecastLandfall {
  /** True only when the pin renders inside the axis. */
  withinHorizon: boolean
  /** First month the balance is at or below zero, null when gap is not positive. */
  monthIndex: number | null
  /** The headline runway in tenths of a month, exact. */
  deciMonths: number
  /** Printed pin label, the headline figure, or the no landfall fallback. */
  label: string
}

/**
 * The EI cliff block: display only, job loss twists only. It never
 * feeds months[0].answer, the headline verdict, or the plan text.
 */
export interface ForecastEiCliff {
  /** True only for a job loss twist. */
  visible: boolean
  /** Zero based month where EI income stops (always 6). */
  monthIndex: number
  /** Tenths of a month for the worst case continuation, null when hidden. */
  afterDeciMonths: number | null
  /** Worst case landfall month on the shared axis, null when hidden. */
  afterMonthIndex: number | null
  /** The one printed label shared by line, continuation, and second pin. */
  label: string
  /** Printed worst case runway figure, empty when hidden. */
  afterLabel: string
  /** Dashed worst case points from the cliff to the second pin, capped at the horizon. */
  continuation: ForecastBalancePoint[]
}

/** Everything the weather surfaces render, all finished numbers. */
export interface ForecastProjection {
  /** One entry per axis month, length horizonMonths plus one. */
  months: ForecastMonthPoint[]
  /** The axis length in months (12 default, extended to landfall, capped at 120). */
  horizonMonths: number
  /** Recorded balances drawn muted left of month 0. */
  history: ForecastHistoryPoint[]
  /** The month 0 marker: active preset card or the plain fallback. */
  stormFront: ForecastStormFront
  /** The landfall pin data. */
  landfall: ForecastLandfall
  /** The display only EI cliff data. */
  eiCliff: ForecastEiCliff
}

const MONTH_PATTERN = /^\d{4}-\d{2}$/

/**
 * Continue a YYYY-MM label by an integer offset of months, using floor
 * division so a negative offset walks backwards across a year boundary
 * exactly as a positive offset walks forwards (monthLabel('2025-12', 1)
 * is '2026-01'). The label must already satisfy the artifact contract,
 * which the profiles loader enforces.
 */
export function monthLabel(startMonth: string, offset: number): string {
  if (!MONTH_PATTERN.test(startMonth)) {
    throw new Error(`monthLabel start must be a yyyy-mm label, got "${startMonth}"`)
  }
  const year = Number(startMonth.slice(0, 4))
  const month = Number(startMonth.slice(5, 7))
  const total = year * 12 + (month - 1) + offset
  const nextYear = Math.floor(total / 12)
  const nextMonth = total - nextYear * 12 + 1
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`
}

/**
 * The first month the balance is at or below zero: month 0 when the
 * buffer is already gone, null when the gap is not positive (no
 * shortfall can ever land), otherwise the integer ceiling of
 * bufferLeft divided by gap, written as one integer division so no
 * float touches the branch.
 */
function landfallMonthIndex(bufferLeft: number, gap: number): number | null {
  if (bufferLeft <= 0) {
    return 0
  }
  if (gap <= 0) {
    return null
  }
  return Math.floor((bufferLeft + gap - 1) / gap)
}

/**
 * The adaptive horizon: 12 months by default, extended to the
 * landfall month when that lands later than 12, and capped at 120.
 * A null landfall (no shortfall) always keeps the 12 month view.
 */
function horizonFor(landfallMonth: number | null): number {
  if (landfallMonth === null || landfallMonth <= DEFAULT_HORIZON_MONTHS) {
    return DEFAULT_HORIZON_MONTHS
  }
  return Math.min(landfallMonth, MAX_HORIZON_MONTHS)
}

/** The preset card sentence for a live twist, or null when no card matches. */
function presetCardFor(twist: Twist): string | null {
  for (const preset of SHOCK_PRESETS) {
    if (sameTwist(normalizeTwist(preset.twist), twist)) {
      return preset.card
    }
  }
  return null
}

/**
 * Build the whole projection for one profile under one twist. The
 * result must be the applyTwist output for that same pair (the
 * invariants in forecast.test.ts pin exactly that), so the strip, the
 * pin, and the verdict badge all read one set of numbers.
 */
export function projectForecast(
  profile: AccountProfile,
  result: ShockResult,
  twist: Twist,
): ForecastProjection {
  if (result.bufferLeftCents !== profile.buffer_cents - result.oneOffCents) {
    throw new Error('projectForecast anchor mismatch: buffer left must equal buffer minus one off')
  }
  if (result.gapAfterCents !== result.spendingAfterCents - result.incomeAfterCents) {
    throw new Error('projectForecast anchor mismatch: gap must equal spending after minus income after')
  }

  const bufferLeft = result.bufferLeftCents
  const gap = result.gapAfterCents
  const balanceAt = (index: number): number => bufferLeft - index * gap

  const landfallMonth = landfallMonthIndex(bufferLeft, gap)
  const horizonMonths = horizonFor(landfallMonth)

  const months: ForecastMonthPoint[] = []
  for (let index = 0; index <= horizonMonths; index += 1) {
    const balanceCents = balanceAt(index)
    const answer = runway(balanceCents, 0, result.incomeAfterCents, result.spendingAfterCents)
    months.push({
      index,
      labelMonth: monthLabel(profile.history.last_month, index + 1),
      balanceCents,
      answer,
      bandId: verdictBand(answer).id,
    })
  }

  const history: ForecastHistoryPoint[] = profile.balance_series.values_cents.map(
    (balanceCents, index) => ({
      labelMonth: monthLabel(profile.balance_series.start_month, index),
      balanceCents,
    }),
  )

  const active = !sameTwist(twist, IDLE_TWIST)
  const presetCard = active ? presetCardFor(twist) : null
  const stormFront: ForecastStormFront = {
    active,
    label: presetCard ?? SHOCK_LANDS_LABEL,
  }

  const withinHorizon = landfallMonth !== null && landfallMonth <= horizonMonths
  const landfall: ForecastLandfall = {
    withinHorizon,
    monthIndex: landfallMonth,
    deciMonths: result.runway.deciMonths,
    label:
      landfallMonth === null
        ? NO_LANDFALL_LABEL
        : formatDeciMonths(result.runway.deciMonths, result.runway.state),
  }

  const eiCliff = projectEiCliff(twist, result, balanceAt, horizonMonths)

  return { months, horizonMonths, history, stormFront, landfall, eiCliff }
}

/**
 * The display only EI cliff: visible only for a job loss twist, always
 * at month 6, with the worst case continuation that assumes income
 * falls to zero while spending continues (gap2 equals spending after
 * the shock). The second pin is the integer ceiling of the remaining
 * balance over gap2, measured from the cliff and only drawn when it
 * sits inside the horizon. None of these numbers ever reach the
 * headline: months[0] is computed from the anchors alone.
 */
function projectEiCliff(
  twist: Twist,
  result: ShockResult,
  balanceAt: (index: number) => number,
  horizonMonths: number,
): ForecastEiCliff {
  const visible = twist.jobLoss
  const monthIndex = EI_CLIFF_MONTH_INDEX
  const hidden: ForecastEiCliff = {
    visible: false,
    monthIndex,
    afterDeciMonths: null,
    afterMonthIndex: null,
    label: EI_CLIFF_LABEL,
    afterLabel: '',
    continuation: [],
  }
  if (!visible) {
    return hidden
  }

  const balanceAtCliff = balanceAt(monthIndex)
  const gapAfterEi = result.spendingAfterCents
  const afterAnswer = runway(balanceAtCliff, 0, 0, gapAfterEi)

  let afterMonthIndex: number
  const continuation: ForecastBalancePoint[] = []
  if (balanceAtCliff <= 0) {
    afterMonthIndex = monthIndex
    continuation.push({ monthIndex, balanceCents: balanceAtCliff })
  } else if (gapAfterEi > 0) {
    // Integer ceiling of balanceAtCliff over gapAfterEi, no float step.
    const drainMonths = Math.floor((balanceAtCliff + gapAfterEi - 1) / gapAfterEi)
    afterMonthIndex = monthIndex + drainMonths
    const lastDrawn = Math.min(afterMonthIndex, horizonMonths)
    for (let index = monthIndex; index <= lastDrawn; index += 1) {
      continuation.push({
        monthIndex: index,
        balanceCents: balanceAtCliff - (index - monthIndex) * gapAfterEi,
      })
    }
  } else {
    // Spending at or below zero after EI: the worst case never drains,
    // so the dashed line holds flat and no second pin is drawn.
    afterMonthIndex = monthIndex
    continuation.push({ monthIndex, balanceCents: balanceAtCliff })
  }

  return {
    visible: true,
    monthIndex,
    afterDeciMonths: afterAnswer.deciMonths,
    afterMonthIndex,
    label: EI_CLIFF_LABEL,
    afterLabel: formatDeciMonths(afterAnswer.deciMonths, afterAnswer.state),
    continuation,
  }
}
