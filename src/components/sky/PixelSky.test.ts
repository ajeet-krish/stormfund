// @vitest-environment jsdom
/**
 * Pixel sky header tests: the day and storm swap rule pinned as a pure
 * function and again through the live console store, the two scenes
 * carrying their own props (sun on the day sky, rain and bolt on the
 * storm sky), the rect grid staying on whole units, the mascot drawing
 * itself as outlined pixels, and the stylesheet gating every animation
 * behind prefers reduced motion. The bundled profiles.json is served
 * from disk exactly as the booth serves it, so the band the header
 * reads is the real band the badge would print.
 */
import { readFileSync } from 'node:fs'
// The jsdom environment replaces the global URL with its own
// implementation, which does not resolve file: bases correctly, so
// node:url's URL reads the stylesheets from disk here.
import { URL as NodeURL } from 'node:url'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useConsole } from '../../state/consoleStore'
import PixelMascot from './PixelMascot'
import PixelSky, { skyVariantFor, type SkyVariant } from './PixelSky'

// React's act() refuses to run until the environment declares itself.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mounted: { container: HTMLElement; root: Root } | null = null

afterEach(() => {
  if (mounted) {
    const { container, root } = mounted
    mounted = null
    act(() => {
      root.unmount()
    })
    container.remove()
  }
  vi.unstubAllGlobals()
})

/** Serve the bundled public/data JSON for every relative data fetch. */
function stubBundledData(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const segments = String(input).split('/').filter(Boolean)
      const dataIndex = segments.lastIndexOf('data')
      const relative = dataIndex < 0 ? '' : segments.slice(dataIndex + 1).join('/')
      if (!/^([a-z_]+\/)*[a-z_]+\.json$/.test(relative)) {
        throw new Error(`unexpected bundled data request: ${String(input)}`)
      }
      const body = readFileSync(
        new NodeURL(`../../../public/data/${relative}`, import.meta.url),
        'utf8',
      )
      return { ok: true, status: 200, json: async () => JSON.parse(body) } as Response
    }),
  )
}

async function renderSky(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted = { container, root }
  await act(async () => {
    root.render(createElement(PixelSky))
  })
  return container
}

function variantOf(container: HTMLElement): SkyVariant | null {
  const svg = container.querySelector('svg.px-sky')
  const value = svg?.getAttribute('data-variant')
  return value === 'day' || value === 'storm' ? value : null
}

async function run(action: () => void | Promise<void>): Promise<void> {
  await act(async () => {
    await action()
  })
}

describe('skyVariantFor: the day and storm rule', () => {
  it('turns storm for the two bands that mean trouble', () => {
    expect(skyVariantFor('critical')).toBe('storm')
    expect(skyVariantFor('storm_warning')).toBe('storm')
  })

  it('keeps day for every other band and for no band at all', () => {
    expect(skyVariantFor('watch')).toBe('day')
    expect(skyVariantFor('fair_skies')).toBe('day')
    expect(skyVariantFor('clear')).toBe('day')
    expect(skyVariantFor(null)).toBe('day')
  })
})

describe('PixelSky scene', () => {
  it('starts on the day scene and swaps when the live band turns', async () => {
    stubBundledData()
    const container = await renderSky()
    expect(variantOf(container)).toBe('day')

    await run(async () => {
      await useConsole.getState().boot()
    })
    await run(() => {
      useConsole.getState().selectAccount('68257')
    })
    // Account 68257 sits at Fair skies on the untouched twist, so the
    // sky stays day while the console reads calm.
    expect(variantOf(container)).toBe('day')

    await run(() => {
      useConsole.getState().applyPreset('combo')
    })
    // The combo preset lands Storm warning for this account.
    expect(variantOf(container)).toBe('storm')

    await run(() => {
      useConsole.getState().applyPreset('emergency_repair')
    })
    // A one month repair reads Critical, still a storm sky.
    expect(variantOf(container)).toBe('storm')

    await run(() => {
      useConsole.getState().resetTwist()
    })
    expect(variantOf(container)).toBe('day')

    await run(() => {
      useConsole.getState().resetAll()
    })
    expect(variantOf(container)).toBe('day')
  })

  it('paints the sun on day and rain with a bolt on storm', async () => {
    stubBundledData()
    const container = await renderSky()

    const daySvg = container.querySelector('svg.px-sky') as Element
    expect(daySvg.querySelector('[fill="#ffcf2e"]')).not.toBeNull()
    expect(daySvg.querySelector('.px-sky__rain')).toBeNull()
    expect(daySvg.querySelector('.px-sky__bolt')).toBeNull()

    await run(async () => {
      await useConsole.getState().boot()
    })
    await run(() => {
      useConsole.getState().selectAccount('68257')
      useConsole.getState().applyPreset('combo')
    })

    const stormSvg = container.querySelector('svg.px-sky') as Element
    expect(stormSvg.getAttribute('data-variant')).toBe('storm')
    expect(stormSvg.querySelector('[fill="#ffcf2e"]')).toBeNull()
    expect(stormSvg.querySelector('.px-sky__rain')).not.toBeNull()
    expect(stormSvg.querySelector('.px-sky__bolt')).not.toBeNull()
  })

  it('keeps every block on whole grid units and stays decorative', async () => {
    stubBundledData()
    const container = await renderSky()
    const svg = container.querySelector('svg.px-sky') as Element

    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('shape-rendering')).toBe('crispEdges')
    expect(svg.getAttribute('viewBox')).toBe('0 0 320 32')
    expect(svg.textContent).toBe('')

    const rects = [...svg.querySelectorAll('rect')]
    expect(rects.length).toBeGreaterThan(40)
    for (const rect of rects) {
      for (const attribute of ['x', 'y', 'width', 'height']) {
        const value = Number(rect.getAttribute(attribute))
        expect(Number.isInteger(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('PixelMascot', () => {
  it('draws an outlined pixel cloud over a coin jar', () => {
    const html = renderToString(createElement(PixelMascot))
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('viewBox="0 0 32 32"')
    // The slate outline that keeps the mascot readable on both skies,
    // the gold lid, and the square coins inside the jar.
    expect(html).toContain('#16273f')
    expect(html).toContain('#ffd23f')
    expect(html).toContain('#ffb42e')
    expect(html).toContain('shape-rendering="crispEdges"')
  })
})

describe('sky stylesheet: gated motion only', () => {
  it('gates the rain and the bolt behind no preference', () => {
    const css = readFileSync(new NodeURL('./sky.css', import.meta.url), 'utf8')
    expect(css).toContain('@media (prefers-reduced-motion: no-preference)')
    // Every animation in the sheet sits inside a no preference gate.
    const found = [...css.matchAll(/animation\s*:/g)]
    expect(found.length).toBeGreaterThan(0)
    for (const match of found) {
      const index = match.index ?? 0
      const gate = css.lastIndexOf('@media (prefers-reduced-motion: no-preference)', index)
      expect(gate).toBeGreaterThanOrEqual(0)
    }
    // The header keeps its text on solid plates, so the art never has
    // to carry contrast, and any future raster stays crisp.
    expect(css).toContain('image-rendering: pixelated')
    expect(css).toContain('border: 3px solid')
  })
})
