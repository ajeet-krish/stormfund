import type { RunwayState } from './shocks'

const CAD_FORMAT = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
})

/**
 * Format integer CAD cents as a dollar string (for example $1,234.56).
 * Negative cents keep their numeric minus in front of the symbol
 * (for example -$1,234.50), which is the one allowed dash in shipped
 * strings because it is a formatted number, not prose. Non finite input
 * reads n/a instead of printing NaN on a card.
 */
export function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) {
    return 'n/a'
  }
  return CAD_FORMAT.format(cents / 100)
}

/**
 * Format tenths of a month for the runway readouts: 98 reads 9.8 months,
 * the no_shortfall cap reads 120+ months, and a depleted buffer reads
 * 0.0 months. The state wins over the number so the two special states
 * can never print as an ordinary figure.
 */
export function formatDeciMonths(deciMonths: number, state: RunwayState): string {
  if (state === 'no_shortfall') {
    return '120+ months'
  }
  if (state === 'buffer_depleted') {
    return '0.0 months'
  }
  if (!Number.isFinite(deciMonths)) {
    return 'n/a months'
  }
  return `${(deciMonths / 10).toFixed(1)} months`
}

/** Format an m/s budget for the HUD (one decimal, for example 1641.5 m/s). */
export function formatMetersPerSecond(value: number): string {
  return `${value.toFixed(1)} m/s`
}
