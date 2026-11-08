// @vitest-environment jsdom
/**
 * App shell smoke tests for the console shell (Phase E2): the station
 * header, the footer that cites the profiles.json pipeline, and the
 * console itself. Server rendering covers the loading branch (an effect
 * never runs under renderToString), and the loaded console runs in jsdom
 * against real clicks: picking an account and playing a preset are the
 * contracts App.tsx mounts ConsoleView for.
 */
import { readFileSync } from 'node:fs'
// The jsdom environment replaces the global URL with its own
// implementation, which does not resolve file: bases correctly, so
// node:url's URL reads the bundled fixtures from disk here.
import { URL as NodeURL } from 'node:url'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

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

/**
 * Serve the bundled public/data JSON for every relative data fetch, so
 * the shell boots exactly as it does at the booth (offline, no network).
 */
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
        new NodeURL(`../public/data/${relative}`, import.meta.url),
        'utf8',
      )
      return { ok: true, status: 200, json: async () => JSON.parse(body) } as Response
    }),
  )
}

async function renderShell(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted = { container, root }
  await act(async () => {
    root.render(createElement(App))
  })
  return container
}

async function until(container: HTMLElement, text: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (container.textContent?.includes(text)) {
      return
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }
  throw new Error(
    `timed out waiting for ${JSON.stringify(text)}; shell reads: ${JSON.stringify(
      container.textContent?.slice(0, 600),
    )}`,
  )
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

async function type(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('app shell (server rendering)', () => {
  it('names the station and the pipeline while the console loads', () => {
    const html = renderToString(createElement(App))
    expect(html).toContain('<h1 class="px-title">Storm Fund Weather Station</h1>')
    expect(html).toContain('<p class="px-tagline">A weather forecast for personal finance</p>')
    expect(html).toContain('Loading account profiles')
    expect(html).toContain('scripts/engine.build')
    expect(html).toContain('public/data/engine/profiles.json')
    // The header carries the shipped static art and the mascot plate,
    // not the live pixel sky band or the retired track line.
    expect(html).toContain('src="/art/background.jpg"')
    expect(html).toContain('viewBox="0 0 32 32"')
    expect(html).not.toContain('px-sky')
    expect(html).not.toContain('Tangerine track, Sheridan Datathon 2026')
    expect(html).not.toContain('pick an account, take a shock')
    // The console is the only mounted surface in Phase E2.
    expect(html).not.toContain('FINDINGS')
    expect(html).not.toContain('Balance River')
  })

  it('crops the shipped header art to the band in the pixel sheet', () => {
    const css = readFileSync(new NodeURL('./components/sky/sky.css', import.meta.url), 'utf8')
    expect(css).toContain('object-fit: cover')
    expect(css).toContain('object-position: center 72%')
    expect(css).toContain('image-rendering: pixelated')
  })
})

describe('app shell (loaded console)', () => {
  it('boots the console and explains the empty state', async () => {
    stubBundledData()
    const container = await renderShell()
    await until(container, 'Know the customer')

    expect(container.querySelector('#account-lookup')).not.toBeNull()
    expect(container.textContent).toContain('Pick an account')
    expect(container.textContent).toContain('Type an account id, for example 68257')
    // The shock panel needs an account to show before and after numbers,
    // so it waits for a selection instead of rendering placeholder math.
    expect(container.querySelector('[data-preset="combo"]')).toBeNull()
  })

  it('selects an account and plays a preset from the shell', async () => {
    stubBundledData()
    const container = await renderShell()
    await until(container, 'Know the customer')

    const input = container.querySelector<HTMLInputElement>('#account-lookup')
    await type(input as HTMLInputElement, '68257')
    await until(container, 'One match.')
    await click(container.querySelector('#console [data-account-id="68257"]') as Element)

    await until(container, 'Account 68257')
    expect(container.textContent).toContain('Fair skies')

    // A one month repair costs more than this buffer holds.
    await click(container.querySelector('[data-preset="emergency_repair"]') as Element)
    await until(container, 'Critical')
    expect(container.textContent).toContain('0.0 months')
    expect(container.textContent).toContain(
      'The furnace dies, and the repair costs a full month of their typical spending.',
    )
  })
})

describe('app shell (layout order)', () => {
  it('mounts the console above the atlas so judges reach account entry first', async () => {
    stubBundledData()
    const container = await renderShell()
    await until(container, 'Know the customer')

    const consoleSlot = container.querySelector('#console')
    const atlasSlot = container.querySelector('#atlas')
    expect(consoleSlot).not.toBeNull()
    expect(atlasSlot).not.toBeNull()
    if (!consoleSlot || !atlasSlot) {
      return
    }

    // The console precedes the atlas in document order, so the first
    // thing under the header is the account lookup.
    const order = consoleSlot.compareDocumentPosition(atlasSlot)
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeGreaterThan(0)

    // The atlas drill down still has its scroll target to climb back to.
    expect(container.querySelector('#console #account-lookup')).not.toBeNull()
    expect(container.querySelector('#atlas .ax-shell')).not.toBeNull()
  })
})
