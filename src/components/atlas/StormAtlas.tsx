import { useMemo } from 'react'
import '../weather/weather.css'
import { SEVERITY_ORDER, WEATHER_META, type WeatherState } from '../../lib/weatherState'
import {
  summarizeStormAtlas,
  type AtlasEntry,
  type StormAtlasOptions,
} from '../../lib/stormAtlas'

/**
 * The Storm Atlas surface (E5): the population headline over seven
 * state cells, each colored by state and showing its count and whole
 * percent, plus a typed click callback for the drill down. Clicking a
 * cell never navigates here: the view owns what a click means, this
 * component only reports which state was picked.
 *
 * The profiles prop is the wiring seam. Until the E5 view passes the
 * loaded profiles the grid renders zero counts and an honest note, so
 * the surface is safe to mount in any wiring state. Counts come from
 * summarizeStormAtlas, which runs the same weatherState ladder the
 * forecast strip draws, and useMemo keeps the 4500 entry aggregation to
 * one pass per props change.
 *
 * Text sits on the soft state tints from weather.css, so every label
 * keeps measured WCAG AA contrast whatever the state color is.
 */

export interface StormAtlasProps extends StormAtlasOptions {
  /** Loaded profiles in AtlasEntry shape; null renders the placeholder. */
  profiles?: readonly AtlasEntry[] | null
  /** Cell the view currently has selected, outlined in the grid. */
  selectedState?: WeatherState | null
  /** Typed drill down callback, one state per click. */
  onSelectState?: (state: WeatherState) => void
}

export default function StormAtlas(props: StormAtlasProps) {
  const profiles = props.profiles ?? null
  const selected = props.selectedState ?? null
  const onSelectState = props.onSelectState

  const summary = useMemo(
    () =>
      summarizeStormAtlas(profiles, {
        headlineState: props.headlineState,
        scenarioLabel: props.scenarioLabel,
      }),
    [profiles, props.headlineState, props.scenarioLabel],
  )

  return (
    <section className="wx-atlas" aria-label="Storm Atlas">
      <h2 className="wx-atlas__headline">{summary.headline}</h2>

      {summary.total === 0 ? (
        <p className="wx-atlas__note">
          Atlas data not wired yet: pass the loaded profiles to see the population counts.
        </p>
      ) : null}

      <ul className="wx-atlas__grid">
        {SEVERITY_ORDER.map((state) => {
          const meta = WEATHER_META[state]
          const count = summary.counts[state]
          const percent = summary.percents[state]
          const isSelected = selected === state
          const cellClass = `wx-atlas__cell wx-atlas__cell-${state}${
            isSelected ? ' wx-atlas__cell-selected' : ''
          }`
          const content = (
            <>
              <span className="wx-atlas__state">
                <span aria-hidden="true">{meta.glyph} </span>
                {meta.label}
              </span>
              <span className="wx-atlas__count">{count.toLocaleString('en-CA')}</span>
              <span className="wx-atlas__percent">{`${percent}% of ${summary.total.toLocaleString(
                'en-CA',
              )}`}</span>
            </>
          )

          return (
            <li key={state}>
              {onSelectState ? (
                <button
                  type="button"
                  className={cellClass}
                  aria-pressed={isSelected}
                  aria-label={`${meta.label}: ${count} accounts, ${percent} percent. Drill into this state.`}
                  onClick={() => onSelectState(state)}
                >
                  {content}
                </button>
              ) : (
                <div className={cellClass}>{content}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
