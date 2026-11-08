import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runway, scaleCents } from './shocks'
import {
  BACKUP_HORIZON_MONTHS,
  CUT_NOT_APPLICABLE,
  GOAL_CONTRIBUTION_FLOOR_PCT,
  GOAL_MILESTONE_MONTHS,
  GOAL_STRETCH_MONTHS,
  GOAL_TARGET_MONTHS,
  MONTHS_UNREACHABLE,
  backupPlan,
  goalMilestones,
  goalPlan,
  leverLadder,
  type LeverInputs,
  type LeverLadder,
} from './planMath'

/**
 * Hand computed goldens for the E4 plan engine, one surplus account,
 * one deficit account, and one account with no income, plus the backup
 * verdict boundaries at exactly the 6 month horizon. Every expectation
 * below is arithmetic done by hand in integer cents, so a change in the
 * formulas fails here before a judge ever sees the card.
 */

// ============================================================
// Fixture account A, the surplus saver.
//   I = 400000 ($4,000.00), S = 250000 ($2,500.00)
//   target      = 3 x 250000 = 750000
//   floor       = 5 percent of 400000 = 20000
//   contribution= max(400000 minus 250000, 20000) = max(150000, 20000) = 150000
//   months      = ceil(750000 / 150000) = 5 exactly
//   I > S, so cut = 0 and the status is on track.
// ============================================================
const ACCOUNT_A = { income: 400_000, spending: 250_000 }

// ============================================================
// Fixture account B, the monthly deficit.
//   I = 300000 ($3,000.00), S = 320000 ($3,200.00)
//   target      = 3 x 320000 = 960000
//   floor       = 5 percent of 300000 = 15000
//   contribution= max(300000 minus 320000, 15000) = max(-20000, 15000) = 15000
//   months      = ceil(960000 / 15000) = 64 exactly
//   I <= S, so cut = 320000 minus 300000 plus 15000 = 35000 (cut needed).
// ============================================================
const ACCOUNT_B = { income: 300_000, spending: 320_000 }

// ============================================================
// Fixture account C, no income at all (the zero_income edge flag).
//   I = 0, S = 200000
//   target      = 3 x 200000 = 600000
//   floor       = 5 percent of 0 = 0
//   contribution= max(0 minus 200000, 0) = 0, so the goal needs income:
//   months      = MONTHS_UNREACHABLE, cut = CUT_NOT_APPLICABLE.
// ============================================================
const ACCOUNT_C = { income: 0, spending: 200_000 }

describe('goalPlan: three fixture accounts', () => {
  it('account A, surplus saver, reaches the cushion in 5 months', () => {
    const plan = goalPlan(ACCOUNT_A.income, ACCOUNT_A.spending)
    expect(plan.targetCents).toBe(750_000)
    expect(plan.contributionCents).toBe(150_000)
    expect(plan.months).toBe(5)
    expect(plan.cutCents).toBe(0)
    expect(plan.status).toBe('on track')
  })

  it('account B, monthly deficit, needs a 35000 cent cut for 64 months', () => {
    const plan = goalPlan(ACCOUNT_B.income, ACCOUNT_B.spending)
    expect(plan.targetCents).toBe(960_000)
    expect(plan.contributionCents).toBe(15_000)
    expect(plan.months).toBe(64)
    expect(plan.cutCents).toBe(35_000)
    expect(plan.status).toBe('cut needed')
  })

  it('account C, no income, reports the goal as needing income', () => {
    const plan = goalPlan(ACCOUNT_C.income, ACCOUNT_C.spending)
    expect(plan.targetCents).toBe(600_000)
    expect(plan.contributionCents).toBe(0)
    expect(plan.months).toBe(MONTHS_UNREACHABLE)
    expect(plan.cutCents).toBe(CUT_NOT_APPLICABLE)
    expect(plan.status).toBe('needs income')
    expect(plan.months).toBe(-1)
    expect(plan.cutCents).toBe(-1)
  })
})

describe('goalPlan: boundaries and sentinels', () => {
  it('uses ceil division that lands exactly on a whole month', () => {
    // I = 400000, S = 100000: target 300000, contribution
    // max(300000, 20000) = 300000, so 300000 / 300000 is 1 month, not 2.
    const plan = goalPlan(400_000, 100_000)
    expect(plan.contributionCents).toBe(300_000)
    expect(plan.months).toBe(1)
    expect(plan.status).toBe('on track')
  })

  it('rounds the 5 percent floor half up on a tie', () => {
    // 5 percent of 10 cents is 0.5 cents, which rounds away from zero
    // to 1 cent (ROUND_HALF_UP), so the floor still contributes.
    const plan = goalPlan(10, 20)
    expect(plan.contributionCents).toBe(1)
    expect(plan.months).toBe(60)
    expect(plan.cutCents).toBe(11)
    expect(plan.status).toBe('cut needed')
  })

  it('treats income equal to spending as a cut, not as on track', () => {
    // I = S = 300000: surplus 0, floor 15000, so contribution is the
    // floor and the exact cut equals the contribution itself.
    const plan = goalPlan(300_000, 300_000)
    expect(plan.contributionCents).toBe(15_000)
    expect(plan.cutCents).toBe(15_000)
    expect(plan.status).toBe('cut needed')
  })

  it('reads non finite cents as 0 instead of NaN branches', () => {
    const plan = goalPlan(Number.NaN, 200_000)
    expect(plan.contributionCents).toBe(0)
    expect(plan.status).toBe('needs income')
    expect(Number.isFinite(plan.months)).toBe(true)
  })

  it('exports the documented constants', () => {
    expect(GOAL_TARGET_MONTHS).toBe(3)
    expect(GOAL_CONTRIBUTION_FLOOR_PCT).toBe(5)
    expect(BACKUP_HORIZON_MONTHS).toBe(6)
    expect(MONTHS_UNREACHABLE).toBe(-1)
    expect(CUT_NOT_APPLICABLE).toBe(-1)
  })
})

describe('backupPlan: runway against the 6 month horizon', () => {
  const F = 150_000
  const P = 50_000

  it('account A under the EI twist falls 1.5 months short of the horizon', () => {
    // Shocked runway 45 tenths (4.5 months), horizon 60 tenths:
    // cut floor = F + P = 200000, shortfall = 60 minus 45 = 15 tenths.
    const plan = backupPlan({
      fixedCostsCents: F,
      loanPaymentCents: P,
      runwayState: 'finite',
      runwayDeciMonths: 45,
    })
    expect(plan.cutFloorCents).toBe(200_000)
    expect(plan.horizonDeciMonths).toBe(60)
    expect(plan.survives).toBe(false)
    expect(plan.shortfallDeciMonths).toBe(15)
  })

  it('no shortfall always survives with no shortfall', () => {
    const plan = backupPlan({
      fixedCostsCents: F,
      loanPaymentCents: P,
      runwayState: 'no_shortfall',
      runwayDeciMonths: 1200,
    })
    expect(plan.survives).toBe(true)
    expect(plan.shortfallDeciMonths).toBe(0)
  })

  it('a depleted buffer is always a full horizon short', () => {
    const plan = backupPlan({
      fixedCostsCents: F,
      loanPaymentCents: P,
      runwayState: 'buffer_depleted',
      runwayDeciMonths: 0,
    })
    expect(plan.survives).toBe(false)
    expect(plan.shortfallDeciMonths).toBe(60)
    expect(plan.cutFloorCents).toBe(200_000)
  })

  it('treats exactly the horizon as surviving, one tenth under as short', () => {
    const atHorizon = backupPlan({
      fixedCostsCents: F,
      loanPaymentCents: P,
      runwayState: 'finite',
      runwayDeciMonths: 60,
    })
    expect(atHorizon.survives).toBe(true)
    expect(atHorizon.shortfallDeciMonths).toBe(0)

    const justUnder = backupPlan({
      fixedCostsCents: F,
      loanPaymentCents: P,
      runwayState: 'finite',
      runwayDeciMonths: 59,
    })
    expect(justUnder.survives).toBe(false)
    expect(justUnder.shortfallDeciMonths).toBe(1)
  })

  it('names the cut floor as F plus P, with no loan reading F alone', () => {
    const withLoan = backupPlan({
      fixedCostsCents: 120_000,
      loanPaymentCents: 30_000,
      runwayState: 'finite',
      runwayDeciMonths: 90,
    })
    expect(withLoan.cutFloorCents).toBe(150_000)

    const noLoan = backupPlan({
      fixedCostsCents: 120_000,
      loanPaymentCents: 0,
      runwayState: 'finite',
      runwayDeciMonths: 90,
    })
    expect(noLoan.cutFloorCents).toBe(120_000)
    expect(noLoan.survives).toBe(true)
  })

  it('accepts a caller horizon and falls back for invalid input', () => {
    const threeMonths = backupPlan({
      fixedCostsCents: F,
      loanPaymentCents: 0,
      runwayState: 'finite',
      runwayDeciMonths: 30,
      horizonMonths: 3,
    })
    expect(threeMonths.horizonDeciMonths).toBe(30)
    expect(threeMonths.survives).toBe(true)

    const badHorizon = backupPlan({
      fixedCostsCents: F,
      loanPaymentCents: 0,
      runwayState: 'finite',
      runwayDeciMonths: 45,
      horizonMonths: Number.NaN,
    })
    expect(badHorizon.horizonDeciMonths).toBe(60)
    expect(badHorizon.survives).toBe(false)

    const badDeci = backupPlan({
      fixedCostsCents: F,
      loanPaymentCents: 0,
      runwayState: 'finite',
      runwayDeciMonths: Number.POSITIVE_INFINITY,
    })
    expect(badDeci.survives).toBe(false)
    expect(badDeci.shortfallDeciMonths).toBe(60)
  })
})

// ============================================================
// E4 golden inputs shared by the unit suites below. The five frozen
// accounts come from scripts/engine/golden_fixtures.json; their shocked
// numbers are the standard COMBO twist (job loss at 55 percent, bills
// plus 15 percent, no one off cost) derived here with the same integer
// helpers applyTwist uses.
// ============================================================
interface GoldenFixture {
  account_id: string
  expected: {
    income_cents: number
    fixed_costs_cents: number
    spending_cents: number
    buffer_cents: number
    household_bills_cents: number
    insurance_cents: number
    loan_payment_cents: number
  }
}

const FIXTURES = (
  JSON.parse(
    readFileSync(new URL('../../scripts/engine/golden_fixtures.json', import.meta.url), 'utf8'),
  ) as { fixtures: GoldenFixture[] }
).fixtures

function comboLadderInput(fixture: GoldenFixture): LeverInputs {
  const expected = fixture.expected
  return {
    shockedIncomeCents: scaleCents(expected.income_cents, 55),
    shockedSpendingCents:
      expected.spending_cents + scaleCents(expected.household_bills_cents, 15),
    oneOffCents: 0,
    bufferCents: expected.buffer_cents,
    fixedCostsCents: expected.fixed_costs_cents,
    loanPaymentCents: expected.loan_payment_cents,
    insuranceCents: expected.insurance_cents,
    typicalSpendingCents: expected.spending_cents,
  }
}

/** One ladder step by position, failing loudly when the index is missing. */
function stepAt(ladder: LeverLadder, index: number) {
  const step = ladder.steps[index]
  if (!step) {
    throw new Error(`missing lever step ${index}`)
  }
  return step
}

describe('goalMilestones: unit goldens', () => {
  it('reaches account A milestones at 2, 4, 5, and 10 new savings months', () => {
    // Contribution is 150000 (goalPlan account A above), so each chip
    // is ceil(months x 250000 / 150000): 2, 4, 5, and 10 exactly.
    const milestones = goalMilestones(ACCOUNT_A.income, ACCOUNT_A.spending)
    expect(milestones).toEqual([
      { monthsOfSpending: 1, amountCents: 250_000, monthsToReach: 2, isGoal: false, isStretch: false },
      { monthsOfSpending: 2, amountCents: 500_000, monthsToReach: 4, isGoal: false, isStretch: false },
      { monthsOfSpending: 3, amountCents: 750_000, monthsToReach: 5, isGoal: true, isStretch: false },
      { monthsOfSpending: 6, amountCents: 1_500_000, monthsToReach: 10, isGoal: false, isStretch: true },
    ])
  })

  it('keeps amounts but reports MONTHS_UNREACHABLE with no income', () => {
    const milestones = goalMilestones(ACCOUNT_C.income, ACCOUNT_C.spending)
    expect(milestones.map((entry) => entry.amountCents)).toEqual([
      200_000, 400_000, 600_000, 1_200_000,
    ])
    expect(milestones.map((entry) => entry.monthsToReach)).toEqual([-1, -1, -1, -1])
  })

  it('ties the 3 month chip to goalPlan on every fixture account', () => {
    for (const account of [ACCOUNT_A, ACCOUNT_B, ACCOUNT_C]) {
      const goal = goalPlan(account.income, account.spending)
      const chip = goalMilestones(account.income, account.spending).find(
        (entry) => entry.isGoal,
      )
      if (!chip) {
        throw new Error('missing goal milestone')
      }
      expect(chip.monthsOfSpending).toBe(GOAL_TARGET_MONTHS)
      expect(chip.monthsToReach).toBe(goal.months)
    }
  })

  it('exports the documented milestone constants', () => {
    expect(GOAL_STRETCH_MONTHS).toBe(6)
    expect(GOAL_MILESTONE_MONTHS).toEqual([1, 2, 3, 6])
    expect(GOAL_TARGET_MONTHS).toBe(3)
  })
})

describe('leverLadder: synthetic golden, all three levers in order', () => {
  // Hand computation: B 2000000, one off 0, income 300000, spending
  // 400000, F 200000, P 50000, insurance 30000, S 400000.
  // baseline   = runway(2000000, 0, 300000, 400000): gap 100000,
  //              floor((40000000 + 100000) / 200000) = 200, finite 200.
  // step 1     = shop insurance 30000: spending 370000, gap 70000,
  //              floor((40000000 + 70000) / 140000) = 286, plus 86.
  // step 2     = trim max(0, 400000 minus 250000) = 150000: spending
  //              220000, gap negative, no_shortfall 1200, plus 1000,
  //              step 1200 minus 286 = 914.
  // step 3     = defer 50000: spending 170000, still no_shortfall 1200,
  //              plus 1000, step 0 (the marginal gain is 0).
  const INPUT: LeverInputs = {
    shockedIncomeCents: 300_000,
    shockedSpendingCents: 400_000,
    oneOffCents: 0,
    bufferCents: 2_000_000,
    fixedCostsCents: 200_000,
    loanPaymentCents: 50_000,
    insuranceCents: 30_000,
    typicalSpendingCents: 400_000,
  }

  it('matches every hand computed step', () => {
    const ladder = leverLadder(INPUT)
    expect(ladder.baseline).toEqual({ state: 'finite', deciMonths: 200 })
    expect(ladder.steps).toHaveLength(3)

    const insurance = stepAt(ladder, 0)
    const trim = stepAt(ladder, 1)
    const defer = stepAt(ladder, 2)
    expect(insurance.lever.id).toBe('shop_insurance')
    expect(insurance.lever.effect).toEqual({
      incomeDeltaCents: 0,
      spendingDeltaCents: -30_000,
      bufferDeltaCents: 0,
    })
    expect(insurance.incomeAfterCents).toBe(300_000)
    expect(insurance.spendingAfterCents).toBe(370_000)
    expect(insurance.bufferLeftCents).toBe(2_000_000)
    expect(insurance.runwayAfter).toEqual({ state: 'finite', deciMonths: 286 })
    expect(insurance.plusDeciMonths).toBe(86)
    expect(insurance.stepDeciMonths).toBe(86)

    expect(trim.lever.id).toBe('trim_discretionary')
    expect(trim.lever.effect.spendingDeltaCents).toBe(-150_000)
    expect(trim.spendingAfterCents).toBe(220_000)
    expect(trim.runwayAfter).toEqual({ state: 'no_shortfall', deciMonths: 1200 })
    expect(trim.plusDeciMonths).toBe(1000)
    expect(trim.stepDeciMonths).toBe(914)

    expect(defer.lever.id).toBe('defer_loan')
    expect(defer.lever.effect.spendingDeltaCents).toBe(-50_000)
    expect(defer.spendingAfterCents).toBe(170_000)
    expect(defer.runwayAfter).toEqual({ state: 'no_shortfall', deciMonths: 1200 })
    expect(defer.plusDeciMonths).toBe(1000)
    expect(defer.stepDeciMonths).toBe(0)
  })

  it('ships the exact labels and caveats the card prints', () => {
    const ladder = leverLadder(INPUT)
    expect(ladder.steps.map((step) => step.lever.label)).toEqual([
      'Shop insurance',
      'Trim discretionary',
      'Defer loan',
    ])
    expect(ladder.steps.map((step) => step.lever.caveat)).toEqual([
      'simulated counterfactual: premiums re-shopped, upper bound of renegotiation',
      'simulated counterfactual: all discretionary spending above the fixed cost floor trimmed',
      'simulated counterfactual: hardship deferral, the payment resumes later and interest cost is not modeled',
    ])
  })
})

describe('leverLadder: availability, clamps, and edge states', () => {
  const BASE: LeverInputs = {
    shockedIncomeCents: 300_000,
    shockedSpendingCents: 400_000,
    oneOffCents: 0,
    bufferCents: 2_000_000,
    fixedCostsCents: 200_000,
    loanPaymentCents: 0,
    insuranceCents: 0,
    typicalSpendingCents: 200_000,
  }

  it('drops the trim lever when S sits under the F plus P floor', () => {
    // S 200000 under F 200000 plus P 50000 means no discretionary room:
    // the disc clamp reads 0 and the trim lever never appears.
    const ladder = leverLadder({ ...BASE, loanPaymentCents: 50_000 })
    expect(ladder.steps.map((step) => step.lever.id)).toEqual(['defer_loan'])
  })

  it('keeps every step depleted with a zero gain on a negative buffer', () => {
    const ladder = leverLadder({
      ...BASE,
      shockedSpendingCents: 400_000,
      bufferCents: -73_269,
      insuranceCents: 30_000,
      typicalSpendingCents: 400_000,
      loanPaymentCents: 50_000,
    })
    expect(ladder.baseline).toEqual({ state: 'buffer_depleted', deciMonths: 0 })
    expect(ladder.steps).toHaveLength(3)
    for (const step of ladder.steps) {
      expect(step.runwayAfter).toEqual({ state: 'buffer_depleted', deciMonths: 0 })
      expect(step.plusDeciMonths).toBe(0)
      expect(step.stepDeciMonths).toBe(0)
      expect(step.bufferLeftCents).toBeLessThan(0)
    }
    expect(stepAt(ladder, 2).spendingAfterCents).toBe(400_000 - 30_000 - 150_000 - 50_000)
  })

  it('runs the availability matrix in ladder order', () => {
    const matrix: Array<{ name: string; input: Partial<LeverInputs>; ids: string[] }> = [
      { name: 'nothing available', input: {}, ids: [] },
      { name: 'insurance only', input: { insuranceCents: 30_000 }, ids: ['shop_insurance'] },
      {
        name: 'discretionary only',
        input: { typicalSpendingCents: 400_000 },
        ids: ['trim_discretionary'],
      },
      {
        name: 'loan only, floor eats the disc',
        input: { loanPaymentCents: 50_000 },
        ids: ['defer_loan'],
      },
      {
        name: 'all three, free moves first',
        input: { insuranceCents: 30_000, typicalSpendingCents: 400_000, loanPaymentCents: 50_000 },
        ids: ['shop_insurance', 'trim_discretionary', 'defer_loan'],
      },
    ]
    for (const row of matrix) {
      const ladder = leverLadder({ ...BASE, ...row.input })
      expect(
        ladder.steps.map((step) => step.lever.id),
        row.name,
      ).toEqual(row.ids)
    }
  })
})

describe('E4 invariants: monotonic gains, cumulative composition, integers', () => {
  function everyLadder(): Array<{ name: string; input: LeverInputs; ladder: LeverLadder }> {
    const rows: Array<{ name: string; input: LeverInputs; ladder: LeverLadder }> = []
    for (const fixture of FIXTURES) {
      const input = comboLadderInput(fixture)
      rows.push({ name: fixture.account_id, input, ladder: leverLadder(input) })
    }

    const incomes = [0, 1, 999, 100_000, 300_000]
    const spendings = [0, 500, 999, 400_000]
    const buffers = [-100, 0, 1, 5_000, 2_000_000]
    const fixeds = [0, 50_000, 200_000]
    const loans = [0, 50_000]
    const insurances = [0, 30_000]
    const typicals = [0, 250_000, 400_000]
    const oneOffs = [0, 1_000]
    for (const income of incomes) {
      for (const spending of spendings) {
        for (const buffer of buffers) {
          for (const fixed of fixeds) {
            for (const loan of loans) {
              for (const insurance of insurances) {
                for (const typical of typicals) {
                  for (const oneOff of oneOffs) {
                    const input: LeverInputs = {
                      shockedIncomeCents: income,
                      shockedSpendingCents: spending,
                      oneOffCents: oneOff,
                      bufferCents: buffer,
                      fixedCostsCents: fixed,
                      loanPaymentCents: loan,
                      insuranceCents: insurance,
                      typicalSpendingCents: typical,
                    }
                    rows.push({ name: 'grid', input, ladder: leverLadder(input) })
                  }
                }
              }
            }
          }
        }
      }
    }
    return rows
  }

  const LADDERS = everyLadder()

  it('covers the fixtures and a wide integer grid', () => {
    expect(LADDERS).toHaveLength(FIXTURES.length + 5 * 4 * 5 * 3 * 2 * 2 * 3 * 2)
  })

  it('never reports a negative gain and never lowers the runway', () => {
    for (const row of LADDERS) {
      let previousSpending = row.input.shockedSpendingCents
      for (const step of row.ladder.steps) {
        expect(step.plusDeciMonths, `${row.name} plus`).toBeGreaterThanOrEqual(0)
        expect(step.stepDeciMonths, `${row.name} step`).toBeGreaterThanOrEqual(0)
        expect(step.runwayAfter.deciMonths, `${row.name} runway`).toBeGreaterThanOrEqual(
          row.ladder.baseline.deciMonths,
        )
        expect(step.spendingAfterCents, `${row.name} spend`).toBeLessThanOrEqual(
          previousSpending,
        )
        previousSpending = step.spendingAfterCents
      }
    }
  })

  it('lands the last step exactly on one runway over the summed effects', () => {
    for (const row of LADDERS) {
      const total = row.ladder.steps.reduce(
        (sum, step) => sum + step.lever.effect.spendingDeltaCents,
        0,
      )
      const finalSpending = Math.max(0, row.input.shockedSpendingCents + total)
      const last = row.ladder.steps[row.ladder.steps.length - 1]
      if (!last) {
        expect(finalSpending).toBe(row.input.shockedSpendingCents)
        continue
      }
      expect(last.spendingAfterCents, row.name).toBe(finalSpending)
      expect(last.runwayAfter, row.name).toEqual(
        runway(
          row.input.bufferCents,
          row.input.oneOffCents,
          row.input.shockedIncomeCents,
          finalSpending,
        ),
      )
    }
  })

  it('keeps every exported money and month field an integer', () => {
    for (const row of LADDERS) {
      expect(Number.isInteger(row.ladder.baseline.deciMonths), row.name).toBe(true)
      for (const step of row.ladder.steps) {
        const fields = [
          step.incomeAfterCents,
          step.spendingAfterCents,
          step.bufferLeftCents,
          step.plusDeciMonths,
          step.stepDeciMonths,
          step.runwayAfter.deciMonths,
          step.lever.effect.incomeDeltaCents,
          step.lever.effect.spendingDeltaCents,
          step.lever.effect.bufferDeltaCents,
        ]
        for (const field of fields) {
          expect(Number.isInteger(field), `${row.name} ${step.lever.id}`).toBe(true)
        }
      }
    }
    for (const fixture of FIXTURES) {
      const milestones = goalMilestones(
        fixture.expected.income_cents,
        fixture.expected.spending_cents,
      )
      for (const milestone of milestones) {
        expect(Number.isInteger(milestone.amountCents), fixture.account_id).toBe(true)
        expect(Number.isInteger(milestone.monthsToReach), fixture.account_id).toBe(true)
        expect(Number.isInteger(milestone.monthsOfSpending), fixture.account_id).toBe(true)
      }
    }
  })

  it('never trips the defensive spending floor on a fixture', () => {
    // Levers are sized from profile numbers, and on the five fixtures
    // the profile sizes always fit inside the shocked spending, so the
    // max(0, ...) guard in leverLadder never has to fire.
    for (const fixture of FIXTURES) {
      const input = comboLadderInput(fixture)
      let running = input.shockedSpendingCents
      const ladder = leverLadder(input)
      for (const step of ladder.steps) {
        running += step.lever.effect.spendingDeltaCents
        expect(running, `${fixture.account_id} raw spend`).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
