// @vitest-environment jsdom
/**
 * Rehearsal dock contract (Phase E6): the five step script renders in
 * order, Run step selects the fixture account and plays its card
 * through the store, Answered stops the stopwatch and prints the
 * verdict against the 2000 ms target, Next step advances, and a fresh
 * mount starts back at step one because nothing persists.
 */
import { readFileSync } from 'node:fs'
// The jsdom environment replaces the global URL with its own
// implementation, which does not resolve file: bases correctly, so
// node:url's URL reads the bundled fixtures from disk here.
import { URL as NodeURL } from 'node:url'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { parseProfilesArtifact, type ProfilesArtifact } from '../../data/profiles'
import { useConsole } from '../../state/consoleStore'
import { REHEARSAL_SCRIPT, rehearsalCard } from '../../lib/rehearsal'
import RehearsalDock from './RehearsalDock'

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
  useConsole.setState({
    status: 'idle',
    error: null,
    bundle: null,
    query: '',
    selectedId: null,
    activePresetId: null,
  })
})

async function renderDock(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted = { container, root }
  await act(async () => {
    root.render(createElement(RehearsalDock))
  })
  return container
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

function buttonOf(container: HTMLElement, label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === label,
  )
  if (!match) {
    throw new Error(`no ${label} button; dock reads: ${container.textContent?.slice(0, 400)}`)
  }
  return match
}

describe('RehearsalDock', () => {
  it('opens on step one of five with the card sentence and the script line', async () => {
    useConsole.setState({ status: 'ready', bundle: ARTIFACT })
    const container = await renderDock()
    const first = REHEARSAL_SCRIPT[0]
    expect(first).toBeDefined()
    expect(container.textContent).toContain('Rehearsal step 1 of 5')
    expect(container.textContent).toContain(rehearsalCard(first!))
    expect(container.textContent).toContain(first!.scriptLine)
    expect(container.textContent).toContain('Account 68257')
    expect(container.textContent).toContain('target 2000 ms')
    expect(buttonOf(container, 'Run step')).toBeDefined()
  })

  it('runs the step through the store, times the answer, and advances', async () => {
    useConsole.setState({ status: 'ready', bundle: ARTIFACT })
    const container = await renderDock()

    await click(buttonOf(container, 'Run step'))
    expect(useConsole.getState().selectedId).toBe('68257')
    expect(useConsole.getState().activePresetId).toBe('layoff')
    expect(container.textContent).toContain('Stopwatch running')
    expect(buttonOf(container, 'Answered')).toBeDefined()

    await click(buttonOf(container, 'Answered'))
    expect(container.textContent).toMatch(/Answered in \d+ ms: (fast|ok|slow)/)
    expect(buttonOf(container, 'Next step')).toBeDefined()

    await click(buttonOf(container, 'Next step'))
    const second = REHEARSAL_SCRIPT[1]
    expect(second).toBeDefined()
    expect(container.textContent).toContain('Rehearsal step 2 of 5')
    expect(container.textContent).toContain(rehearsalCard(second!))
    expect(container.textContent).toContain('Account 23838')

    await click(buttonOf(container, 'Run step'))
    expect(useConsole.getState().selectedId).toBe('23838')
    expect(useConsole.getState().activePresetId).toBe('cost_spike')
  })

  it('walks all five steps in order and starts over on the last', async () => {
    useConsole.setState({ status: 'ready', bundle: ARTIFACT })
    const container = await renderDock()

    for (let position = 0; position < REHEARSAL_SCRIPT.length; position += 1) {
      const step = REHEARSAL_SCRIPT[position]
      expect(step).toBeDefined()
      expect(container.textContent).toContain(`Rehearsal step ${position + 1} of 5`)
      await click(buttonOf(container, 'Run step'))
      expect(useConsole.getState().selectedId).toBe(step!.accountId)
      expect(useConsole.getState().activePresetId).toBe(step!.presetId)
      await click(buttonOf(container, 'Answered'))
      const label = position === REHEARSAL_SCRIPT.length - 1 ? 'Start over' : 'Next step'
      expect(buttonOf(container, label)).toBeDefined()
      await click(buttonOf(container, label))
    }

    expect(container.textContent).toContain('Rehearsal step 1 of 5')
  })

  it('keeps no state between mounts', async () => {
    useConsole.setState({ status: 'ready', bundle: ARTIFACT })
    const first = await renderDock()
    await click(buttonOf(first, 'Run step'))
    await click(buttonOf(first, 'Answered'))
    expect(first.textContent).toContain('Answered in')

    const { container, root } = mounted!
    mounted = null
    act(() => {
      root.unmount()
    })
    container.remove()

    const second = await renderDock()
    expect(second.textContent).toContain('Rehearsal step 1 of 5')
    expect(second.textContent).not.toContain('Answered in')
    expect(buttonOf(second, 'Run step')).toBeDefined()
  })
})
