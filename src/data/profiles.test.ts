import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseProfilesArtifact, searchAccountIds } from './profiles'
import { runway } from '../lib/shocks'

/**
 * Loader contract for public/data/engine/profiles.json: the refusal
 * matrix from docs/profiles-schema.md (schema version, key sets, integer
 * cents, enum, range, hex check sum, count), the shipped artifact parse,
 * and the baseline cross check that the TS runway twin reproduces the
 * recorded runway for all 4,500 accounts, so the console's live shock
 * math starts from the same branch the pipeline froze.
 */

function miniProfile(): Record<string, unknown> {
  return {
    account_id: '20111',
    income_cents: 633_939,
    fixed_costs_cents: 233_006,
    spending_cents: 859_961,
    buffer_cents: 1_761_186,
    household_bills_cents: 0,
    loan_payment_cents: 233_019,
    insurance_cents: 0,
    loan_payments_median_cents: 233_006,
    pension_in_cents: 0,
    gap_cents: 226_022,
    runway_state: 'finite',
    runway_deci_months: 78,
    history: {
      first_month: '2022-11',
      last_month: '2025-12',
      row_count: 38,
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
    balance_series: { start_month: '2025-01', values_cents: [1] },
    provenance: {
      source: 'data/tangerine/monthly_summary.csv',
      filter: 'account_id = 20111 ordered by month ascending',
      agg: 'judge metrics; checksum value = money_in_cents',
      check_sum: 'd'.repeat(64),
    },
  }
}

function miniArtifact(): Record<string, unknown> {
  return {
    meta: {
      schema_version: 1,
      generated_by: 'scripts.engine.build',
      sources: [
        { path: 'data/tangerine/monthly_summary.csv', sha256: 'a'.repeat(64), rows: 185_326 },
        { path: 'data/tangerine/loans.csv', sha256: 'b'.repeat(64), rows: 682 },
        { path: 'data/tangerine/accounts.csv', sha256: 'c'.repeat(64), rows: 4500 },
      ],
      account_count: 1,
      date_range: { start: '2020-01', end: '2025-12' },
      money_unit: 'integer CAD cents',
      runway_unit: 'tenths of a month',
      rounding: 'half up at the metric boundary',
      definitions: { income_cents: 'I: median of money_in' },
      checksum_recipe: 'sha256 over id:value lines',
      edge_flag_counts: { pensioner: 1 },
    },
    profiles: { '20111': miniProfile() },
  }
}

function entryAt(doc: Record<string, unknown>): Record<string, unknown> {
  const profiles = doc.profiles as Record<string, Record<string, unknown>>
  const entry = profiles['20111']
  if (!entry) {
    throw new Error('fixture profile 20111 is missing')
  }
  return entry
}

function blockAt(doc: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = entryAt(doc)[key]
  if (typeof value !== 'object' || value === null) {
    throw new Error(`fixture profile block ${key} is missing`)
  }
  return value as Record<string, unknown>
}

function mutate(mutator: (raw: Record<string, unknown>) => void): Record<string, unknown> {
  const raw = miniArtifact()
  mutator(raw)
  return raw
}

describe('parseProfilesArtifact refusals', () => {
  it('accepts the minimal valid artifact', () => {
    const artifact = parseProfilesArtifact(miniArtifact())
    expect(artifact.ids).toEqual(['20111'])
    expect(artifact.byId.get('20111')?.income_cents).toBe(633_939)
    expect(artifact.meta.account_count).toBe(1)
  })

  it('refuses a schema version it does not know', () => {
    const raw = mutate((doc) => {
      ;(doc.meta as Record<string, unknown>).schema_version = 2
    })
    expect(() => parseProfilesArtifact(raw)).toThrow('schema_version must be 1')
  })

  it('refuses extra top level keys', () => {
    const raw = mutate((doc) => {
      doc.extra = true
    })
    expect(() => parseProfilesArtifact(raw)).toThrow(
      'profiles.json keys must be exactly meta, profiles',
    )
  })

  it('refuses an extra key inside a profile', () => {
    const raw = mutate((doc) => {
      entryAt(doc).mystery = 1
    })
    expect(() => parseProfilesArtifact(raw)).toThrow('unexpected mystery')
  })

  it('refuses a missing key inside a profile', () => {
    const raw = mutate((doc) => {
      delete entryAt(doc).gap_cents
    })
    expect(() => parseProfilesArtifact(raw)).toThrow('missing gap_cents')
  })

  it('refuses fractional cents', () => {
    const raw = mutate((doc) => {
      entryAt(doc).income_cents = 1.5
    })
    expect(() => parseProfilesArtifact(raw)).toThrow('income_cents must be an integer')
  })

  it('refuses a non integer runway state', () => {
    const raw = mutate((doc) => {
      entryAt(doc).runway_state = 'almost'
    })
    expect(() => parseProfilesArtifact(raw)).toThrow(
      'runway_state must be finite, no_shortfall, or buffer_depleted',
    )
  })

  it('refuses a runway outside the deci range', () => {
    const raw = mutate((doc) => {
      entryAt(doc).runway_deci_months = 1201
    })
    expect(() => parseProfilesArtifact(raw)).toThrow('within 0 to 1200')
  })

  it('refuses an account count that does not match the profile count', () => {
    const raw = mutate((doc) => {
      ;(doc.meta as Record<string, unknown>).account_count = 2
    })
    expect(() => parseProfilesArtifact(raw)).toThrow(
      'meta.account_count must equal the profile count (1)',
    )
  })

  it('refuses a check sum that is not 64 hex digits', () => {
    const raw = mutate((doc) => {
      blockAt(doc, 'provenance').check_sum = 'xyz'
    })
    expect(() => parseProfilesArtifact(raw)).toThrow('64 lowercase hex digits')
  })

  it('refuses an account id that disagrees with its key', () => {
    const raw = mutate((doc) => {
      entryAt(doc).account_id = '20112'
    })
    expect(() => parseProfilesArtifact(raw)).toThrow('must match its key')
  })

  it('refuses a flag that is not a boolean', () => {
    const raw = mutate((doc) => {
      blockAt(doc, 'flags').pensioner = 'yes'
    })
    expect(() => parseProfilesArtifact(raw)).toThrow('flags.pensioner must be a boolean')
  })
})

describe('shipped profiles.json', () => {
  const raw = JSON.parse(
    readFileSync(new URL('../../public/data/engine/profiles.json', import.meta.url), 'utf8'),
  ) as unknown
  const artifact = parseProfilesArtifact(raw)

  it('indexes all 4,500 accounts in ascending numeric order', () => {
    expect(artifact.ids).toHaveLength(4500)
    expect(artifact.byId.size).toBe(4500)
    expect(artifact.meta.account_count).toBe(4500)
    expect(artifact.ids[0]).toBe('20111')
    expect(artifact.ids[4499]).toBe('99984')
    for (let index = 1; index < artifact.ids.length; index += 1) {
      const previous = Number(artifact.ids[index - 1])
      const current = Number(artifact.ids[index])
      expect(current).toBeGreaterThan(previous)
    }
  })

  it('carries a meta block the UI can quote', () => {
    expect(artifact.meta.generated_by).toBe('scripts.engine.build')
    expect(artifact.meta.money_unit).toBe('integer CAD cents')
    expect(artifact.meta.runway_unit).toBe('tenths of a month')
    expect(artifact.meta.sources).toHaveLength(3)
    expect(artifact.meta.date_range).toEqual({ start: '2020-01', end: '2025-12' })
    for (const [flag, count] of Object.entries(artifact.meta.edge_flag_counts)) {
      expect(count, `edge flag ${flag} never fires in the shipped build`).toBeGreaterThan(0)
    }
  })

  it('parses the golden fixture accounts with their recorded values', () => {
    const runner = artifact.byId.get('68257')
    expect(runner?.income_cents).toBe(650_326)
    expect(runner?.spending_cents).toBe(716_084)
    expect(runner?.buffer_cents).toBe(643_785)
    expect(runner?.runway_state).toBe('finite')
    expect(runner?.runway_deci_months).toBe(98)
    expect(runner?.loan?.status).toBe('C')

    const defaulted = artifact.byId.get('42988')
    expect(defaulted?.flags.defaulted_loan).toBe(true)
    expect(defaulted?.flags.negative_buffer).toBe(true)
    expect(defaulted?.runway_state).toBe('buffer_depleted')

    const pensioner = artifact.byId.get('98952')
    expect(pensioner?.flags.pensioner).toBe(true)
    expect(pensioner?.pension_in_cents).toBe(13_945_644)
  })

  it('reproduces the recorded runway for every account', () => {
    const mismatches: string[] = []
    for (const id of artifact.ids) {
      const profile = artifact.byId.get(id)
      if (!profile) {
        continue
      }
      const answer = runway(profile.buffer_cents, 0, profile.income_cents, profile.spending_cents)
      if (
        answer.state !== profile.runway_state ||
        answer.deciMonths !== profile.runway_deci_months
      ) {
        mismatches.push(
          `${id}: twin ${answer.state}/${answer.deciMonths} vs artifact ${profile.runway_state}/${profile.runway_deci_months}`,
        )
      }
    }
    expect(mismatches).toEqual([])
  })

  it('keeps the recorded gap consistent with spending minus income', () => {
    const bad: string[] = []
    for (const id of artifact.ids) {
      const profile = artifact.byId.get(id)
      if (profile && profile.gap_cents !== profile.spending_cents - profile.income_cents) {
        bad.push(id)
      }
    }
    expect(bad).toEqual([])
  })
})

describe('searchAccountIds', () => {
  const ids = ['20111', '20112', '68257', '68258', '98952']

  it('returns nothing for an empty query', () => {
    expect(searchAccountIds(ids, '')).toEqual([])
    expect(searchAccountIds(ids, '   ')).toEqual([])
  })

  it('ranks prefix matches before substring matches', () => {
    expect(searchAccountIds(ids, '68')).toEqual(['68257', '68258'])
    expect(searchAccountIds(ids, '95')).toEqual(['98952'])
    expect(searchAccountIds(ids, '2')).toEqual([
      '20111',
      '20112',
      '68257',
      '68258',
      '98952',
    ])
    expect(searchAccountIds(ids, '99')).toEqual([])
  })

  it('honours the limit', () => {
    expect(searchAccountIds(ids, '2', 1)).toEqual(['20111'])
    expect(searchAccountIds(ids, 'z')).toEqual([])
  })

  it('trims what the judge typed', () => {
    expect(searchAccountIds(ids, ' 68257 ')).toEqual(['68257'])
  })
})
