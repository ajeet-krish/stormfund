import './weather.css'
import { WEATHER_META, type WeatherState } from '../../lib/weatherState'

/**
 * The E3 forecast strip: 12 month tiles in one hand rolled SVG, each
 * tile filled with that month's weather state color and stamped with the
 * state glyph, the researched almanac grid idiom (docs/research.md,
 * Terraria and Stardew translation table). No chart library, no canvas,
 * no network: the months array is the only input, and the state ladder
 * that produced it lives in src/lib/weatherState.ts.
 *
 * Month labels sit below the tiles on the grounds, not on the tiles, so
 * every label keeps full contrast whatever the state color is. The
 * component renders a labelled placeholder for empty or missing props,
 * so a view can mount it before the forecast data exists.
 */

/** The strip always lays out this many tiles when data is present. */
export const FORECAST_MONTH_COUNT = 12

/** One tile of the strip: a month label, its state, and optional tenths. */
export interface ForecastMonth {
  /** Month label as YYYY-MM (the artifact's own month spelling). */
  month: string
  /** Weather state already decided by weatherState(metrics). */
  state: WeatherState
  /** Optional runway in tenths of a month, shown in the tile tooltip. */
  runwayDeciMonths?: number
}

export interface ForecastStripProps {
  /** Months to draw, calm to severe is not required: order is the array order. */
  months?: readonly ForecastMonth[] | null
  /** Overrides the generated aria label with a caller sentence. */
  ariaLabel?: string
}

const STRIP_W = 640
const STRIP_H = 96
const TILE_GAP = 4
const TILE_TOP = 8
const TILE_H = 42
const MONTH_LABEL_Y = 68
const PLACEHOLDER_TEXT_Y = 56

function tileGeometry(count: number): { slot: number; width: number } {
  const safeCount = Math.max(1, count)
  const slot = STRIP_W / safeCount
  return { slot, width: Math.max(6, slot - TILE_GAP) }
}

function describeMonths(months: readonly ForecastMonth[]): string {
  return months
    .map((entry) => `${entry.month} ${WEATHER_META[entry.state].label.toLowerCase()}`)
    .join(', ')
}

function tileTooltip(entry: ForecastMonth): string {
  const meta = WEATHER_META[entry.state]
  const runway =
    entry.runwayDeciMonths === undefined
      ? ''
      : `, runway ${(entry.runwayDeciMonths / 10).toFixed(1)} months`
  return `${entry.month}: ${meta.label.toLowerCase()}${runway}`
}

export default function ForecastStrip(props: ForecastStripProps) {
  const months = props.months ?? []
  const hasMonths = months.length > 0
  const geometry = tileGeometry(hasMonths ? months.length : FORECAST_MONTH_COUNT)
  const ariaLabel =
    props.ariaLabel ??
    (hasMonths
      ? `Forecast strip, ${months.length} months: ${describeMonths(months)}.`
      : 'Forecast strip, no forecast wired yet.')

  return (
    <div className="wx-strip">
      <svg
        className="wx-strip__svg"
        viewBox={`0 0 ${STRIP_W} ${STRIP_H}`}
        role="img"
        aria-label={ariaLabel}
      >
        {hasMonths ? (
          months.map((entry, index) => {
            const x = index * geometry.slot
            const meta = WEATHER_META[entry.state]
            return (
              <g
                key={entry.month}
                className="wx-strip__tile"
                style={{ animationDelay: `${index * 45}ms` }}
              >
                <title>{tileTooltip(entry)}</title>
                <rect
                  x={x}
                  y={TILE_TOP}
                  width={geometry.width}
                  height={TILE_H}
                  rx={2}
                  className={`wx-tile wx-tile-${entry.state}`}
                />
                <text
                  x={x + geometry.width / 2}
                  y={TILE_TOP + TILE_H / 2 + 5}
                  textAnchor="middle"
                  className="wx-strip__glyph"
                  aria-hidden="true"
                >
                  {meta.glyph}
                </text>
                <text
                  x={x + geometry.width / 2}
                  y={MONTH_LABEL_Y}
                  textAnchor="middle"
                  className="wx-strip__month"
                >
                  {entry.month.slice(5)}
                </text>
              </g>
            )
          })
        ) : (
          <g>
            <rect
              x={0}
              y={TILE_TOP}
              width={STRIP_W}
              height={TILE_H}
              rx={2}
              className="wx-strip__placeholder"
            />
            <text x={STRIP_W / 2} y={PLACEHOLDER_TEXT_Y} textAnchor="middle" className="wx-strip__empty">
              forecast not wired yet
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}
