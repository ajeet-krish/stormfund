import type { ReactElement } from 'react'
import './weather.css'
import { formatCents, formatDeciMonths } from '../../lib/format'
import { DEFAULT_HORIZON_MONTHS, NO_LANDFALL_LABEL, type ForecastProjection, type ForecastMonthPoint } from '../../lib/forecast'
import { verdictBandById } from '../../lib/verdict'

/**
 * The E3 forecast strip: a weather map of one person's money. Left of
 * the storm front sits the recorded balance line, muted and labelled
 * "Recorded average balances"; right of it the projection runs as one
 * polyline over band colored month slots, every slot carrying the
 * verdict band's hue, glyph, and tooltip so the band reads from two
 * metres with redundant encoding (color plus glyph plus label). The
 * storm front marks month 0, the landfall pin prints the exact
 * headline figure at the snapped landfall month, and under a job loss
 * twist the dashed worst case continuation runs to its second pin.
 *
 * The component renders finished numbers only: every balance, answer,
 * band, and pin position arrives from src/lib/forecast.ts, and the
 * only arithmetic here is float pixel mapping against the SVG viewBox
 * (never money, never a branch on money). Month labels sit below the
 * slots on the grounds so they keep full contrast whatever the band
 * color is, a labelled placeholder renders before any projection
 * exists, and the aria label compresses the band sequence into runs a
 * screen reader can follow.
 */

/** The strip lays out at most this many recorded months before the front. */
export const MAX_HISTORY_SLOTS = 12

const STRIP_W = 720
const STRIP_H = 176
const SLOT_TOP = 30
const SLOT_BOTTOM = 128
const CURVE_TOP = 58
const CURVE_BOTTOM = 124
const GLYPH_BASELINE = 46
const MONTH_LABEL_Y = 146
const TOP_ROW_Y = 20
const HORIZON_Y = 168

/** Below this slot width the band glyph would not read, so it hides. */
const GLYPH_MIN_SLOT = 14
/** Below this slot width only anchor months get a printed label. */
const LABEL_MIN_SLOT = 16

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export interface ForecastStripProps {
  /** The finished projection; null renders the labelled placeholder. */
  projection?: ForecastProjection | null
  /** Overrides the generated aria label with a caller sentence. */
  ariaLabel?: string
}

/** Slot geometry shared with the EI overlay so both agree on percents. */
export interface StripLayout {
  /** Recorded slots drawn left of the storm front. */
  historySlots: number
  /** Every slot on the axis: history slots plus projected months. */
  totalSlots: number
  /** ViewBox units per slot. */
  slotWidth: number
}

/**
 * The slot grid for one projection: history is capped at
 * MAX_HISTORY_SLOTS so a long horizon keeps most of the width, and the
 * month percent for the overlay is (historySlots plus month) over
 * totalSlots, which lands on the same x the curve uses.
 */
export function stripLayout(projection: ForecastProjection): StripLayout {
  const historySlots = Math.min(projection.history.length, MAX_HISTORY_SLOTS)
  const totalSlots = Math.max(1, historySlots + projection.months.length)
  return { historySlots, totalSlots, slotWidth: STRIP_W / totalSlots }
}

/** Consecutive months in one band, the run length for the aria label. */
function bandRuns(months: readonly ForecastMonthPoint[]): { bandId: ForecastMonthPoint['bandId']; length: number }[] {
  const runs: { bandId: ForecastMonthPoint['bandId']; length: number }[] = []
  for (const point of months) {
    const last = runs[runs.length - 1]
    if (last && last.bandId === point.bandId) {
      last.length += 1
    } else {
      runs.push({ bandId: point.bandId, length: 1 })
    }
  }
  return runs
}

function describeProjection(projection: ForecastProjection): string {
  const months = projection.months
  const first = months[0]
  const last = months[months.length - 1]
  if (!first || !last) {
    return 'Forecast strip, no months projected.'
  }
  const historyClause =
    projection.history.length > 0
      ? `${projection.history.length} recorded months`
      : 'no recorded months'
  const runs = bandRuns(months)
    .map(
      (run) =>
        `${verdictBandById(run.bandId).label.toLowerCase()} for ${run.length} month${run.length === 1 ? '' : 's'}`,
    )
    .join(', ')
  const pinMonth = projection.landfall.monthIndex
  const pinClause =
    pinMonth !== null && projection.landfall.withinHorizon && months[pinMonth]
      ? `Landfall pin at ${projection.landfall.label}, ${months[pinMonth].labelMonth}.`
      : `Pin: ${NO_LANDFALL_LABEL}.`
  const cliffClause = projection.eiCliff.visible ? ` ${projection.eiCliff.label}.` : ''
  return (
    `Forecast strip: ${historyClause}, then ${months.length} projected months ` +
    `from ${first.labelMonth} to ${last.labelMonth}. Bands: ${runs}. ` +
    `${pinClause} Horizon ${projection.horizonMonths} months.${cliffClause}`
  )
}

/** The printed axis note: default, extended to landfall, or capped out. */
function horizonLabel(projection: ForecastProjection): string {
  const base = `Projection horizon: ${projection.horizonMonths} months`
  if (projection.horizonMonths <= DEFAULT_HORIZON_MONTHS) {
    return base
  }
  return projection.landfall.withinHorizon
    ? `${base}, extended to the landfall month`
    : `${base}, landfall sits beyond this view`
}

/** One slot's hover text: month, band, runway, and buffer in dollars. */
function monthTooltip(point: ForecastMonthPoint): string {
  const band = verdictBandById(point.bandId)
  return (
    `${point.labelMonth}: ${band.label.toLowerCase()}, ` +
    `runway ${formatDeciMonths(point.answer.deciMonths, point.answer.state)}, ` +
    `buffer ${formatCents(point.balanceCents)}`
  )
}

/** Compact month label for long axes, for example "Jan 26". */
function compactMonthLabel(labelMonth: string): string {
  const year = labelMonth.slice(2, 4)
  const monthIndex = Number(labelMonth.slice(5, 7)) - 1
  const abbr = MONTH_ABBR[monthIndex] ?? labelMonth.slice(5, 7)
  return `${abbr} ${year}`
}

function placeholder(): ReactElement {
  return (
    <div className="wx-strip">
      <svg
        className="wx-strip__svg"
        viewBox={`0 0 ${STRIP_W} ${STRIP_H}`}
        role="img"
        aria-label="Forecast strip, no forecast wired yet."
      >
        <rect
          x={0}
          y={SLOT_TOP}
          width={STRIP_W}
          height={SLOT_BOTTOM - SLOT_TOP}
          rx={2}
          className="wx-strip__placeholder"
        />
        <text
          x={STRIP_W / 2}
          y={(SLOT_TOP + SLOT_BOTTOM) / 2}
          textAnchor="middle"
          className="wx-strip__empty"
        >
          forecast not wired yet
        </text>
      </svg>
    </div>
  )
}

export default function ForecastStrip({ projection, ariaLabel }: ForecastStripProps) {
  if (!projection || projection.months.length === 0) {
    return placeholder()
  }

  const { historySlots, slotWidth } = stripLayout(projection)
  const months = projection.months
  const slotGap = Math.min(3, slotWidth * 0.15)
  const tileWidth = Math.max(1, slotWidth - slotGap)
  const monthX = (index: number): number => (historySlots + index) * slotWidth
  const historyX = (index: number): number => (index + 0.5) * slotWidth

  // Float pixel mapping only: scale every drawn balance onto the viewBox.
  const values: number[] = []
  for (const entry of projection.history.slice(0, historySlots)) {
    values.push(entry.balanceCents)
  }
  for (const point of months) {
    values.push(point.balanceCents)
  }
  if (projection.eiCliff.visible) {
    for (const point of projection.eiCliff.continuation) {
      values.push(point.balanceCents)
    }
  }
  let yMax = Math.max(0, ...values)
  let yMin = Math.min(0, ...values)
  if (yMax === yMin) {
    yMax = yMin + 1
  }
  const y = (value: number): number =>
    CURVE_BOTTOM - ((value - yMin) / (yMax - yMin)) * (CURVE_BOTTOM - CURVE_TOP)
  const zeroY = y(0)

  const dense = slotWidth >= LABEL_MIN_SLOT
  const showGlyphs = slotWidth >= GLYPH_MIN_SLOT
  const labelFor = (point: ForecastMonthPoint): string =>
    dense ? point.labelMonth.slice(5) : compactMonthLabel(point.labelMonth)
  const showLabel = (point: ForecastMonthPoint, index: number): boolean =>
    dense || index === 0 || index === months.length - 1 || point.labelMonth.endsWith('-01')

  const historyPoints = projection.history.slice(0, historySlots)
  const historyPolyline = historyPoints
    .map((entry, index) => `${historyX(index)},${y(entry.balanceCents)}`)
    .join(' ')
  const projectionPolyline = months
    .map((point, index) => `${monthX(index)},${y(point.balanceCents)}`)
    .join(' ')

  const cliff = projection.eiCliff
  const afterPoint = cliff.continuation[cliff.continuation.length - 1]
  const showSecondPin =
    cliff.visible &&
    cliff.afterMonthIndex !== null &&
    cliff.afterMonthIndex <= projection.horizonMonths &&
    afterPoint !== undefined &&
    afterPoint.monthIndex === cliff.afterMonthIndex

  const landfall = projection.landfall
  const pinMonth = landfall.monthIndex
  const pinPoint = pinMonth !== null ? months[pinMonth] : undefined
  const showPin = landfall.withinHorizon && pinPoint !== undefined
  const pinX = pinMonth !== null ? monthX(pinMonth) : 0
  const pinBand = pinPoint ? verdictBandById(pinPoint.bandId) : null
  // The chip sits just above the pin point, clear of the top row the
  // HTML cliff label occupies and of the horizon note at the bottom.
  const pinChipX = Math.min(Math.max(pinX, 60), STRIP_W - 60)
  const pinChipY = pinPoint
    ? Math.max(SLOT_TOP + 13, Math.min(y(pinPoint.balanceCents) - 13, CURVE_BOTTOM - 4))
    : SLOT_TOP + 13

  const frontX = historySlots * slotWidth

  return (
    <div className="wx-strip">
      <svg
        className="wx-strip__svg"
        viewBox={`0 0 ${STRIP_W} ${STRIP_H}`}
        role="img"
        aria-label={ariaLabel ?? describeProjection(projection)}
      >
        {/* Band colored month slots: color plus glyph plus tooltip. */}
        {months.map((point, index) => {
          const band = verdictBandById(point.bandId)
          const x = monthX(index)
          return (
            <g
              key={`${point.labelMonth}:${index}`}
              className="wx-strip__tile"
              style={{ animationDelay: `${Math.min(index, 24) * 45}ms` }}
            >
              <title>{monthTooltip(point)}</title>
              <rect
                x={x}
                y={SLOT_TOP}
                width={tileWidth}
                height={SLOT_BOTTOM - SLOT_TOP}
                rx={2}
                className={`wx-slot ${band.tailwind}`}
              />
              {showGlyphs ? (
                <text
                  x={x + tileWidth / 2}
                  y={GLYPH_BASELINE}
                  textAnchor="middle"
                  className={`wx-strip__glyph ${band.tailwind}`}
                  aria-hidden="true"
                >
                  {band.glyph}
                </text>
              ) : null}
              {showLabel(point, index) ? (
                <text
                  x={x + tileWidth / 2}
                  y={MONTH_LABEL_Y}
                  textAnchor="middle"
                  className="wx-strip__month"
                >
                  {labelFor(point)}
                </text>
              ) : null}
            </g>
          )
        })}

        {/* The zero line: where the buffer runs out. */}
        <line x1={0} y1={zeroY} x2={STRIP_W} y2={zeroY} className="wx-zero-line" />

        {/* Recorded balances, muted, left of the storm front, with the
            printed legend on the top row (clear of the HTML cliff label,
            which sits at the marker's percent further right). */}
        {historyPoints.length > 0 ? (
          <g className="wx-history">
            <polyline className="wx-history-line" points={historyPolyline} />
            {historyPoints.map((entry, index) => (
              <circle
                key={`${entry.labelMonth}:${index}`}
                cx={historyX(index)}
                cy={y(entry.balanceCents)}
                r={2}
                className="wx-history-dot"
              />
            ))}
            <text x={4} y={TOP_ROW_Y} className="wx-history-legend">
              Recorded average balances
            </text>
          </g>
        ) : null}

        {/* The projection curve over the slots. */}
        <polyline className="wx-projection-line" points={projectionPolyline} />

        {/* Worst case continuation after EI stops, dashed so it never
            reads as the answer key figure. */}
        {cliff.visible && cliff.continuation.length > 1 ? (
          <polyline
            className="wx-continuation-line"
            points={cliff.continuation
              .map((point) => `${monthX(point.monthIndex)},${y(point.balanceCents)}`)
              .join(' ')}
          />
        ) : null}
        {showSecondPin && afterPoint ? (
          <circle
            cx={monthX(afterPoint.monthIndex)}
            cy={y(afterPoint.balanceCents)}
            r={4}
            className="wx-ei-pin"
          >
            <title>{`${cliff.label}. Worst case buffer gone at month ${cliff.afterMonthIndex}.`}</title>
          </circle>
        ) : null}

        {/* The storm front at month 0: live shock or quiet fallback. */}
        <line
          x1={frontX}
          y1={SLOT_TOP}
          x2={frontX}
          y2={SLOT_BOTTOM}
          className={projection.stormFront.active ? 'wx-front wx-front-active' : 'wx-front wx-front-idle'}
        />

        {/* The landfall pin, or the honest fallback chip. */}
        {showPin && pinPoint && pinBand ? (
          <g className="wx-pin">
            <line
              x1={pinX}
              y1={SLOT_TOP}
              x2={pinX}
              y2={y(pinPoint.balanceCents)}
              className="wx-pin-stem"
            />
            <circle
              cx={pinX}
              cy={y(pinPoint.balanceCents)}
              r={4.5}
              className={`wx-pin-dot ${pinBand.tailwind}`}
            >
              <title>{`${pinPoint.labelMonth}: landfall, ${landfall.label}`}</title>
            </circle>
            <text x={pinChipX} y={pinChipY} textAnchor="middle" className="wx-pin__label">
              {landfall.label}
            </text>
          </g>
        ) : (
          <text
            x={STRIP_W - 6}
            y={HORIZON_Y}
            textAnchor="end"
            className="wx-pin__label wx-pin__label-faint"
          >
            {NO_LANDFALL_LABEL}
          </text>
        )}

        {/* The printed horizon note. */}
        <text x={6} y={HORIZON_Y} className="wx-strip__horizon">
          {horizonLabel(projection)}
        </text>
      </svg>
    </div>
  )
}
