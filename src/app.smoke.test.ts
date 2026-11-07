// @vitest-environment jsdom
/**
 * App shell smoke tests for the findings-first shell (pivot recorded in
 * docs/decisions.md): the FINDINGS report leads, the second nav slot is the
 * exploration placeholder that stands in for the cancelled galaxy game, and
 * the explore seam carries the finding id the reader came from.
 *
 * Server rendering covers the loading branches (an effect never runs under
 * renderToString), so the loaded report and the view switch run in jsdom
 * against real clicks: only a click can fire an explore link, and that click
 * is the contract App.tsx owns.
 */
import { readFileSync } from 'node:fs'
// The jsdom environment replaces the global URL with its own implementation,
// which does not resolve file: bases correctly, so node:url's URL is the one
// that reads the bundled fixtures from disk here.
import { URL as NodeURL } from 'node:url'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import PlayView from './components/PlayView'

// React's act() refuses to run until the environment declares itself.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Mounted shell to unmount between tests. */
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
 * Serve the bundled public/data JSON for every relative data fetch, so the
 * shell boots exactly as it does at the booth (offline, no network).
 */
function stubBundledData(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const name = String(input).split('/').filter(Boolean).pop() ?? ''
      if (!/^[a-z_]+\.json$/.test(name)) {
        throw new Error(`unexpected bundled data request: ${String(input)}`)
      }
      const body = readFileSync(new NodeURL(`../public/data/${name}`, import.meta.url), 'utf8')
      return { ok: true, status: 200, json: async () => JSON.parse(body) } as Response
    }),
  )
}

/** Mount the real App into a detached-in-body container. */
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

/** Flush effects until the given text lands, or fail loudly. */
async function until(container: HTMLElement, text: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (container.textContent?.includes(text)) {
      return
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }
  throw new Error(
    `timed out waiting for ${JSON.stringify(text)}; shell reads: ${JSON.stringify(
      container.textContent?.slice(0, 500),
    )}`,
  )
}

/** Click helper: dispatch inside act so React flushes the resulting switch. */
async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

describe('app shell (server rendering)', () => {
  it('renders the findings-first shell with an honest nav', () => {
    const html = renderToString(createElement(App))
    expect(html).toContain('Ledger Odyssey')
    // FindingsView fetches findings.json in an effect, so SSR shows the
    // loading branch; the loaded body is covered by FindingsView.test.ts.
    expect(html).toContain('Loading findings')
    expect(html).toContain('FINDINGS')
    // The slot is named EXPLORE: the game surface is retired and the
    // Balance River is what exploration will mean next phase.
    expect(html).toContain('EXPLORE')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('Findings first, exploration next')
  })

  it('renders the exploration placeholder with the pivot spelled out', () => {
    const html = renderToString(createElement(PlayView, { onBack: () => undefined }))
    expect(html).toContain('The galaxy game is retired. The Balance River comes next.')
    expect(html).toContain('docs/decisions.md')
    expect(html).toContain('Balance River')
    expect(html).toContain('Back to the findings report')
    // No finding id when the reader came from the nav: nothing to name.
    expect(html).not.toContain('Arrived from finding')
  })

  it('names the finding the explore seam carried', () => {
    const html = renderToString(
      createElement(PlayView, { findingId: 'F4', onBack: () => undefined }),
    )
    expect(html.replace(/<!-- -->/g, '')).toContain('Arrived from finding F4')
    expect(html).toContain('The galaxy game is retired')
  })
})

describe('app shell (loaded report and view switch)', () => {
  it('renders the loaded report and switches views through an explore link', async () => {
    stubBundledData()
    const container = await renderShell()
    await until(container, 'One year of a Tangerine style ledger')
    for (const id of ['f1', 'f2', 'f3', 'f4', 'f5']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }

    const section = container.querySelector('#f4')
    const link = section?.querySelector('a.rp-explore')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('#play')

    await click(link as Element)
    expect(container.textContent).toContain('The galaxy game is retired')
    expect(container.textContent).toContain('Arrived from finding F4')
    // The report unmounts behind the switch; the placeholder owns the view.
    expect(container.textContent).not.toContain('One year of a Tangerine style ledger')

    const exploreTab = Array.from(container.querySelectorAll('nav button')).find(
      (button) => button.textContent === 'EXPLORE',
    )
    expect(exploreTab?.getAttribute('aria-current')).toBe('page')
  })

  it('switches from the nav tab and back without a finding to name', async () => {
    stubBundledData()
    const container = await renderShell()
    await until(container, 'One year of a Tangerine style ledger')

    const tabs = Array.from(container.querySelectorAll('nav button'))
    const exploreTab = tabs.find((button) => button.textContent === 'EXPLORE')
    expect(exploreTab).toBeDefined()
    await click(exploreTab as Element)

    expect(container.textContent).toContain('The galaxy game is retired')
    expect(container.textContent).not.toContain('Arrived from finding')

    const back = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Back to the findings report'),
    )
    expect(back).toBeDefined()
    await click(back as Element)

    await until(container, 'One year of a Tangerine style ledger')
    expect(container.textContent).not.toContain('The galaxy game is retired')
    const findingsTab = Array.from(container.querySelectorAll('nav button')).find(
      (button) => button.textContent === 'FINDINGS',
    )
    expect(findingsTab?.getAttribute('aria-current')).toBe('page')
  })
})
