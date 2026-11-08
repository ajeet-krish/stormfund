import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseProfilesArtifact, type ProfilesArtifact } from '../data/profiles'
import type { ParseOk, ParseOutcome, PromptMetrics } from '../lib/shockParse'
import { IDLE_TWIST } from '../lib/shocks'

/**
 * The typed slice of consoleStore with the parser mocked out: the
 * confirm gate (pendingShock never writes twist), the fallback note
 * mapping per reject category, the chip stepper clamping, and the
 * clearing rules (preset play, both resets, account selection) that
 * also retire an in flight parse through the generation counter.
 */

vi.mock('../data/profiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/profiles')>()
  return { ...actual, loadSharedProfiles: vi.fn() }
})

vi.mock('../lib/shockParse', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/shockParse')>()
  return { ...actual, parseShockSentence: vi.fn() }
})

function miniProfile(accountId: string): Record<string, unknown> {
  return {
    account_id: accountId,
    income_cents: 100_000,
    fixed_costs_cents: 40_000,
    spending_cents: 90_000,
    buffer_cents: 500_000,
    household_bills_cents: 20_000,
    loan_payment_cents: 0,
    insurance_cents: 0,
    loan_payments_median_cents: 0,
    pension_in_cents: 0,
    gap_cents: -10_000,
    runway_state: 'no_shortfall',
    runway_deci_months: 1200,
    history: {
      first_month: '2024-01',
      last_month: '2025-12',
      row_count: 24,
      months_contiguous: true,
    },
    loan: null,
    flags: {
      pensioner: false,
      thin_history: false,
      zero_income: false,
      defaulted_loan: false,
      negative_buffer: false,
    },
    balance_series: { start_month: '2025-01', values_cents: [1, 2, 3] },
    provenance: {
      source: 'data/tangerine/monthly_summary.csv',
      filter: `account_id = ${accountId} ordered by month ascending`,
      agg: 'judge metrics; checksum value = money_in_cents',
      check_sum: 'e'.repeat(64),
    },
  }
}

function makeBundle(): ProfilesArtifact {
  return parseProfilesArtifact({
    meta: {
      schema_version: 1,
      generated_by: 'scripts.engine.build',
      sources: [
        { path: 'data/tangerine/monthly_summary.csv', sha256: 'a'.repeat(64), rows: 185_326 },
        { path: 'data/tangerine/loans.csv', sha256: 'b'.repeat(64), rows: 682 },
        { path: 'data/tangerine/accounts.csv', sha256: 'c'.repeat(64), rows: 4500 },
      ],
      account_count: 2,
      date_range: { start: '2020-01', end: '2025-12' },
      money_unit: 'integer CAD cents',
      runway_unit: 'tenths of a month',
      rounding: 'half up',
      definitions: { income_cents: 'I' },
      checksum_recipe: 'sha256',
      edge_flag_counts: { pensioner: 1 },
    },
    profiles: { '42988': miniProfile('42988'), '68257': miniProfile('68257') },
  })
}

async function freshStore() {
  vi.resetModules()
  const profilesModule = await import('../data/profiles')
  const parseModule = await import('../lib/shockParse')
  const storeModule = await import('./consoleStore')
  return {
    useConsole: storeModule.useConsole,
    loadSharedProfiles: vi.mocked(profilesModule.loadSharedProfiles),
    parseShockSentence: vi.mocked(parseModule.parseShockSentence),
  }
}

async function booted() {
  const store = await freshStore()
  store.loadSharedProfiles.mockResolvedValue(makeBundle())
  await store.useConsole.getState().boot()
  store.useConsole.getState().selectAccount('68257')
  return store
}

function okOutcome(overrides: Partial<ParseOk> = {}): ParseOk {
  return {
    status: 'ok',
    spec: { incomeFactor: 0.55, billsPct: 0, oneOffMonths: 0, durationMonths: 6 },
    intent: 'job_loss',
    confidence: 'high',
    summary: 'Laid off, EI covers half for six months',
    fixes: [],
    ...overrides,
  }
}

const NOTE_NO_KEY = 'Typed shocks run on a local build: npm run dev, or build and preview with .env. The deployed build falls back to preset cards.'
const NOTE_UNAVAILABLE = 'Gemini unavailable, using preset cards'
const NOTE_NO_SHOCK = 'No clear shock in that sentence, using preset cards'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('consoleStore typed parse', () => {
  it('shows reading while a parse is in flight, then parks an ok result', async () => {
    const { useConsole, parseShockSentence } = await booted()
    let release: (outcome: ParseOutcome) => void = () => undefined
    parseShockSentence.mockReturnValue(
      new Promise<ParseOutcome>((resolve) => {
        release = resolve
      }),
    )

    const inFlight = useConsole.getState().parseTypedShock('laid off')
    expect(useConsole.getState().typedStatus).toBe('reading')
    expect(useConsole.getState().typedNote).toBeNull()
    expect(useConsole.getState().pendingShock).toBeNull()

    release(okOutcome())
    await inFlight
    expect(useConsole.getState().typedStatus).toBe('pending')
    expect(useConsole.getState().pendingShock?.sentence).toBe('laid off')
    expect(useConsole.getState().pendingShock?.spec.incomeFactor).toBe(0.55)
    expect(useConsole.getState().pendingShock?.confidence).toBe('high')
    expect(useConsole.getState().typedNote).toBeNull()
    expect(useConsole.getState().twist).toEqual(IDLE_TWIST)
    expect(useConsole.getState().shockMode).toBe('preset')
  })

  it('keeps twist untouched until confirmTypedShock runs', async () => {
    const { useConsole, parseShockSentence } = await booted()
    parseShockSentence.mockResolvedValue(okOutcome())
    await useConsole.getState().parseTypedShock('they lose their job')

    expect(useConsole.getState().typedStatus).toBe('pending')
    expect(useConsole.getState().twist).toEqual(IDLE_TWIST)
    expect(useConsole.getState().shockMode).toBe('preset')

    useConsole.getState().confirmTypedShock()
    const twist = useConsole.getState().twist
    expect(twist.jobLoss).toBe(true)
    expect(twist.incomeFactor).toBe(0.55)
    expect(twist.billsDeltaPct).toBe(0)
    expect(twist.durationMonths).toBe(6)
    expect(useConsole.getState().activePresetId).toBe('layoff')
    expect(useConsole.getState().shockMode).toBe('gemini')
    expect(useConsole.getState().typedStatus).toBe('idle')
    expect(useConsole.getState().pendingShock).toBeNull()
    expect(useConsole.getState().typedNote).toBeNull()
  })

  it('re matches a preset when the confirmed spec lands on one', async () => {
    const { useConsole, parseShockSentence } = await booted()
    parseShockSentence.mockResolvedValue(
      okOutcome({ spec: { incomeFactor: 0.55, billsPct: 0.15, oneOffMonths: 0, durationMonths: 6 } }),
    )
    await useConsole.getState().parseTypedShock('laid off and bills up')
    useConsole.getState().confirmTypedShock()
    expect(useConsole.getState().activePresetId).toBe('combo')
    expect(useConsole.getState().twist.billsDeltaPct).toBe(15)
    expect(useConsole.getState().shockMode).toBe('gemini')
  })

  it('does nothing on confirm without a pending parse', async () => {
    const { useConsole } = await booted()
    useConsole.getState().confirmTypedShock()
    expect(useConsole.getState().twist).toEqual(IDLE_TWIST)
    expect(useConsole.getState().shockMode).toBe('preset')
    expect(useConsole.getState().typedStatus).toBe('idle')
  })

  it('maps every reject category to its fallback note', async () => {
    const { useConsole, parseShockSentence } = await booted()
    const cases: Array<[ParseOutcome, string]> = [
      [{ status: 'rejected', reason: 'no_key', detail: '' }, NOTE_NO_KEY],
      [{ status: 'timeout' }, NOTE_UNAVAILABLE],
      [{ status: 'rejected', reason: 'rate_limited', detail: '' }, NOTE_UNAVAILABLE],
      [{ status: 'rejected', reason: 'http_error', detail: '' }, NOTE_UNAVAILABLE],
      [{ status: 'rejected', reason: 'network_error', detail: '' }, NOTE_UNAVAILABLE],
      [{ status: 'rejected', reason: 'aborted', detail: '' }, NOTE_UNAVAILABLE],
      [{ status: 'rejected', reason: 'malformed_json', detail: '' }, NOTE_NO_SHOCK],
      [{ status: 'rejected', reason: 'bad_shape', detail: '' }, NOTE_NO_SHOCK],
      [{ status: 'rejected', reason: 'no_shock', detail: '' }, NOTE_NO_SHOCK],
      [{ status: 'rejected', reason: 'low_confidence', detail: '' }, NOTE_NO_SHOCK],
      [{ status: 'rejected', reason: 'all_neutral', detail: '' }, NOTE_NO_SHOCK],
      [{ status: 'rejected', reason: 'empty_input', detail: '' }, NOTE_NO_SHOCK],
    ]
    for (const [outcome, note] of cases) {
      const reason = outcome.status === 'rejected' ? outcome.reason : 'timeout'
      parseShockSentence.mockResolvedValueOnce(outcome)
      await useConsole.getState().parseTypedShock(`attempt for ${reason}`)
      expect(useConsole.getState().typedStatus).toBe('fallback')
      expect(useConsole.getState().typedNote).toBe(note)
      expect(useConsole.getState().pendingShock).toBeNull()
      expect(useConsole.getState().twist).toEqual(IDLE_TWIST)
      expect(useConsole.getState().shockMode).toBe('preset')
    }
  })

  it('falls back without a parse when no account is selected', async () => {
    const { useConsole, parseShockSentence, loadSharedProfiles } = await freshStore()
    loadSharedProfiles.mockResolvedValue(makeBundle())
    await useConsole.getState().boot()

    await useConsole.getState().parseTypedShock('laid off')
    expect(useConsole.getState().typedStatus).toBe('fallback')
    expect(useConsole.getState().typedNote).toBe('No account selected, using preset cards')
    expect(parseShockSentence).not.toHaveBeenCalled()
  })

  it('steps one pending chip field and clamps at the bounds', async () => {
    const { useConsole, parseShockSentence } = await booted()
    parseShockSentence.mockResolvedValue(
      okOutcome({ spec: { incomeFactor: 1, billsPct: 0, oneOffMonths: 0, durationMonths: 0 } }),
    )
    await useConsole.getState().parseTypedShock('bills up a little')

    useConsole.getState().adjustPendingShock('billsPct', 1)
    useConsole.getState().adjustPendingShock('incomeFactor', -1)
    useConsole.getState().adjustPendingShock('oneOffMonths', 1)
    useConsole.getState().adjustPendingShock('durationMonths', 1)
    const stepped = useConsole.getState().pendingShock?.spec
    expect(stepped?.billsPct).toBe(0.01)
    expect(stepped?.incomeFactor).toBe(0.95)
    expect(stepped?.oneOffMonths).toBe(0.1)
    expect(stepped?.durationMonths).toBe(1)
    expect(useConsole.getState().typedStatus).toBe('pending')
    expect(useConsole.getState().twist).toEqual(IDLE_TWIST)

    for (let index = 0; index < 150; index++) {
      useConsole.getState().adjustPendingShock('incomeFactor', -1)
      useConsole.getState().adjustPendingShock('billsPct', -1)
      useConsole.getState().adjustPendingShock('durationMonths', 1)
    }
    const clamped = useConsole.getState().pendingShock?.spec
    expect(clamped?.incomeFactor).toBe(0)
    expect(clamped?.billsPct).toBe(0)
    expect(clamped?.durationMonths).toBe(120)

    useConsole.getState().cancelTypedShock()
    expect(useConsole.getState().pendingShock).toBeNull()
    expect(useConsole.getState().typedStatus).toBe('idle')
    expect(useConsole.getState().twist).toEqual(IDLE_TWIST)
  })

  it('ignores chip steps without a pending parse', async () => {
    const { useConsole } = await booted()
    useConsole.getState().adjustPendingShock('billsPct', 1)
    expect(useConsole.getState().pendingShock).toBeNull()
    expect(useConsole.getState().twist).toEqual(IDLE_TWIST)
  })

  it('retires an in flight parse when a second one starts', async () => {
    const { useConsole, parseShockSentence } = await booted()
    let releaseFirst: (outcome: ParseOutcome) => void = () => undefined
    let releaseSecond: (outcome: ParseOutcome) => void = () => undefined
    parseShockSentence
      .mockReturnValueOnce(
        new Promise<ParseOutcome>((resolve) => {
          releaseFirst = resolve
        }),
      )
      .mockReturnValueOnce(
        new Promise<ParseOutcome>((resolve) => {
          releaseSecond = resolve
        }),
      )

    const first = useConsole.getState().parseTypedShock('first sentence')
    const second = useConsole.getState().parseTypedShock('second sentence')
    expect(parseShockSentence.mock.calls[0]?.[2]?.aborted).toBe(true)

    releaseSecond(
      okOutcome({
        spec: { incomeFactor: 0.5, billsPct: 0, oneOffMonths: 0, durationMonths: 0 },
      }),
    )
    await second
    expect(useConsole.getState().pendingShock?.spec.incomeFactor).toBe(0.5)

    releaseFirst(okOutcome())
    await first
    expect(useConsole.getState().pendingShock?.spec.incomeFactor).toBe(0.5)
    expect(useConsole.getState().typedStatus).toBe('pending')
  })

  it('clears typed state and aborts on resetTwist', async () => {
    const { useConsole, parseShockSentence } = await booted()
    let release: (outcome: ParseOutcome) => void = () => undefined
    parseShockSentence.mockReturnValue(
      new Promise<ParseOutcome>((resolve) => {
        release = resolve
      }),
    )
    const inFlight = useConsole.getState().parseTypedShock('laid off')
    expect(useConsole.getState().typedStatus).toBe('reading')
    expect(parseShockSentence.mock.calls[0]?.[2]?.aborted).toBe(false)

    useConsole.getState().resetTwist()
    expect(parseShockSentence.mock.calls[0]?.[2]?.aborted).toBe(true)
    expect(useConsole.getState().typedStatus).toBe('idle')

    release(okOutcome())
    await inFlight
    expect(useConsole.getState().typedStatus).toBe('idle')
    expect(useConsole.getState().pendingShock).toBeNull()
    expect(useConsole.getState().typedNote).toBeNull()
    expect(useConsole.getState().shockMode).toBe('preset')
    expect(useConsole.getState().twist).toEqual(IDLE_TWIST)
  })

  it('clears typed state on resetAll', async () => {
    const { useConsole, parseShockSentence } = await booted()
    parseShockSentence.mockResolvedValue(okOutcome())
    await useConsole.getState().parseTypedShock('laid off')
    expect(useConsole.getState().pendingShock).not.toBeNull()

    useConsole.getState().resetAll()
    expect(useConsole.getState().typedStatus).toBe('idle')
    expect(useConsole.getState().pendingShock).toBeNull()
    expect(useConsole.getState().typedNote).toBeNull()
    expect(useConsole.getState().shockMode).toBe('preset')
    expect(useConsole.getState().twist).toEqual(IDLE_TWIST)
    expect(useConsole.getState().selectedId).toBeNull()
  })

  it('clears typed state on an accepted account selection', async () => {
    const { useConsole, parseShockSentence } = await booted()
    parseShockSentence.mockResolvedValue(okOutcome())
    await useConsole.getState().parseTypedShock('laid off')
    expect(useConsole.getState().pendingShock).not.toBeNull()

    useConsole.getState().selectAccount('42988')
    expect(useConsole.getState().selectedId).toBe('42988')
    expect(useConsole.getState().typedStatus).toBe('idle')
    expect(useConsole.getState().pendingShock).toBeNull()
    expect(useConsole.getState().typedNote).toBeNull()
    expect(useConsole.getState().shockMode).toBe('preset')
    expect(useConsole.getState().twist).toEqual(IDLE_TWIST)
  })

  it('keeps typed state on an unknown account selection', async () => {
    const { useConsole, parseShockSentence } = await booted()
    parseShockSentence.mockResolvedValue(okOutcome())
    await useConsole.getState().parseTypedShock('laid off')

    useConsole.getState().selectAccount('00000')
    expect(useConsole.getState().selectedId).toBe('68257')
    expect(useConsole.getState().pendingShock).not.toBeNull()
  })

  it('clears typed state when a preset card plays', async () => {
    const { useConsole, parseShockSentence } = await booted()
    parseShockSentence.mockResolvedValue(okOutcome())
    await useConsole.getState().parseTypedShock('laid off')
    expect(useConsole.getState().pendingShock).not.toBeNull()

    useConsole.getState().applyPreset('combo')
    expect(useConsole.getState().typedStatus).toBe('idle')
    expect(useConsole.getState().pendingShock).toBeNull()
    expect(useConsole.getState().typedNote).toBeNull()
    expect(useConsole.getState().shockMode).toBe('preset')
    expect(useConsole.getState().activePresetId).toBe('combo')
  })

  it('keeps preset play working while a parse is in flight', async () => {
    const { useConsole, parseShockSentence } = await booted()
    let release: (outcome: ParseOutcome) => void = () => undefined
    parseShockSentence.mockReturnValue(
      new Promise<ParseOutcome>((resolve) => {
        release = resolve
      }),
    )
    const inFlight = useConsole.getState().parseTypedShock('laid off')
    expect(parseShockSentence.mock.calls[0]?.[2]?.aborted).toBe(false)
    useConsole.getState().applyPreset('cost_spike')
    expect(parseShockSentence.mock.calls[0]?.[2]?.aborted).toBe(true)
    release(okOutcome())
    await inFlight
    expect(useConsole.getState().typedStatus).toBe('idle')
    expect(useConsole.getState().pendingShock).toBeNull()
    expect(useConsole.getState().activePresetId).toBe('cost_spike')
    expect(useConsole.getState().shockMode).toBe('preset')
  })
})

describe('consoleStore typed prompt metrics', () => {
  it('builds the prompt metrics from the selected profile', async () => {
    const { useConsole, parseShockSentence } = await booted()
    parseShockSentence.mockResolvedValue(okOutcome())
    await useConsole.getState().parseTypedShock('laid off')
    const metrics = parseShockSentence.mock.calls[0]?.[1] as PromptMetrics
    expect(metrics.accountId).toBe('68257')
    expect(metrics.incomeCents).toBe(100_000)
    expect(metrics.fixedCostsCents).toBe(40_000)
    expect(metrics.spendingCents).toBe(90_000)
    expect(metrics.bufferCents).toBe(500_000)
    expect(metrics.householdBillsCents).toBe(20_000)
    expect(metrics.loanPaymentCents).toBe(0)
    expect(metrics.runwayMonths).toBe(120)
  })
})
