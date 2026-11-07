import { readFileSync } from 'node:fs'
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseFindingsReport, type ReportSection } from '../../data/findings'
import {
  F1Chart,
  F2Chart,
  F3Chart,
  F4Chart,
  F5Chart,
  f1AcfDomain,
  f2HolidayBand,
  f4GridTicks,
  f5Axis,
} from './charts'

/**
 * Chart twins are hand rolled SVG over findings.json data: these tests pin
 * the geometry contract (viewBox), the accessibility contract (role img
 * with an aria label), and the data contract (the real labels, values, and
 * paths a judge reads off each chart).
 */

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))
}

const sections = parseFindingsReport(readJson('../../../public/data/findings.json')).sections

function byId(id: ReportSection['id']): ReportSection {
  const section = sections.find((entry) => entry.id === id)
  if (!section) {
    throw new Error(`missing section ${id}`)
  }
  return section
}

function render(chart: ReactElement): string {
  return renderToString(chart)
}

/** Days in the month of an ISO date (2025-11-15 has 30, 2025-12-31 has 31). */
function monthLength(isoDate: string): number {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(isoDate)
  if (!match || !match[1] || !match[2]) {
    throw new Error(`bad ISO date ${isoDate}`)
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate()
}

describe('F1 chart: structural share, spend bars, autocorrelation', () => {
  const section = byId('F1')
  if (section.id !== 'F1') {
    throw new Error('F1 required')
  }
  const html = render(createElement(F1Chart, { section }))

  it('renders an accessible svg over the 45 lag window', () => {
    expect(html).toContain('role="img"')
    expect(html).toContain('viewBox="0 0 640')
    expect(html).toContain('aria-label')
  })

  it('draws the structural share strip and every category bar', () => {
    expect(html).toContain('5.08% structural (Subscriptions, Utilities)')
    expect(html).toContain('94.92% discretionary')
    for (const category of section.categoryBars) {
      expect(html).toContain(category.name)
    }
    expect(html).toContain('rp-bar-teal')
    expect(html).toContain('rp-bar-amber')
  })

  it('draws an autocorrelation path per category with the threshold line', () => {
    expect(html.match(/<path/g)?.length).toBe(section.acfSeries.length)
    expect(html).toContain('rp-threshold')
    expect(html).toContain('rp-window')
    expect(html).toContain('lag 1 to 45')
    expect(html).toContain('7 rows, not tested')
  })
})

describe('F2 chart: month share against calendar share', () => {
  const section = byId('F2')
  if (section.id !== 'F2') {
    throw new Error('F2 required')
  }
  const html = render(createElement(F2Chart, { section }))

  it('renders twelve month bars with the holiday band', () => {
    expect(html).toContain('viewBox="0 0 640 250"')
    expect(html).toContain('holiday window, 47 days')
    expect(html).toContain('ledger months 2025-11 to 2026-10')
    expect(html).toContain('ticks = calendar share of each month')
    // Retail peaks in December (2025-12), labelled with its share.
    expect(html).toContain('15.6%')
    expect(html).toContain('rp-tick')
  })

  it('shades the band exactly over the parsed holiday window', () => {
    // Independent slot math from the shipped dates and month labels: the
    // label index plus the day's position inside that month (day start
    // for the open, day end for the close, so every claimed day is in).
    const startIndex = section.monthLabels.indexOf(section.holidayWindowStart.slice(0, 7))
    const endIndex = section.monthLabels.indexOf(section.holidayWindowEnd.slice(0, 7))
    expect(startIndex).toBeGreaterThanOrEqual(0)
    expect(endIndex).toBeGreaterThan(startIndex)
    const startDay = Number(section.holidayWindowStart.slice(8, 10))
    const endDay = Number(section.holidayWindowEnd.slice(8, 10))
    const fromSlot = startIndex + (startDay - 1) / monthLength(section.holidayWindowStart)
    const toSlot = endIndex + endDay / monthLength(section.holidayWindowEnd)

    // The chart's own axis line is the coordinate frame: one slot per
    // month label between its two ends.
    const axis = /<line x1="(-?[\d.]+)" x2="(-?[\d.]+)"[^>]*class="rp-axis"/.exec(html)
    expect(axis).not.toBeNull()
    const axisLeft = Number(axis?.[1])
    const axisRight = Number(axis?.[2])
    const slot = (axisRight - axisLeft) / section.monthLabels.length

    const bandTag = /<rect [^>]*class="rp-window"/.exec(html)?.[0] ?? ''
    expect(bandTag).not.toBe('')
    const from = Number(/x="(-?[\d.]+)"/.exec(bandTag)?.[1])
    const width = Number(/width="([\d.]+)"/.exec(bandTag)?.[1])
    const to = from + width

    // Both edges land within half a pixel of the computed window.
    const tolerance = 0.5
    expect(Math.abs(from - (axisLeft + fromSlot * slot))).toBeLessThanOrEqual(tolerance)
    expect(Math.abs(to - (axisLeft + toSlot * slot))).toBeLessThanOrEqual(tolerance)
    // The helper the chart draws from agrees with the rendered rect.
    const band = f2HolidayBand(section)
    if (!band) {
      throw new Error('F2 holiday band missing')
    }
    expect(Math.abs(band.from - from)).toBeLessThan(1e-9)
    expect(Math.abs(band.to - to)).toBeLessThan(1e-9)
    // The window spans more than one month slot, never a lone month end.
    expect(to - from).toBeGreaterThan(slot)
  })
})

describe('F3 chart: ROC, confusion, coefficients', () => {
  const section = byId('F3')
  if (section.id !== 'F3') {
    throw new Error('F3 required')
  }
  const html = render(createElement(F3Chart, { section }))

  it('draws the ROC path with the published AUC', () => {
    expect(html).toContain('viewBox="0 0 640 500"')
    expect(html).toContain('AUC 0.590')
    expect(html).toContain('false positive rate')
    expect(html).toContain('true positive rate')
    expect(html).toContain('rp-draw')
    expect(html).toContain('rp-diagonal')
  })

  it('draws the confusion matrix and the diverging coefficients', () => {
    expect(html).toContain('confusion at 0.5')
    expect(html).toContain('true positive')
    expect(html).toContain('false negative')
    expect(html).toContain('+1.6223')
    expect(html).toContain('-0.5495')
    expect(html).toContain('spend_volatility_30d')
    expect(html).toContain('standardized coefficients, top 10 by magnitude')
  })
})

describe('F4 chart: the drawdown waterfall', () => {
  const section = byId('F4')
  if (section.id !== 'F4') {
    throw new Error('F4 required')
  }
  const html = render(createElement(F4Chart, { section }))

  it('steps from the baseline drawdown to the summed upper bound', () => {
    expect(html).toContain('viewBox="0 0 640 340"')
    expect(html).toContain('$21,884.01')
    expect(html).toContain('all aligned')
    expect(html).toContain('upper bound')
    expect(html).toContain('baseline')
    expect(html).toContain('rp-connector')
  })

  it('labels the best aligned step with the headline gain', () => {
    expect(html).toContain('+$1,005.93')
    expect(html).toContain('Travel')
    expect(html).toContain('4.6% of baseline')
    expect(html).toContain('trough date 2025-12-24')
  })
})

describe('F5 chart: ranked intervention bars', () => {
  const section = byId('F5')
  if (section.id !== 'F5') {
    throw new Error('F5 required')
  }
  const html = render(createElement(F5Chart, { section }))

  it('ranks the four interventions with dollar labels on one axis', () => {
    expect(html).toContain('viewBox="0 0 640 268"')
    expect(html).toContain('1. Cap the top surge category at its baseline rate')
    expect(html).toContain('2. Realign Dining to the income phase')
    expect(html).toContain('3. Consolidate subscriptions to a single cycle')
    expect(html).toContain('4. Fixed auto save on payday with emergency release')
    expect(html).toContain('+$2,366.72')
    expect(html).toContain('+$932.20')
    expect(html).toContain('-$306.64')
    expect(html).toContain('$0.00')
    expect(html).toContain('primary: minimum month end balance')
  })
})

/**
 * Domain contract: the sections here are parsed straight from
 * public/data/findings.json, so these assertions pin every real value in
 * the artifact inside the scale that draws it. A data change that would
 * have been silently clamped by the old pinned domains now fails here.
 */
describe('chart domains derive from the shipped data', () => {
  it('F1 sparkline window contains every acf value and threshold line', () => {
    const section = byId('F1')
    if (section.id !== 'F1') {
      throw new Error('F1 required')
    }
    const domain = f1AcfDomain(section)
    expect(domain.min).toBeLessThan(0)
    expect(domain.max).toBeGreaterThan(0)
    for (const series of section.acfSeries) {
      for (const value of series.acf) {
        expect(value).toBeGreaterThanOrEqual(domain.min)
        expect(value).toBeLessThanOrEqual(domain.max)
      }
      expect(series.threshold).toBeGreaterThanOrEqual(domain.min)
      expect(series.threshold).toBeLessThanOrEqual(domain.max)
    }
  })

  it('F4 gridlines stay inside the zero to baseline band the bars occupy', () => {
    const section = byId('F4')
    if (section.id !== 'F4') {
      throw new Error('F4 required')
    }
    const ticks = f4GridTicks(section.baselineDrawdownCents)
    expect(ticks.length).toBeGreaterThan(0)
    let previous = 0
    for (const tick of ticks) {
      expect(tick).toBeGreaterThan(previous)
      expect(tick).toBeLessThanOrEqual(section.baselineDrawdownCents)
      previous = tick
    }
    // Every plotted column (baseline, each step, the summed upper bound)
    // sits between zero and the baseline, so none can leave the frame.
    const lowestColumn =
      section.baselineDrawdownCents - section.sumOfAlignedDrawdownImprovementsCents
    expect(lowestColumn).toBeGreaterThanOrEqual(0)
    expect(lowestColumn).toBeLessThanOrEqual(section.baselineDrawdownCents)
  })

  it('F5 axis contains every plotted floor and drawdown value', () => {
    const section = byId('F5')
    if (section.id !== 'F5') {
      throw new Error('F5 required')
    }
    const axis = f5Axis(section)
    expect(axis.min).toBeLessThan(0)
    expect(axis.max).toBeGreaterThan(0)
    expect(axis.ticks).toContain(0)
    let previous = axis.min - 1
    for (const tick of axis.ticks) {
      expect(tick).toBeGreaterThanOrEqual(axis.min)
      expect(tick).toBeLessThanOrEqual(axis.max)
      expect(tick).toBeGreaterThan(previous)
      previous = tick
    }
    for (const bar of section.bars) {
      for (const value of [bar.minMonthEndDeltaCents, bar.drawdownImprovementCents]) {
        expect(value).toBeGreaterThanOrEqual(axis.min)
        expect(value).toBeLessThanOrEqual(axis.max)
      }
    }
  })
})
