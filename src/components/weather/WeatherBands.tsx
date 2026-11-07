import './weather.css'
import { SEVERITY_ORDER, WEATHER_META, type WeatherState } from '../../lib/weatherState'

/**
 * The condition bands: the sky legend that prints all seven states with
 * their glyph, label, and threshold sentence. This is the "each state
 * also carries a unique icon silhouette and a printed label" rule from
 * docs/research.md made concrete, so no surface ever distinguishes
 * states by color alone.
 *
 * Bands read the solid state color as the left rule and the soft tint as
 * the background, which keeps the printed threshold sentence above WCAG
 * AA on every band (see the contrast note in weather.css). The active
 * state gets an inset parchment outline and aria-current, which is how
 * the console marks the account's current sky. The scaffold renders for
 * empty props with the full severity ladder, so it is safe to mount
 * before any account is loaded.
 */

export interface WeatherBandsProps {
  /** States to show, in caller order. Defaults to severity, severe first. */
  states?: readonly WeatherState[] | null
  /** The account's current state, highlighted in the ladder. */
  activeState?: WeatherState | null
}

export default function WeatherBands(props: WeatherBandsProps) {
  const requested = props.states
  const states: readonly WeatherState[] =
    requested && requested.length > 0 ? requested : SEVERITY_ORDER
  const active = props.activeState ?? null

  return (
    <ul className="wx-bands" aria-label="Weather condition bands">
      {states.map((state) => {
        const meta = WEATHER_META[state]
        const isActive = active === state
        return (
          <li
            key={state}
            className={`wx-band wx-band-${state}${isActive ? ' wx-band-active' : ''}`}
            aria-current={isActive ? 'true' : undefined}
          >
            <span className="wx-band__glyph" aria-hidden="true">
              {meta.glyph}
            </span>
            <span className="wx-band__body">
              <span className="wx-band__label">{meta.label}</span>
              <span className="wx-band__threshold">{meta.threshold}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
