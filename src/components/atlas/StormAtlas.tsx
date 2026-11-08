import './atlas.css'
import { ATLAS_BAND_ORDER, type StormAtlasSummary } from '../../lib/stormAtlas'
import { verdictBandById } from '../../lib/verdict'

/**
 * The Storm Atlas headline panel (E5): the population sentence at the
 * largest type in the section, the honest subline under it, and five
 * band cells that repeat the same numbers with redundant encoding
 * (glyph plus label plus color plus count plus percent), so the strip
 * reads from two metres across a judging table.
 *
 * The component renders finished sentences only: the headline and the
 * counts arrive from summarizeStormAtlas, which counted the very
 * entries the same scenario label describes, so no wording about a
 * twist is ever written here. A baselineSummary only arrives when the
 * live twist differs from the untouched console, which is why the
 * comparison line appears exactly when the numbers really moved.
 *
 * Text sits on the console tokens from src/index.css, so every label
 * keeps measured WCAG AA contrast whatever the band color is.
 */

export interface StormAtlasProps {
  /** The finished summary for the live twist, from one atlas run. */
  summary: StormAtlasSummary
  /** The same population at baseline; present only under a twist. */
  baselineSummary?: StormAtlasSummary | null
  /** The account the strip plot has selected, echoed as a chip. */
  selectedId?: string | null
}

/** Grouped digits for every count this panel prints. */
function formatCount(count: number): string {
  return count.toLocaleString('en-CA')
}

export default function StormAtlas({ summary, baselineSummary, selectedId }: StormAtlasProps) {
  const total = formatCount(summary.total)

  return (
    <div className="ax-atlas">
      <h2 className="ax-headline">{summary.headline}</h2>

      <p className="ax-subline">
        <span className="ax-subline__count">
          {`${formatCount(summary.headlineCount)} of ${total} accounts`}
        </span>
        {baselineSummary ? (
          <span className="ax-compare">
            {`At baseline: ${baselineSummary.headlinePercent}% (${formatCount(
              baselineSummary.headlineCount,
            )} of ${formatCount(baselineSummary.total)})`}
          </span>
        ) : null}
        {selectedId ? (
          <span className="ax-track">{`Tracking account ${selectedId}`}</span>
        ) : null}
      </p>

      <ul className="ax-cells">
        {ATLAS_BAND_ORDER.map((bandId) => {
          const band = verdictBandById(bandId)
          const count = summary.counts[bandId]
          const percent = summary.percents[bandId]
          return (
            <li key={bandId} className="ax-cell" data-band={bandId}>
              <span className="ax-cell__glyph" aria-hidden="true">
                {band.glyph}
              </span>
              <span className="ax-cell__label">{band.label}</span>
              <span className="ax-cell__count">{formatCount(count)}</span>
              <span className="ax-cell__percent">{`${percent}% of ${total}`}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
