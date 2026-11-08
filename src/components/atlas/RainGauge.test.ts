// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
// The jsdom environment replaces the global URL with its own
// implementation, which does not resolve file: bases correctly, so
// node:url's URL reads the stylesheets from disk here.
import { URL as NodeURL } from 'node:url'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import RainGauge, { GAUGE_REFERENCE_PERCENT, gaugeReading } from './RainGauge'
import type { BandCounts } from '../../lib/atlasData'

/**
 * Rain gauge contracts on inline counts: the fill is the share of
 * accounts NOT in critical or storm warning, the face prints that
 * definition word for word, the readout pairs the whole percent with
 * the raw fraction, the 80 percent reference line is a named
 * constant, empty props print n/a instead of a zero share, and the
 * fill transition lives only inside the no preference gate in
 * atlas.css. No test reads the shipped artifact, and the component
 * fetches nothing.
 */

// React's act() refuses to run until the environment declares itself.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** 4,500 accounts with 1,000 in the two risk bands: 3,500 outside. */
const COUNTS: BandCounts = {
  critical: 341,
  storm_warning: 659,
  watch: 800,
  fair_skies: 1400,
  clear: 1300,
}

async function render(
  overrides: Partial<Parameters<typeof RainGauge>[0]> = {},
): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(RainGauge, overrides))
  })
  return { container, root }
}

async function cleanup(container: HTMLDivElement, root: Root): Promise<void> {
  await act(async () => {
    root.unmount()
  })
  container.remove()
}

function fillScale(container: Element): number {
  const fill = container.querySelector('.ax-gauge__fill') as SVGRectElement | null
  expect(fill).not.toBeNull()
  const raw = fill?.style.transform ?? ''
  expect(raw).toContain('scaleY(')
  return Number(raw.replace(/[^0-9.]/g, ''))
}

describe('gaugeReading: the share outside the two risk bands', () => {
  it('counts everything but critical and storm warning as outside', () => {
    const reading = gaugeReading(COUNTS, 4500)
    expect(reading.outside).toBe(3500)
    expect(reading.total).toBe(4500)
    expect(reading.percent).toBe(78)
  })

  it('falls back to the counts own total when no total arrives', () => {
    const reading = gaugeReading(COUNTS, undefined)
    expect(reading.total).toBe(4500)
    expect(reading.outside).toBe(3500)
    expect(reading.percent).toBe(78)
  })

  it('reads null, never zero, when counts or population are missing', () => {
    expect(gaugeReading(null, 4500)).toEqual({ outside: null, total: 0, percent: null })
    expect(gaugeReading(undefined, undefined)).toEqual({
      outside: null,
      total: 0,
      percent: null,
    })
    expect(gaugeReading(COUNTS, 0).outside).toBe(3500)
    expect(gaugeReading({ critical: 0, storm_warning: 0, watch: 0, fair_skies: 0, clear: 0 }, 0))
      .toEqual({ outside: null, total: 0, percent: null })
  })

  it('clamps a population whose risk bands overflow the total', () => {
    const reading = gaugeReading({ critical: 5000, storm_warning: 0, watch: 0, fair_skies: 0, clear: 0 }, 4500)
    expect(reading.outside).toBe(0)
    expect(reading.percent).toBe(0)
  })
})

describe('RainGauge markup', () => {
  it('prints the whole percent, the raw fraction, and the face', async () => {
    const { container, root } = await render({
      counts: COUNTS,
      total: 4500,
      scenarioLabel: 'at baseline',
    })

    expect(container.querySelector('.ax-gauge__pct')?.textContent).toBe('78%')
    expect(container.querySelector('.ax-gauge__count')?.textContent).toBe('3,500 of 4,500 accounts')
    expect(container.querySelector('.ax-gauge__face')?.textContent).toBe(
      'share of accounts outside critical and storm warning',
    )
    expect(container.querySelector('.ax-gauge__scenario')?.textContent).toBe('at baseline')
    expect(container.textContent).toContain('78%')

    await cleanup(container, root)
  })

  it('fills the tube to the exact outside share', async () => {
    const { container, root } = await render({ counts: COUNTS, total: 4500 })
    expect(fillScale(container)).toBeCloseTo(3500 / 4500, 6)
    await cleanup(container, root)
  })

  it('names the scenario from the scenarioLabel contract only', async () => {
    const { container, root } = await render({
      counts: COUNTS,
      total: 4500,
      scenarioLabel: 'under the laid off twist',
    })
    expect(container.querySelector('.ax-gauge__scenario')?.textContent).toBe(
      'under the laid off twist',
    )
    await cleanup(container, root)

    const bare = await render({ counts: COUNTS, total: 4500 })
    expect(bare.container.querySelector('.ax-gauge__scenario')).toBeNull()
    await cleanup(bare.container, bare.root)
  })

  it('prints the 80 percent reference line as a named constant', async () => {
    expect(GAUGE_REFERENCE_PERCENT).toBe(80)
    const { container, root } = await render({ counts: COUNTS, total: 4500 })

    expect(container.querySelector('.ax-gauge__ref-label')?.textContent).toBe('80%')
    // The line sits at the fill height of exactly 80 percent: 9 + 230 * 0.2.
    const line = container.querySelector('.ax-gauge__ref')
    expect(line?.getAttribute('y1')).toBe('55')
    expect(line?.getAttribute('y2')).toBe('55')

    await cleanup(container, root)
  })

  it('labels the gauge with the reading for assistive technology', async () => {
    const { container, root } = await render({
      counts: COUNTS,
      total: 4500,
      scenarioLabel: 'at baseline',
    })
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe(
      '78% outside critical and storm warning, 3,500 of 4,500 accounts',
    )
    await cleanup(container, root)
  })
})

describe('RainGauge empty props', () => {
  it('prints n/a and an honest empty line instead of a zero share', async () => {
    const { container, root } = await render({})

    expect(container.querySelector('.ax-gauge__pct')?.textContent).toBe('n/a')
    expect(container.querySelector('.ax-gauge__count')?.textContent).toBe(
      'No accounts in the atlas yet',
    )
    expect(fillScale(container)).toBe(0)
    expect(container.querySelector('.ax-gauge__scenario')).toBeNull()

    await cleanup(container, root)
  })

  it('server renders without a DOM', () => {
    const html = renderToString(
      createElement(RainGauge, { counts: COUNTS, total: 4500, scenarioLabel: 'at baseline' }),
    )
    expect(html).toContain('78%')
    expect(html).toContain('3,500 of 4,500 accounts')
    expect(html).toContain('share of accounts outside critical and storm warning')
    expect(html).toContain('scaleY(')
  })
})

describe('RainGauge stylesheet: gated motion only', () => {
  it('gates the 600ms fill transition behind no preference', () => {
    const css = readFileSync(new NodeURL('../atlas/atlas.css', import.meta.url), 'utf8')
    expect(css).toContain('@media (prefers-reduced-motion: no-preference)')
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) \{\s*\.ax-gauge__fill \{\s*transition: transform 600ms ease-out;/,
    )
    // Every transition in the sheet sits inside a no preference gate.
    const found = [...css.matchAll(/transition\s*:/g)]
    expect(found.length).toBeGreaterThan(0)
    for (const match of found) {
      const index = match.index ?? 0
      const gate = css.lastIndexOf('@media (prefers-reduced-motion: no-preference)', index)
      expect(gate).toBeGreaterThanOrEqual(0)
    }
  })
})
