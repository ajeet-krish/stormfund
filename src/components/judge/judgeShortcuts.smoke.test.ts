// @vitest-environment jsdom
/**
 * Judge shortcut wiring smoke test (Phase E6): the real window
 * listener over the real store. Key 1 plays the layoff card, the same
 * keys typed into #account-lookup do nothing, slash focuses the lookup
 * and prevents the default, Esc walks the layers (gate, then query,
 * then reset all), Shift R resets everything, n draws the first safe
 * pool account under a stubbed rng, and a repeated key is ignored.
 * The last test mounts the real App to pin the bar, the rehearsal
 * toggle, and the paper sheet link in place.
 */
import { readFileSync } from 'node:fs'
// The jsdom environment replaces the global URL with its own
// implementation, which does not resolve file: bases correctly, so
// node:url's URL reads the bundled fixtures from disk here.
import { URL as NodeURL } from 'node:url'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import ConsoleView from '../console/ConsoleView'
import { parseProfilesArtifact, type ProfilesArtifact } from '../../data/profiles'
import { randomAccountPool } from '../../lib/judgeMode'
import { useConsole } from '../../state/consoleStore'
import { useJudgeDispatcher, useJudgeShortcuts } from './useJudgeShortcuts'

// React's act() refuses to run until the environment declares itself.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ARTIFACT: ProfilesArtifact = parseProfilesArtifact(
  JSON.parse(
    readFileSync(new NodeURL('../../../public/data/engine/profiles.json', import.meta.url), 'utf8'),
  ),
)

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
  useConsole.getState().resetAll()
  useConsole.setState({ typedStatus: 'idle', pendingShock: null, typedNote: null })
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
      const body = readFileSync(new NodeURL(`../../../public/data/${relative}`, import.meta.url), 'utf8')
      return { ok: true, status: 200, json: async () => JSON.parse(body) } as Response
    }),
  )
}

/** The wiring under test: console plus hooks, rng pinned to the pool head. */
function JudgeHarness() {
  const dispatch = useJudgeDispatcher({ rng: () => 0 })
  useJudgeShortcuts(dispatch)
  return createElement(ConsoleView)
}

async function renderJudge(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted = { container, root }
  await act(async () => {
    root.render(createElement(JudgeHarness))
  })
  await until(container, 'Know the customer')
  return container
}

async function renderShell(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted = { container, root }
  await act(async () => {
    root.render(createElement(App))
  })
  await until(container, 'Know the customer')
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

async function press(
  key: string,
  init: KeyboardEventInit = {},
  target: EventTarget = document.body,
): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  await act(async () => {
    target.dispatchEvent(event)
  })
  return event
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

function lookupOf(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('#account-lookup')
  if (!input) {
    throw new Error('no #account-lookup in the shell')
  }
  return input
}

describe('judge shortcuts over the live console', () => {
  it('plays the layoff card on key 1', async () => {
    stubBundledData()
    const container = await renderJudge()
    act(() => {
      useConsole.getState().selectAccount('68257')
    })
    expect(useConsole.getState().activePresetId).toBeNull()

    await press('1')
    expect(useConsole.getState().activePresetId).toBe('layoff')
    expect(useConsole.getState().twist.jobLoss).toBe(true)
    expect(container.textContent).toContain('Storm warning')
  })

  it('ignores 1 and n typed into the lookup input', async () => {
    stubBundledData()
    const container = await renderJudge()
    const input = lookupOf(container)
    input.focus()

    await press('1', {}, input)
    expect(useConsole.getState().activePresetId).toBeNull()
    await press('n', {}, input)
    expect(useConsole.getState().selectedId).toBeNull()
    expect(document.activeElement).toBe(input)
    await press('/', {}, input)
    expect(document.activeElement).toBe(input)
    // Even a key event that targets the body stays dead while the
    // lookup holds focus.
    await press('1')
    expect(useConsole.getState().activePresetId).toBeNull()
  })

  it('focuses the lookup on slash and prevents the default', async () => {
    stubBundledData()
    const container = await renderJudge()
    expect(document.activeElement).not.toBe(lookupOf(container))

    const event = await press('/')
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(lookupOf(container))
  })

  it('walks the Esc layers: gate, then query, then reset all', async () => {
    stubBundledData()
    const container = await renderJudge()
    const input = lookupOf(container)
    await type(input, '68257')
    expect(useConsole.getState().query).toBe('68257')
    act(() => {
      useConsole.setState({ typedStatus: 'pending' })
    })

    // Layer 1: the open gate cancels and the query survives.
    await press('Escape', {}, input)
    expect(useConsole.getState().typedStatus).toBe('idle')
    expect(useConsole.getState().query).toBe('68257')

    // Layer 2: the query clears and the selection survives.
    act(() => {
      useConsole.getState().selectAccount('68257')
    })
    await press('Escape', {}, input)
    expect(useConsole.getState().query).toBe('')
    expect(useConsole.getState().selectedId).toBe('68257')

    // Layer 3: with a selection and no query, everything resets.
    await press('Escape', {}, input)
    expect(useConsole.getState().selectedId).toBeNull()
    expect(useConsole.getState().twist.jobLoss).toBe(false)
    expect(useConsole.getState().activePresetId).toBeNull()
  })

  it('resets the twist on r and everything on Shift R', async () => {
    stubBundledData()
    await renderJudge()
    act(() => {
      useConsole.getState().selectAccount('68257')
      useConsole.getState().applyPreset('combo')
      useConsole.getState().setQuery('68257')
    })

    await press('r')
    expect(useConsole.getState().twist.jobLoss).toBe(false)
    expect(useConsole.getState().selectedId).toBe('68257')
    expect(useConsole.getState().query).toBe('68257')

    act(() => {
      useConsole.getState().applyPreset('combo')
    })
    await press('R', { shiftKey: true })
    expect(useConsole.getState().selectedId).toBeNull()
    expect(useConsole.getState().query).toBe('')
    expect(useConsole.getState().activePresetId).toBeNull()

    // Caps Lock R arrives as key R with no shift held, and the allowShift
    // binding still reads it as reset all, as documented.
    act(() => {
      useConsole.getState().selectAccount('68257')
      useConsole.getState().applyPreset('layoff')
    })
    await press('R')
    expect(useConsole.getState().selectedId).toBeNull()
    expect(useConsole.getState().activePresetId).toBeNull()
  })

  it('draws the safe pool head on n, then the next one with excludeId', async () => {
    stubBundledData()
    await renderJudge()
    const pool = randomAccountPool(ARTIFACT)
    expect(pool.length).toBeGreaterThan(10)

    await press('n')
    expect(useConsole.getState().selectedId).toBe(pool[0])

    await press('n')
    expect(useConsole.getState().selectedId).toBe(pool[1])
  })

  it('ignores repeated and modified keys', async () => {
    stubBundledData()
    await renderJudge()
    await press('1', { repeat: true })
    expect(useConsole.getState().activePresetId).toBeNull()
    await press('1', { ctrlKey: true })
    expect(useConsole.getState().activePresetId).toBeNull()
    await press('n', { metaKey: true })
    expect(useConsole.getState().selectedId).toBeNull()
    await press('1', { isComposing: true })
    expect(useConsole.getState().activePresetId).toBeNull()
  })
})

describe('App wiring: bar, rehearsal toggle, paper sheet', () => {
  it('mounts the sticky bar with nine buttons, the toggle, and the sheet link', async () => {
    stubBundledData()
    const container = await renderShell()

    const bar = container.querySelector('.jg-bar-sticky')
    expect(bar).not.toBeNull()
    expect(bar?.getAttribute('aria-label')).toBe('Judge mode')
    const buttons = [...container.querySelectorAll('.jg-shortcuts button')]
    expect(buttons).toHaveLength(9)
    expect(container.querySelector('kbd')?.textContent).toBe('1')

    const toggle = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Rehearsal',
    )
    expect(toggle).toBeDefined()
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')

    const sheet = container.querySelector<HTMLAnchorElement>('a.jg-tool')
    expect(sheet?.getAttribute('href')).toBe('/judge-sheet.html')
    expect(sheet?.textContent).toBe('Judge sheet')

    await click(toggle as Element)
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain('Rehearsal step 1 of 5')

    const hide = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Hide rehearsal',
    )
    await click(hide as Element)
    expect(container.textContent).not.toContain('Rehearsal step 1 of 5')
  })

  it('fires a shortcut button through the dispatcher', async () => {
    stubBundledData()
    const container = await renderShell()
    act(() => {
      useConsole.getState().selectAccount('68257')
    })
    const cards = [...container.querySelectorAll('.jg-shortcuts button')]
    await click(cards[0] as Element)
    expect(useConsole.getState().activePresetId).toBe('layoff')
  })
})
