import { describe, expect, it } from 'vitest'
import {
  BACKUP_HORIZON_MONTHS,
  CUT_NOT_APPLICABLE,
  GOAL_CONTRIBUTION_FLOOR_PCT,
  GOAL_TARGET_MONTHS,
  MONTHS_UNREACHABLE,
  backupPlan,
  goalPlan,
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
//   contribution= max(400000 - 250000, 20000) = max(150000, 20000) = 150000
//   months      = ceil(750000 / 150000) = 5 exactly
//   I > S, so cut = 0 and the status is on track.
// ============================================================
const ACCOUNT_A = { income: 400_000, spending: 250_000 }

// ============================================================
// Fixture account B, the monthly deficit.
//   I = 300000 ($3,000.00), S = 320000 ($3,200.00)
//   target      = 3 x 320000 = 960000
//   floor       = 5 percent of 300000 = 15000
//   contribution= max(300000 - 320000, 15000) = max(-20000, 15000) = 15000
//   months      = ceil(960000 / 15000) = 64 exactly
//   I <= S, so cut = 320000 - 300000 + 15000 = 35000 (cut needed).
// ============================================================
const ACCOUNT_B = { income: 300_000, spending: 320_000 }

// ============================================================
// Fixture account C, no income at all (the zero_income edge flag).
//   I = 0, S = 200000
//   target      = 3 x 200000 = 600000
//   floor       = 5 percent of 0 = 0
//   contribution= max(0 - 200000, 0) = 0, so the goal needs income:
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
    // cut floor = F + P = 200000, shortfall = 60 - 45 = 15 tenths.
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
