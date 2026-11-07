import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseProfilesArtifact, type ProfilesArtifact } from '../data/profiles'
import { IDLE_TWIST } from '../lib/shocks'

/**
 * Store transitions with the loader stubbed: boot lifecycle (idle to
 * ready, idempotent, failure then retry), selection validated against the
 * bundle index, preset play and the deviation rule (any slider move that
 * changes a field clears activePresetId, returning the fields restores
 * it), and the two reset semantics. The module registry is reset per test
 * so each case starts from a fresh store without a test only export.
 */

vi.mock('../data/profiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/profiles')>()
  return { ...actual, loadSharedProfiles: vi.fn() }
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
  const storeModule = await import('./consoleStore')
  return {
    useConsole: storeModule.useConsole,
    loadSharedProfiles: vi.mocked(profilesModule.loadSharedProfiles),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('consoleStore boot', () => {
  it('goes from idle to ready and only fetches once', async () => {
    const { useConsole, loadSharedProfiles } = await freshStore()
    loadSharedProfiles.mockResolvedValue(makeBundle())

    expect(useConsole.getState().status).toBe('idle')
    expect(useConsole.getState().bundle).toBeNull()

    await useConsole.getState().boot()
    expect(useConsole.getState().status).toBe('ready')
    expect(useConsole.getState().bundle?.ids).toEqual(['42988', '68257'])

    await useConsole.getState().boot()
    expect(loadSharedProfiles).toHaveBeenCalledTimes(1)
  })

  it('reports a failed boot and retries on the next call', async () => {
    const { useConsole, loadSharedProfiles } = await freshStore()
    loadSharedProfiles
      .mockRejectedValueOnce(new Error('profiles.json fetch failed with status 404'))
      .mockResolvedValueOnce(makeBundle())

    await useConsole.getState().boot()
    expect(useConsole.getState().status).toBe('error')
    expect(useConsole.getState().error).toContain('profiles.json fetch failed')
    expect(useConsole.getState().bundle).toBeNull()

    await useConsole.getState().boot()
    expect(useConsole.getState().status).toBe('ready')
    expect(useConsole.getState().error).toBeNull()
    expect(loadSharedProfiles).toHaveBeenCalledTimes(2)
  })

  it('stays loading while a boot is in flight', async () => {
    const { useConsole, loadSharedProfiles } = await freshStore()
    let release: (bundle: ProfilesArtifact) => void = () => undefined
    loadSharedProfiles.mockReturnValue(
      new Promise<ProfilesArtifact>((resolve) => {
        release = resolve
      }),
    )

    void useConsole.getState().boot()
    void useConsole.getState().boot()
    expect(useConsole.getState().status).toBe('loading')
    expect(loadSharedProfiles).toHaveBeenCalledTimes(1)

    release(makeBundle())
    await vi.waitFor(() => expect(useConsole.getState().status).toBe('ready'))
  })
})

describe('consoleStore selection', () => {
  async function booted() {
    const store = await freshStore()
    store.loadSharedProfiles.mockResolvedValue(makeBundle())
    await store.useConsole.getState().boot()
    return store
  }

  it('accepts an id that exists in the index', async () => {
    const { useConsole } = await booted()
    useConsole.getState().selectAccount('68257')
    expect(useConsole.getState().selectedId).toBe('68257')
  })

  it('ignores an id that does not exist', async () => {
    const { useConsole } = await booted()
    useConsole.getState().selectAccount('68257')
    useConsole.getState().selectAccount('00000')
    expect(useConsole.getState().selectedId).toBe('68257')
  })

  it('stores the lookup query as typed', async () => {
    const { useConsole } = await booted()
    useConsole.getState().setQuery(' 682 ')
    expect(useConsole.getState().query).toBe(' 682 ')
  })
})

describe('consoleStore presets and twist', () => {
  async function booted() {
    const store = await freshStore()
    store.loadSharedProfiles.mockResolvedValue(makeBundle())
    await store.useConsole.getState().boot()
    store.useConsole.getState().selectAccount('68257')
    return store.useConsole
  }

  it('plays a preset and marks it active', async () => {
    const useConsole = await booted()
    useConsole.getState().applyPreset('combo')
    const twist = useConsole.getState().twist
    expect(twist.jobLoss).toBe(true)
    expect(twist.incomeFactor).toBe(0.55)
    expect(twist.billsDeltaPct).toBe(15)
    expect(twist.durationMonths).toBe(6)
    expect(useConsole.getState().activePresetId).toBe('combo')
  })

  it('clears the active preset when a slider changes a field', async () => {
    const useConsole = await booted()
    useConsole.getState().applyPreset('layoff')
    expect(useConsole.getState().activePresetId).toBe('layoff')

    // A value no preset carries means a custom twist.
    useConsole.getState().setTwistField({ billsDeltaPct: 20 })
    expect(useConsole.getState().activePresetId).toBeNull()

    useConsole.getState().setTwistField({ billsDeltaPct: 0 })
    expect(useConsole.getState().activePresetId).toBe('layoff')
  })

  it('recognizes a slider state that lands exactly on another preset', async () => {
    const useConsole = await booted()
    useConsole.getState().applyPreset('layoff')
    // Layoff plus 15 percent bills is, field for field, the combo card.
    useConsole.getState().setTwistField({ billsDeltaPct: 15 })
    expect(useConsole.getState().activePresetId).toBe('combo')
  })

  it('normalizes what a slider hands it', async () => {
    const useConsole = await booted()
    useConsole.getState().setTwistField({ billsDeltaPct: 500, incomeFactor: 2 })
    expect(useConsole.getState().twist.billsDeltaPct).toBe(100)
    expect(useConsole.getState().twist.incomeFactor).toBe(1)
  })

  it('keeps the account when the twist resets', async () => {
    const useConsole = await booted()
    useConsole.getState().applyPreset('emergency_repair')
    useConsole.getState().resetTwist()
    expect(useConsole.getState().twist).toEqual(IDLE_TWIST)
    expect(useConsole.getState().activePresetId).toBeNull()
    expect(useConsole.getState().selectedId).toBe('68257')
  })

  it('clears account, query, and twist on a full reset', async () => {
    const useConsole = await booted()
    useConsole.getState().setQuery('68257')
    useConsole.getState().applyPreset('cost_spike')
    useConsole.getState().resetAll()
    expect(useConsole.getState().selectedId).toBeNull()
    expect(useConsole.getState().query).toBe('')
    expect(useConsole.getState().twist).toEqual(IDLE_TWIST)
    expect(useConsole.getState().activePresetId).toBeNull()
  })

  it('ignores an unknown preset id', async () => {
    const useConsole = await booted()
    useConsole.getState().applyPreset('hail' as never)
    expect(useConsole.getState().activePresetId).toBeNull()
    expect(useConsole.getState().twist).toEqual(IDLE_TWIST)
  })
})
