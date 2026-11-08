// @vitest-environment jsdom
/**
 * Guard chip row contract (Phase E6): nothing renders before boot or
 * with a clean account, and a flagged account prints one short chip per
 * flag with the full guard sentence behind it for hover and for screen
 * readers. The row is prop free, so the store is the only input.
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
import GuardChips from './GuardChips'

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

async function renderChips(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted = { container, root }
  await act(async () => {
    root.render(createElement(GuardChips))
  })
  return container
}

describe('GuardChips', () => {
  it('renders nothing before boot and with nothing selected', async () => {
    const empty = await renderChips()
    expect(empty.innerHTML).toBe('')

    await act(async () => {
      useConsole.setState({ status: 'ready', bundle: ARTIFACT, selectedId: null })
    })
    expect(empty.innerHTML).toBe('')
  })

  it('renders nothing for a clean account', async () => {
    await act(async () => {
      useConsole.setState({ status: 'ready', bundle: ARTIFACT, selectedId: '68257' })
    })
    const container = await renderChips()
    expect(container.innerHTML).toBe('')
  })

  it('prints one short chip per flag with the full message behind it', async () => {
    await act(async () => {
      useConsole.setState({ status: 'ready', bundle: ARTIFACT, selectedId: '42988' })
    })
    const container = await renderChips()
    expect(container.innerHTML).toContain('aria-label="Edge guard flags"')
    expect(container.innerHTML).toContain('jg-chip')
    expect(container.textContent).toContain('negative buffer')
    expect(container.textContent).toContain('defaulted loan')
    expect(container.innerHTML).toContain(
      'Savings buffer is below zero: the baseline already reads 0.0 months of runway',
    )
    expect(container.innerHTML).toContain(
      'Loan in arrears (status D): the account still pays a loan it is behind on.',
    )
    expect(container.innerHTML).toContain('jg-sr')
    expect(container.innerHTML).toContain('title="')
  })

  it('swaps to the layoff message when a job loss twist goes live', async () => {
    await act(async () => {
      useConsole.setState({ status: 'ready', bundle: ARTIFACT, selectedId: '98952' })
    })
    const container = await renderChips()
    expect(container.textContent).toContain('pension income')

    await act(async () => {
      useConsole.getState().applyPreset('layoff')
    })
    expect(container.textContent).toContain('pension vs layoff')
    expect(container.innerHTML).toContain(
      'Layoff twist simulated against pension income: this account has no wage to lose, read the verdict as a stress test',
    )
  })
})
