import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import StormAtlas from './StormAtlas'
import { ATLAS_BAND_ORDER, summarizeStormAtlas, type AtlasEntry } from '../../lib/stormAtlas'
import { verdictBandById, type VerdictBandId } from '../../lib/verdict'

/**
 * The headline panel markup contract: the sentence word for word for
 * baseline and twisted populations, the comparison subline only when a
 * baseline summary arrives, five band cells in ladder order with
 * glyph, label, count, and percent, and the tracking chip for the
 * selected account. Server rendering only: the panel owns no callbacks.
 */

/** One band's runway answer: deci readings land exactly on that band. */
const BAND_ROW: Record<VerdictBandId, readonly [AtlasEntry['runway_state'], number]> = {
  critical: ['finite', 0],
  storm_warning: ['finite', 20],
  watch: ['finite', 40],
  fair_skies: ['finite', 90],
  clear: ['no_shortfall', 1200],
}

/** A population of exactly the counts given, one id per row. */
function population(counts: Record<VerdictBandId, number>, prefix: string): AtlasEntry[] {
  const rows: AtlasEntry[] = []
  for (const bandId of ATLAS_BAND_ORDER) {
    const [runway_state, runway_deci_months] = BAND_ROW[bandId]
    for (let index = 0; index < counts[bandId]; index += 1) {
      rows.push({
        account_id: `${prefix}:${bandId}:${index}`,
        runway_state,
        runway_deci_months,
      })
    }
  }
  return rows
}

/** 100 accounts with 34 under three months: the baseline sentence. */
const BASELINE = population(
  { critical: 10, storm_warning: 24, watch: 5, fair_skies: 6, clear: 55 },
  'base',
)

/** 100 accounts with 61 under three months: the twisted sentence. */
const TWISTED = population(
  { critical: 20, storm_warning: 41, watch: 10, fair_skies: 9, clear: 20 },
  'twist',
)

const baselineSummary = summarizeStormAtlas(BASELINE)
const twistedSummary = summarizeStormAtlas(TWISTED, {
  scenarioLabel: 'under the laid off twist',
})

describe('StormAtlas markup', () => {
  it('prints the baseline headline word for word', () => {
    const html = renderToString(createElement(StormAtlas, { summary: baselineSummary }))
    expect(html).toContain(
      '<h2 class="ax-headline">34% of accounts have under 3 months of runway at baseline</h2>',
    )
    expect(html).toContain('34 of 100 accounts')
    expect(html).not.toContain('At baseline:')
  })

  it('prints the twisted headline and the baseline comparison', () => {
    const html = renderToString(
      createElement(StormAtlas, { summary: twistedSummary, baselineSummary }),
    )
    expect(html).toContain(
      '<h2 class="ax-headline">61% of accounts would have under 3 months of runway under the laid off twist</h2>',
    )
    expect(html).toContain('61 of 100 accounts')
    expect(html).toContain('At baseline: 34% (34 of 100)')
  })

  it('shows the comparison subline only when a baseline arrives', () => {
    const withBaseline = renderToString(
      createElement(StormAtlas, { summary: twistedSummary, baselineSummary }),
    )
    const withoutBaseline = renderToString(
      createElement(StormAtlas, { summary: twistedSummary }),
    )
    expect(withBaseline.split('At baseline:').length - 1).toBe(1)
    expect(withoutBaseline).not.toContain('At baseline:')
    expect(
      renderToString(createElement(StormAtlas, { summary: twistedSummary, baselineSummary: null })),
    ).not.toContain('At baseline:')
  })

  it('renders five band cells with glyph, label, count, and percent', () => {
    const html = renderToString(createElement(StormAtlas, { summary: baselineSummary }))
    expect(html.split('data-band="').length - 1).toBe(5)
    expect(html).not.toContain('<button')

    for (const bandId of ATLAS_BAND_ORDER) {
      const band = verdictBandById(bandId)
      expect(html, bandId).toContain(`data-band="${bandId}"`)
      expect(html, bandId).toContain(band.glyph)
      expect(html, bandId).toContain(band.label)
      expect(html, bandId).toContain(`${baselineSummary.percents[bandId]}% of 100`)
    }

    expect(html).toContain('>10</span>')
    expect(html).toContain('>24</span>')
    expect(html).toContain('>55</span>')

    // Ladder order: critical first, clear last.
    expect(html.indexOf('data-band="critical"')).toBeLessThan(
      html.indexOf('data-band="storm_warning"'),
    )
    expect(html.indexOf('data-band="fair_skies"')).toBeLessThan(html.indexOf('data-band="clear"'))
  })

  it('echoes the selected account as a tracking chip', () => {
    const html = renderToString(
      createElement(StormAtlas, { summary: baselineSummary, selectedId: '68257' }),
    )
    expect(html).toContain('Tracking account 68257')
    expect(
      renderToString(createElement(StormAtlas, { summary: baselineSummary })),
    ).not.toContain('Tracking account')
  })

  it('renders an honest zero panel for an empty population', () => {
    const html = renderToString(createElement(StormAtlas, { summary: summarizeStormAtlas([]) }))
    expect(html).toContain('No accounts in the atlas yet')
    expect(html.split('data-band="').length - 1).toBe(5)
    expect(html.split('>0</span>').length - 1).toBe(5)
    expect(html).toContain('0% of 0')
  })
})

describe('StormAtlas stylesheet: one line at judging widths', () => {
  it('keeps the five band cells on a single flex row with one phone escape', () => {
    const css = readFileSync(new URL('./atlas.css', import.meta.url), 'utf8')

    const cells = css.match(/\.ax-cells \{[^}]*\}/)?.[0] ?? ''
    expect(cells).toContain('display: flex')
    expect(cells).toContain('flex-wrap: nowrap')

    const cell = css.match(/\.ax-cell \{[^}]*\}/)?.[0] ?? ''
    expect(cell).toContain('flex: 1 1 0')
    expect(cell).toContain('min-width: 0')

    // The only place the row breaks sits under a narrow phone width.
    expect(css).toMatch(/@media \(max-width: 36rem\) \{\s*\.ax-cells \{[^}]*flex-wrap: wrap/)
  })
})
