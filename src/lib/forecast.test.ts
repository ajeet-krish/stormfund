import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseProfilesArtifact, type AccountProfile } from '../data/profiles'
import {
  DEFAULT_HORIZON_MONTHS,
  EI_CLIFF_LABEL,
  EI_CLIFF_MONTH_INDEX,
  MAX_HORIZON_MONTHS,
  NO_LANDFALL_LABEL,
  SHOCK_LANDS_LABEL,
  monthLabel,
  projectForecast,
} from './forecast'
import { SHOCK_PRESETS, type PresetId } from './shockPresets'
import { applyTwist, IDLE_TWIST, runway, scaleCents, type Twist } from './shocks'
import { verdictBand } from './verdict'

/**
 * Contract for src/lib/forecast.ts: the five invariants the weather
 * surfaces depend on (month 0 equals applyTwist's runway, the pin
 * prints the exact headline figure, the pin snaps to the landfall
 * month, the balance line steps by the gap, and month 0 carries the
 * same band the ShockPanel badge shows), the adaptive horizon rules,
 * the storm front and EI cliff display rules, the five golden fixture
 * accounts, and the population sweeps: all 4,500 shipped profiles at
 * IDLE_TWIST must reproduce their recorded runway, and under the
 * layoff twist the EI cliff answer must never equal the headline the
 * card renders (headline exclusion).
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

const artifact = parseProfilesArtifact(
  JSON.parse(
    readFileSync(new URL('../../public/data/engine/profiles.json', import.meta.url), 'utf8'),
  ) as unknown,
)

function fixture(id: string): GoldenFixture {
  const found = FIXTURES.find((entry) => entry.account_id === id)
  if (!found) {
    throw new Error(`missing golden fixture ${id}`)
  }
  return found
}

function profileOf(entry: GoldenFixture): AccountProfile {
  const expected = entry.expected
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

function presetTwist(id: PresetId): Twist {
  const preset = SHOCK_PRESETS.find((entry) => entry.id === id)
  if (!preset) {
    throw new Error(`missing preset ${id}`)
  }
  return { ...IDLE_TWIST, ...preset.twist }
}

/**
 * Check invariants I1 to I5 for one profile under one twist and return
 * every violation as a string, so a population sweep can collect
 * problems instead of running an expect per month.
 */
function invariantViolations(profile: AccountProfile, twist: Twist): string[] {
  const problems: string[] = []
  const who = profile.account_id
  const result = applyTwist(profile, twist)
  const projection = projectForecast(profile, result, twist)
  const first = projection.months[0]

  if (!first) {
    return [`${who}: projection holds no months`]
  }

  // I1: month 0 is exactly the applyTwist runway.
  if (first.answer.state !== result.runway.state || first.answer.deciMonths !== result.runway.deciMonths) {
    problems.push(
      `${who}: I1 month 0 answer ${JSON.stringify(first.answer)} differs from applyTwist ${JSON.stringify(result.runway)}`,
    )
  }

  // I2: the pin carries the exact headline figure.
  if (projection.landfall.deciMonths !== result.runway.deciMonths) {
    problems.push(`${who}: I2 landfall deci ${projection.landfall.deciMonths} differs from headline ${result.runway.deciMonths}`)
  }

  // I3: the snapped pin sits within one tenth of a month of the pin month.
  const pinMonth = projection.landfall.monthIndex
  if (pinMonth !== null && result.runway.deciMonths < 1200) {
    const snap = pinMonth * 10 - result.runway.deciMonths
    if (snap < 0 || snap > 10) {
      problems.push(`${who}: I3 pin snap out of range (${pinMonth} months, ${result.runway.deciMonths} deci)`)
    }
  }

  // I4: the balance line steps by the gap and starts at buffer left.
  if (first.balanceCents !== result.bufferLeftCents) {
    problems.push(`${who}: I4 month 0 balance ${first.balanceCents} differs from buffer left ${result.bufferLeftCents}`)
  }
  for (let index = 1; index < projection.months.length; index += 1) {
    const current = projection.months[index]
    const previous = projection.months[index - 1]
    if (!current || !previous) {
      continue
    }
    if (current.balanceCents - previous.balanceCents !== -result.gapAfterCents) {
      problems.push(`${who}: I4 step at month ${index} is not the gap`)
      break
    }
  }
  if (projection.months.length !== projection.horizonMonths + 1) {
    problems.push(`${who}: months length ${projection.months.length} is not horizon plus one`)
  }

  // I5: month 0 carries the band the ShockPanel badge renders.
  const expectedBand = verdictBand(result.runway)
  if (first.bandId !== expectedBand.id) {
    problems.push(`${who}: I5 month 0 band ${first.bandId} differs from badge band ${expectedBand.id}`)
  }

  return problems
}

function shippedProfile(id: string): AccountProfile {
  const profile = artifact.byId.get(id)
  if (!profile) {
    throw new Error(`missing shipped profile ${id}`)
  }
  return profile
}

describe('monthLabel', () => {
  it('walks forward across a year boundary', () => {
    expect(monthLabel('2025-12', 1)).toBe('2026-01')
    expect(monthLabel('2025-06', 0)).toBe('2025-06')
    expect(monthLabel('2025-01', 13)).toBe('2026-02')
  })

  it('walks backward across a year boundary', () => {
    expect(monthLabel('2026-01', -1)).toBe('2025-12')
    expect(monthLabel('2026-01', -13)).toBe('2024-12')
  })

  it('refuses a label that is not yyyy-mm', () => {
    expect(() => monthLabel('2025/12', 1)).toThrow('yyyy-mm')
    expect(() => monthLabel('December', 0)).toThrow('yyyy-mm')
  })
})

describe('invariants I1 to I5', () => {
  const twists: { name: string; twist: Twist }[] = [
    { name: 'IDLE', twist: IDLE_TWIST },
    { name: 'combo', twist: presetTwist('combo') },
    { name: 'layoff', twist: presetTwist('layoff') },
    { name: 'emergency_repair', twist: presetTwist('emergency_repair') },
    { name: 'job loss at full pay', twist: { ...IDLE_TWIST, jobLoss: true, incomeFactor: 1 } },
  ]

  it('hold for every golden fixture under every shock', () => {
    const problems: string[] = []
    for (const entry of FIXTURES) {
      const profile = profileOf(entry)
      for (const { name, twist } of twists) {
        problems.push(...invariantViolations(profile, twist).map((text) => `${name}: ${text}`))
      }
    }
    expect(problems).toEqual([])
  })

  it('hold for all 4,500 shipped profiles at IDLE_TWIST', () => {
    const problems: string[] = []
    let count = 0
    for (const id of artifact.ids) {
      const profile = artifact.byId.get(id)
      if (!profile) {
        problems.push(`${id}: missing from the index`)
        continue
      }
      count += 1
      problems.push(...invariantViolations(profile, IDLE_TWIST))
    }
    expect(count).toBe(4500)
    expect(problems).toEqual([])
  })

  it('pin the population headline: recorded runway reproduced exactly', () => {
    const problems: string[] = []
    const counts = { finite: 0, no_shortfall: 0, buffer_depleted: 0 }
    for (const id of artifact.ids) {
      const profile = artifact.byId.get(id)
      if (!profile) {
        continue
      }
      counts[profile.runway_state] += 1
      const result = applyTwist(profile, IDLE_TWIST)
      const projection = projectForecast(profile, result, IDLE_TWIST)
      if (projection.landfall.deciMonths !== profile.runway_deci_months) {
        problems.push(`${id}: landfall deci ${projection.landfall.deciMonths} vs recorded ${profile.runway_deci_months}`)
      }
      const first = projection.months[0]
      if (!first || first.answer.state !== profile.runway_state) {
        problems.push(`${id}: month 0 state does not match the recorded runway state`)
      }
    }
    // Every branch of the ladder is live in the shipped data.
    expect(counts.finite).toBeGreaterThan(1000)
    expect(counts.no_shortfall).toBeGreaterThan(3000)
    expect(counts.buffer_depleted).toBeGreaterThan(0)
    expect(counts.finite + counts.no_shortfall + counts.buffer_depleted).toBe(4500)
    expect(problems).toEqual([])
  })

  it('refuses a drifted anchor instead of drawing a wrong sky', () => {
    const profile = shippedProfile('68257')
    const result = applyTwist(profile, IDLE_TWIST)
    expect(() => projectForecast(profile, { ...result, bufferLeftCents: result.bufferLeftCents + 1 }, IDLE_TWIST)).toThrow(
      'buffer left must equal buffer minus one off',
    )
    expect(() => projectForecast(profile, { ...result, gapAfterCents: result.gapAfterCents + 1 }, IDLE_TWIST)).toThrow(
      'gap must equal spending after minus income after',
    )
  })
})

describe('adaptive horizon', () => {
  it('keeps 12 months when landfall sits inside the default view', () => {
    const profile = profileOf(fixture('68257'))
    const result = applyTwist(profile, IDLE_TWIST)
    const projection = projectForecast(profile, result, IDLE_TWIST)
    expect(projection.landfall.monthIndex).toBe(10)
    expect(projection.horizonMonths).toBe(DEFAULT_HORIZON_MONTHS)
    expect(projection.months).toHaveLength(13)
    expect(projection.landfall.withinHorizon).toBe(true)
    expect(projection.landfall.label).toBe('9.8 months')
  })

  it('extends to the landfall month when it lands later than 12', () => {
    const profile = shippedProfile('98952')
    const result = applyTwist(profile, IDLE_TWIST)
    const projection = projectForecast(profile, result, IDLE_TWIST)
    expect(projection.landfall.monthIndex).toBe(25)
    expect(projection.horizonMonths).toBe(25)
    expect(projection.months).toHaveLength(26)
    expect(projection.landfall.withinHorizon).toBe(true)
    expect(projection.landfall.label).toBe('24.6 months')
    expect(projection.months[0]?.labelMonth).toBe('2026-01')
    expect(projection.months[25]?.labelMonth).toBe('2028-02')
  })

  it('caps the extended horizon at 120 months', () => {
    const profile = profileOf(fixture('49900'))
    const result = applyTwist(profile, IDLE_TWIST)
    const projection = projectForecast(profile, result, IDLE_TWIST)
    expect(projection.landfall.monthIndex).toBe(148)
    expect(projection.horizonMonths).toBe(MAX_HORIZON_MONTHS)
    expect(projection.months).toHaveLength(121)
    expect(projection.landfall.withinHorizon).toBe(false)
    expect(projection.landfall.deciMonths).toBe(1200)
    expect(projection.landfall.label).toBe('120.0 months')
    const last = projection.months[120]
    expect(last?.balanceCents).toBe(169_980)
    expect(last?.answer).toEqual({ state: 'finite', deciMonths: 270 })
    expect(last?.bandId).toBe('clear')
  })

  it('keeps 12 months when there is no shortfall to land', () => {
    const profile = profileOf(fixture('23838'))
    const result = applyTwist(profile, IDLE_TWIST)
    const projection = projectForecast(profile, result, IDLE_TWIST)
    expect(projection.horizonMonths).toBe(DEFAULT_HORIZON_MONTHS)
    expect(projection.landfall.monthIndex).toBeNull()
    expect(projection.landfall.withinHorizon).toBe(false)
    expect(projection.landfall.label).toBe(NO_LANDFALL_LABEL)
    expect(projection.months[0]?.answer).toEqual({ state: 'no_shortfall', deciMonths: 1200 })
  })
})

describe('golden fixtures: the projection numbers', () => {
  it('68257 under the combo preset matches the frozen worked example', () => {
    const profile = profileOf(fixture('68257'))
    const twist = presetTwist('combo')
    const result = applyTwist(profile, twist)
    expect(result.incomeAfterCents).toBe(357_679)
    expect(scaleCents(profile.household_bills_cents, 15)).toBe(64_601)
    expect(result.spendingAfterCents).toBe(780_685)
    expect(result.gapAfterCents).toBe(423_006)
    expect(result.bufferLeftCents).toBe(643_785)
    expect(result.runway).toEqual({ state: 'finite', deciMonths: 15 })

    const projection = projectForecast(profile, result, twist)
    expect(projection.horizonMonths).toBe(12)
    expect(projection.landfall).toEqual({
      withinHorizon: true,
      monthIndex: 2,
      deciMonths: 15,
      label: '1.5 months',
    })
    expect(projection.months[0]?.answer).toEqual({ state: 'finite', deciMonths: 15 })
    expect(projection.months[0]?.bandId).toBe('storm_warning')
    expect(projection.months[1]?.balanceCents).toBe(643_785 - 423_006)
    expect(projection.months[2]?.balanceCents).toBe(643_785 - 2 * 423_006)
  })

  it('23838 keeps the half cent tie income and shows no landfall', () => {
    const profile = profileOf(fixture('23838'))
    const result = applyTwist(profile, IDLE_TWIST)
    expect(result.incomeAfterCents).toBe(280_403)
    const projection = projectForecast(profile, result, IDLE_TWIST)
    expect(projection.landfall.label).toBe(NO_LANDFALL_LABEL)
    expect(projection.months[0]?.bandId).toBe('clear')
    // A no shortfall account's balance grows each month, never drains.
    expect(projection.months[1]?.balanceCents).toBeGreaterThan(projection.months[0]?.balanceCents ?? 0)
  })

  it('98952 the pensioner lands exactly at the extended horizon', () => {
    const profile = profileOf(fixture('98952'))
    const result = applyTwist(profile, IDLE_TWIST)
    expect(result.runway).toEqual({ state: 'finite', deciMonths: 246 })
    const projection = projectForecast(profile, result, IDLE_TWIST)
    expect(projection.landfall.monthIndex).toBe(25)
    expect(projection.horizonMonths).toBe(25)
    expect(projection.landfall.label).toBe('24.6 months')
    // The pin snap: 25 months against 24.6 printed, four tenths inside.
    const pinMonth = projection.landfall.monthIndex ?? 0
    expect(pinMonth * 10 - result.runway.deciMonths).toBe(4)
    // The shipped entry carries the pensioner flag the fixture profile does not.
    expect(shippedProfile('98952').flags.pensioner).toBe(true)
  })

  it('42988 the negative buffer lands at month 0', () => {
    const profile = profileOf(fixture('42988'))
    const result = applyTwist(profile, IDLE_TWIST)
    expect(result.bufferLeftCents).toBe(-73_269)
    const projection = projectForecast(profile, result, IDLE_TWIST)
    expect(projection.landfall).toEqual({
      withinHorizon: true,
      monthIndex: 0,
      deciMonths: 0,
      label: '0.0 months',
    })
    expect(projection.months[0]?.balanceCents).toBe(-73_269)
    expect(projection.months[0]?.answer).toEqual({ state: 'buffer_depleted', deciMonths: 0 })
    expect(projection.months[0]?.bandId).toBe('critical')
    expect(projection.horizonMonths).toBe(DEFAULT_HORIZON_MONTHS)
  })
})

describe('storm front', () => {
  it('sits idle with the plain caption when no shock is live', () => {
    const profile = shippedProfile('68257')
    const result = applyTwist(profile, IDLE_TWIST)
    const projection = projectForecast(profile, result, IDLE_TWIST)
    expect(projection.stormFront).toEqual({ active: false, label: SHOCK_LANDS_LABEL })
  })

  it('carries the active preset card sentence', () => {
    const profile = shippedProfile('68257')
    const twist = presetTwist('combo')
    const result = applyTwist(profile, twist)
    const projection = projectForecast(profile, result, twist)
    expect(projection.stormFront.active).toBe(true)
    expect(projection.stormFront.label).toBe(
      'They lose their job (EI at 55%) and their household bills go up 15% in the same month.',
    )
  })

  it('falls back to the plain caption for a custom slider shock', () => {
    const profile = shippedProfile('68257')
    const twist: Twist = { ...IDLE_TWIST, billsDeltaPct: 7 }
    const result = applyTwist(profile, twist)
    const projection = projectForecast(profile, result, twist)
    expect(projection.stormFront.active).toBe(true)
    expect(projection.stormFront.label).toBe(SHOCK_LANDS_LABEL)
  })
})

describe('EI cliff', () => {
  it('stays hidden for every twist without a job loss', () => {
    const profile = shippedProfile('68257')
    for (const twist of [IDLE_TWIST, presetTwist('cost_spike'), presetTwist('emergency_repair')]) {
      const result = applyTwist(profile, twist)
      const projection = projectForecast(profile, result, twist)
      expect(projection.eiCliff.visible).toBe(false)
      expect(projection.eiCliff.monthIndex).toBe(EI_CLIFF_MONTH_INDEX)
      expect(projection.eiCliff.afterDeciMonths).toBeNull()
      expect(projection.eiCliff.afterMonthIndex).toBeNull()
      expect(projection.eiCliff.continuation).toEqual([])
      expect(projection.eiCliff.label).toBe(EI_CLIFF_LABEL)
    }
  })

  it('is visible for a job loss twist even when the headline still rides', () => {
    const profile = shippedProfile('68257')
    const twist = presetTwist('layoff')
    const result = applyTwist(profile, twist)
    const projection = projectForecast(profile, result, twist)
    expect(projection.eiCliff.visible).toBe(true)
    expect(projection.eiCliff.monthIndex).toBe(6)
    expect(projection.eiCliff.label).toBe('Beyond the answer key: EI income stops after month 6')
    // Headline unchanged by the cliff block (headline exclusion).
    expect(projection.months[0]?.answer).toEqual(result.runway)
  })

  it('pins the second pin with integer ceiling math and a flat worst case', () => {
    const profile = shippedProfile('68257')
    // Job loss at full pay: the flow matches idle, so the buffer still
    // holds at the cliff and the worst case drains over spending alone.
    const twist: Twist = { ...IDLE_TWIST, jobLoss: true, incomeFactor: 1 }
    const result = applyTwist(profile, twist)
    const projection = projectForecast(profile, result, twist)
    const cliff = projection.eiCliff
    expect(cliff.visible).toBe(true)
    // 643785 minus 6 times the 65758 gap leaves 249237 at the cliff.
    expect(cliff.afterMonthIndex).toBe(7)
    expect(cliff.afterDeciMonths).toBe(3)
    expect(cliff.afterLabel).toBe('0.3 months')
    expect(cliff.continuation).toEqual([
      { monthIndex: 6, balanceCents: 249_237 },
      { monthIndex: 7, balanceCents: 249_237 - 716_084 },
    ])
    // The headline at month 0 is the ordinary answer, not the cliff.
    expect(projection.months[0]?.answer).toEqual(result.runway)
  })

  it('stops the dashed continuation at the horizon when the worst case runs long', () => {
    const profile = profileOf(fixture('49900'))
    const twist: Twist = { ...IDLE_TWIST, jobLoss: true, incomeFactor: 0.55 }
    const result = applyTwist(profile, twist)
    const projection = projectForecast(profile, result, twist)
    const cliff = projection.eiCliff
    expect(cliff.visible).toBe(true)
    expect(cliff.afterMonthIndex).toBe(148)
    expect(cliff.afterDeciMonths).toBe(1200)
    expect(cliff.afterLabel).toBe('120.0 months')
    const first = cliff.continuation[0]
    const last = cliff.continuation[cliff.continuation.length - 1]
    expect(first?.monthIndex).toBe(6)
    expect(last?.monthIndex).toBe(MAX_HORIZON_MONTHS)
    expect(cliff.continuation).toHaveLength(MAX_HORIZON_MONTHS - 6 + 1)
  })

  it('keeps the second pin on screen when the buffer is already gone at the cliff', () => {
    const profile = shippedProfile('68257')
    const twist = presetTwist('combo')
    const result = applyTwist(profile, twist)
    const projection = projectForecast(profile, result, twist)
    const cliff = projection.eiCliff
    expect(cliff.visible).toBe(true)
    // The combo drains the buffer long before month 6, so the worst
    // case lands at the cliff itself.
    expect(cliff.afterMonthIndex).toBe(6)
    expect(cliff.afterDeciMonths).toBe(0)
    expect(cliff.afterLabel).toBe('0.0 months')
    expect(cliff.continuation).toHaveLength(1)
    expect(cliff.continuation[0]?.monthIndex).toBe(6)
    expect(cliff.continuation[0]?.balanceCents).toBeLessThan(0)
  })
})

describe('EI isolation: the cliff never becomes the headline', () => {
  it('keeps month 0 equal to applyTwist under a job loss twist', () => {
    for (const id of ['68257', '23838', '49900', '98952', '42988']) {
      const profile = shippedProfile(id)
      const twist = presetTwist('layoff')
      const result = applyTwist(profile, twist)
      const projection = projectForecast(profile, result, twist)
      expect(projection.months[0]?.answer, id).toEqual(result.runway)
      expect(projection.months[0]?.bandId, id).toBe(verdictBand(result.runway).id)
    }
  })

  it('never lets a visible cliff answer equal the finite headline, for all 4,500 profiles', () => {
    const problems: string[] = []
    let checked = 0
    let cappedBoth = 0
    const twist = presetTwist('layoff')
    for (const id of artifact.ids) {
      const profile = artifact.byId.get(id)
      if (!profile) {
        continue
      }
      const result = applyTwist(profile, twist)
      const projection = projectForecast(profile, result, twist)
      const first = projection.months[0]
      if (!first || first.answer.state !== 'finite' || !projection.eiCliff.visible) {
        continue
      }
      const cliffAt = projection.months[projection.eiCliff.monthIndex]
      if (!cliffAt) {
        continue
      }
      // The cliff answer, recomputed here from the projection's own
      // month 6 balance and the shocked spending: income is zero after
      // EI, which is the worst case the overlay draws.
      const cliffAnswer = runway(cliffAt.balanceCents, 0, 0, result.spendingAfterCents)
      checked += 1
      // Known display cap coincidence: when both the shocked runway and
      // the worst case exceed 120 months, both figures read the 1200
      // cap (accounts 26617 and 49900 in the shipped data). That is one
      // shared display cap, not a leak: I1 proves month 0 comes from
      // applyTwist alone.
      if (cliffAnswer.deciMonths >= 1200 && first.answer.deciMonths >= 1200) {
        cappedBoth += 1
        continue
      }
      if (cliffAnswer.state === first.answer.state && cliffAnswer.deciMonths === first.answer.deciMonths) {
        problems.push(`${id}: cliff ${JSON.stringify(cliffAnswer)} equals headline ${JSON.stringify(first.answer)}`)
      }
    }
    expect(checked).toBeGreaterThan(3500)
    expect(problems).toEqual([])
    expect(cappedBoth).toBeLessThan(10)
  })
})

describe('history context', () => {
  it('draws the recorded series left of month 0 with honest labels', () => {
    const profile = shippedProfile('68257')
    const result = applyTwist(profile, IDLE_TWIST)
    const projection = projectForecast(profile, result, IDLE_TWIST)
    expect(projection.history).toHaveLength(profile.balance_series.values_cents.length)
    expect(projection.history[0]).toEqual({
      labelMonth: profile.balance_series.start_month,
      balanceCents: profile.balance_series.values_cents[0],
    })
    const lastIndex = projection.history.length - 1
    expect(projection.history[lastIndex]?.labelMonth).toBe('2025-12')
    // Month 0 continues after the last recorded month, so the muted
    // history line ends exactly where the projection begins.
    expect(projection.months[0]?.labelMonth).toBe('2026-01')
    expect(monthLabel('2025-12', 1)).toBe('2026-01')
  })
})
