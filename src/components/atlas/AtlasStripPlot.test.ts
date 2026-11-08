// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import AtlasStripPlot from './AtlasStripPlot'
import { buildAtlasPlot } from '../../lib/atlasPlot'
import type { AtlasEntry } from '../../lib/stormAtlas'

/**
 * The strip plot markup and drill down: one circle per account, the
 * headline carried as the accessible name, the printed month ticks,
 * a selected ring with its id, and a dot click that reports exactly
 * the account id that was hit. jsdom for the real click, server
 * rendering for the markup contract.
 */

function entry(
  account_id: string,
  runway_state: AtlasEntry['runway_state'],
  runway_deci_months: number,
): AtlasEntry {
  return { account_id, runway_state, runway_deci_months }
}

/** Twelve accounts spread over every bin, two in the cap bin. */
const ENTRIES: readonly AtlasEntry[] = [
  entry('10001', 'buffer_depleted', 0),
  entry('10002', 'finite', 9),
  entry('10003', 'finite', 10),
  entry('10004', 'finite', 29),
  entry('10005', 'finite', 30),
  entry('10006', 'finite', 59),
  entry('10007', 'finite', 60),
  entry('10008', 'finite', 119),
  entry('10009', 'finite', 120),
  entry('10010', 'finite', 1199),
  entry('10011', 'finite', 1200),
  entry('10012', 'no_shortfall', 1200),
]

const plot = buildAtlasPlot(ENTRIES)
const HEADLINE = '40% of accounts have under 3 months of runway at baseline'

async function render(
  overrides: { selectedId?: string | null; onSelectAccount?: (id: string) => void } = {},
): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(AtlasStripPlot, { plot, label: HEADLINE, ...overrides }))
  })
  return { container, root }
}

async function cleanup(container: HTMLDivElement, root: Root): Promise<void> {
  await act(async () => {
    root.unmount()
  })
  container.remove()
}

describe('AtlasStripPlot markup', () => {
  it('names the picture with the headline and prints the caption', () => {
    const html = renderToString(createElement(AtlasStripPlot, { plot, label: HEADLINE }))
    expect(html).toContain('role="img"')
    expect(html).toContain(`aria-label="${HEADLINE}"`)
    expect(html).toContain('viewBox="0 0 960 240"')
    expect(html).toContain(
      'Every dot is one account. Axis segments follow the verdict bands, not equal months.',
    )
    // No animation anywhere in the field.
    expect(html).not.toContain('animation')
    // One circle per account before any selection arrives.
    expect(html.split('<circle').length - 1).toBe(ENTRIES.length)
    expect(html).not.toContain('ax-ring')
  })

  it('prints the month ticks and the unit note', () => {
    const html = renderToString(createElement(AtlasStripPlot, { plot, label: HEADLINE }))
    for (const tick of ['0', '1', '3', '6', '12', '120', '120+']) {
      expect(html, tick).toContain(`>${tick}</text>`)
    }
    expect(html).toContain('>(months)</text>')
  })
})

describe('AtlasStripPlot field', () => {
  it('renders exactly plot.total dot circles', async () => {
    const { container, root } = await render()
    expect(plot.total).toBe(12)
    expect(container.querySelectorAll('circle.ax-dot')).toHaveLength(plot.total)
    expect(container.querySelectorAll('circle.ax-dot[data-band="storm_warning"]')).toHaveLength(2)
    await cleanup(container, root)
  })

  it('routes a dot click to that account id, and only to that one', async () => {
    const onSelectAccount = vi.fn()
    const { container, root } = await render({ onSelectAccount })

    const dot = container.querySelector('[data-account-id="10005"]')
    expect(dot).not.toBeNull()
    await act(async () => {
      dot?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(onSelectAccount).toHaveBeenCalledTimes(1)
    expect(onSelectAccount).toHaveBeenCalledWith('10005')

    // A click on the ground carries no account id and drills nowhere.
    const svg = container.querySelector('svg')
    await act(async () => {
      svg?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(onSelectAccount).toHaveBeenCalledTimes(1)

    await cleanup(container, root)
  })

  it('stays inert when no drill down callback is wired', async () => {
    const { container, root } = await render()
    const dot = container.querySelector('[data-account-id="10011"]')
    await act(async () => {
      dot?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(container.querySelectorAll('circle.ax-dot')).toHaveLength(12)
    await cleanup(container, root)
  })

  it('rings the selected dot and prints its id', async () => {
    const { container, root } = await render({ selectedId: '10005' })
    const ring = container.querySelector('circle.ax-ring')
    expect(ring).not.toBeNull()

    const selectedDot = container.querySelector('[data-account-id="10005"]')
    expect(ring?.getAttribute('cx')).toBe(selectedDot?.getAttribute('cx'))
    expect(ring?.getAttribute('cy')).toBe(selectedDot?.getAttribute('cy'))
    expect(container.querySelector('text.ax-ring__label')?.textContent).toBe('10005')

    // One ring only, and the field still holds every dot.
    expect(container.querySelectorAll('circle.ax-ring')).toHaveLength(1)
    expect(container.querySelectorAll('circle.ax-dot')).toHaveLength(12)
    await cleanup(container, root)
  })

  it('renders no ring for an unknown selected id', async () => {
    const { container, root } = await render({ selectedId: 'does-not-exist' })
    expect(container.querySelector('circle.ax-ring')).toBeNull()
    await cleanup(container, root)
  })
})
