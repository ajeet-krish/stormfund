// @vitest-environment jsdom
/**
 * Shock panel contracts on the real console: the panel is named
 * Simulate a Shock Event in one heading, the typed sentence row is not
 * rendered (the preset cards lead the panel), the twist card line sits
 * below every control and right above the After the shock verdict,
 * and each slider carries a local synced whole number text field.
 * The number fields push into the store only, so they never touch the
 * Gemini path, and their parsing rules (whole numbers, decimals
 * stripped, clamped to the slider range, empty field holds still) are
 * pinned here. The bundled profiles.json is served from disk exactly
 * as the booth serves it; only the network is stubbed.
 */
import { readFileSync } from 'node:fs'
// The jsdom environment replaces the global URL with its own
// implementation, which does not resolve file: bases correctly, so
// node:url's URL reads the bundled fixtures from disk here.
import { URL as NodeURL } from 'node:url'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ConsoleView from './ConsoleView'
import { IDLE_TWIST } from '../../lib/shocks'
import { useConsole } from '../../state/consoleStore'

// React's act() refuses to run until the environment declares itself.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mounted: { container: HTMLElement; root: Root } | null = null

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

beforeEach(() => {
  // The first mount boots the shared store, every later test reuses
  // that bundle and starts from the untouched twist again.
  useConsole.setState({
    query: '',
    selectedId: null,
    twist: IDLE_TWIST,
    activePresetId: null,
    typedStatus: 'idle',
    pendingShock: null,
    typedNote: null,
    shockMode: 'preset',
  })
})

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
  throw new Error(`timed out waiting for ${JSON.stringify(text)}`)
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

/** Drag a range input to a value the way a browser would. */
async function drag(input: HTMLInputElement, value: string): Promise<void> {
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

function field(container: HTMLElement, id: string): { range: HTMLInputElement; text: HTMLInputElement } {
  const range = container.querySelector<HTMLInputElement>(`#${id}`)
  const text = container.querySelector<HTMLInputElement>(`#${id}-typed`)
  expect(range).not.toBeNull()
  expect(text).not.toBeNull()
  return { range: range as HTMLInputElement, text: text as HTMLInputElement }
}

function comesBefore(first: Element, second: Element): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
}

/** Boot the shell and select account 68257 so the shock panel mounts. */
async function consoleWithAccount(): Promise<HTMLElement> {
  stubBundledData()
  const container = await renderConsole()
  await until(container, 'Know the customer')
  const input = container.querySelector<HTMLInputElement>('#account-lookup')
  await type(input as HTMLInputElement, '68257')
  await until(container, 'One match.')
  await click(container.querySelector('[data-account-id="68257"]') as Element)
  await until(container, 'Account 68257')
  return container
}

describe('ShockPanel heading and order', () => {
  it('names the panel in one heading and drops the old pair', async () => {
    const container = await consoleWithAccount()
    const shock = sectionOf(container, 'shock-heading')

    expect(shock).not.toBeNull()
    const heading = shock?.querySelector('#shock-heading')
    expect(heading?.tagName).toBe('H2')
    expect(heading?.textContent?.trim()).toBe('Simulate a Shock Event')
    expect(shock?.querySelector('.cp-panel__head .cp-eyebrow')).toBeNull()
    expect(shock?.textContent).not.toContain('Take a shock')
    expect(shock?.textContent).not.toContain('Play a twist card')
  })

  it('sits the twist card line under every control and above the verdict', async () => {
    const container = await consoleWithAccount()
    const shock = sectionOf(container, 'shock-heading')
    expect(shock).not.toBeNull()

    // The typed sentence row is unmounted for the demo, so the preset
    // cards lead the panel with no typed input above them.
    expect(shock?.querySelector('#shock-sentence')).toBeNull()
    expect(shock?.querySelector('.cp-typed')).toBeNull()

    const presets = shock?.querySelector('.cp-presets') as Element
    const sliders = shock?.querySelector('.cp-sliders') as Element
    const card = shock?.querySelector('.cp-twist-card') as Element
    const verdict = shock?.querySelector('.cp-verdict') as Element

    expect(comesBefore(presets, sliders)).toBe(true)
    expect(comesBefore(sliders, card)).toBe(true)
    expect(comesBefore(card, verdict)).toBe(true)
    expect(verdict.textContent).toContain('After the shock')
    // The idle panel still explains itself before any preset is played.
    expect(card.textContent).toContain('No preset yet')
  })
})

describe('ShockPanel synced number fields', () => {
  it('labels every typed field, marks it numeric, and describes it with the readout', async () => {
    const container = await consoleWithAccount()

    for (const id of ['shock-income', 'shock-bills', 'shock-oneoff', 'shock-extra']) {
      const { text } = field(container, id)
      expect(text.getAttribute('inputmode')).toBe('numeric')
      expect(text.getAttribute('type')).toBe('text')
      expect(text.getAttribute('pattern')).toBe('[0-9]*')
      const label = container.querySelector(`label[for="${id}-typed"]`)
      expect(label).not.toBeNull()
      expect(label?.textContent).toContain('in ')
      expect(text.getAttribute('aria-describedby')).toBe(`${id}-out`)
    }
    expect(container.querySelector('label[for="shock-income-typed"]')?.textContent).toBe(
      'Income after shock in percent',
    )
    expect(container.querySelector('label[for="shock-extra-typed"]')?.textContent).toBe(
      'Extra monthly cost in dollars a month',
    )
  })

  it('reads the untouched twist in every text field', async () => {
    const container = await consoleWithAccount()

    expect(field(container, 'shock-income').text.value).toBe('55')
    expect(field(container, 'shock-bills').text.value).toBe('0')
    expect(field(container, 'shock-oneoff').text.value).toBe('0')
    expect(field(container, 'shock-extra').text.value).toBe('0')
  })

  it('pushes a typed value into the twist and repaints the slider', async () => {
    const container = await consoleWithAccount()
    const { range, text } = field(container, 'shock-extra')

    await type(text, '237')

    expect(text.value).toBe('237')
    expect(range.value).toBe('23700')
    expect(useConsole.getState().twist.extraMonthlyCents).toBe(23700)
    // The exact figure is the formatted readout above the slider.
    expect(container.querySelector('#shock-extra-out')?.textContent).toBe('$237.00 a month')
  })

  it('clamps a typed value to the range the slider holds', async () => {
    const container = await consoleWithAccount()
    const { range, text } = field(container, 'shock-income')

    await type(text, '237')

    expect(text.value).toBe('100')
    expect(range.value).toBe('100')
    expect(useConsole.getState().twist.incomeFactor).toBe(1)
  })

  it('strips decimals so a typed percent stays a whole number', async () => {
    const container = await consoleWithAccount()
    const { range, text } = field(container, 'shock-bills')

    await type(text, '23.7')

    expect(text.value).toBe('23')
    expect(range.value).toBe('23')
    expect(useConsole.getState().twist.billsDeltaPct).toBe(23)
  })

  it('holds still on an empty field and resyncs when the field loses focus', async () => {
    const container = await consoleWithAccount()
    const { text } = field(container, 'shock-bills')

    await type(text, '12')
    expect(useConsole.getState().twist.billsDeltaPct).toBe(12)

    await type(text, '')
    expect(text.value).toBe('')
    // The twist keeps the value it already had: empty is a pause, not a zero.
    expect(useConsole.getState().twist.billsDeltaPct).toBe(12)

    await act(async () => {
      text.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(text.value).toBe('12')
  })

  it('repaints the text when the slider moves', async () => {
    const container = await consoleWithAccount()
    const { range, text } = field(container, 'shock-income')

    expect(text.value).toBe('55')
    await drag(range, '70')

    expect(text.value).toBe('70')
    expect(useConsole.getState().twist.incomeFactor).toBe(0.7)
  })

  it('keeps the typed fields out of the Gemini path', async () => {
    const container = await consoleWithAccount()

    const { text } = field(container, 'shock-bills')
    await type(text, '15')

    expect(useConsole.getState().typedStatus).toBe('idle')
    expect(useConsole.getState().shockMode).toBe('preset')
    expect(useConsole.getState().pendingShock).toBeNull()
    // No typed input, mode badge, or chip gate renders in the panel.
    expect(container.querySelector('.cp-typed')).toBeNull()
    expect(container.querySelector('.cp-mode-badge')).toBeNull()
    expect(container.querySelector('.cp-chips')).toBeNull()
  })
})
