import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  parseFindingsReport,
  type F4Section,
  type FindingsReport,
  type ReportSection,
} from '../../data/findings'
import FindingSection from './FindingSection'

/**
 * The reverse direction of the counterfactual bridge: FindingSection's F4
 * branch notes that the same figure prints on the game's transfer card,
 * read through the shared lookupFriction module so the report and the card
 * cannot disagree. Every other finding must render without the note, a
 * drifted category name must produce no note instead of a fabricated one,
 * and the note wording follows the sign of the figure (tightens, unchanged,
 * widens) exactly like the option card sentence does.
 */

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))
}

const report: FindingsReport = parseFindingsReport(readJson('../../../public/data/findings.json'))

function f4Section(): F4Section {
  const section = report.sections.find((entry) => entry.id === 'F4')
  if (!section || section.id !== 'F4') {
    throw new Error('the shipped report must carry F4')
  }
  return section
}

function sectionById(id: ReportSection['id']): ReportSection {
  const section = report.sections.find((entry) => entry.id === id)
  if (!section) {
    throw new Error(`the shipped report must carry ${id}`)
  }
  return section
}

function render(section: ReportSection): string {
  return renderToString(
    createElement(FindingSection, {
      section,
      provenance: null,
      provenanceStatus: 'ready',
      provenanceError: null,
    }),
  )
}

/**
 * The reverse bridge note as prose: React's SSR comment separators and the
 * markup inside the paragraph are dropped, whitespace collapses, and the
 * stray space React leaves before punctuation is removed, so assertions
 * compare the sentence a reader sees instead of markup fragments. Scoped
 * to the note on purpose: the claim and the chart still carry their own
 * figures under a drifted bar.
 */
function bridgeNote(html: string): string {
  const match = /<p class="rp-bridge">([\s\S]*?)<\/p>/.exec(html)
  if (!match || match[1] === undefined) {
    throw new Error('expected a reverse bridge note')
  }
  return match[1]
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ ([,.])/g, '$1')
    .trim()
}

/** The shipped F4 section with one aligned figure replaced by a drift value. */
function driftedF4(alignedDrawdownImprovementCents: number): F4Section {
  const base = f4Section()
  return {
    ...base,
    bars: base.bars.map((bar) =>
      bar.name === base.bestAlignedCategory ? { ...bar, alignedDrawdownImprovementCents } : bar,
    ),
  }
}

describe('FindingSection F4: reverse bridge note', () => {
  const html = render(f4Section())

  it('states that the game transfer card shows the same figure', () => {
    expect(html).toContain('rp-bridge')
    const note = bridgeNote(html)
    expect(note).toContain('The transfer card in the game shows this same figure:')
    expect(note).toContain('aligning Travel tightens drawdown by $1,005.93')
    expect(note).toContain('tagged as a simulated counterfactual')
    expect(note).not.toContain('drawdown improvement')
  })

  it('names the same category the deep link targets (Travel)', () => {
    expect(f4Section().bestAlignedCategory).toBe('Travel')
    expect(html).toContain('Travel')
    expect(bridgeNote(html)).toContain('aligning Travel')
  })

  it('keeps the explore link next to the note', () => {
    expect(html).toContain('Explore in game')
    expect(html).toContain('href="#play"')
  })

  it('renders no note for the other findings', () => {
    for (const id of ['F1', 'F2', 'F3', 'F5'] as const) {
      expect(render(sectionById(id))).not.toContain('rp-bridge')
    }
  })

  it('renders no note when the F4 category has no entry (no fabrication)', () => {
    const drifted: F4Section = { ...f4Section(), bestAlignedCategory: 'Parking' }
    const driftedHtml = render(drifted)
    expect(driftedHtml).not.toContain('rp-bridge')
    expect(driftedHtml).not.toContain('simulated counterfactual')
  })
})

describe('FindingSection F4: bridge note wording follows the sign', () => {
  it('keeps a positive figure as a tighter drawdown', () => {
    const note = bridgeNote(render(driftedF4(25000)))
    expect(note).toContain('aligning Travel tightens drawdown by $250.00')
    expect(note).not.toContain('drawdown improvement')
  })

  it('reads a zero figure as unchanged with no dollar claim', () => {
    const note = bridgeNote(render(driftedF4(0)))
    expect(note).toContain('aligning Travel leaves the drawdown unchanged')
    expect(note).not.toContain('$')
    expect(note).not.toContain('tightens')
    expect(note).not.toContain('widens')
  })

  it('reads a negative figure as a wider drawdown at the magnitude', () => {
    const note = bridgeNote(render(driftedF4(-43210)))
    expect(note).toContain('aligning Travel widens drawdown by $432.10')
    expect(note).not.toContain('tightens')
    expect(note).not.toContain('-$432.10')
    expect(note).not.toContain('drawdown improvement')
  })
})
