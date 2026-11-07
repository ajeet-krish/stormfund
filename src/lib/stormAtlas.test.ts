import { describe, expect, it } from 'vitest'
import {
  ATLAS_ORDER,
  accountsInState,
  emptyCounts,
  summarizeStormAtlas,
  DEFAULT_SCENARIO_LABEL,
  type AtlasEntry,
} from './stormAtlas'
import { WEATHER_STATES, type WeatherMetrics } from './weatherState'

/**
 * The Storm Atlas aggregation against a hand built fixture of ten
 * accounts covering all seven states: exact counts, whole percents, the
 * "1 in N" headline template, the honest empty population, and the
 * drill down id list. Every expected number below is hand counted from
 * the fixture array.
 */

function entry(account_id: string, overrides: Partial<WeatherMetrics> = {}): AtlasEntry {
  const base: WeatherMetrics = {
    income_cents: 400_000,
    spending_cents: 300_000,
    buffer_cents: 500_000,
    gap_cents: -100_000,
    runway_state: 'no_shortfall',
    runway_deci_months: 1200,
  }
  return { account_id, ...base, ...overrides }
}

/**
 * Ten accounts: 2 flood, 2 storm, 1 drought, 2 rain, 1 overcast,
 * 1 cloudy, 1 clear. Hand counted, so the headline for the default
 * storm state is 1 in 5.
 */
const FIXTURE: readonly AtlasEntry[] = [
  entry('10001', { runway_state: 'buffer_depleted', runway_deci_months: 0, buffer_cents: -1 }),
  entry('10002', { runway_state: 'buffer_depleted', runway_deci_months: 0, buffer_cents: 0 }),
  entry('10003', {
    runway_state: 'finite',
    runway_deci_months: 10,
    gap_cents: 100_000,
  }),
  entry('10004', {
    runway_state: 'finite',
    runway_deci_months: 29,
    gap_cents: 100_000,
  }),
  entry('10005', {
    runway_state: 'finite',
    runway_deci_months: 60,
    gap_cents: 100_000,
    income_cents: 200_000,
    spending_cents: 400_000,
  }),
  entry('10006', { runway_state: 'finite', runway_deci_months: 60, gap_cents: 100_000 }),
  entry('10007', { runway_state: 'finite', runway_deci_months: 90, gap_cents: 100_000 }),
  entry('10008', { runway_state: 'finite', runway_deci_months: 150, gap_cents: 100_000 }),
  entry('10009', { runway_state: 'finite', runway_deci_months: 300, gap_cents: 100_000 }),
  entry('10010'),
]

describe('summarizeStormAtlas: counts over the fixture', () => {
  const summary = summarizeStormAtlas(FIXTURE)

  it('counts all ten accounts across the seven states', () => {
    expect(summary.total).toBe(10)
    expect(summary.counts).toEqual({
      clear: 1,
      cloudy: 1,
      overcast: 1,
      rain: 2,
      drought: 1,
      storm: 2,
      flood: 2,
    })
    const sum = WEATHER_STATES.reduce((acc, state) => acc + summary.counts[state], 0)
    expect(sum).toBe(summary.total)
  })

  it('computes whole percents that add up on this fixture', () => {
    expect(summary.percents.storm).toBe(20)
    expect(summary.percents.flood).toBe(20)
    expect(summary.percents.clear).toBe(10)
    const sum = WEATHER_STATES.reduce((acc, state) => acc + summary.percents[state], 0)
    expect(sum).toBe(100)
  })

  it('builds the 1 in N headline for the default storm state', () => {
    expect(summary.headlineState).toBe('storm')
    expect(summary.headlineCount).toBe(2)
    expect(summary.oneInN).toBe(5)
    expect(summary.scenarioLabel).toBe(DEFAULT_SCENARIO_LABEL)
    expect(summary.headline).toBe('1 in 5 accounts hits storm warning at baseline')
  })

  it('relabels the headline for another state and scenario', () => {
    const twisted = summarizeStormAtlas(FIXTURE, {
      headlineState: 'flood',
      scenarioLabel: 'under the standard EI twist',
    })
    expect(twisted.headlineCount).toBe(2)
    expect(twisted.oneInN).toBe(5)
    expect(twisted.headline).toBe('1 in 5 accounts hits flood under the standard EI twist')
  })

  it('rounds percents half up over a population of three', () => {
    const three = [FIXTURE[0], FIXTURE[2], FIXTURE[9]] as AtlasEntry[]
    // One flood out of three is 33 percent, two of three is 67.
    const floodSummary = summarizeStormAtlas(three, { headlineState: 'flood' })
    expect(floodSummary.percents.flood).toBe(33)
    expect(floodSummary.oneInN).toBe(3)

    const twoOfThree = [FIXTURE[0], FIXTURE[2], FIXTURE[2]] as AtlasEntry[]
    const stormSummary = summarizeStormAtlas(twoOfThree, { headlineState: 'storm' })
    expect(stormSummary.percents.storm).toBe(67)
    expect(stormSummary.oneInN).toBe(2)
  })
})

describe('summarizeStormAtlas: honest fallbacks', () => {
  it('reads an empty, null, or undefined population as not wired yet', () => {
    for (const input of [[], null, undefined]) {
      const summary = summarizeStormAtlas(input as AtlasEntry[] | null | undefined)
      expect(summary.total).toBe(0)
      expect(summary.oneInN).toBeNull()
      expect(summary.headline).toBe('No accounts in the atlas yet')
      expect(summary.percents.storm).toBe(0)
      expect(summary.counts.clear).toBe(0)
    }
  })

  it('never claims a 1 in N ratio when the state never fires', () => {
    const clearOnly = [entry('20001')]
    const summary = summarizeStormAtlas(clearOnly, { headlineState: 'storm' })
    expect(summary.headlineCount).toBe(0)
    expect(summary.oneInN).toBeNull()
    expect(summary.headline).toBe('No accounts hit storm warning at baseline')
  })

  it('skips defensively invalid rows instead of crashing the count', () => {
    const messy = [null, undefined, entry('30001'), 7] as unknown as AtlasEntry[]
    const summary = summarizeStormAtlas(messy)
    expect(summary.total).toBe(1)
    expect(summary.counts.clear).toBe(1)
    // The single valid row is clear, so the default storm headline
    // reports an honest zero rather than a ratio.
    expect(summary.headline).toBe('No accounts hit storm warning at baseline')
  })
})

describe('accountsInState and the shared order', () => {
  it('lists the account ids behind one cell in caller order', () => {
    expect(accountsInState(FIXTURE, 'flood')).toEqual(['10001', '10002'])
    expect(accountsInState(FIXTURE, 'storm')).toEqual(['10003', '10004'])
    expect(accountsInState(FIXTURE, 'clear')).toEqual(['10010'])
    expect(accountsInState(FIXTURE, 'drought')).toEqual(['10005'])
    expect(accountsInState([], 'storm')).toEqual([])
    expect(accountsInState(null, 'storm')).toEqual([])
    expect(accountsInState(undefined, 'storm')).toEqual([])
  })

  it('exports an empty count record in canonical key order', () => {
    expect(Object.keys(emptyCounts())).toEqual([...WEATHER_STATES])
    expect(emptyCounts().flood).toBe(0)
  })

  it('orders the atlas grid severe first', () => {
    expect([...ATLAS_ORDER]).toEqual([
      'flood',
      'storm',
      'drought',
      'rain',
      'overcast',
      'cloudy',
      'clear',
    ])
  })
})
