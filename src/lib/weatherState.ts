/**
 * Phase E3 weather vocabulary: the pure mapping from judge metrics to one
 * of seven sky states, plus the 0 to 1 severity helper. This is the judge
 * parity contract for every weather surface (forecast strip, condition
 * bands, EI cliff overlay, Storm Atlas): it READS metrics that already
 * exist, it never recomputes a runway, a gap, or a median, so a sky color
 * can never disagree with the number printed next to it
 * (docs/architecture.md frontend layering, docs/tangerine-challenge.md).
 *
 * The ladder comes from the researched mapping table in
 * docs/research.md (Metric to weather mapping table, palette section)
 * adapted to the seven state vocabulary the E3 surfaces share. Branch
 * discipline follows scripts/engine/shocks.py and src/lib/verdict.ts:
 * the two special runway states are decided before any threshold, then
 * severity runs from most severe to calm, and clear is the honest
 * fallback for anything with no monthly shortfall. Every comparison is
 * integer arithmetic on cents and tenths of a month; the only division
 * in this file is inside weatherSeverity, whose result is display only
 * and never decides a branch.
 *
 * The seven states are a union of string literals, so a state value is
 * itself the discriminator: `if (state === 'storm')` narrows with no
 * wrapper object, and Record<WeatherState, T> stays exhaustively checked.
 */

/** Runway answer states, structurally identical to src/lib/shocks.ts. */
export type WeatherRunwayState = 'finite' | 'no_shortfall' | 'buffer_depleted'

/** Canonical declaration order, calm to severe (also the record key order). */
export const WEATHER_STATES = [
  'clear',
  'cloudy',
  'overcast',
  'rain',
  'drought',
  'storm',
  'flood',
] as const

export type WeatherState = (typeof WEATHER_STATES)[number]

/** Display order for ladders, atlas grids, and legends: severe first. */
export const SEVERITY_ORDER = [
  'flood',
  'storm',
  'drought',
  'rain',
  'overcast',
  'cloudy',
  'clear',
] as const

/**
 * The five edge flags exactly as scripts/engine/metrics.py derives them
 * (docs/profiles-schema.md flags block). All optional: a caller may pass
 * metrics without flags, and the ladder still works from the numbers.
 */
export interface WeatherFlags {
  pensioner?: boolean
  thin_history?: boolean
  zero_income?: boolean
  defaulted_loan?: boolean
  negative_buffer?: boolean
}

/**
 * The metrics one weather decision reads: the artifact's own field
 * names (docs/profiles-schema.md), so a profiles entry satisfies this
 * interface with no adapter, and a shocked metrics object is built by
 * copying the same seven fields from a ShockResult. Optional flags are
 * baseline honesty modifiers.
 */
export interface WeatherMetrics {
  income_cents: number
  spending_cents: number
  buffer_cents: number
  gap_cents: number
  runway_state: WeatherRunwayState
  runway_deci_months: number
  flags?: WeatherFlags
}

/** Printed label plus glyph and threshold sentence for one state. */
export interface WeatherStateMeta {
  /** Sentence case label for badges and headlines. */
  label: string
  /** Decorative glyph, never the only distinction (research palette rule). */
  glyph: string
  /** Plain words for where the line sits, shown in the bands legend. */
  threshold: string
}

/**
 * Ladder boundaries in tenths of a month, all inclusive of the lower
 * edge: storm is 0.1 to 2.9, rain 3.0 to 11.9, overcast 12.0 to 23.9,
 * cloudy 24.0 and up. The researched ladder writes these in months, and
 * the artifact stores tenths, so the integers below are the exact
 * conversion with no float involved.
 */
const DECI_STORM_MAX = 29
const DECI_RAIN_MAX = 119
const DECI_OVERCAST_MAX = 239

/** Income ratio threshold: income covers 65 percent or less of spending. */
const INCOME_RATIO_PCT = 65

/** Reference runway for severity: 12 months in tenths (docs/research.md). */
export const SEVERITY_REFERENCE_DECI = 120

/**
 * State table in canonical order. Threshold sentences are the printed
 * labels each surface shows, so a judge reading the legend and a judge
 * reading the tile see the same sentence.
 */
export const WEATHER_META: Record<WeatherState, WeatherStateMeta> = {
  clear: {
    label: 'Clear',
    glyph: '☀',
    threshold: 'no monthly shortfall',
  },
  cloudy: {
    label: 'Cloudy',
    glyph: '☁',
    threshold: 'runway 24.0 months and up with spending above income',
  },
  overcast: {
    label: 'Overcast',
    glyph: '🌥',
    threshold: 'runway 12.0 to 23.9 months with spending above income',
  },
  rain: {
    label: 'Rain',
    glyph: '🌧',
    threshold: 'runway 3.0 to 11.9 months with spending above income',
  },
  drought: {
    label: 'Drought watch',
    glyph: '🌵',
    threshold: 'income covers 65 percent or less of spending, runway 3.0 months and up',
  },
  storm: {
    label: 'Storm warning',
    glyph: '⛈',
    threshold: 'runway under 3.0 months',
  },
  flood: {
    label: 'Flood',
    glyph: '🌊',
    threshold: 'buffer depleted or runway at 0.0 months',
  },
}

/** Type guard for values arriving from props, query strings, or JSON. */
export function isWeatherState(value: unknown): value is WeatherState {
  return typeof value === 'string' && (WEATHER_STATES as readonly string[]).includes(value)
}

/**
 * Finite, truncated runway in tenths. A non finite input reads as 0,
 * which lands on flood: unknown data must never render as clear skies.
 */
function deciMonthsOf(metrics: WeatherMetrics): number {
  const raw = metrics.runway_deci_months
  if (!Number.isFinite(raw)) {
    return 0
  }
  return Math.trunc(raw)
}

/**
 * Map one metrics object to its weather state. The ladder, in priority
 * order (first match wins):
 *
 * 1. runway_state buffer_depleted reads flood, the same way
 *    verdict.ts reads critical, before any threshold.
 * 2. runway_state no_shortfall reads clear before any threshold.
 * 3. runway at or under 0 tenths reads flood, and a negative buffer
 *    flag also reads flood: the account is already underwater, and clear
 *    skies over a known negative buffer would be the dishonest render.
 * 4. runway 0.1 to 2.9 months reads storm.
 * 5. income covering 65 percent or less of spending reads drought at
 *    runway 3.0 months and up (with spending above zero, since income
 *    ratio against zero spending is undefined, and a zero income flag
 *    with no spending is a no shortfall account, not a drought).
 * 6. runway 3.0 to 11.9 reads rain when spending exceeds income, the
 *    spending driven band.
 * 7. runway 12.0 to 23.9 reads overcast, and 24.0 and up reads cloudy,
 *    both only while spending exceeds income.
 * 8. Everything else reads clear: no monthly shortfall, or a runway of
 *    12.0 months and up that no spending driven band claimed. This is
 *    what keeps all seven states reachable, since clear and overcast
 *    would otherwise both claim the 12 to 24 month window.
 *
 * thin_history, pensioner, and defaulted_loan deliberately do not change
 * the state: research assigns them chip modifiers (fog confidence chip,
 * eclipse modifier, hail warning on shock only) that the surfaces render
 * beside the state instead of replacing it.
 */
export function weatherState(metrics: WeatherMetrics): WeatherState {
  if (metrics.runway_state === 'buffer_depleted') {
    return 'flood'
  }
  if (metrics.runway_state === 'no_shortfall') {
    return 'clear'
  }

  const deci = deciMonthsOf(metrics)
  if (deci <= 0 || metrics.buffer_cents <= 0 || metrics.flags?.negative_buffer === true) {
    return 'flood'
  }
  if (deci < DECI_STORM_MAX + 1) {
    return 'storm'
  }

  const income = metrics.income_cents
  const spending = metrics.spending_cents
  // Integer form of income / spending <= 0.65, both operands cents, so
  // no float can sit on the drought boundary.
  if (spending > 0 && income * 100 <= spending * INCOME_RATIO_PCT) {
    return 'drought'
  }

  const gapAboveZero = metrics.gap_cents > 0
  if (deci < DECI_RAIN_MAX + 1) {
    return gapAboveZero ? 'rain' : 'clear'
  }
  if (deci < DECI_OVERCAST_MAX + 1) {
    return gapAboveZero ? 'overcast' : 'clear'
  }
  return gapAboveZero ? 'cloudy' : 'clear'
}

/**
 * Severity from 0 (calm) to 1 (underwater), the researched formula
 * clamp(1 minus runway months / 12, 0, 1) over the same integer tenths
 * the state ladder reads. It drives motion intensity and arc gauges
 * only: the division happens once, at the end, and the result is
 * display data that never decides a branch anywhere in the repo.
 */
export function weatherSeverity(metrics: WeatherMetrics): number {
  if (metrics.runway_state === 'buffer_depleted') {
    return 1
  }
  if (metrics.runway_state === 'no_shortfall') {
    return 0
  }
  const deci = Math.max(0, deciMonthsOf(metrics))
  const capped = Math.min(deci, SEVERITY_REFERENCE_DECI)
  return (SEVERITY_REFERENCE_DECI - capped) / SEVERITY_REFERENCE_DECI
}
