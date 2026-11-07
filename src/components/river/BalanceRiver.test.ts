import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseFindingsReport, parseModelCard } from '../../data/findings'
import { parseTransactions, parseWorld } from '../../data/loaders'
import { resolveFindingProvenance } from '../../lib/reportProvenance'
import { buildRiverScene } from '../../lib/riverData'
import ReportBody from '../report/ReportBody'
import { RiverSceneFigure, riverGeometry } from './BalanceRiver'

/**
 * The Money River figure painted from the shipped artifacts: a landscape
 * first, a chart second, every painted element traceable to data. These
 * tests render the real scene through react-dom/server exactly the way the
 * report body does, then check what a judge and a screen reader actually
 * receive: the printed almanac legend, the headline caption with the real
 * F1 and F5 numbers, the layer count, and byte identical path strings on
 * repeated renders (determinism, no Math.random anywhere in the sources).
 */

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))
}

const world = parseWorld(readJson('../../../public/data/world.json'))
const transactions = parseTransactions(readJson('../../../public/data/transactions.json'))
const report = parseFindingsReport(readJson('../../../public/data/findings.json'))
const modelCard = parseModelCard(readJson('../../../public/data/model_card.json'))
const provenance = resolveFindingProvenance(world, transactions.rows)

const scene = buildRiverScene({ world, transactions, report })
const html = renderToString(createElement(RiverSceneFigure, { scene }))

/** Every painted path string, in document order (path data always starts M). */
function pathStrings(markup: string): string[] {
  return markup.match(/ d="M [^"]*"/g) ?? []
}

function count(markup: string, needle: string): number {
  return markup.split(needle).length - 1
}

describe('river figure: headline caption with the real F1 and F5 numbers', () => {
  it('states the shipped headline numbers over the painting', () => {
    expect(html).toContain(
      'Money River, 365 daily closes: 5.08% of annual spend is structural, +$2,366.72 floor lift from capping the top surge category.',
    )
    expect(html).toContain('5.08%')
    expect(html).toContain('+$2,366.72')
  })
})

describe('river figure: printed almanac legend as real DOM text', () => {
  it('prints one line per painted element naming the data rule', () => {
    expect(html).toContain('Almanac: what each painted element binds to')
    expect(count(html, 'class="rv-legend__item"')).toBe(8)

    expect(html).toContain('Water surface')
    expect(html).toContain('daily closing balance, 365 days from 2025-11-01 to 2026-10-31')
    expect(html).toContain('transactions.json rows, balanceCents per date')

    expect(html).toContain('Riverbed stones')
    expect(html).toContain('one stone for each day closing below zero (86 days)')

    expect(html).toContain('Payday bridges')
    expect(html).toContain('one bridge per payroll deposit on the 25th phase (12 inside the window')
    expect(html).toContain('2026-04-15')

    expect(html).toContain('Ghost water line')
    expect(html).toContain('findings.json F4, daily path not exported')

    expect(html).toContain('High water mark')
    expect(html).toContain('+$2,366.72 lands at $2,286.48')

    expect(html).toContain('Tributaries')
    expect(html).toContain('findings.json F1 classification')
    expect(html).toContain('Month ridges')
    expect(html).toContain('world.json monthly_balance_series, findings.json F2')
    expect(html).toContain('Accent color')

    expect(html).toContain('Ghost line is approximate, see the F4 section for the export that would make it exact.')
  })
})

describe('river figure: every painted layer binds to data', () => {
  it('renders the water, drought, bridges, ghost, mark, tributaries, and sky', () => {
    // Water surface and filled body from the 365 daily closes.
    expect(html).toContain('class="rv-water-surface"')
    expect(html).toContain('class="rv-ghost"')
    expect(pathStrings(html).length).toBeGreaterThanOrEqual(40)

    // Drought stones and the accent drought line on the exposed bed.
    const stones = count(html, 'class="rv-stone"')
    expect(stones).toBeGreaterThanOrEqual(1)
    expect(stones).toBeLessThanOrEqual(scene.deficitDays.length)
    expect(count(html, 'class="rv-drought-line"')).toBeGreaterThanOrEqual(1)
    expect(html).toContain('86 days closed below zero (F3)')

    // One bridge per 25th phase payroll deposit inside the window.
    expect(count(html, 'class="rv-bridge"')).toBe(12)

    // Seven tributaries width by annual spend, structural and discretionary.
    expect(count(html, 'class="rv-tributary"')).toBe(7)
    expect(html).toContain('Dining $27,766.09')
    expect(html).toContain('Subscriptions $976.50')

    // Month ridges on the horizon with warm holiday light in the sky.
    expect(count(html, 'class="rv-ridge"')).toBe(12)
    expect(html).toContain('holiday window, 47 days, 2025-11-15 to 12-31')

    // The painted F4 and F5 marks.
    expect(html).toContain('F4 trough 2025-12-24, -$6,041.20')
    expect(html).toContain('ghost: Travel aligned +$1,005.93 (approx)')
    expect(html).toContain('high water mark, F5 floor lift +$2,366.72')
  })

  it('summarizes the whole scene for screen readers in one label', () => {
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Money River landscape painting')
    expect(html).toContain('365 daily closing balances from 2025-11-01 to 2026-10-31')
    expect(html).toContain('86 days below zero')
    expect(html).toContain('12 payday bridges')
    expect(html).toContain('Travel aligned trough lift of $1,005.93')
    expect(html).toContain('F5 floor lift of $2,366.72')
  })

  it('never leaks a coordinate the geometry did not compute', () => {
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('Infinity')
  })
})

describe('river figure: deterministic paint', () => {
  it('emits byte identical path strings on repeated renders', () => {
    const first = pathStrings(renderToString(createElement(RiverSceneFigure, { scene })))
    const second = pathStrings(renderToString(createElement(RiverSceneFigure, { scene })))
    expect(first.length).toBeGreaterThan(0)
    expect(second).toEqual(first)

    const geometryA = riverGeometry(scene)
    const geometryB = riverGeometry(buildRiverScene({ world, transactions, report }))
    expect(geometryA.surfacePath).toBe(geometryB.surfacePath)
    expect(geometryA.ghostPath).toBe(geometryB.ghostPath)
    expect(geometryA.waterPath).toBe(geometryB.waterPath)
  })

  it('keeps Math.random out of both river sources', () => {
    const component = readFileSync(new URL('./BalanceRiver.tsx', import.meta.url), 'utf8')
    const model = readFileSync(new URL('../../lib/riverData.ts', import.meta.url), 'utf8')
    // The prose in these files mentions Math.random only to forbid it, so
    // the guard matches the call form a renderer could actually make.
    expect(component).not.toContain('Math.random(')
    expect(model).not.toContain('Math.random(')
  })
})

describe('river figure: responsive scroll-in-figure and reduced motion', () => {
  it('wraps the wide painting in a horizontal scroll container', () => {
    expect(html).toContain('class="rv-scroll"')
    expect(html).toContain('Painting scrolls sideways on narrow screens')
  })

  it('declares the narrow screen and reduced motion rules in the stylesheet', () => {
    const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
    // 395px handsets fall under 59.99rem, where the hint shows and the
    // figure scrolls instead of shrinking the painting into illegibility.
    expect(css).toMatch(/\.rv-canvas \{[^}]*min-width: 56rem/)
    expect(css).toMatch(/\.rv-scroll \{[^}]*overflow-x: auto/)
    expect(css).toContain('@media (max-width: 59.99rem)')
    expect(css).toContain('.rv-hint {')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})

describe('river figure: mount in the report hero', () => {
  it('renders the scene below the synthetic banner in the findings view', () => {
    const body = renderToString(
      createElement(ReportBody, {
        report,
        modelCard,
        provenance,
        provenanceStatus: 'ready',
        provenanceError: null,
      }),
    )
    const banner = body.indexOf('Synthetic data, seed 20261107')
    const river = body.indexOf('Painting the Money River from public/data')
    expect(banner).toBeGreaterThanOrEqual(0)
    expect(river).toBeGreaterThan(0)
    expect(banner).toBeLessThan(river)
    expect(body).toContain('No real bank data')
    // The report content below the hero is untouched by the mount.
    expect(body).toContain('How to read this report')
    expect(body).toContain('Explore in game')
  })
})
