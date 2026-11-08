import { describe, expect, it } from 'vitest'
import type { AccountProfile } from '../data/profiles'
import { applyTwist, IDLE_TWIST, type Twist } from './shocks'
import { buildPlanText, formatMonthsToReach } from './planText'
import { verdictBand } from './verdict'

/**
 * Exact plan sentences for the shipped fixture numbers, plus the content
 * rule: no em dash, en dash, minus sign, double hyphen, or spaced hyphen
 * may ever appear in a line the console prints (docs/architecture.md).
 *
 * APPROVED STRING CHURN, Phase E4 (the phase brief calls this out so a
 * reviewer does not read it as breakage): the old deficit goal line
 * ("A monthly deficit means the cushion goal waits for income or
 * spending to move.") is replaced by the cut story from goalPlan, and
 * three new PlanText fields appear (goalChips, levers, definitions).
 * The surplus goal line and both backup lines keep their E2 wording.
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
  it('spells out the cut story and the baseline plan for account 68257', () => {
    const plan = planFor(makeProfile(), IDLE_TWIST)
    expect(plan.goal).toEqual([
      'Starter cushion: $21,482.52 (3 months of typical spending).',
      'Monthly deficit: $657.58 (spending exceeds income).',
      'A monthly cut of $982.74 for 67 months makes the cushion reachable.',
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

  it('prints the needs income story when no contribution exists', () => {
    const plan = planFor(
      makeProfile({
        income_cents: 0,
        gap_cents: 6293,
        runway_state: 'finite',
        runway_deci_months: 1200,
      }),
      IDLE_TWIST,
    )
    expect(plan.goal[2]).toBe('The cushion goal needs income before months can be counted.')
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
})

describe('buildPlanText: milestone chips', () => {
  it('builds the four chips for account 68257 with goal and stretch roles', () => {
    const plan = planFor(makeProfile(), IDLE_TWIST)
    expect(plan.goalChips).toEqual([
      {
        label: '1 month of spending',
        amountCents: 716_084,
        monthsToReach: 23,
        highlight: 'plain',
      },
      {
        label: '2 months of spending',
        amountCents: 1_432_168,
        monthsToReach: 45,
        highlight: 'plain',
      },
      {
        label: '3 months of spending',
        amountCents: 2_148_252,
        monthsToReach: 67,
        highlight: 'goal',
      },
      {
        label: '6 months of spending',
        amountCents: 4_296_504,
        monthsToReach: 133,
        highlight: 'stretch',
      },
    ])
  })

  it('reports the reach sentinel as the goal plan story', () => {
    const plan = planFor(
      makeProfile({
        income_cents: 0,
        gap_cents: 6293,
        runway_state: 'finite',
        runway_deci_months: 1200,
      }),
      IDLE_TWIST,
    )
    expect(plan.goalChips.map((chip) => chip.monthsToReach)).toEqual([-1, -1, -1, -1])
    expect(plan.goalChips.map((chip) => formatMonthsToReach(chip.monthsToReach))).toEqual([
      'needs income',
      'needs income',
      'needs income',
      'needs income',
    ])
  })

  it('formats singular and plural reach months', () => {
    expect(formatMonthsToReach(1)).toBe('1 month of new savings')
    expect(formatMonthsToReach(23)).toBe('23 months of new savings')
    expect(formatMonthsToReach(0)).toBe('0 months of new savings')
    expect(formatMonthsToReach(-1)).toBe('needs income')
  })
})

describe('buildPlanText: lever rows', () => {
  it('lists the trim and defer rows under the combo twist for 68257', () => {
    const plan = planFor(makeProfile(), COMBO)
    expect(plan.levers).toHaveLength(2)

    const [trim, defer] = plan.levers
    expect(trim?.id).toBe('trim_discretionary')
    expect(trim?.label).toBe('Trim discretionary')
    expect(trim?.caveat).toBe(
      'simulated counterfactual: all discretionary spending above the fixed cost floor trimmed',
    )
    expect(trim?.effectCents).toBe(-919)
    expect(trim?.runwayAfter).toBe('1.5 months')
    expect(trim?.plusLabel).toBe('+0.0 months')
    expect(trim?.plusDeciMonths).toBe(0)
    expect(trim?.stepDeciMonths).toBe(0)

    expect(defer?.id).toBe('defer_loan')
    expect(defer?.label).toBe('Defer loan')
    expect(defer?.caveat).toBe(
      'simulated counterfactual: hardship deferral, the payment resumes later and interest cost is not modeled',
    )
    expect(defer?.effectCents).toBe(-284_493)
    expect(defer?.runwayAfter).toBe('4.7 months')
    expect(defer?.plusLabel).toBe('+3.2 months')
    expect(defer?.plusDeciMonths).toBe(32)
    expect(defer?.stepDeciMonths).toBe(32)
  })

  it('reads the cap crossing gain as clearing the shortfall for 98952', () => {
    const profile = makeProfile({
      account_id: '98952',
      income_cents: 391_520,
      fixed_costs_cents: 124_407,
      spending_cents: 427_376,
      buffer_cents: 881_382,
      household_bills_cents: 124_407,
      loan_payment_cents: 0,
      gap_cents: 35_856,
      runway_state: 'finite',
      runway_deci_months: 246,
    })
    const plan = planFor(profile, COMBO)
    expect(plan.levers).toHaveLength(1)
    const trim = plan.levers[0]
    expect(trim?.runwayAfter).toBe('120+ months')
    expect(trim?.plusLabel).toBe('clears the shortfall (120+ months)')
    expect(trim?.plusDeciMonths).toBe(1162)
  })

  it('reads every gain as depleted when the buffer starts negative', () => {
    const plan = planFor(makeProfile({ buffer_cents: -73_269 }), COMBO)
    expect(plan.levers.length).toBeGreaterThan(0)
    for (const row of plan.levers) {
      expect(row.plusLabel).toBe('+0.0 months (buffer depleted: restore a positive balance first)')
      expect(row.runwayAfter).toBe('0.0 months')
      expect(row.plusDeciMonths).toBe(0)
      expect(row.stepDeciMonths).toBe(0)
    }
  })

  it('offers no lever row when nothing is available to move', () => {
    const plan = planFor(
      makeProfile({
        fixed_costs_cents: 800_000,
        loan_payment_cents: 0,
        insurance_cents: 0,
      }),
      IDLE_TWIST,
    )
    expect(plan.levers).toEqual([])
  })
})

describe('buildPlanText: definition strip', () => {
  it('prints the five definition lines for account 68257', () => {
    const plan = planFor(makeProfile(), COMBO)
    expect(plan.definitions).toHaveLength(5)
    expect(plan.definitions).toEqual([
      'Starter cushion: 3 times typical spending, $21,482.52.',
      'Monthly contribution: the larger of income minus spending and 5 percent of income, $325.16.',
      'Months to the target count new contributions from zero. Savings on hand: $6,437.85 (0.9 months of spending), not counted in the months above.',
      'Backup horizon: 6 months, matching the EI twist duration.',
      'The cut floor is fixed costs plus loan payment, $7,151.65; the labeled levers may go under it on purpose.',
    ])
  })

  it('clamps the savings on hand months at zero for a negative buffer', () => {
    const plan = planFor(makeProfile({ buffer_cents: -73_269 }), IDLE_TWIST)
    expect(plan.definitions[2]).toBe(
      'Months to the target count new contributions from zero. Savings on hand: -$732.69 (0.0 months of spending), not counted in the months above.',
    )
  })
})

describe('buildPlanText: content rule over every new field', () => {
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
      planFor(
        makeProfile({
          income_cents: 0,
          gap_cents: 6293,
          runway_state: 'finite',
          runway_deci_months: 1200,
        }),
        COMBO,
      ),
    ]
    const violations: string[] = []
    for (const plan of plans) {
      const reachLabels = plan.goalChips.map((chip) => formatMonthsToReach(chip.monthsToReach))
      const strings = [
        ...plan.goal,
        ...plan.backup,
        ...plan.definitions,
        ...plan.goalChips.map((chip) => chip.label),
        ...reachLabels,
        ...plan.levers.flatMap((row) => [
          row.label,
          row.caveat,
          row.runwayAfter,
          row.plusLabel,
        ]),
      ]
      for (const line of strings) {
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
