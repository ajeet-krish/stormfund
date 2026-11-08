// @vitest-environment jsdom
/**
 * Typed shock smoke tests: the mode badge never lies, "reading the sky"
 * is the only loading state, a fallback note hands the judge back to
 * preset cards, and a pending parse renders four correction chips plus a
 * hand verifiable formula strip that cannot reach state without an
 * explicit confirm. The console store slice and shockFormula are mocked
 * at the module boundary, so no network request and no real Gemini call
 * ever run in this file.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountProfile } from '../../data/profiles'
import TypedShock from './TypedShock'

// React's act() refuses to run until the environment declares itself.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const harness = vi.hoisted(() => ({
  typedStatus: 'idle' as string,
  typedNote: null as string | null,
  shockMode: 'preset' as string,
  pendingShock: null as unknown,
  parseTypedShock: vi.fn(),
  confirmTypedShock: vi.fn(),
  adjustPendingShock: vi.fn(),
  cancelTypedShock: vi.fn(),
  shockFormula: vi.fn(() => ({
    incomeAfterCents: 300000,
    billsDeltaCents: 40000,
    spendingAfterCents: 460000,
    oneOffCents: 130000,
    bufferLeftCents: 70000,
  })),
}))

vi.mock('../../state/consoleStore', () => ({
  useConsole: (selector: (state: typeof harness) => unknown) => selector(harness),
}))

vi.mock('../../lib/shockParse', () => ({
  shockFormula: harness.shockFormula,
}))

const PENDING = {
  sentence: 'they lose their job, EI covers half, and the furnace dies next month',
  spec: { incomeFactor: 0.5, billsPct: 0.2, oneOffMonths: 1.5, durationMonths: 12 },
  intent: 'mixed',
  confidence: 'high',
  summary: 'Half income, bills up, furnace replaced next month',
  fixes: [] as string[],
}

/** Only the fields this component reads; shockFormula itself is mocked. */
function makeProfile(): AccountProfile {
  return {
    account_id: '68257',
    income_cents: 600000,
    spending_cents: 460000,
    household_bills_cents: 200000,
    buffer_cents: 200000,
  } as unknown as AccountProfile
}

let mounted: { container: HTMLElement; root: Root } | null = null

beforeEach(() => {
  harness.typedStatus = 'idle'
  harness.typedNote = null
  harness.shockMode = 'preset'
  harness.pendingShock = null
  harness.parseTypedShock.mockClear()
  harness.confirmTypedShock.mockClear()
  harness.adjustPendingShock.mockClear()
  harness.cancelTypedShock.mockClear()
  harness.shockFormula.mockClear()
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
})

async function renderTyped(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted = { container, root }
  await act(async () => {
    root.render(createElement(TypedShock, { profile: makeProfile() }))
  })
  return container
}

/** Type into a controlled input the way a browser would. */
async function type(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function pressEnter(input: HTMLInputElement): Promise<void> {
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
  })
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === text,
  )
  expect(match).toBeDefined()
  return match as HTMLButtonElement
}

describe('typed shock input', () => {
  it('renders the sentence input and the preset cards mode badge at idle', async () => {
    const container = await renderTyped()

    const input = container.querySelector<HTMLInputElement>('#shock-sentence')
    expect(input).not.toBeNull()
    expect(findButton(container, 'Read the sky')).toBeDefined()

    const badge = container.querySelector('.cp-mode-badge')
    expect(badge?.textContent).toBe('preset cards')
    expect(badge?.textContent).not.toContain('Gemini')
    expect(container.querySelector('[role="status"]')).toBeNull()
    expect(container.querySelector('.cp-chips')).toBeNull()
  })

  it('reads typed shock Gemini on the badge when the store says gemini', async () => {
    harness.shockMode = 'gemini'
    const container = await renderTyped()

    const badge = container.querySelector('.cp-mode-badge')
    expect(badge?.textContent).toBe('typed shock Gemini')
    expect(badge?.classList.contains('cp-mode-badge-gemini')).toBe(true)
  })

  it('shows reading the sky as the status while a parse is in flight', async () => {
    harness.typedStatus = 'reading'
    const container = await renderTyped()

    const status = container.querySelector('[role="status"]')
    expect(status).not.toBeNull()
    expect(status?.textContent).toBe('reading the sky')
    expect(container.querySelector('.cp-chips')).toBeNull()
  })

  it('shows the fallback note and keeps the preset cards badge', async () => {
    harness.typedStatus = 'fallback'
    harness.typedNote = 'Gemini unavailable, using preset cards'
    harness.shockMode = 'preset'
    const container = await renderTyped()

    const note = container.querySelector('.cp-note-fallback')
    expect(note).not.toBeNull()
    expect(note?.textContent).toBe('Gemini unavailable, using preset cards')
    expect(container.querySelector('.cp-mode-badge')?.textContent).toBe('preset cards')
    expect(container.querySelector('.cp-chips')).toBeNull()
  })

  it('renders four chips and the formula strip, and only applies on confirm', async () => {
    harness.typedStatus = 'pending'
    harness.pendingShock = PENDING
    harness.shockMode = 'gemini'
    const container = await renderTyped()

    const chips = container.querySelectorAll('.cp-chip')
    expect(chips.length).toBe(4)
    expect(container.querySelector('[data-chip="incomeFactor"]')?.textContent).toContain('50%')
    expect(container.querySelector('[data-chip="billsPct"]')?.textContent).toContain('20%')
    expect(container.querySelector('[data-chip="oneOffMonths"]')?.textContent).toContain('1.5')
    expect(container.querySelector('[data-chip="oneOffMonths"]')?.textContent).toContain(
      'months of spending',
    )
    expect(container.querySelector('[data-chip="durationMonths"]')?.textContent).toContain('12')
    expect(container.querySelector('[data-chip="durationMonths"]')?.textContent).toContain('months')

    const lines = Array.from(container.querySelectorAll('.cp-formula__line')).map(
      (line) => line.textContent,
    )
    expect(lines).toEqual([
      'Income: 50% of $6,000.00 = $3,000.00',
      'Spending: $4,600.00 + 20% of bills $2,000.00 = $4,600.00',
      'One off: 1.5 months of spending = $1,300.00 from the buffer',
      'Buffer left: $700.00',
    ])
    expect(harness.shockFormula).toHaveBeenCalledTimes(1)

    const apply = findButton(container, 'Apply shock')
    expect(document.activeElement).toBe(apply)
    expect(harness.confirmTypedShock).not.toHaveBeenCalled()

    await click(apply)
    expect(harness.confirmTypedShock).toHaveBeenCalledTimes(1)
    expect(findButton(container, 'Discard')).toBeDefined()
  })

  it('calls adjustPendingShock with the right field and delta on every stepper', async () => {
    harness.typedStatus = 'pending'
    harness.pendingShock = PENDING
    const container = await renderTyped()

    const cases: readonly (readonly [string, number])[] = [
      ['incomeFactor', 0.05],
      ['billsPct', 0.01],
      ['oneOffMonths', 0.1],
      ['durationMonths', 1],
    ]

    for (const [field, step] of cases) {
      const chip = container.querySelector(`[data-chip="${field}"]`)
      expect(chip).not.toBeNull()
      const buttons = chip?.querySelectorAll('button') ?? []
      expect(buttons.length).toBe(2)

      harness.adjustPendingShock.mockClear()
      await click(buttons[0] as Element)
      expect(harness.adjustPendingShock).toHaveBeenCalledTimes(1)
      expect(harness.adjustPendingShock).toHaveBeenCalledWith(field, -step)

      harness.adjustPendingShock.mockClear()
      await click(buttons[1] as Element)
      expect(harness.adjustPendingShock).toHaveBeenCalledTimes(1)
      expect(harness.adjustPendingShock).toHaveBeenCalledWith(field, step)
    }

    expect(harness.confirmTypedShock).not.toHaveBeenCalled()
  })

  it('parses the trimmed sentence when Enter is pressed in the input', async () => {
    const container = await renderTyped()
    const input = container.querySelector<HTMLInputElement>('#shock-sentence')
    expect(input).not.toBeNull()

    await type(input as HTMLInputElement, '  the furnace dies next month  ')
    await pressEnter(input as HTMLInputElement)

    expect(harness.parseTypedShock).toHaveBeenCalledTimes(1)
    expect(harness.parseTypedShock).toHaveBeenCalledWith('the furnace dies next month')
    expect(harness.confirmTypedShock).not.toHaveBeenCalled()
  })
})
