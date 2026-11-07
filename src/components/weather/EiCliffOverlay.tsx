import './weather.css'

/**
 * The EI cliff overlay: a marker line that sits over the forecast strip
 * at the month where Employment Insurance income stops. The standard EI
 * twist pays 55 percent of usual income for 6 months
 * (docs/tangerine-challenge.md example twist), so income falls off a
 * cliff entering month 7, which is zero based index 6.
 *
 * Purely presentational: it takes an index and draws a line, it never
 * computes when EI ends and it never touches the strip's DOM. The
 * wiring view wraps ForecastStrip and this overlay in one element
 * carrying the wx-cliff-wrap class, because the overlay positions itself
 * with a left percentage against that box, and ForecastStrip lays its
 * monthCount equal width tiles across the full width of the same box.
 * Out of range or missing indices render nothing rather than a stray
 * marker, so the component is safe under any props.
 */

/** Zero based index of the first month without EI income, standard twist. */
export const EI_CLIFF_INDEX = 6

/** Printed marker label, uppercase by CSS. */
export const EI_CLIFF_LABEL = 'EI income stops'

export interface EiCliffOverlayProps {
  /** Zero based first month without EI. Null hides the marker. Defaults to the standard EI twist. */
  cliffIndex?: number | null
  /** Tiles the strip lays out; the line lands at cliffIndex / monthCount. */
  monthCount?: number
  /** Overrides the marker sentence. */
  label?: string
}

function normalizedCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return 12
  }
  return Math.trunc(value)
}

export default function EiCliffOverlay(props: EiCliffOverlayProps) {
  const monthCount = normalizedCount(props.monthCount)
  const raw = props.cliffIndex === undefined ? EI_CLIFF_INDEX : props.cliffIndex
  if (raw === null || !Number.isFinite(raw)) {
    return null
  }
  const cliffIndex = Math.trunc(raw)
  if (cliffIndex < 0 || cliffIndex >= monthCount) {
    return null
  }

  const percent = (cliffIndex / monthCount) * 100
  const label = props.label ?? EI_CLIFF_LABEL
  // Keep the label chip inside the strip when the line sits near an edge.
  const align =
    percent <= 8 ? 'translateX(0)' : percent >= 92 ? 'translateX(-100%)' : 'translateX(-50%)'

  return (
    <div
      className="wx-cliff"
      style={{ left: `${percent}%` }}
      role="img"
      aria-label={`EI cliff at month ${cliffIndex + 1} of ${monthCount}: ${label}.`}
    >
      <span className="wx-cliff__label" style={{ transform: align }}>
        {label}
      </span>
    </div>
  )
}
