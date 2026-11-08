import './weather.css'
import { HISTORY_LEGEND_LABEL, type ForecastProjection } from '../../lib/forecast'
import EiCliffOverlay from './EiCliffOverlay'
import ForecastStrip, { stripLayout } from './ForecastStrip'
import WeatherBands from './WeatherBands'

/**
 * The E3 weather panel: one full width section between the shock grid
 * and the plan card that turns the projection into a weather map of
 * one person's money. It owns no math at all: the projection arrives
 * finished from ConsoleView's single derivation pass, and this file
 * only composes the strip, the EI cliff overlay on the strip's own
 * slot grid, the storm front caption, the history honesty note, and
 * the five band chips with month 0's band active.
 *
 * The honesty note is mandatory copy: the recorded balances are
 * context only, and the projection anchors on buffer B (the judge
 * definition, mean of the last 6 recorded balances), never on the
 * last recorded balance a judge might read off the muted line. Empty
 * props render the shell with the placeholder strip and the full band
 * ladder, so the panel is safe to mount before any account is selected.
 */

interface WeatherPanelProps {
  /** The finished projection; null renders the placeholder shell. */
  projection?: ForecastProjection | null
}

export default function WeatherPanel({ projection }: WeatherPanelProps) {
  const layout = projection && projection.months.length > 0 ? stripLayout(projection) : null
  const firstMonth = projection?.months[0]
  const activeBandId = firstMonth?.bandId ?? null
  const storm = projection?.stormFront ?? null

  return (
    <section className="cp-panel wx-panel" aria-labelledby="forecast-heading">
      <header className="cp-panel__head">
        <p className="cp-eyebrow">Forecast</p>
        <h2 className="cp-title" id="forecast-heading">
          Your buffer, month by month
        </h2>
        {storm ? (
          <p className="cp-sub">
            <span className="wx-storm-tag">Storm front</span>
            {storm.label}
          </p>
        ) : null}
      </header>

      <div className="wx-cliff-wrap">
        <ForecastStrip projection={projection ?? null} />
        {projection && layout ? (
          <EiCliffOverlay
            visible={projection.eiCliff.visible}
            cliffIndex={projection.eiCliff.monthIndex}
            monthCount={layout.totalSlots}
            startIndex={layout.historySlots}
            label={projection.eiCliff.label}
            afterIndex={projection.eiCliff.afterMonthIndex}
          />
        ) : null}
      </div>

      {projection ? (
        <p className="wx-honesty">
          <span className="wx-honesty__swatch" aria-hidden="true" />
          <span className="wx-honesty__legend">{HISTORY_LEGEND_LABEL}</span>
          <span>
            Context only: the projection starts from buffer B, the mean of the last 6 recorded
            balances, not the last recorded balance.
          </span>
        </p>
      ) : null}

      <WeatherBands activeBandId={activeBandId} />
    </section>
  )
}
