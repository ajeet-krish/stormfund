import { useMemo, type MouseEvent } from 'react'
import './atlas.css'
import {
  ATLAS_AXIS_Y,
  ATLAS_BAR_MAX_H,
  ATLAS_BAR_TOP,
  ATLAS_BIN_BANDS,
  ATLAS_BIN_COUNT,
  ATLAS_DOT_TOP,
  ATLAS_PAD_X,
  ATLAS_PLOT_W,
  ATLAS_TICK_LABELS,
  ATLAS_TICK_Y,
  ATLAS_UNIT_X,
  ATLAS_VIEW_H,
  ATLAS_VIEW_W,
  type AtlasPlot,
} from '../../lib/atlasPlot'

/**
 * The Storm Atlas strip plot (E5): every account in the population as
 * one dot on a piecewise axis whose six segments are the verdict band
 * edges, so the three month window the headline talks about is a
 * sixth of the width instead of a sliver. Above the dot field hangs
 * the bin count silhouette, below it the printed month ticks.
 *
 * Rendering contract: one keyed circle per account, so a twist change
 * reconciles by account id and updates cx, cy, and fill in place
 * instead of rebuilding the field. Colors come from the band data
 * attribute and the shared cp band tokens in src/index.css, never
 * from a second palette. The svg carries role="img" with the headline
 * as its accessible name, and dot clicks bubble to one listener that
 * reports the account id; the typed lookup in the console remains the
 * keyboard path to the same account.
 *
 * Documented fallback, not applied: if profiling ever shows a drag
 * frame above 50 ms under an 8x CPU throttle, the field collapses to
 * one <path> per band (five nodes of subpaths) which keeps the same
 * picture and gives up per dot hit testing. This checkout has no
 * browser automation, so the frame time could not be measured here
 * and the single circle field ships as written.
 *
 * No animation: a population that re-counts itself on every twist
 * must not also move on its own.
 */

export interface AtlasStripPlotProps {
  /** The finished plot for the live scenario, from buildAtlasPlot. */
  plot: AtlasPlot
  /** The headline sentence, carried as the accessible name. */
  label: string
  /** The selected account, ringed and labelled on the field. */
  selectedId?: string | null
  /** Reports a dot click with the account id; absent means no drill. */
  onSelectAccount?: (id: string) => void
}

export default function AtlasStripPlot({
  plot,
  label,
  selectedId,
  onSelectAccount,
}: AtlasStripPlotProps) {
  const dots = useMemo(
    () =>
      plot.dots.map((dot) => (
        <circle
          key={dot.account_id}
          className="ax-dot"
          data-band={dot.band}
          data-account-id={dot.account_id}
          cx={dot.x}
          cy={dot.y}
          r={2.6}
        />
      )),
    [plot],
  )

  const segmentWidth = ATLAS_PLOT_W / ATLAS_BIN_COUNT
  const maxCount = Math.max(1, ...plot.bins.map((bin) => bin.count))
  const selected = selectedId
    ? plot.dots.find((dot) => dot.account_id === selectedId)
    : undefined

  /** One listener reads data-account-id off whatever dot was hit. */
  function handleDotClick(event: MouseEvent<SVGSVGElement>): void {
    if (!onSelectAccount) {
      return
    }
    const target = event.target
    if (target instanceof Element) {
      const id = target.getAttribute('data-account-id')
      if (id) {
        onSelectAccount(id)
      }
    }
  }

  return (
    <figure className="ax-figure">
      <svg
        className="ax-plot__svg"
        viewBox={`0 0 ${ATLAS_VIEW_W} ${ATLAS_VIEW_H}`}
        width="100%"
        role="img"
        aria-label={label}
        onClick={handleDotClick}
      >
        {/* Band tinted segments: the axis follows the verdict bands. */}
        {ATLAS_BIN_BANDS.map((band, index) => (
          <rect
            key={`segment ${band} ${index}`}
            className="ax-seg"
            data-band={band}
            x={ATLAS_PAD_X + index * segmentWidth}
            y={ATLAS_BAR_TOP}
            width={segmentWidth}
            height={ATLAS_AXIS_Y - ATLAS_BAR_TOP}
          />
        ))}

        {/* Bin count silhouette: bar height is the bin share of the
            biggest bin, hanging from the top of the dot field. */}
        {ATLAS_BIN_BANDS.map((band, index) => {
          const bin = plot.bins[index]
          if (!bin) {
            return null
          }
          const height = (bin.count / maxCount) * ATLAS_BAR_MAX_H
          return (
            <rect
              key={`bar ${band} ${index}`}
              className="ax-bar"
              data-band={band}
              x={ATLAS_PAD_X + index * segmentWidth + 2}
              y={ATLAS_DOT_TOP - height}
              width={segmentWidth - 4}
              height={height}
            />
          )
        })}

        {/* The account field: one circle per account, band colored. */}
        {dots}

        {/* The axis line and the printed month ticks. */}
        <line
          className="ax-axis"
          x1={ATLAS_PAD_X}
          y1={ATLAS_AXIS_Y}
          x2={ATLAS_PAD_X + ATLAS_PLOT_W}
          y2={ATLAS_AXIS_Y}
        />
        {ATLAS_TICK_LABELS.map((tick, index) => {
          const isLast = index === ATLAS_TICK_LABELS.length - 1
          const x = isLast
            ? ATLAS_PAD_X + ATLAS_PLOT_W
            : ATLAS_PAD_X + (index / ATLAS_BIN_COUNT) * ATLAS_PLOT_W
          const anchor = index === 0 ? 'start' : isLast ? 'end' : 'middle'
          return (
            <text key={tick} className="ax-tick" x={x} y={ATLAS_TICK_Y} textAnchor={anchor}>
              {tick}
            </text>
          )
        })}
        <text className="ax-unit" x={ATLAS_UNIT_X} y={ATLAS_TICK_Y}>
          (months)
        </text>

        {/* The selected account: ring plus id, clamped inside the field. */}
        {selected && selectedId ? (
          <g className="ax-selection">
            <circle className="ax-ring" cx={selected.x} cy={selected.y} r={6} />
            <text
              className="ax-ring__label"
              x={Math.min(
                Math.max(selected.x, ATLAS_PAD_X + 28),
                ATLAS_PAD_X + ATLAS_PLOT_W - 28,
              )}
              y={selected.y - 11}
            >
              {selectedId}
            </text>
          </g>
        ) : null}
      </svg>
      <figcaption className="ax-caption">
        Every dot is one account. Axis segments follow the verdict bands, not equal months.
      </figcaption>
    </figure>
  )
}
