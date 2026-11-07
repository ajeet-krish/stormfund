import { describe, expect, it } from 'vitest'
import type { AccountProfile } from '../data/profiles'
import { applyTwist, IDLE_TWIST, type Twist } from './shocks'
import { buildPlanText } from './planText'
import { verdictBand } from './verdict'

/**
 * Exact plan sentences for the shipped fixture numbers, plus the content
 * rule: no em dash, en dash, minus sign, double hyphen, or spaced hyphen
 * may ever appear in a line the console prints (docs/architecture.md).
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

function planFor(profile: AccountProfile, twist: Twist) {
  const result = applyTwist(profile, twist)
  const band = verdictBand(result.runway)
  return buildPlanText(profile, result, twist, band)
}

const COMBO: Twist = {
  jobLoss: true,
  incomeFactor: 0.55,
  billsDeltaPct: 15,
  oneOffMonthsTenths: 0,
  extraMonthlyCents: 0,
  durationMonths: 6,
}

describe('buildPlanText', () => {
  it('spells out the deficit goal and the baseline plan for account 68257', () => {
    const plan = planFor(makeProfile(), IDLE_TWIST)
    expect(plan.goal).toEqual([
      'Starter cushion: $21,482.52 (3 months of typical spending).',
      'Monthly deficit: $657.58 (spending exceeds income).',
      'A monthly deficit means the cushion goal waits for income or spending to move.',
    ])
    expect(plan.backup).toEqual([
      'Baseline steady state: 9.8 months. Shocked steady state: 9.8 months (Fair skies).',
      'Monthly shortfall after the shock: $657.58.',
    ])
  })

  it('spells out the surplus goal with the months to the cushion', () => {
    const plan = planFor(
      makeProfile({
        income_cents: 800_000,
        spending_cents: 500_000,
        gap_cents: -300_000,
        runway_state: 'no_shortfall',
        runway_deci_months: 1200,
      }),
      IDLE_TWIST,
    )
    expect(plan.goal).toEqual([
      'Starter cushion: $15,000.00 (3 months of typical spending).',
      'Monthly surplus: $3,000.00 (income minus spending).',
      'Setting aside $3,000.00 a month builds the cushion in about 5 months.',
    ])
    expect(plan.backup).toEqual([
      'Baseline steady state: 120+ months. Shocked steady state: 120+ months (Clear).',
      'No monthly shortfall after the shock.',
    ])
  })

  it('judges the shocked runway against the preset horizon', () => {
    const plan = planFor(makeProfile(), COMBO)
    expect(plan.backup).toEqual([
      'Baseline steady state: 9.8 months. Shocked steady state: 1.5 months (Storm warning).',
      'Monthly shortfall after the shock: $4,230.06.',
      'The shocked runway runs out before the 6 month horizon ends.',
    ])
  })

  it('says when the shocked runway covers the horizon', () => {
    const plan = planFor(
      makeProfile({
        income_cents: 800_000,
        spending_cents: 500_000,
        buffer_cents: 3_000_000,
        gap_cents: -300_000,
        runway_state: 'no_shortfall',
        runway_deci_months: 1200,
      }),
      COMBO,
    )
    expect(plan.backup[2]).toBe('The shocked runway covers the 6 month horizon.')
  })

  it('omits the horizon line when no duration is set', () => {
    const plan = planFor(makeProfile(), IDLE_TWIST)
    expect(plan.backup).toHaveLength(2)
  })

  it('keeps every line free of dashes', () => {
    const emDash = String.fromCharCode(0x2014)
    const enDash = String.fromCharCode(0x2013)
    const minusSign = String.fromCharCode(0x2212)
    const doubleHyphen = '-'.repeat(2)
    const spacedHyphen = [' ', '-', ' '].join('')

    const plans = [
      planFor(makeProfile(), IDLE_TWIST),
      planFor(makeProfile(), COMBO),
      planFor(makeProfile({ buffer_cents: -73269 }), IDLE_TWIST),
    ]
    const violations: string[] = []
    for (const plan of plans) {
      for (const line of [...plan.goal, ...plan.backup]) {
        for (const character of [emDash, enDash, minusSign]) {
          if (line.includes(character)) {
            violations.push(`dash code point in ${JSON.stringify(line)}`)
          }
        }
        if (line.includes(doubleHyphen)) {
          violations.push(`double hyphen in ${JSON.stringify(line)}`)
        }
        if (line.includes(spacedHyphen)) {
          violations.push(`spaced hyphen in ${JSON.stringify(line)}`)
        }
      }
    }
    expect(violations).toEqual([])
  })
})
