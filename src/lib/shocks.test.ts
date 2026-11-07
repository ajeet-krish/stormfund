import { describe, expect, it } from 'vitest'
import type { AccountProfile } from '../data/profiles'
import {
  applyTwist,
  IDLE_TWIST,
  monthsToTenths,
  normalizeTwist,
  percentToFactor,
  roundHalfUp,
  runway,
  sameTwist,
  scaleCents,
  tenthsToMonths,
} from './shocks'

/**
 * Unit coverage for the shock math: rounding ties in both signs, every
 * runway branch in fixed order, the clamp and quantize pass, and the
 * worked example from scripts/engine/golden_fixtures.json (account 68257)
 * so the console reproduces the pipeline's hand computation to the cent.
 */

function makeProfile(overrides: Partial<AccountProfile> = {}): AccountProfile {
  return {
    account_id: '68257',
    income_cents: 650326,
    fixed_costs_cents: 430672,
    spending_cents: 716084,
    buffer_cents: 643785,
    household_bills_cents: 430672,
    loan_payment_cents: 284493,
    insurance_cents: 0,
    loan_payments_median_cents: 0,
    pension_in_cents: 0,
    gap_cents: 65758,
    runway_state: 'finite',
    runway_deci_months: 98,
    history: {
      first_month: '2024-04',
      last_month: '2025-12',
      row_count: 21,
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
    balance_series: {
      start_month: '2025-01',
      values_cents: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    },
    provenance: {
      source: 'data/tangerine/monthly_summary.csv',
      filter: 'account_id = 68257 ordered by month ascending',
      agg: 'judge metrics; checksum value = money_in_cents',
      check_sum: 'a'.repeat(64),
    },
    ...overrides,
  }
}

describe('roundHalfUp', () => {
  it('rounds ties away from zero in both signs', () => {
    expect(roundHalfUp(5, 2)).toBe(3)
    expect(roundHalfUp(-5, 2)).toBe(-3)
    expect(roundHalfUp(1, 2)).toBe(1)
    expect(roundHalfUp(-1, 2)).toBe(-1)
    expect(roundHalfUp(7, 2)).toBe(4)
    expect(roundHalfUp(-7, 2)).toBe(-4)
  })

  it('keeps exact divisions exact', () => {
    expect(roundHalfUp(4, 2)).toBe(2)
    expect(roundHalfUp(-4, 2)).toBe(-2)
    expect(roundHalfUp(0, 7)).toBe(0)
    expect(roundHalfUp(3862709, 6)).toBe(643785)
    expect(roundHalfUp(-439612, 6)).toBe(-73269)
  })

  it('refuses a non positive denominator', () => {
    expect(() => roundHalfUp(1, 0)).toThrow('denominator must be positive')
    expect(() => roundHalfUp(1, -2)).toThrow('denominator must be positive')
  })
})

describe('scaleCents', () => {
  it('takes an integer percent of a base, half up', () => {
    expect(scaleCents(430672, 15)).toBe(64601)
    expect(scaleCents(650326, 55)).toBe(357679)
    expect(scaleCents(100, 0)).toBe(0)
  })

  it('breaks half cent ties away from zero', () => {
    expect(scaleCents(1, 50)).toBe(1)
    expect(scaleCents(3, 50)).toBe(2)
    expect(scaleCents(-3, 50)).toBe(-2)
  })
})

describe('runway', () => {
  it('reproduces the finite branch of the shipped fixtures', () => {
    expect(runway(643785, 0, 650326, 716084)).toEqual({ state: 'finite', deciMonths: 98 })
    expect(runway(881382, 0, 391520, 427376)).toEqual({ state: 'finite', deciMonths: 246 })
  })

  it('reports no_shortfall when the gap is not positive', () => {
    expect(runway(3229857, 0, 280403, 173780)).toEqual({
      state: 'no_shortfall',
      deciMonths: 1200,
    })
  })

  it('reports buffer_depleted when the buffer is not positive', () => {
    expect(runway(-73269, 0, 1439203, 1593092)).toEqual({
      state: 'buffer_depleted',
      deciMonths: 0,
    })
  })

  it('lets buffer_depleted win over no_shortfall', () => {
    // Buffer already gone and income above spending: the first branch runs.
    expect(runway(-100, 0, 1000, 500)).toEqual({ state: 'buffer_depleted', deciMonths: 0 })
  })

  it('caps the finite branch at 1200 deci months', () => {
    expect(runway(925140, 0, 0, 6293)).toEqual({ state: 'finite', deciMonths: 1200 })
    expect(runway(10_000_000, 0, 1, 6293)).toEqual({ state: 'finite', deciMonths: 1200 })
  })

  it('rounds the deci half tie away from zero', () => {
    // 10 * 3 / 20 = 1.5 months of tenths, so 2 deci months.
    expect(runway(3, 0, 0, 20)).toEqual({ state: 'finite', deciMonths: 2 })
    expect(runway(1, 0, 0, 4)).toEqual({ state: 'finite', deciMonths: 3 })
  })

  it('subtracts one off costs from the buffer only', () => {
    expect(runway(643785, 716084, 357679, 780685)).toEqual({
      state: 'buffer_depleted',
      deciMonths: 0,
    })
  })
})

describe('normalizeTwist', () => {
  it('fills missing fields from the idle twist', () => {
    expect(normalizeTwist({ billsDeltaPct: 15 })).toEqual({
      jobLoss: false,
      incomeFactor: 0.55,
      billsDeltaPct: 15,
      oneOffMonthsTenths: 0,
      extraMonthlyCents: 0,
      durationMonths: 0,
    })
  })

  it('clamps every field to its range', () => {
    const twist = normalizeTwist({
      jobLoss: true,
      incomeFactor: 1.5,
      billsDeltaPct: 250,
      oneOffMonthsTenths: 99,
      extraMonthlyCents: -50,
      durationMonths: 999,
    })
    expect(twist.incomeFactor).toBe(1)
    expect(twist.billsDeltaPct).toBe(100)
    expect(twist.oneOffMonthsTenths).toBe(30)
    expect(twist.extraMonthlyCents).toBe(0)
    expect(twist.durationMonths).toBe(120)
  })

  it('quantizes the income factor to hundredths', () => {
    expect(normalizeTwist({ incomeFactor: 0.5549 }).incomeFactor).toBe(0.55)
    expect(normalizeTwist({ incomeFactor: 0.555 }).incomeFactor).toBe(0.56)
    expect(normalizeTwist({ incomeFactor: -0.2 }).incomeFactor).toBe(0)
    expect(normalizeTwist({ incomeFactor: Number.NaN }).incomeFactor).toBe(0.55)
  })

  it('round trips slider units', () => {
    expect(percentToFactor(55)).toBe(0.55)
    expect(tenthsToMonths(10)).toBe(1)
    expect(monthsToTenths(1.5)).toBe(15)
    expect(monthsToTenths(0.29)).toBe(3)
  })
})

describe('applyTwist', () => {
  it('matches the golden combo example for account 68257', () => {
    const result = applyTwist(makeProfile(), {
      jobLoss: true,
      incomeFactor: 0.55,
      billsDeltaPct: 15,
      durationMonths: 6,
    })
    expect(result.incomeAfterCents).toBe(357679)
    expect(result.spendingAfterCents).toBe(780685)
    expect(result.oneOffCents).toBe(0)
    expect(result.bufferLeftCents).toBe(643785)
    expect(result.gapAfterCents).toBe(423006)
    expect(result.runway).toEqual({ state: 'finite', deciMonths: 15 })
  })

  it('matches the layoff plus one month repair example', () => {
    const result = applyTwist(makeProfile(), {
      jobLoss: true,
      incomeFactor: 0.55,
      oneOffMonthsTenths: 10,
    })
    expect(result.incomeAfterCents).toBe(357679)
    expect(result.oneOffCents).toBe(716084)
    expect(result.bufferLeftCents).toBe(-72299)
    expect(result.runway).toEqual({ state: 'buffer_depleted', deciMonths: 0 })
  })

  it('keeps one off costs out of monthly spending', () => {
    const result = applyTwist(makeProfile(), { oneOffMonthsTenths: 10 })
    expect(result.spendingAfterCents).toBe(716084)
    expect(result.oneOffCents).toBe(716084)
    expect(result.bufferLeftCents).toBe(643785 - 716084)
  })

  it('adds the recurring extra cost to spending', () => {
    const result = applyTwist(makeProfile(), { extraMonthlyCents: 50_000 })
    expect(result.spendingAfterCents).toBe(766084)
    expect(result.oneOffCents).toBe(0)
    expect(result.bufferLeftCents).toBe(643785)
  })

  it('leaves income untouched when the job is kept', () => {
    const result = applyTwist(makeProfile(), { incomeFactor: 0.2 })
    expect(result.incomeAfterCents).toBe(650326)
  })

  it('handles a zero income account', () => {
    const result = applyTwist(makeProfile({ income_cents: 0, gap_cents: 716084 }), {
      jobLoss: true,
      incomeFactor: 0.55,
    })
    expect(result.incomeAfterCents).toBe(0)
    expect(result.gapAfterCents).toBe(716084)
    expect(result.runway.state).toBe('finite')
  })

  it('handles a negative buffer at idle', () => {
    const result = applyTwist(makeProfile({ buffer_cents: -73269 }), IDLE_TWIST)
    expect(result.bufferLeftCents).toBe(-73269)
    expect(result.runway).toEqual({ state: 'buffer_depleted', deciMonths: 0 })
  })

  it('ignores an out of range twist instead of branching on it', () => {
    const result = applyTwist(makeProfile(), { billsDeltaPct: 400, oneOffMonthsTenths: -3 })
    expect(result.spendingAfterCents).toBe(716084 + 430672)
    expect(result.oneOffCents).toBe(0)
  })
})

describe('sameTwist', () => {
  it('compares every field', () => {
    const left = normalizeTwist({ jobLoss: true, incomeFactor: 0.55 })
    const right = normalizeTwist({ jobLoss: true, incomeFactor: 0.55 })
    const bills = normalizeTwist({ jobLoss: true, incomeFactor: 0.55, billsDeltaPct: 1 })
    expect(sameTwist(left, right)).toBe(true)
    expect(sameTwist(left, bills)).toBe(false)
    expect(sameTwist(IDLE_TWIST, normalizeTwist({}))).toBe(true)
  })
})
