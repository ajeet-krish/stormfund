// @vitest-environment jsdom
/**
 * Console shell smoke tests: a failed boot explains what to do and lets
 * the judge retry, then the happy path runs the whole console contract in
 * jsdom (lookup selects account 68257, the combo preset applies, the
 * verdict band changes, and the plan text renders). The bundled
 * profiles.json is served from disk exactly as the booth serves it, so
 * the parse, the index, and the pure derivation all run for real; only
 * the network is stubbed.
 */
import { readFileSync } from 'node:fs'
// The jsdom environment replaces the global URL with its own
// implementation, which does not resolve file: bases correctly, so
// node:url's URL reads the bundled fixtures from disk here.
import { URL as NodeURL } from 'node:url'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ConsoleView from './ConsoleView'

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

async function renderConsole(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted = { container, root }
  await act(async () => {
    root.render(createElement(ConsoleView))
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
    `timed out waiting for ${JSON.stringify(text)}; console reads: ${JSON.stringify(
      container.textContent?.slice(0, 600),
    )}`,
  )
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

/** Type into a controlled input the way a browser would. */
async function type(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function sectionOf(container: HTMLElement, headingId: string): HTMLElement | null {
  const heading = container.querySelector(`#${headingId}`)
  return heading?.closest('section') ?? null
}

describe('console boot', () => {
  it('explains a failed boot and offers a retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('profiles.json fetch failed with status 404')
      }),
    )
    const container = await renderConsole()
    await until(container, 'Profiles failed to load')

    const alert = container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain('profiles.json fetch failed with status 404')
    expect(alert?.textContent).toContain('Check that public/data/engine/profiles.json')
    expect(
      Array.from(container.querySelectorAll('button')).some(
        (button) => button.textContent === 'Try again',
      ),
    ).toBe(true)
  })

  it('runs lookup, preset, verdict, and plan end to end', async () => {
    stubBundledData()
    const container = await renderConsole()

    // The store is still in its error state from the failed boot above,
    // so mounting retries against the stubbed bundle.
    await until(container, 'Know the customer')
    expect(container.textContent).toContain('Type an account id, for example 68257')

    const input = container.querySelector<HTMLInputElement>('#account-lookup')
    expect(input).not.toBeNull()
    await type(input as HTMLInputElement, '68257')
    await until(container, 'One match.')

    const suggestion = container.querySelector('[data-account-id="68257"]')
    expect(suggestion).not.toBeNull()
    await click(suggestion as Element)

    const baseline = sectionOf(container, 'baseline-heading')
    expect(baseline?.textContent).toContain('Account 68257')
    expect(baseline?.textContent).toContain('$6,503.26')
    expect(baseline?.textContent).toContain('Fair skies')
    expect(baseline?.textContent).toContain('Recorded check sum')

    const shock = sectionOf(container, 'shock-heading')
    expect(shock).not.toBeNull()
    expect(shock?.textContent).toContain('steady state')

    const combo = container.querySelector('[data-preset="combo"]')
    expect(combo).not.toBeNull()
    await click(combo as Element)

    const shocked = sectionOf(container, 'shock-heading')
    expect(shocked?.textContent).toContain('Storm warning')
    expect(shocked?.textContent).toContain('1.5 months')
    expect(shocked?.textContent).toContain('$3,576.79')
    expect(shocked?.textContent).toContain('$7,806.85')
    expect(shocked?.textContent).toContain('$4,230.06')

    // The weather panel's landfall pin prints the same figure the
    // verdict badge shows, to the digit, and the job loss marker with
    // its answer key label is live under the combo twist.
    const forecast = sectionOf(container, 'forecast-heading')
    expect(forecast).not.toBeNull()
    const verdictFigure = shocked?.querySelector('.cp-verdict__runway')?.textContent ?? ''
    expect(verdictFigure).toBe('1.5 months')
    expect(forecast?.textContent).toContain(verdictFigure)
    expect(forecast?.textContent).toContain('Beyond the answer key: EI income stops after month 6')
    expect(forecast?.textContent).toContain('They lose their job (EI at 55%)')

    const plan = sectionOf(container, 'plan-heading')
    expect(plan?.textContent).toContain('Starter cushion: $21,482.52')
    expect(plan?.textContent).toContain(
      'Baseline steady state: 9.8 months. Shocked steady state: 1.5 months (Storm warning).',
    )
    expect(plan?.textContent).toContain(
      'The shocked runway runs out before the 6 month horizon ends.',
    )

    // Reset returns the console to idle conditions, account kept, and
    // the job loss marker leaves with the twist.
    const reset = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Reset shock',
    )
    expect(reset).toBeDefined()
    await click(reset as Element)
    const afterReset = sectionOf(container, 'shock-heading')
    expect(afterReset?.textContent).toContain('Fair skies')
    expect(sectionOf(container, 'baseline-heading')?.textContent).toContain('Account 68257')
    const idleForecast = sectionOf(container, 'forecast-heading')
    expect(idleForecast?.textContent).not.toContain('Beyond the answer key')
    expect(idleForecast?.textContent).toContain('Shock lands this month')
  })
})
