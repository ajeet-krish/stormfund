const CAD_FORMAT = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
})

/** Format integer CAD cents as a dollar string (for example $1,234.56). */
export function formatCents(cents: number): string {
  return CAD_FORMAT.format(cents / 100)
}

/** Format an m/s budget for the HUD (one decimal, for example 1641.5 m/s). */
export function formatMetersPerSecond(value: number): string {
  return `${value.toFixed(1)} m/s`
}
