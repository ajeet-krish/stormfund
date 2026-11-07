import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseFindingsReport } from '../data/findings'
import type { FindingsReport, ReportSection } from '../data/findings'
import { parseTransactions, parseWorld } from '../data/loaders'
import {
  buildRiverScene,
  dailyClosingBalances,
  dayIndexOf,
  hash01,
  incomeDatesInRange,
  isPaydayPhase,
} from './riverData'

/**
 * Money River scene model against the shipped artifacts, not fixtures:
 * public/data/world.json, transactions.json, and findings.json are parsed
 * with the same loaders the booth uses. Every expected number here is the
 * published pipeline number, so this file fails if the river starts painting
 * a story the pipeline did not compute (the 86 deficit days of F3, the 12
 * 25th phase paydays of F4, the +$2,366.72 F5 floor lift), and it fails if
 * the two documented approximations ever stop declaring themselves.
 */

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))
}

const world = parseWorld(readJson('../../public/data/world.json'))
const transactions = parseTransactions(readJson('../../public/data/transactions.json'))
const report: FindingsReport = parseFindingsReport(readJson('../../public/data/findings.json'))

function sectionOf<K extends ReportSection['id']>(id: K): Extract<ReportSection, { id: K }> {
  const found = report.sections.find((entry) => entry.id === id)
  if (!found || found.id !== id) {
    throw new Error(`findings report is missing ${id}`)
  }
  return found as Extract<ReportSection, { id: K }>
}

const scene = buildRiverScene({ world, transactions, report })

describe('river scene: water surface from the shipped transaction rows', () => {
  it('paints one closing balance per calendar day of the ledger window', () => {
    expect(scene.points).toHaveLength(365)
    expect(scene.points).toHaveLength(report.meta.dayCount)
    expect(scene.points[0]?.date).toBe('2025-11-01')
    expect(scene.points[scene.points.length - 1]?.date).toBe('2026-10-31')

    const dates = scene.points.map((point) => point.date)
    expect(new Set(dates).size).toBe(dates.length)
    for (let index = 1; index < dates.length; index += 1) {
      const previous = Date.parse(`${dates[index - 1]}T00:00:00Z`)
      const current = Date.parse(`${dates[index]}T00:00:00Z`)
      expect(current - previous).toBe(86_400_000)
    }
    for (const point of scene.points) {
      expect(Number.isInteger(point.balanceCents)).toBe(true)
    }
  })

  it('agrees with the pipeline month end closes on all 12 months', () => {
    // The daily rule (last row of the day) must reproduce the published
    // monthly rule (final row of the month) exactly, or the painting's
    // surface and its horizon ridges would disagree about the same ledger.
    const closes = new Map(scene.points.map((point) => [point.date, point.balanceCents]))
    expect(scene.monthRidges).toHaveLength(12)
    for (const ridge of world.monthly_balance_series) {
      expect(closes.get(ridge.date)).toBe(ridge.balanceCents)
      const painted = scene.monthRidges.find((entry) => entry.month === ridge.month)
      expect(painted?.balanceCents).toBe(ridge.balanceCents)
      expect(painted?.date).toBe(ridge.date)
    }
  })

  it('clamps day indexing to the ledger window', () => {
    expect(dayIndexOf('2025-11-02', '2025-11-01', '2026-10-31')).toBe(1)
    expect(dayIndexOf('2020-01-01', '2025-11-01', '2026-10-31')).toBe(0)
    expect(dayIndexOf('2030-06-01', '2025-11-01', '2026-10-31')).toBe(364)
  })
})

describe('river scene: drought stones from the F3 deficit rule', () => {
  it('reproduces the published deficit day count exactly', () => {
    const f3 = sectionOf('F3')
    const publishedEvents = f3.trainEvents + f3.testEvents
    expect(publishedEvents).toBe(86)
    expect(scene.deficitDays).toHaveLength(publishedEvents)
    expect(scene.caption.deficitDayCount).toBe(publishedEvents)
    for (const day of scene.deficitDays) {
      expect(day.balanceCents).toBeLessThan(0)
    }
    const dates = scene.deficitDays.map((day) => day.date)
    expect(dates).toEqual([...dates].sort())
    expect((dates[0] ?? '') >= '2025-11-01').toBe(true)
    expect((dates[dates.length - 1] ?? '') <= '2026-10-31').toBe(true)
  })
})

describe('river scene: payday bridges from the income phase', () => {
  it('keeps only 25th phase deposits as bridges inside the window', () => {
    expect(isPaydayPhase('2026-04-25')).toBe(true)
    expect(isPaydayPhase('2026-04-15')).toBe(false)

    const split = incomeDatesInRange(world, {
      start: report.meta.dateRange.start,
      end: report.meta.dateRange.end,
    })
    expect(scene.paydayDates).toEqual(split.paydays)
    expect(scene.paydayDates).toHaveLength(12)
    expect(scene.paydayDates[0]).toBe('2025-11-25')
    expect(scene.paydayDates[scene.paydayDates.length - 1]).toBe('2026-10-25')
    for (const date of scene.paydayDates) {
      expect(isPaydayPhase(date)).toBe(true)
    }
  })

  it('surfaces the one non payday income event instead of hiding the exclusion', () => {
    // The shipped fixture carries a CRA tax refund on 2026-04-15: income,
    // but not the monthly payroll phase F4 defines its bridges on.
    expect(scene.nonPaydayIncomeDates).toEqual(['2026-04-15'])
    expect(scene.incomeEventsTotal).toBe(13)
    expect(scene.incomeEventsTotal).toBe(
      scene.paydayDates.length + scene.nonPaydayIncomeDates.length,
    )
  })
})

describe('river scene: tributaries, sky, and holiday light', () => {
  it('widths the seven F1 categories by annual spend and flags structure', () => {
    const f1 = sectionOf('F1')
    expect(scene.tributaries).toHaveLength(7)
    expect(scene.tributaries.map((entry) => entry.annualSpendCents)).toEqual(
      [...scene.tributaries.map((entry) => entry.annualSpendCents)].sort((a, b) => b - a),
    )
    const total = scene.tributaries.reduce((sum, entry) => sum + entry.annualSpendCents, 0)
    expect(total).toBe(f1.totalAnnualSpendCents)
    expect(total).toBe(8_399_493)

    const structural = scene.tributaries
      .filter((entry) => entry.structural)
      .map((entry) => entry.category)
      .sort()
    expect(structural).toEqual([...f1.structuralCategories].sort())
    expect(structural).toEqual(['Subscriptions', 'Utilities'])
    for (const entry of scene.tributaries) {
      expect(entry.structural).toBe(entry.category === 'Subscriptions' || entry.category === 'Utilities')
    }
    expect(scene.tributaries[0]?.category).toBe('Dining')
    expect(scene.tributaries[0]?.annualSpendCents).toBe(2_776_609)
  })

  it('carries the F2 holiday window as the warm light window', () => {
    const f2 = sectionOf('F2')
    expect(scene.holidayWindow).toEqual({
      start: '2025-11-15',
      end: '2025-12-31',
      days: 47,
    })
    expect(scene.holidayWindow.start).toBe(f2.holidayWindowStart)
    expect(scene.holidayWindow.end).toBe(f2.holidayWindowEnd)
    expect(scene.holidayWindow.days).toBe(f2.holidayWindowDays)
  })
})

describe('river scene: the two F4 and F5 painted marks', () => {
  it('anchors the ghost line on the published F4 trough and declares it approximate', () => {
    const f4 = sectionOf('F4')
    expect(scene.annotations.f4.troughDate).toBe('2025-12-24')
    expect(scene.annotations.f4.troughDate).toBe(f4.baselineTroughDate)
    expect(scene.annotations.f4.troughCents).toBe(-604_120)
    expect(scene.annotations.f4.category).toBe('Travel')
    expect(scene.annotations.f4.troughLiftCents).toBe(100_593)

    expect(scene.ghost.approximate).toBe(true)
    expect(scene.ghost.liftCents).toBe(100_593)
    expect(scene.ghost.troughDate).toBe('2025-12-24')
    expect(scene.ghost.note).toContain('not exported')
    expect(scene.ghost.note).toContain('not a daily counterfactual path')
    expect(scene.ghost.pipelineExportNeeded).toContain('scripts.analysis.build_findings')
    expect(scene.ghost.pipelineExportNeeded).toContain('dailyAlignedSeries')
  })

  it('raises the ghost by the lift at the trough and returns it to baseline at month end', () => {
    const byDate = new Map(scene.points.map((point) => [point.date, point.balanceCents]))
    const ghostByDate = new Map(scene.ghost.points.map((point) => [point.date, point.balanceCents]))
    const trough = scene.annotations.f4.troughCents

    expect(ghostByDate.get('2025-12-24')).toBe(trough + scene.ghost.liftCents)
    // F4 ships a month end floor delta of zero, so the ghost must meet the
    // baseline exactly on the December month end sample point.
    expect(ghostByDate.get('2025-12-31')).toBe(byDate.get('2025-12-31'))
    // Outside the arc the approximation is flat baseline, never invented data.
    expect(ghostByDate.get('2025-12-01')).toBe(byDate.get('2025-12-01'))
    expect(ghostByDate.get('2026-01-15')).toBe(byDate.get('2026-01-15'))
    expect(ghostByDate.get('2026-10-31')).toBe(byDate.get('2026-10-31'))
  })

  it('paints the F5 high water mark as floor plus the surge cap lift', () => {
    const f5 = sectionOf('F5')
    expect(scene.annotations.f5.interventionName).toBe('Cap the top surge category at its baseline rate')
    expect(scene.annotations.f5.interventionName).toBe(f5.bestInterventionName)
    expect(scene.annotations.f5.floorLiftCents).toBe(236_672)
    expect(scene.annotations.f5.floorLiftCents).toBe(f5.bestMinMonthEndImprovementCents)
    expect(scene.annotations.f5.baselineFloorCents).toBe(-8_024)
    expect(scene.annotations.f5.markCents).toBe(228_648)
    expect(scene.annotations.f5.markCents).toBe(
      scene.annotations.f5.baselineFloorCents + scene.annotations.f5.floorLiftCents,
    )
  })
})

describe('river scene: caption and printed almanac legend', () => {
  it('reads the headline F1 and F5 numbers from the report, not from recompute', () => {
    expect(scene.caption.f1Value).toBe('5.08%')
    expect(scene.caption.f5Value).toBe('+$2,366.72')
    expect(scene.caption.f1Label).toBe('of annual spend is structural')
    expect(scene.caption.dayCount).toBe(365)
    expect(scene.caption.dateRange).toEqual({ start: '2025-11-01', end: '2026-10-31' })
    expect(scene.caption.structuralCategories).toEqual(['Subscriptions', 'Utilities'])
  })

  it('prints one legend line per painted element with a rule and a source', () => {
    expect(scene.legend).toHaveLength(8)
    expect(scene.legend.map((line) => line.element)).toEqual([
      'Water surface',
      'Riverbed stones',
      'Payday bridges',
      'Ghost water line',
      'High water mark',
      'Tributaries',
      'Month ridges',
      'Accent color',
    ])
    for (const line of scene.legend) {
      expect(line.element.length).toBeGreaterThan(0)
      expect(line.rule.length).toBeGreaterThan(10)
      expect(line.source.length).toBeGreaterThan(0)
    }

    const byElement = new Map(scene.legend.map((line) => [line.element, line]))
    expect(byElement.get('Water surface')?.rule).toContain('365 days')
    expect(byElement.get('Water surface')?.source).toContain('transactions.json')
    expect(byElement.get('Riverbed stones')?.rule).toContain('86 days')
    expect(byElement.get('Payday bridges')?.rule).toContain('12 inside the window')
    expect(byElement.get('Payday bridges')?.rule).toContain('2026-04-15')
    expect(byElement.get('Ghost water line')?.rule).toContain('approximate')
    expect(byElement.get('High water mark')?.rule).toContain('+$2,366.72')
    expect(byElement.get('High water mark')?.rule).toContain('-$80.24')
    expect(byElement.get('Tributaries')?.source).toContain('F1 classification')
    expect(byElement.get('Month ridges')?.source).toContain('monthly_balance_series')
  })
})

describe('river scene: deterministic by construction', () => {
  it('builds a byte identical scene on repeated calls', () => {
    const again = buildRiverScene({ world, transactions, report })
    expect(JSON.stringify(again)).toBe(JSON.stringify(scene))
  })

  it('derives texture jitter from a stable data hash, never from a clock', () => {
    expect(hash01('river:2025-11-01')).toBe(hash01('river:2025-11-01'))
    expect(hash01('river:2025-11-01')).not.toBe(hash01('river:2025-11-02'))
    expect(hash01('river:2025-11-01')).toBeGreaterThanOrEqual(0)
    expect(hash01('river:2025-11-01')).toBeLessThan(1)
    expect(scene.seed).toBe('2025-11-01:2026-10-31:5702:20261107')
  })

  it('carries forward a gap free window without inventing rows', () => {
    const points = dailyClosingBalances(transactions, report.meta.dateRange)
    expect(points).toHaveLength(365)
    expect(points[0]).toEqual(scene.points[0])
    expect(points[points.length - 1]).toEqual(scene.points[scene.points.length - 1])
  })
})
