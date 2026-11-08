import './atlas.css'
import { bandTotal, type BandCounts } from '../../lib/atlasData'
import { roundHalfUp } from '../../lib/shocks'

/**
 * The rain gauge (E5 extension): one vertical SVG column whose fill is
 * the share of accounts NOT in the critical or storm_warning bands
 * under the current scenario, so the gauge reads as the population
 * staying outside the two risk bands, and the printed reference line
 * marks the share the plan aims to hold.
 *
 * Props in, no data fetching, no runway math: the component divides
 * the counts it is handed. The gauge face prints its definition word
 * for word, the readout prints the exact whole percent next to the
 * raw fraction, and scenario wording arrives only as the caller's
 * scenarioLabel from the stormAtlas contract, so the numbers and the
 * sentence cannot drift apart. Missing counts print n/a with an honest
 * empty line instead of a zero share.
 *
 * Motion: the fill height transition lives only inside
 * prefers-reduced-motion: no-preference in atlas.css (600ms ease-out,
 * the same cascade moment as the cartogram tiles), and reduced motion
 * swaps the fill instantly.
 */

/**
 * The printed reference line, in percent of accounts outside the two
 * risk bands: 80 is the mark the gauge face quotes, chosen so four in
 * five accounts sitting outside critical and storm warning reads as
 * the target the resilience plan holds the line at.
 */
export const GAUGE_REFERENCE_PERCENT = 80

/** Tube geometry in viewBox units, shared by the fill and the mark. */
const TUBE = { x: 50, y: 8, width: 60, height: 232 } as const

/** The fill lives one unit inside the tube stroke on every side. */
const FILL = {
  x: TUBE.x + 1,
  y: TUBE.y + 1,
  width: TUBE.width - 2,
  height: TUBE.height - 2,
} as const

/** The reference line's height, aligned to the fill's own scale, rounded to hundredths so the printed coordinate stays exact. */
const REFERENCE_Y =
  Math.round((FILL.y + FILL.height * (1 - GAUGE_REFERENCE_PERCENT / 100)) * 100) / 100

export interface GaugeReading {
  /** Accounts outside critical and storm warning; null when none can be read. */
  outside: number | null
  /** The denominator, 0 when no population arrived. */
  total: number
  /** Whole percent outside, roundHalfUp; null when it cannot be computed. */
  percent: number | null
}

/**
 * One gauge reading from the counts: outside is total minus the two
 * risk bands, clamped into 0 to total, and the percent is the repo's
 * whole percent through roundHalfUp. A caller that passes no total
 * falls back to the counts' own five band sum, which is the same
 * number by contract; anything missing reads as null, never as zero.
 */
export function gaugeReading(
  counts: BandCounts | null | undefined,
  total: number | null | undefined,
): GaugeReading {
  const totalFromCounts = counts ? bandTotal(counts) : 0
  const safeTotal =
    typeof total === 'number' && Number.isFinite(total) && total > 0 ? total : totalFromCounts
  if (!counts || safeTotal <= 0) {
    return { outside: null, total: 0, percent: null }
  }
  const risky = counts.critical + counts.storm_warning
  const outside = Math.min(safeTotal, Math.max(0, safeTotal - risky))
  return { outside, total: safeTotal, percent: roundHalfUp(outside * 100, safeTotal) }
}

export interface RainGaugeProps {
  /** The live scenario's five band counts, straight from the summary. */
  counts?: BandCounts | null
  /** The population the counts divide by. */
  total?: number | null
  /** Scenario wording from the stormAtlas scenarioLabel contract. */
  scenarioLabel?: string | null
}

/** Grouped digits for every count this gauge prints. */
function formatCount(count: number): string {
  return count.toLocaleString('en-CA')
}

export default function RainGauge({ counts, total, scenarioLabel }: RainGaugeProps) {
  const reading = gaugeReading(counts, total)
  const scale =
    reading.outside !== null && reading.total > 0
      ? Math.min(1, Math.max(0, reading.outside / reading.total))
      : 0
  const percentText = reading.percent === null ? 'n/a' : `${reading.percent}%`
  const countLine =
    reading.outside !== null
      ? `${formatCount(reading.outside)} of ${formatCount(reading.total)} accounts`
      : 'No accounts in the atlas yet'

  return (
    <figure className="ax-gauge">
      <p className="ax-gauge__pct">{percentText}</p>
      <p className="ax-gauge__count">{countLine}</p>
      <svg
        className="ax-gauge__svg"
        viewBox="0 0 160 248"
        role="img"
        aria-label={`${percentText} outside critical and storm warning, ${countLine}`}
      >
        <rect
          className="ax-gauge__tube"
          x={TUBE.x}
          y={TUBE.y}
          width={TUBE.width}
          height={TUBE.height}
          rx={6}
        />
        <rect
          className="ax-gauge__fill"
          data-band="clear"
          x={FILL.x}
          y={FILL.y}
          width={FILL.width}
          height={FILL.height}
          style={{ transform: `scaleY(${scale})` }}
        />
        <line
          className="ax-gauge__ref"
          x1={TUBE.x - 10}
          x2={TUBE.x + TUBE.width + 10}
          y1={REFERENCE_Y}
          y2={REFERENCE_Y}
        />
        <text
          className="ax-gauge__ref-label"
          x={TUBE.x - 14}
          y={REFERENCE_Y + 4}
          textAnchor="end"
        >
          {`${GAUGE_REFERENCE_PERCENT}%`}
        </text>
      </svg>
      <figcaption className="ax-gauge__face">
        share of accounts outside critical and storm warning
      </figcaption>
      {scenarioLabel ? <p className="ax-gauge__scenario">{scenarioLabel}</p> : null}
    </figure>
  )
}
