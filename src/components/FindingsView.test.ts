import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import FindingsView, { loadSharedFindingsReport } from './FindingsView'
import {
  parseFindingsReport,
  parseFindingsSummary,
  parseModelCard,
  type FindingId,
} from '../data/findings'

/**
 * The FINDINGS landing view must be data driven end to end: the stopgap
 * summary contract, the full report parser, and the model card parser all
 * run against the shipped public/data artifacts, and the container renders
 * the loading branch during SSR (the loaded body is covered in
 * report/report.test.ts).
 */

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))
}

function readFindings(): Record<string, unknown> {
  return readJson('../../public/data/findings.json') as Record<string, unknown>
}

describe('FindingsView container', () => {
  it('renders the loading branch before the bundled report arrives', () => {
    const html = renderToString(createElement(FindingsView))
    expect(html).toContain('Loading findings')
    expect(html).toContain('Findings')
  })

  it('accepts the shell deep-link callback that carries a finding id', () => {
    const seen: (string | undefined)[] = []
    const onExplore = (findingId?: FindingId): void => {
      seen.push(findingId)
    }
    const html = renderToString(createElement(FindingsView, { onExplore }))
    expect(html).toContain('Loading findings')
    // Server rendering runs no effects, so only a real click can fire it.
    expect(seen).toEqual([])
  })
})

describe('shared findings load (report view plus deep-link seam)', () => {
  it('serves both consumers from a single fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => readFindings(),
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      const first = loadSharedFindingsReport()
      const second = loadSharedFindingsReport()
      expect(second).toBe(first)

      const report = await first
      expect(report.sections.map((section) => section.id)).toEqual([
        'F1',
        'F2',
        'F3',
        'F4',
        'F5',
      ])
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('findings report parser (full report contract)', () => {
  it('parses the shipped findings.json into meta and five sections', () => {
    const report = parseFindingsReport(readFindings())

    expect(report.meta.seed).toBe(20261107)
    expect(report.meta.transactionRowCount).toBe(5702)
    expect(report.meta.dateRange).toEqual({ start: '2025-11-01', end: '2026-10-31' })
    expect(report.meta.categoryCount).toBe(7)
    expect(report.meta.dayCount).toBe(365)
    expect(report.meta.transactionSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(report.meta.sourceCsvPath).toBe('data/mock/tangerine_transactions.csv')
    expect(report.meta.baselineCrossCheckMatches).toBe(true)
    expect(report.meta.syntheticNotice).toContain('SYNTHETIC')

    expect(report.sections.map((section) => section.id)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5'])

    const raw = readFindings()
    const keys = [
      'f1StructuralVsDiscretionary',
      'f2Seasonality',
      'f3DeficitRisk',
      'f4PlaneChangeCost',
      'f5Interventions',
    ] as const
    for (const [index, key] of keys.entries()) {
      const section = report.sections[index]
      const source = raw[key] as { question: string; method: string; limitations: string[] }
      expect(section?.key).toBe(key)
      expect(section?.question).toBe(source.question)
      expect(section?.method).toBe(source.method)
      expect(section?.methodOneLiner.endsWith('.')).toBe(true)
      expect(section?.methodOneLiner.length).toBeLessThan(source.method.length)
      expect(section?.limitations.length).toBe(source.limitations.length)
      expect(section?.limitations.length).toBeGreaterThan(0)
      expect(section?.metric.value.length).toBeGreaterThan(0)
      expect(section?.metric.label.length).toBeGreaterThan(0)
    }
  })

  it('carries the headline readout numbers the report is judged on', () => {
    const report = parseFindingsReport(readFindings())
    const byId = new Map(report.sections.map((section) => [section.id, section]))

    expect(byId.get('F1')?.metric.value).toBe('5.08%')
    expect(byId.get('F1')?.metric.label).toContain('structural')
    expect(byId.get('F2')?.metric.value).toBe('1.80x')
    expect(byId.get('F2')?.metric.label).toContain('Retail')
    expect(byId.get('F3')?.metric.value).toBe('0.590')
    expect(byId.get('F3')?.metric.label).toContain('night-before')
    expect(byId.get('F4')?.metric.value).toBe('+$1,005.93')
    expect(byId.get('F5')?.metric.value).toBe('+$2,366.72')
  })

  it('parses the chart twin slices each chart draws from', () => {
    const report = parseFindingsReport(readFindings())
    const f1 = report.sections[0]
    const f2 = report.sections[1]
    const f3 = report.sections[2]
    const f4 = report.sections[3]
    const f5 = report.sections[4]

    if (f1?.id !== 'F1' || f2?.id !== 'F2' || f3?.id !== 'F3' || f4?.id !== 'F4' || f5?.id !== 'F5') {
      throw new Error('sections must parse in report order')
    }

    expect(f1.lags).toHaveLength(45)
    expect(f1.categoryBars).toHaveLength(7)
    expect(f1.acfSeries).toHaveLength(7)
    expect(f1.acfSeries.every((entry) => entry.acf.length === 45)).toBe(true)

    expect(f2.monthLabels).toHaveLength(12)
    expect(f2.monthShares).toHaveLength(7)
    expect(f2.calendarMonthShares).toHaveLength(12)
    expect(f2.strongestCalendarCategory).toBe('Retail')

    expect(f3.rocFpr.length).toBeGreaterThan(10)
    expect(f3.rocFpr.length).toBe(f3.rocTpr.length)
    expect(f3.chartCoefficientFeatures[0]).toBe('spend_volatility_30d')
    expect(f3.confusion.truePositive).toBe(13)

    expect(f4.bars).toHaveLength(7)
    expect(f4.baselineDrawdownCents).toBe(2188401)
    expect(f4.bestAlignedCategory).toBe('Travel')
    expect(f4.monthlySeriesForCategory).toBe('Travel')

    expect(f5.bars).toHaveLength(4)
    expect(f5.interventions).toHaveLength(4)
    expect(f5.rankingOrder[0]).toBe('cap_top_surge')
    expect(f5.autoSaveAuxiliary.deficitDaysBaseline).toBe(86)
  })

  it('rejects a report payload that drifted from the pipeline schema', () => {
    expect(() => parseFindingsReport(null)).toThrow('findings must be an object')
    expect(() => parseFindingsReport({})).toThrow('findings.meta must be an object')

    const missingF3 = readFindings()
    delete missingF3.f3DeficitRisk
    expect(() => parseFindingsReport(missingF3)).toThrow(
      'findings.f3DeficitRisk must be an object',
    )

    const badRoc = readFindings()
    ;(badRoc.f3DeficitRisk as { chartTwin: { roc: { fpr: unknown } } }).chartTwin.roc.fpr = 'drifted'
    expect(() => parseFindingsReport(badRoc)).toThrow('chartTwin.roc.fpr must be an array')
  })
})

describe('model card parser', () => {
  it('parses the shipped model card', () => {
    const card = parseModelCard(readJson('../../public/data/model_card.json'))

    expect(card.modelName).toBe('Ledger Odyssey deficit day risk')
    expect(card.randomSeed).toBe(20261107)
    expect(card.data.rowsModeled).toBe(364)
    expect(card.data.rowCount).toBe(5702)
    expect(card.data.nightBeforeRule.length).toBeGreaterThan(0)
    expect(card.data.excludedByDesign.length).toBeGreaterThan(0)
    expect(card.split.splitDate).toBe('2026-02-01')
    expect(card.split.selectedC).toBe(1)
    expect(card.metrics.testAuc).toBeCloseTo(0.58981, 5)
    expect(card.metrics.confusion.truePositive).toBe(13)
    expect(card.intendedUse.length).toBeGreaterThan(0)
    expect(card.notIntendedUse.length).toBeGreaterThanOrEqual(3)
    expect(card.limitations.length).toBeGreaterThanOrEqual(5)
    expect(card.fairnessCaveats.length).toBeGreaterThanOrEqual(3)
    expect(card.correlationNotCausation).toContain('causal')
    expect(card.topCoefficients[0]?.feature).toBe('spend_volatility_30d')
    expect(card.topCoefficients[0]?.standardizedCoefficient).toBeCloseTo(1.622348, 6)
  })

  it('rejects a model card that drifted from the pipeline schema', () => {
    expect(() => parseModelCard(null)).toThrow('modelCard must be an object')
    expect(() => parseModelCard({})).toThrow('modelCard.modelName must be a non-empty string')

    const card = readJson('../../public/data/model_card.json') as Record<string, unknown>
    delete card.metrics
    expect(() => parseModelCard(card)).toThrow('modelCard.metrics must be an object')
  })
})

describe('stopgap summary contract (kept for compatibility)', () => {
  it('still parses five titles and headline numbers', () => {
    const summary = parseFindingsSummary(readFindings())
    expect(summary.syntheticNotice).toContain('SYNTHETIC')
    expect(summary.lines).toHaveLength(5)
    expect(summary.lines.map((line) => line.id)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5'])
    expect(summary.lines[0]?.headline).toMatch(/^\d+\.\d{2}% of annual spend is structural/)
    expect(summary.lines[4]?.headline).toMatch(/floor gain from/)
  })
})
