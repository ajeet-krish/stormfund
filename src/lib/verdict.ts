import type { RunwayAnswer } from './shocks'

/**
 * The verdict ladder: five contiguous bands over tenths of a month of
 * runway, decided by the user confirmed boundaries (docs/decisions.md,
 * Phase E2). The band is the console's hero signal, so every band
 * carries a label, a glyph, and a tailwind color class that read from
 * two metres away across a judging table; the threshold string is what
 * the UI shows when a judge asks where the line sits.
 */

export type VerdictBandId = 'critical' | 'storm_warning' | 'watch' | 'fair_skies' | 'clear'

export interface VerdictBand {
  id: VerdictBandId
  /** Sentence case label read at the badge. */
  label: string
  /** Weather glyph, decorative next to the label. */
  glyph: string
  /** Tailwind text color class (cp palette in tailwind.config.js). */
  tailwind: string
  /** The band's deci month range, plain words for the UI. */
  threshold: string
}

/**
 * Ladder order, lowest runway first. Boundaries are integer deci months:
 * critical = buffer_depleted or under 10, storm_warning = 10 to 29,
 * watch = 30 to 59, fair_skies = 60 to 119, clear = no_shortfall or
 * 120 and above (12.0 months and up).
 */
export const VERDICT_BANDS: readonly VerdictBand[] = [
  {
    id: 'critical',
    label: 'Critical',
    glyph: '⛈',
    tailwind: 'text-cp-critical',
    threshold: 'buffer gone or under 1.0 month',
  },
  {
    id: 'storm_warning',
    label: 'Storm warning',
    glyph: '🌧',
    tailwind: 'text-cp-storm',
    threshold: '1.0 to 2.9 months',
  },
  {
    id: 'watch',
    label: 'Watch',
    glyph: '☁',
    tailwind: 'text-cp-watch',
    threshold: '3.0 to 5.9 months',
  },
  {
    id: 'fair_skies',
    label: 'Fair skies',
    glyph: '⛅',
    tailwind: 'text-cp-fair',
    threshold: '6.0 to 11.9 months',
  },
  {
    id: 'clear',
    label: 'Clear',
    glyph: '☀',
    tailwind: 'text-cp-clear',
    threshold: '12.0 months and up, or no shortfall',
  },
]

const BAND_BY_ID = new Map(VERDICT_BANDS.map((band) => [band.id, band]))

/** Look a band up by id (never undefined for a shipped id). */
export function verdictBandById(id: VerdictBandId): VerdictBand {
  const band = BAND_BY_ID.get(id)
  if (!band) {
    throw new Error(`unknown verdict band ${id}`)
  }
  return band
}

/**
 * Map one runway answer to its band. Branch order matches the runway
 * itself: the two special states are decided before any threshold, so
 * buffer_depleted always reads Critical and no_shortfall always reads
 * Clear no matter what deci months carry.
 */
export function verdictBand(answer: RunwayAnswer): VerdictBand {
  if (answer.state === 'buffer_depleted') {
    return verdictBandById('critical')
  }
  if (answer.state === 'no_shortfall') {
    return verdictBandById('clear')
  }
  const deci = answer.deciMonths
  if (deci < 10) {
    return verdictBandById('critical')
  }
  if (deci < 30) {
    return verdictBandById('storm_warning')
  }
  if (deci < 60) {
    return verdictBandById('watch')
  }
  if (deci < 120) {
    return verdictBandById('fair_skies')
  }
  return verdictBandById('clear')
}
