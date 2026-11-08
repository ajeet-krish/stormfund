import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AccountProfile } from '../data/profiles'
import { backupPlan, goalMilestones, goalPlan, leverLadder, type LeverInputs } from './planMath'
import { SHOCK_PRESETS, type PresetId } from './shockPresets'
import { applyTwist, type ShockResult, type Twist } from './shocks'

/**
 * Cross language contract for the Phase E4 plan engine: the TypeScript
 * twins must reproduce the frozen hand computation in
 * scripts/engine/golden_plans.json (five fixture accounts under the
 * standard COMBO twist, plus the twist independent goal block). The
 * construction mirrors shocks.golden.test.ts: profiles are rebuilt from
 * golden_fixtures.json, the twist comes from the frozen golden file and
 * is pinned against the shipped combo preset, and every shocked number,
 * ladder step, backup verdict, goal figure, and milestone chip is
 * asserted to the cent. scripts/engine/test_plans.py asserts the same
 * JSON, so a rule change on either side fails here instead of drifting.
 */

interface GoldenMilestone {
  months_of_spending: number
  amount_cents: number
  months_to_reach: number
}

interface GoldenLadderStep {
  id: string
  spending_delta_cents: number
  spending_after_cents: number
  state: 'finite' | 'no_shortfall' | 'buffer_depleted'
  deci_months: number
  plus_deci_months: number
  step_deci_months: number
}

interface GoldenPlan {
  account_id: string
  expected: {
    account_id: string
    shocked: {
      income_cents: number
      spending_cents: number
      one_off_cents: number
      buffer_left_cents: number
      runway_state: 'finite' | 'no_shortfall' | 'buffer_depleted'
      runway_deci_months: number
    }
    ladder: {
      baseline_state: 'finite' | 'no_shortfall' | 'buffer_depleted'
      baseline_deci_months: number
      steps: GoldenLadderStep[]
    }
    backup: {
      cut_floor_cents: number
      survives: boolean
      shortfall_deci_months: number
    }
    goal: {
      target_cents: number
      contribution_cents: number
      months: number
      cut_cents: number
      status: string
      milestones: GoldenMilestone[]
    }
  }
}

interface GoldenPlanFile {
  twist: {
    job_loss: boolean
    income_factor_pct: number
    bills_delta_pct: number
    one_off_months_tenths: number
    extra_monthly_cents: number
    duration_months: number
  }
  plans: GoldenPlan[]
}

interface GoldenFixture {
  account_id: string
  expected: {
    account_id: string
    income_cents: number
    fixed_costs_cents: number
    spending_cents: number
    buffer_cents: number
    household_bills_cents: number
    insurance_cents: number
    loan_payments_median_cents: number
    pension_in_cents: number
    gap_cents: number
    loan_payment_cents: number
    runway_state: 'finite' | 'no_shortfall' | 'buffer_depleted'
    runway_deci_months: number
  }
}

const PLAN_GOLDEN = JSON.parse(
  readFileSync(new URL('../../scripts/engine/golden_plans.json', import.meta.url), 'utf8'),
) as GoldenPlanFile

const FIXTURES = (
  JSON.parse(
    readFileSync(new URL('../../scripts/engine/golden_fixtures.json', import.meta.url), 'utf8'),
  ) as { fixtures: GoldenFixture[] }
).fixtures

function fixtureOf(id: string): GoldenFixture {
  const found = FIXTURES.find((entry) => entry.account_id === id)
  if (!found) {
    throw new Error(`missing golden fixture ${id}`)
  }
  return found
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
    loan_payment_cents: expected.loan_payment_cents,
    insurance_cents: expected.insurance_cents,
    loan_payments_median_cents: expected.loan_payments_median_cents,
    pension_in_cents: expected.pension_in_cents,
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

function goldenTwist(): Twist {
  const twist = PLAN_GOLDEN.twist
  return {
    jobLoss: twist.job_loss,
    incomeFactor: twist.income_factor_pct / 100,
    billsDeltaPct: twist.bills_delta_pct,
    oneOffMonthsTenths: twist.one_off_months_tenths,
    extraMonthlyCents: twist.extra_monthly_cents,
    durationMonths: twist.duration_months,
  }
}

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

function ladderInputs(profile: AccountProfile, result: ShockResult): LeverInputs {
  return {
    shockedIncomeCents: result.incomeAfterCents,
    shockedSpendingCents: result.spendingAfterCents,
    oneOffCents: result.oneOffCents,
    bufferCents: profile.buffer_cents,
    fixedCostsCents: profile.fixed_costs_cents,
    loanPaymentCents: profile.loan_payment_cents,
    insuranceCents: profile.insurance_cents,
    typicalSpendingCents: profile.spending_cents,
  }
}

describe('golden plans: frozen file and twist', () => {
  it('ships the five frozen accounts in fixture order', () => {
    expect(PLAN_GOLDEN.plans.map((entry) => entry.account_id)).toEqual([
      '68257',
      '23838',
      '49900',
      '98952',
      '42988',
    ])
  })

  it('pins the frozen twist to the shipped combo preset', () => {
    const combo = presetTwist('combo')
    const twist = goldenTwist()
    expect(twist.jobLoss).toBe(combo.jobLoss)
    expect(twist.incomeFactor).toBe(combo.incomeFactor)
    expect(twist.billsDeltaPct).toBe(combo.billsDeltaPct)
    expect(twist.oneOffMonthsTenths).toBe(combo.oneOffMonthsTenths)
    expect(twist.extraMonthlyCents).toBe(combo.extraMonthlyCents)
    expect(twist.durationMonths).toBe(combo.durationMonths)
  })
})

describe('golden plans: shocked numbers', () => {
  it('reproduces every shocked income, spending, buffer, and runway', () => {
    const twist = goldenTwist()
    for (const plan of PLAN_GOLDEN.plans) {
      const profile = profileOf(fixtureOf(plan.account_id))
      const result = applyTwist(profile, twist)
      const expected = plan.expected.shocked
      const context = plan.account_id
      expect(result.incomeAfterCents, context).toBe(expected.income_cents)
      expect(result.spendingAfterCents, context).toBe(expected.spending_cents)
      expect(result.oneOffCents, context).toBe(expected.one_off_cents)
      expect(result.bufferLeftCents, context).toBe(expected.buffer_left_cents)
      expect(result.runway, context).toEqual({
        state: expected.runway_state,
        deciMonths: expected.runway_deci_months,
      })
    }
  })
})

describe('golden plans: lever ladder', () => {
  it('reproduces every baseline and step to the tenth of a month', () => {
    const twist = goldenTwist()
    for (const plan of PLAN_GOLDEN.plans) {
      const profile = profileOf(fixtureOf(plan.account_id))
      const result = applyTwist(profile, twist)
      const ladder = leverLadder(ladderInputs(profile, result))
      const expected = plan.expected.ladder
      const context = plan.account_id

      expect(ladder.baseline, context).toEqual({
        state: expected.baseline_state,
        deciMonths: expected.baseline_deci_months,
      })
      expect(ladder.baseline, `${context} baseline equals shocked runway`).toEqual(result.runway)
      expect(ladder.steps, context).toHaveLength(expected.steps.length)

      ladder.steps.forEach((step, index) => {
        const want = expected.steps[index]
        if (!want) {
          throw new Error(`missing golden step ${index} for ${context}`)
        }
        const label = `${context} step ${index}`
        expect(step.lever.id, label).toBe(want.id)
        expect(step.lever.effect.spendingDeltaCents, label).toBe(want.spending_delta_cents)
        expect(step.spendingAfterCents, label).toBe(want.spending_after_cents)
        expect(step.runwayAfter, label).toEqual({
          state: want.state,
          deciMonths: want.deci_months,
        })
        expect(step.plusDeciMonths, label).toBe(want.plus_deci_months)
        expect(step.stepDeciMonths, label).toBe(want.step_deci_months)
        expect(step.incomeAfterCents, label).toBe(result.incomeAfterCents)
        expect(step.bufferLeftCents, label).toBe(result.bufferLeftCents)
      })
    }
  })

  it('never offers the insurance lever on fixtures (insurance is 0)', () => {
    const twist = goldenTwist()
    for (const plan of PLAN_GOLDEN.plans) {
      const profile = profileOf(fixtureOf(plan.account_id))
      expect(profile.insurance_cents, plan.account_id).toBe(0)
      const result = applyTwist(profile, twist)
      const ladder = leverLadder(ladderInputs(profile, result))
      for (const step of ladder.steps) {
        expect(step.lever.id, plan.account_id).not.toBe('shop_insurance')
      }
    }
  })

  it('never trips the defensive spending floor on a golden step', () => {
    // Raw running sums (no max(0, ...) guard) stay non negative on all
    // five fixtures, which is what makes the guard unreachable here.
    const twist = goldenTwist()
    for (const plan of PLAN_GOLDEN.plans) {
      const profile = profileOf(fixtureOf(plan.account_id))
      const result = applyTwist(profile, twist)
      const inputs = ladderInputs(profile, result)
      const ladder = leverLadder(inputs)
      let running = inputs.shockedSpendingCents
      for (const step of ladder.steps) {
        running += step.lever.effect.spendingDeltaCents
        expect(running, plan.account_id).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('golden plans: backup verdicts', () => {
  it('reproduces the floor, the survival flag, and the shortfall', () => {
    const twist = goldenTwist()
    for (const plan of PLAN_GOLDEN.plans) {
      const profile = profileOf(fixtureOf(plan.account_id))
      const result = applyTwist(profile, twist)
      const verdict = backupPlan({
        fixedCostsCents: profile.fixed_costs_cents,
        loanPaymentCents: profile.loan_payment_cents,
        runwayState: result.runway.state,
        runwayDeciMonths: result.runway.deciMonths,
      })
      const expected = plan.expected.backup
      const context = plan.account_id
      expect(verdict.cutFloorCents, context).toBe(expected.cut_floor_cents)
      expect(verdict.survives, context).toBe(expected.survives)
      expect(verdict.shortfallDeciMonths, context).toBe(expected.shortfall_deci_months)
    }
  })
})

describe('golden plans: goal block and milestone chips', () => {
  it('reproduces target, contribution, months, cut, and status', () => {
    for (const plan of PLAN_GOLDEN.plans) {
      const expected = plan.expected.goal
      const profile = profileOf(fixtureOf(plan.account_id))
      const goal = goalPlan(profile.income_cents, profile.spending_cents)
      const context = plan.account_id
      expect(goal.targetCents, context).toBe(expected.target_cents)
      expect(goal.contributionCents, context).toBe(expected.contribution_cents)
      expect(goal.months, context).toBe(expected.months)
      expect(goal.cutCents, context).toBe(expected.cut_cents)
      expect(goal.status, context).toBe(expected.status)
    }
  })

  it('reproduces every milestone chip amount and reach month', () => {
    for (const plan of PLAN_GOLDEN.plans) {
      const expected = plan.expected.goal.milestones
      const profile = profileOf(fixtureOf(plan.account_id))
      const milestones = goalMilestones(profile.income_cents, profile.spending_cents)
      const chips = milestones.map((entry) => ({
        months_of_spending: entry.monthsOfSpending,
        amount_cents: entry.amountCents,
        months_to_reach: entry.monthsToReach,
      }))
      expect(chips, plan.account_id).toEqual(expected)
    }
  })

  it('keeps the 3 month chip tied to goalPlan on every account', () => {
    for (const plan of PLAN_GOLDEN.plans) {
      const profile = profileOf(fixtureOf(plan.account_id))
      const goal = goalPlan(profile.income_cents, profile.spending_cents)
      const chip = goalMilestones(profile.income_cents, profile.spending_cents).find(
        (entry) => entry.isGoal,
      )
      if (!chip) {
        throw new Error(`missing goal chip for ${plan.account_id}`)
      }
      expect(chip.monthsToReach, plan.account_id).toBe(goal.months)
    }
  })
})
