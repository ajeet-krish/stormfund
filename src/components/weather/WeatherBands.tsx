import './weather.css'
import { VERDICT_BANDS, type VerdictBand, type VerdictBandId } from '../../lib/verdict'

/**
 * The condition bands: the sky legend that prints all five verdict
 * bands with their glyph, label, and threshold sentence, so no surface
 * ever distinguishes bands by color alone (redundant encoding: color
 * plus glyph plus label). This is the single band vocabulary of
 * src/lib/verdict.ts, the same ladder the verdict badge and the
 * forecast strip read, so the legend, the slots, and the badge can
 * never disagree.
 *
 * Band color arrives as the band's own tailwind class on the list item
 * and flows through currentColor into the left rule and the label, so
 * one source (tailwind.config.js cp) paints every surface. The active
 * band gets an inset parchment outline and aria-current, which is how
 * the console marks the month 0 sky. Empty props render the full
 * ladder, so it is safe to mount before any account is loaded.
 */

export interface WeatherBandsProps {
  /** Bands to show, in caller order. Defaults to the full ladder, lowest first. */
  bands?: readonly VerdictBand[] | null
  /** The band to highlight, normally month 0's band. */
  activeBandId?: VerdictBandId | null
}

export default function WeatherBands(props: WeatherBandsProps) {
  const requested = props.bands
  const ladder: readonly VerdictBand[] =
    requested && requested.length > 0 ? requested : VERDICT_BANDS
  const active = props.activeBandId ?? null

  return (
    <ul className="wx-bands" aria-label="Weather condition bands">
      {ladder.map((band) => {
        const isActive = active === band.id
        return (
          <li
            key={band.id}
            className={`wx-band wx-band-${band.id} ${band.tailwind}${isActive ? ' wx-band-active' : ''}`}
            aria-current={isActive ? 'true' : undefined}
          >
            <span className="wx-band__glyph" aria-hidden="true">
              {band.glyph}
            </span>
            <span className="wx-band__body">
              <span className="wx-band__label">{band.label}</span>
              <span className="wx-band__threshold">{band.threshold}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
