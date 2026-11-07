// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import StormAtlas from './StormAtlas'
import type { AtlasEntry } from '../../lib/stormAtlas'
import type { WeatherMetrics } from '../../lib/weatherState'

// React act() needs the testing environment flag; jsdom plus this flag
// is the supported combination for React 19 act semantics.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The Storm Atlas surface: honest placeholder with no props, headline
 * and counts with profiles, and the typed drill down callback firing
 * with exactly the state that was clicked (jsdom for the real click,
 * server rendering for the markup contract).
 */

function entry(account_id: string, overrides: Partial<WeatherMetrics> = {}): AtlasEntry {
  const base: WeatherMetrics = {
    income_cents: 400_000,
    spending_cents: 300_000,
    buffer_cents: 500_000,
    gap_cents: -100_000,
    runway_state: 'no_shortfall',
    runway_deci_months: 1200,
  }
  return { account_id, ...base, ...overrides }
}

/** Three accounts: one storm, one flood, one clear. */
const PROFILES: readonly AtlasEntry[] = [
  entry('40001', { runway_state: 'finite', runway_deci_months: 12, gap_cents: 100_000 }),
  entry('40002', { runway_state: 'buffer_depleted', runway_deci_months: 0, buffer_cents: -1 }),
  entry('40003'),
]

describe('StormAtlas markup', () => {
  it('renders an honest placeholder with no props', () => {
    const html = renderToString(createElement(StormAtlas))
    expect(html).toContain('No accounts in the atlas yet')
    expect(html).toContain('Atlas data not wired yet')
    expect(html).toContain('aria-label="Storm Atlas"')
    // Seven cells, all zero, rendered as static divs with no callback.
    expect(html.split('wx-atlas__cell wx-atlas__cell-').length - 1).toBe(7)
    expect(html).not.toContain('<button')
    expect(html).toContain('>0</span>')
  })

  it('renders the headline and counts when profiles arrive', () => {
    const html = renderToString(createElement(StormAtlas, { profiles: PROFILES }))
    expect(html).toContain('1 in 3 accounts hits storm warning at baseline')
    expect(html).not.toContain('Atlas data not wired yet')
    expect(html).toContain('wx-atlas__cell-flood')
    expect(html).toContain('wx-atlas__cell-clear')
    // One of three is 33 percent, printed against the population.
    expect(html).toContain('33% of 3')
    // Severity order: flood cell first, clear cell last.
    expect(html.indexOf('wx-atlas__cell-flood')).toBeLessThan(html.indexOf('wx-atlas__cell-clear'))
  })

  it('honours the scenario label and headline state options', () => {
    const html = renderToString(
      createElement(StormAtlas, {
        profiles: PROFILES,
        headlineState: 'flood',
        scenarioLabel: 'under the standard EI twist',
      }),
    )
    expect(html).toContain('1 in 3 accounts hits flood under the standard EI twist')
  })

  it('renders drill down buttons only when a callback is wired', () => {
    const html = renderToString(
      createElement(StormAtlas, { profiles: PROFILES, onSelectState: () => undefined }),
    )
    expect(html).toContain('<button')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('Drill into this state')
  })

  it('marks the selected cell', () => {
    const html = renderToString(
      createElement(StormAtlas, {
        profiles: PROFILES,
        selectedState: 'storm',
        onSelectState: () => undefined,
      }),
    )
    expect(html).toContain('wx-atlas__cell-storm wx-atlas__cell-selected')
    expect(html).toContain('aria-pressed="true"')
    // Only the selected cell is pressed.
    expect(html.split('aria-pressed="true"').length - 1).toBe(1)
  })
})

describe('StormAtlas drill down click', () => {
  let container: HTMLDivElement
  let root: Root

  it('fires the typed callback with the clicked state and nothing else', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const onSelectState = vi.fn()

    await act(async () => {
      root.render(createElement(StormAtlas, { profiles: PROFILES, onSelectState }))
    })

    const buttons = Array.from(container.querySelectorAll('button'))
    expect(buttons).toHaveLength(7)

    const floodCell = buttons.find((button) =>
      button.className.includes('wx-atlas__cell-flood'),
    )
    expect(floodCell).toBeDefined()
    await act(async () => {
      floodCell?.click()
    })

    expect(onSelectState).toHaveBeenCalledTimes(1)
    expect(onSelectState).toHaveBeenCalledWith('flood')

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })
})
