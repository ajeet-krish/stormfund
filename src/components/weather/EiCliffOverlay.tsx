import './weather.css'
import { EI_CLIFF_LABEL, EI_CLIFF_MONTH_INDEX } from '../../lib/forecast'

/**
 * The EI cliff overlay: a marker line that sits over the forecast
 * strip at the month where Employment Insurance income stops. The
 * standard EI twist pays 55 percent of usual income for 6 months
 * (docs/tangerine-challenge.md example twist), so income falls off a
 * cliff entering month 7, which is zero based index 6. Under a job
 * loss twist a second, dotted line marks the worst case pin where the
 * buffer would run out with income at zero (data from
 * src/lib/forecast.ts).
 *
 * Visibility is a wired prop and defaults to hidden: the marker only
 * draws when the caller says the twist is a job loss, so it can never
 * show over a twist that keeps the job (the scaffold default showed it
 * for any twist). The label defaults to the one honest sentence, "Beyond
 * the answer key: EI income stops after month 6", shared with the
 * projection so the line, the dashed continuation, and the second pin
 * all carry the same words.
 *
 * Purely presentational: it takes indices and draws lines, it never
 * computes when EI ends and it never touches the strip's DOM. The
 * wiring view wraps ForecastStrip and this overlay in one element
 * carrying the wx-cliff-wrap class, because the overlay positions
 * itself with a left percentage against that box. The strip shares its
 * slot grid through stripLayout: monthCount is every slot (history
 * slots plus projected months) and startIndex is the first projected
 * slot, so the percentage lands on the same x the curve uses. Out of
 * range or missing indices render nothing rather than a stray marker.
 */

/** Zero based index of the first month without EI income, standard twist. */
export const EI_CLIFF_INDEX = EI_CLIFF_MONTH_INDEX

/** The one printed label, owned by the forecast module. */
export { EI_CLIFF_LABEL }

export interface EiCliffOverlayProps {
  /** Wired visibility: only a job loss twist draws the marker. Defaults to hidden. */
  visible?: boolean
  /** Zero based first month without EI. Null hides the marker. Defaults to 6. */
  cliffIndex?: number | null
  /** Every slot on the axis: history slots plus projected months. */
  monthCount?: number
  /** Slot index of month 0, so the line lands past the history gutter. */
  startIndex?: number
  /** Overrides the marker sentence. */
  label?: string
  /** Worst case pin month on the shared axis, null hides the second line. */
  afterIndex?: number | null
}

function normalizedCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return 12
  }
  return Math.trunc(value)
}

function normalizedStart(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return 0
  }
  return Math.trunc(value)
}

/** Keep the label chip inside the strip when the line sits near an edge. */
function alignFor(percent: number): string {
  if (percent <= 10) {
    return 'translateX(0)'
  }
  if (percent >= 85) {
    return 'translateX(-100%)'
  }
  return 'translateX(-50%)'
}

export default function EiCliffOverlay(props: EiCliffOverlayProps) {
  const visible = props.visible ?? false
  const monthCount = normalizedCount(props.monthCount)
  const startIndex = normalizedStart(props.startIndex)
  const raw = props.cliffIndex === undefined ? EI_CLIFF_INDEX : props.cliffIndex
  if (!visible || raw === null || !Number.isFinite(raw)) {
    return null
  }
  const cliffIndex = Math.trunc(raw)
  const cliffSlot = startIndex + cliffIndex
  if (cliffIndex < 0 || cliffSlot >= monthCount) {
    return null
  }

  const percent = (cliffSlot / monthCount) * 100
  const label = props.label ?? EI_CLIFF_LABEL
  const align = alignFor(percent)

  const rawAfter = props.afterIndex ?? null
  let afterPercent: number | null = null
  let afterMonths: number | null = null
  if (rawAfter !== null && Number.isFinite(rawAfter)) {
    const afterIndex = Math.trunc(rawAfter)
    const afterSlot = startIndex + afterIndex
    // The second line only draws past the marker and inside the axis;
    // when it lands on the marker the strip's pin already marks it.
    if (afterIndex > cliffIndex && afterSlot < monthCount) {
      afterPercent = (afterSlot / monthCount) * 100
      afterMonths = afterIndex
    }
  }

  const aria =
    afterMonths === null
      ? `${label}. Marker after ${cliffIndex} months.`
      : `${label}. Marker after ${cliffIndex} months, worst case pin after ${afterMonths} months.`

  return (
    <div className="wx-cliff-set" role="img" aria-label={aria}>
      <div className="wx-cliff" style={{ left: `${percent}%` }}>
        <span className="wx-cliff__label" style={{ transform: align }}>
          {label}
        </span>
      </div>
      {afterPercent !== null ? (
        <div
          className="wx-cliff wx-cliff-after"
          style={{ left: `${afterPercent}%` }}
          title={label}
        />
      ) : null}
    </div>
  )
}
