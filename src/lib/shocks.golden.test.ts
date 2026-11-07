import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AccountProfile } from '../data/profiles'
import { meanCents, medianCents } from './metrics'
import { SHOCK_PRESETS, type PresetId } from './shockPresets'
import { applyTwist, runway, scaleCents, type Twist } from './shocks'

/**
 * Cross language contract: the TypeScript twins must reproduce the frozen
 * hand computation in scripts/engine/golden_fixtures.json (Phase E1).
 * Four layers: the runway over each fixture's recorded baseline, the
 * median and mean twins over the recorded sorted cents arrays (which pins
 * the half cent tie in account 23838), the branch cases including the
 * 120 month cap and a deci half tie, and the worked shock example for
 * account 68257 (combo preset, then layoff plus one month of repair).
 * Nothing under scripts/engine is written by this test, so a rule change
 * on either side fails here instead of drifting silently.
 */

interface GoldenFixture {
  account_id: string
  sorted_cents: Record<string, number[]>
  expected: {
    account_id: string
    income_cents: number
    fixed_costs_cents: number
    spending_cents: number
    buffer_cents: number
    household_bills_cents: number
    gap_cents: number
    runway_state: 'finite' | 'no_shortfall' | 'buffer_depleted'
    runway_deci_months: number
  }
}

interface GoldenFile {
  fixtures: GoldenFixture[]
}

const FIXTURES: GoldenFixture[] = (
  JSON.parse(
    readFileSync(new URL('../../scripts/engine/golden_fixtures.json', import.meta.url), 'utf8'),
  ) as GoldenFile
).fixtures

function presetTwist(id: PresetId): Twist {
  const preset = SHOCK_PRESETS.find((entry) => entry.id === id)
  if (!preset) {
    throw new Error(`missing preset ${id}`)
  }
  return {
    jobLoss: false,
    incomeFactor: 0.55,
    billsDeltaPct: 0,
    oneOffMonthsTenths: 0,
    extraMonthlyCents: 0,
    durationMonths: 0,
    ...preset.twist,
  }
}

function profileOf(fixture: GoldenFixture): AccountProfile {
  const expected = fixture.expected
  return {
    account_id: expected.account_id,
    income_cents: expected.income_cents,
    fixed_costs_cents: expected.fixed_costs_cents,
    spending_cents: expected.spending_cents,
    buffer_cents: expected.buffer_cents,
    household_bills_cents: expected.household_bills_cents,
    loan_payment_cents: 0,
    insurance_cents: 0,
    loan_payments_median_cents: 0,
    pension_in_cents: 0,
    gap_cents: expected.gap_cents,
    runway_state: expected.runway_state,
    runway_deci_months: expected.runway_deci_months,
    history: {
      first_month: '2020-01',
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
    balance_series: { start_month: '2025-01', values_cents: [1] },
    provenance: {
      source: 'data/tangerine/monthly_summary.csv',
      filter: `account_id = ${expected.account_id} ordered by month ascending`,
      agg: 'judge metrics; checksum value = money_in_cents',
      check_sum: 'b'.repeat(64),
    },
  }
}

function fixture(id: string): GoldenFixture {
  const found = FIXTURES.find((entry) => entry.account_id === id)
  if (!found) {
    throw new Error(`missing golden fixture ${id}`)
  }
  return found
}

describe('golden fixtures: runway twin', () => {
  it('ships the five frozen accounts', () => {
    expect(FIXTURES.map((entry) => entry.account_id)).toEqual([
      '68257',
      '23838',
      '49900',
      '98952',
      '42988',
    ])
  })

  it('reproduces every recorded baseline runway from the recorded metrics', () => {
    for (const entry of FIXTURES) {
      const expected = entry.expected
      expect(
        runway(expected.buffer_cents, 0, expected.income_cents, expected.spending_cents),
        `runway for ${entry.account_id}`,
      ).toEqual({ state: expected.runway_state, deciMonths: expected.runway_deci_months })
    }
  })

  it('keeps the recorded gap equal to spending minus income', () => {
    for (const entry of FIXTURES) {
      expect(entry.expected.gap_cents).toBe(
        entry.expected.spending_cents - entry.expected.income_cents,
      )
    }
  })
})

describe('golden fixtures: metric twins', () => {
  it('reproduces I, S, F, H, and B from the recorded sorted arrays', () => {
    for (const entry of FIXTURES) {
      const sorted = entry.sorted_cents
      const expected = entry.expected
      const context = `metrics for ${entry.account_id}`
      expect(medianCents(sorted.money_in ?? []), context).toBe(expected.income_cents)
      expect(medianCents(sorted.money_out ?? []), context).toBe(expected.spending_cents)
      expect(medianCents(sorted.fixed_row_sum ?? []), context).toBe(expected.fixed_costs_cents)
      expect(medianCents(sorted.household_bills ?? []), context).toBe(
        expected.household_bills_cents,
      )
      expect(meanCents(sorted.avg_daily_balance_last_6_chronological ?? []), context).toBe(
        expected.buffer_cents,
      )
    }
  })

  it('pins the half cent tie in account 23838 to 280403', () => {
    const tie = fixture('23838')
    const moneyIn = tie.sorted_cents.money_in ?? []
    // n = 18, middles 279358 and 281447: 280402.5 rounds away from zero.
    expect(medianCents(moneyIn)).toBe(280403)
    expect(medianCents(moneyIn)).toBe(tie.expected.income_cents)
    expect(medianCents(tie.sorted_cents.money_out ?? [])).toBe(173780)
  })

  it('keeps the mean tie in account 68257 on the half up rule', () => {
    const runner = fixture('68257')
    const balances = runner.sorted_cents.avg_daily_balance_last_6_chronological ?? []
    expect(balances).toHaveLength(6)
    expect(meanCents(balances)).toBe(643785)
    expect(meanCents(balances)).toBe(runner.expected.buffer_cents)
  })
})

describe('golden fixtures: branch cases', () => {
  it('caps the finite branch at 1200 deci months for account 49900', () => {
    const capped = fixture('49900')
    expect(capped.expected.runway_state).toBe('finite')
    expect(capped.expected.runway_deci_months).toBe(1200)
    expect(runway(925_140, 0, 0, 6293)).toEqual({ state: 'finite', deciMonths: 1200 })
  })

  it('rounds a deci half tie away from zero', () => {
    // buffer_left 3, gap 20: 10 * 3 / 20 = 1.5, so 2 deci months.
    expect(runway(3, 0, 0, 20)).toEqual({ state: 'finite', deciMonths: 2 })
  })

  it('keeps branch order: buffer_depleted wins over no_shortfall', () => {
    expect(runway(0, 0, 100, 50)).toEqual({ state: 'buffer_depleted', deciMonths: 0 })
    expect(runway(100, 200, 100, 50)).toEqual({ state: 'buffer_depleted', deciMonths: 0 })
    expect(runway(100, 0, 100, 50)).toEqual({ state: 'no_shortfall', deciMonths: 1200 })
  })
})

describe('golden fixtures: worked shock example for account 68257', () => {
  const profile = profileOf(fixture('68257'))

  it('matches the combo preset numbers', () => {
    const result = applyTwist(profile, presetTwist('combo'))
    expect(result.incomeAfterCents).toBe(357_679)
    expect(scaleCents(profile.household_bills_cents, 15)).toBe(64_601)
    expect(result.spendingAfterCents).toBe(780_685)
    expect(result.gapAfterCents).toBe(423_006)
    expect(result.bufferLeftCents).toBe(643_785)
    expect(result.runway.deciMonths).toBe(15)
    expect(result.runway.state).toBe('finite')
  })

  it('matches layoff plus a one month repair', () => {
    const twist: Twist = {
      ...presetTwist('layoff'),
      oneOffMonthsTenths: presetTwist('emergency_repair').oneOffMonthsTenths,
    }
    const result = applyTwist(profile, twist)
    expect(result.bufferLeftCents).toBe(-72_299)
    expect(result.runway.state).toBe('buffer_depleted')
    expect(result.runway.deciMonths).toBe(0)
  })
})
