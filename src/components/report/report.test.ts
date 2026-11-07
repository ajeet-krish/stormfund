import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseFindingsReport, parseModelCard } from '../../data/findings'
import { parseTransactions, parseWorld } from '../../data/loaders'
import { resolveFindingProvenance } from '../../lib/reportProvenance'
import ReportBody from './ReportBody'

/**
 * The full FINDINGS report body rendered against the shipped artifacts:
 * public/data/findings.json, model_card.json, world.json, and
 * transactions.json, exactly as the booth loads them. Every assertion here
 * is about content a judge sees in the first minute: the synthetic banner,
 * the five real headline numbers, the chart twins, the provenance stamps,
 * the model card, and the explore link.
 */

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))
}

const report = parseFindingsReport(readJson('../../../public/data/findings.json'))
const modelCard = parseModelCard(readJson('../../../public/data/model_card.json'))
const world = parseWorld(readJson('../../../public/data/world.json'))
const transactions = parseTransactions(readJson('../../../public/data/transactions.json'))
const provenance = resolveFindingProvenance(world, transactions.rows)

const html = renderToString(
  createElement(ReportBody, {
    report,
    modelCard,
    provenance,
    provenanceStatus: 'ready',
    provenanceError: null,
  }),
)

/** Mirror of React's SSR text escaping so strings compare byte for byte. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#x27;')
    .replace(/"/g, '&quot;')
}

describe('report body: synthetic data banner', () => {
  it('states the synthetic origin and the transfer note loudly', () => {
    expect(html).toContain('Synthetic data, seed 20261107')
    expect(html).toContain('No real bank data')
    expect(html).toContain('SYNTHETIC')
    expect(html).toContain('data/mock/tangerine_transactions.csv')
    expect(html).toContain('transfers unchanged to the real Tangerine dataset')
    expect(html).toContain('aria-label="Synthetic data notice"')
  })

  it('never reaches the network', () => {
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toMatch(/src="/)
  })
})

describe('report body: hero and question panel', () => {
  it('leads with the audited ledger thesis and the five number readout', () => {
    expect(html).toContain('One year of a Tangerine style ledger, audited row by row.')
    expect(html).toContain('how much spending is locked by the calendar')
    for (const value of ['5.08%', '1.80x', '0.590', '+$1,005.93', '+$2,366.72']) {
      expect(html).toContain(value)
    }
    expect(html).toContain('href="#f1"')
    expect(html).toContain('href="#f5"')
  })

  it('shows the ledger facts a judge checks first', () => {
    expect(html).toContain('How to read this report')
    expect(html).toContain('5,702')
    expect(html).toContain('2025-11-01 to 2026-10-31')
    expect(html).toContain('uv run python -m scripts.analysis.build_findings')
    expect(html).toContain('Transactions sha256')
  })
})

describe('report body: the five findings', () => {
  it('renders each question, claim, and method from findings.json', () => {
    for (const section of report.sections) {
      expect(html).toContain(`id="${section.id.toLowerCase()}"`)
      expect(html).toContain(escapeHtml(section.question))
      expect(html).toContain(escapeHtml(section.methodOneLiner))
      expect(html).toContain(`${section.limitations.length} limitations for this finding`)
      expect(html).toContain('Full method, verbatim from findings.json')
    }
    expect(html).toContain('Finding 1 of 5')
    expect(html).toContain('Finding 5 of 5')
    expect(html).toContain('behavioral, not structural')
    expect(html).toContain('Timing buys the trough, not the month end floor')
    expect(html).toContain('The night before screen beats a coin flip')
    expect(html).toContain('honest null')
  })

  it('renders five inline SVG chart twins with data driven labels', () => {
    expect(html.match(/<svg/g)?.length).toBe(5)
    expect(html).toContain('<path')
    expect(html).toContain('role="img"')
    // F1 strip and sparklines
    expect(html).toContain('Structural share and lag autocorrelation')
    // F2 holiday band
    expect(html).toContain('holiday window, 47 days')
    // F3 ROC and coefficients
    expect(html).toContain('AUC 0.590')
    expect(html).toContain('confusion at 0.5')
    expect(html).toContain('+1.6223')
    // F4 signature waterfall
    expect(html).toContain('Drawdown waterfall: baseline to aligned')
    expect(html).toContain('all aligned')
    // F5 ranked bars with dollar labels
    expect(html).toContain('Ranked interventions on one dollar axis')
    expect(html).toContain('1. Cap the top surge category at its baseline rate')
  })

  it('stamps every finding with a verified row count', () => {
    expect(html).toContain('Verified against 5,689 rows, checksum ok')
    expect(html).toContain('Verified against 5,702 rows, checksum ok')
    expect(html).toContain('expand for the row level inspector')
    expect(html).toContain('Checksums')
    expect(html).toContain('Missing ids')
    expect(html).toContain('Generator filters (7)')
    expect(html).toContain('First 12 of 5,689 rows, sorted by date')
    expect(html).toContain('TAN-')
  })

  it('offers the explore in game deep link on every finding and the CTA', () => {
    expect(html.match(/href="#play"/g)?.length).toBe(6)
    expect(html).toContain('Explore in game')
  })
})

describe('report body: model card, limits, and CTA', () => {
  it('renders the model card as the trust artifact for F3', () => {
    expect(html).toContain('Ledger Odyssey deficit day risk')
    expect(html).toContain('Intended use')
    expect(html).toContain('Not intended for')
    expect(html).toContain('Correlation, not causation')
    expect(html).toContain('fairness caveats')
    expect(html).toContain('How the features stay night before')
    expect(html).toContain('time ordered, no shuffling')
  })

  it('indexes what the report does not claim', () => {
    expect(html).toContain('What this report does not claim')
    expect(html).toContain('Synthetic input.')
    expect(html).toContain('Counterfactual, not causal estimate.')
    expect(html).toContain('Declared thresholds.')
  })

  it('closes with the explore CTA and the reproduce note', () => {
    expect(html).toContain('Fly the same numbers in the game')
    expect(html).toContain('scripts.analysis.verify_findings')
  })
})

describe('report body: accessibility surface', () => {
  it('labels sections, charts, and scroll regions', () => {
    expect(html).toContain('aria-labelledby="f1-question"')
    expect(html).toContain('aria-labelledby="model-card-title"')
    expect(html).toContain('aria-labelledby="limits-title"')
    expect(html).toContain('aria-labelledby="cta-title"')
    expect(html).toContain('figcaption')
    expect(html).toContain('scrolls horizontally on narrow screens')
    expect(html).toContain('scope="col"')
  })
})
