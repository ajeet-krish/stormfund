// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
// The jsdom environment replaces the global URL with its own
// implementation, which does not resolve file: bases correctly, so
// node:url's URL reads the bundled fixtures and sources from disk.
import { URL as NodeURL } from 'node:url'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import AtlasSection from './AtlasSection'
import { parseProfilesArtifact } from '../../data/profiles'
import { IDLE_TWIST } from '../../lib/shocks'
import { useConsole } from '../../state/consoleStore'

/**
 * The Storm Atlas section wiring: it counts the shipped population at
 * baseline, re counts and re labels the whole field when a preset
 * twist lands (the label and the numbers come from the same atlas
 * run), drills a dot into the store's existing selectAccount action
 * and scrolls the console into view, and stays slim when the bundle is
 * loading or failed. The last block is scope discipline: the E2 to E4
 * sources and the console store must not learn the word atlas.
 */

// React's act() refuses to run until the environment declares itself.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const artifact = parseProfilesArtifact(
  JSON.parse(
    readFileSync(new NodeURL('../../../public/data/engine/profiles.json', import.meta.url), 'utf8'),
  ),
)

let mounted: { container: HTMLElement; root: Root } | null = null

async function renderSection(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted = { container, root }
  await act(async () => {
    root.render(createElement(AtlasSection))
  })
  return container
}

async function settle(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (mounted?.container.querySelector('svg')) {
      return
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }
  throw new Error(`atlas never rendered a plot: ${mounted?.container.textContent ?? ''}`)
}

async function cleanup(): Promise<void> {
  if (mounted) {
    const { container, root } = mounted
    mounted = null
    await act(async () => {
      root.unmount()
    })
    container.remove()
  }
}

function bandDots(container: Element, band: string): number {
  return container.querySelectorAll(`circle.ax-dot[data-band="${band}"]`).length
}

/** The scroll target App mounts above the console. */
function mountConsoleTarget(): HTMLElement {
  const target = document.createElement('div')
  target.id = 'console'
  document.body.appendChild(target)
  return target
}

describe('AtlasSection: the population under the live twist', () => {
  it('renders the shipped baseline headline and counts', async () => {
    useConsole.setState({
      status: 'ready',
      error: null,
      bundle: artifact,
      selectedId: null,
      twist: IDLE_TWIST,
      activePresetId: null,
    })

    const container = await renderSection()
    await settle()

    expect(container.textContent).toContain(
      '1% of accounts have under 3 months of runway at baseline',
    )
    expect(container.textContent).toContain('60 of 4,500 accounts')
    // The untouched console prints no comparison line.
    expect(container.textContent).not.toContain('At baseline:')
    // One circle per shipped account.
    expect(container.querySelectorAll('circle.ax-dot')).toHaveLength(4500)
    expect(bandDots(container, 'storm_warning')).toBe(26)
    expect(bandDots(container, 'critical')).toBe(34)
    expect(container.querySelector('h2')?.textContent).toBe(
      '1% of accounts have under 3 months of runway at baseline',
    )

    await cleanup()
  })

  it('re colors the field and relabels it under the laid off twist', async () => {
    useConsole.setState({
      status: 'ready',
      error: null,
      bundle: artifact,
      selectedId: null,
      twist: IDLE_TWIST,
      activePresetId: null,
    })

    const container = await renderSection()
    await settle()
    const before = bandDots(container, 'storm_warning')

    await act(async () => {
      useConsole.getState().applyPreset('layoff')
    })

    // The label quotes the preset whose applyTwist results are counted.
    expect(container.textContent).toContain(
      '10% of accounts would have under 3 months of runway under the laid off twist',
    )
    expect(container.textContent).toContain('435 of 4,500 accounts')
    expect(container.textContent).toContain('At baseline: 1% (60 of 4,500)')

    // The field really moved: storm warning dots multiplied, and the
    // population itself did not change size.
    expect(bandDots(container, 'storm_warning')).toBe(384)
    expect(bandDots(container, 'storm_warning')).toBeGreaterThan(before)
    expect(bandDots(container, 'critical')).toBe(51)
    expect(container.querySelectorAll('circle.ax-dot')).toHaveLength(4500)

    await cleanup()
  })

  it('drills a dot into the console selection and scrolls to it', async () => {
    useConsole.setState({
      status: 'ready',
      error: null,
      bundle: artifact,
      selectedId: null,
      twist: IDLE_TWIST,
      activePresetId: null,
    })

    const scroll = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scroll,
    })
    const consoleTarget = mountConsoleTarget()

    const container = await renderSection()
    await settle()

    const dot = container.querySelector('[data-account-id="68257"]')
    expect(dot).not.toBeNull()
    await act(async () => {
      dot?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(useConsole.getState().selectedId).toBe('68257')
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })

    await cleanup()
    consoleTarget.remove()
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('steps instead of gliding when reduced motion is requested', async () => {
    useConsole.setState({
      status: 'ready',
      error: null,
      bundle: artifact,
      selectedId: null,
      twist: IDLE_TWIST,
      activePresetId: null,
    })

    const scroll = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scroll,
    })
    const consoleTarget = mountConsoleTarget()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))

    const container = await renderSection()
    await settle()

    const dot = container.querySelector('[data-account-id="68257"]')
    await act(async () => {
      dot?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(scroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })

    await cleanup()
    consoleTarget.remove()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })
})

describe('AtlasSection: slim states', () => {
  it('stays a note until the bundle arrives', async () => {
    useConsole.setState({ status: 'loading', error: null, bundle: null, selectedId: null })
    const container = await renderSection()
    expect(container.textContent).toContain('Counting the population...')
    expect(container.querySelector('svg')).toBeNull()
    expect(container.textContent).not.toContain('under 3 months')
    await cleanup()
  })

  it('reports a failed load without offering a second retry', async () => {
    useConsole.setState({
      status: 'error',
      error: 'profiles.json fetch failed with status 404',
      bundle: null,
      selectedId: null,
    })
    const container = await renderSection()
    expect(container.textContent).toContain(
      'The profiles did not load, so the atlas has no population to count.',
    )
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
    await cleanup()
  })
})

describe('AtlasSection: scope discipline', () => {
  /** The E2 to E4 sources that must stay free of atlas imports. */
  const UNTOUCHED: readonly string[] = [
    '../../state/consoleStore.ts',
    '../../components/console/ConsoleView.tsx',
    '../../components/console/VerdictBadge.tsx',
    '../../components/console/BaselineCard.tsx',
    '../../components/console/ShockPanel.tsx',
    '../../components/console/PlanCard.tsx',
    '../../components/weather/WeatherPanel.tsx',
    '../../components/weather/ForecastStrip.tsx',
    '../../components/weather/WeatherBands.tsx',
    '../../lib/forecast.ts',
    '../../lib/planMath.ts',
    '../../lib/planText.ts',
    '../../lib/shockParse.ts',
    '../../lib/verdict.ts',
  ]

  it('keeps every E2 to E4 source free of atlas references', () => {
    for (const file of UNTOUCHED) {
      const text = readFileSync(new NodeURL(file, import.meta.url), 'utf8')
      expect(text, file).not.toContain('stormAtlas')
      expect(text, file).not.toContain('atlasPlot')
      expect(text, file).not.toContain('AtlasSection')
      expect(text, file).not.toMatch(/from ['"][^'"]*atlas/i)
    }
  })

  it('leaves the console store unaware of the atlas', () => {
    const text = readFileSync(new NodeURL('../../state/consoleStore.ts', import.meta.url), 'utf8')
    expect(text).not.toContain('atlas')
    expect(text).not.toContain('Atlas')
  })
})
