import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AccountProfile } from '../../data/profiles'
import { buildPlanText, type PlanText } from '../../lib/planText'
import { applyTwist, IDLE_TWIST, type Twist } from '../../lib/shocks'
import { verdictBand } from '../../lib/verdict'
import PlanCard from './PlanCard'

/**
 * The plan card renders finished strings only: milestone chips, the
 * lever ladder with its +N gains and caveats, and the five line
 * definition strip. Every assertion below is a string the card prints
 * (or an aria label it ships), so the component itself can never grow
 * money math without failing here.
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

const COMBO: Twist = {
  jobLoss: true,
  incomeFactor: 0.55,
  billsDeltaPct: 15,
  oneOffMonthsTenths: 0,
  extraMonthlyCents: 0,
  durationMonths: 6,
}

function planFor(profile: AccountProfile, twist: Twist): PlanText {
  const result = applyTwist(profile, twist)
  return buildPlanText(profile, result, twist, verdictBand(result.runway))
}

function render(plan: PlanText): string {
  return renderToString(createElement(PlanCard, { plan }))
}

describe('PlanCard', () => {
  const html = render(planFor(makeProfile(), COMBO))

  it('keeps the panel landmarks and headings', () => {
    expect(html).toContain('id="plan-heading"')
    expect(html).toContain('Goal: build the cushion')
    expect(html).toContain('Backup: if the shock lands')
    expect(html).toContain('Backup levers, in order')
    expect(html).toContain('How the plan counts')
  })

  it('renders the four milestone chips with amounts and reach labels', () => {
    expect(html).toContain('aria-label="Cushion milestones"')
    expect(html).toContain('1 month of spending')
    expect(html).toContain('6 months of spending')
    expect(html).toContain('$7,160.84')
    expect(html).toContain('$21,482.52')
    expect(html).toContain('67 months of new savings')
    expect(html).toContain('133 months of new savings')
    expect(html).toContain('cp-plan__chip-goal')
    expect(html).toContain('cp-plan__chip-stretch')
    expect(html).toContain('goal')
    expect(html).toContain('stretch')
  })

  it('renders each lever row with label, caveat, effect, runway, and gain', () => {
    expect(html).toContain('Simulated counterfactuals, applied one after another')
    expect(html).toContain('Trim discretionary')
    expect(html).toContain(
      'simulated counterfactual: all discretionary spending above the fixed cost floor trimmed',
    )
    expect(html).toContain('Defer loan')
    expect(html).toContain(
      'simulated counterfactual: hardship deferral, the payment resumes later and interest cost is not modeled',
    )
    expect(html).toContain('-$9.19')
    expect(html).toContain('-$2,844.93')
    expect(html).toContain('1.5 months')
    expect(html).toContain('4.7 months')
    expect(html).toContain('+0.0 months')
    expect(html).toContain('+3.2 months')
  })

  it('renders the five definition lines', () => {
    expect(html).toContain(
      'Starter cushion: 3 times typical spending, $21,482.52.',
    )
    expect(html).toContain(
      'Monthly contribution: the larger of income minus spending and 5 percent of income, $325.16.',
    )
    expect(html).toContain(
      'Months to the target count new contributions from zero. Savings on hand: $6,437.85 (0.9 months of spending), not counted in the months above.',
    )
    expect(html).toContain('Backup horizon: 6 months, matching the EI twist duration.')
    expect(html).toContain(
      'The cut floor is fixed costs plus loan payment, $7,151.65; the labeled levers may go under it on purpose.',
    )
  })

  it('explains an empty ladder instead of rendering an empty table', () => {
    const empty = render(
      planFor(
        makeProfile({
          fixed_costs_cents: 800_000,
          loan_payment_cents: 0,
          insurance_cents: 0,
        }),
        IDLE_TWIST,
      ),
    )
    expect(empty).not.toContain('<table')
    expect(empty).toContain(
      'No lever applies to this account: no insurance premium, no loan payment, and no spending above the fixed cost floor to move.',
    )
  })

  it('ships the goal and backup sentences alongside the new fields', () => {
    expect(html).toContain('A monthly cut of $982.74 for 67 months makes the cushion reachable.')
    expect(html).toContain(
      'Baseline steady state: 9.8 months. Shocked steady state: 1.5 months (Storm warning).',
    )
  })
})
