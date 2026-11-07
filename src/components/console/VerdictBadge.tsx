import { formatDeciMonths } from '../../lib/format'
import type { RunwayAnswer } from '../../lib/shocks'
import type { VerdictBand } from '../../lib/verdict'

/**
 * The shared verdict readout: band glyph, band label, the band's
 * threshold, and the runway number labeled "steady state". This is the
 * console's signature element, so it is built to read from two metres
 * away: a weather glyph, an uppercase tracked band name in the band
 * color, and a tabular runway figure large enough to see across a
 * judging table. The number remounts when the band or the tenths change
 * so the tick animation plays, and it is disabled by the reduced motion
 * rule in index.css. role="status" announces the change to a screen
 * reader without stealing focus.
 */

interface VerdictBadgeProps {
  band: VerdictBand
  runway: RunwayAnswer
  /** What this number describes, for example Baseline or After the shock. */
  caption: string
  /** Hero size for the shock panel, compact for the baseline card. */
  variant?: 'hero' | 'compact'
}

export default function VerdictBadge({
  band,
  runway,
  caption,
  variant = 'hero',
}: VerdictBadgeProps) {
  const formatted = formatDeciMonths(runway.deciMonths, runway.state)

  return (
    <div
      className={`cp-verdict cp-verdict-${variant}`}
      data-band={band.id}
      role="status"
      aria-label={`${caption}: ${band.label}, ${formatted} steady state`}
    >
      <span className="cp-verdict__glyph" aria-hidden="true">
        {band.glyph}
      </span>
      <div className="cp-verdict__body">
        <span className="cp-verdict__caption">{caption}</span>
        <span className={`cp-verdict__label ${band.tailwind}`}>{band.label}</span>
        <strong
          className={`cp-verdict__runway ${band.tailwind}`}
          key={`${band.id}:${runway.state}:${runway.deciMonths}`}
        >
          {formatted}
        </strong>
        <span className="cp-verdict__state">
          steady state, {band.threshold}
        </span>
      </div>
    </div>
  )
}
