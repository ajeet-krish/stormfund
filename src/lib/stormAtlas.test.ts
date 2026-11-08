import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseProfilesArtifact, type AccountProfile } from '../data/profiles'
import { SHOCK_PRESETS } from './shockPresets'
import { IDLE_TWIST, normalizeTwist, roundHalfUp } from './shocks'
import {
  ATLAS_BAND_ORDER,
  DEFAULT_HEADLINE_BANDS,
  DEFAULT_HEADLINE_THRESHOLD_WORDS,
  DEFAULT_SCENARIO_LABEL,
  accountsInBand,
  emptyBandCounts,
  shockedAtlasScenario,
  summarizeStormAtlas,
  type AtlasEntry,
} from './stormAtlas'

/**
 * The Storm Atlas aggregation after the E5 fold: five band counts
 * over a hand built fixture, the word for word headline for empty,
 * zero, baseline, and twisted populations, the drill down id list,
 * and the honesty contract that a scenario label only ever comes from
 * the twist whose applyTwist results are in the entries. Every
 * expected number below is hand counted from the fixture array.
 */

function entry(
  account_id: string,
  runway_state: AtlasEntry['runway_state'],
  runway_deci_months: number,
): AtlasEntry {
  return { account_id, runway_state, runway_deci_months }
}

/**
 * Ten accounts, two per band, hand counted so every percent is a
 * clean fifth of the population: 2 critical, 2 storm_warning, 2 watch,
 * 2 fair_skies, 2 clear.
 */
const FIXTURE: readonly AtlasEntry[] = [
  entry('10001', 'buffer_depleted', 0),
  entry('10002', 'finite', 9),
  entry('10003', 'finite', 10),
  entry('10004', 'finite', 29),
  entry('10005', 'finite', 30),
  entry('10006', 'finite', 59),
  entry('10007', 'finite', 60),
  entry('10008', 'finite', 119),
  entry('10009', 'finite', 120),
  entry('10010', 'no_shortfall', 1200),
]

const artifact = parseProfilesArtifact(
  JSON.parse(
    readFileSync(new URL('../../public/data/engine/profiles.json', import.meta.url), 'utf8'),
  ),
)
const shippedProfiles: AccountProfile[] = Object.values(artifact.profiles)

describe('summarizeStormAtlas: counts over the five bands', () => {
  const summary = summarizeStormAtlas(FIXTURE)

  it('counts all ten accounts across the five bands', () => {
    expect(summary.total).toBe(10)
    expect(summary.counts).toEqual({
      critical: 2,
      storm_warning: 2,
      watch: 2,
      fair_skies: 2,
      clear: 2,
    })
    const sum = ATLAS_BAND_ORDER.reduce((acc, band) => acc + summary.counts[band], 0)
    expect(sum).toBe(summary.total)
  })

  it('computes whole percents that may not sum to 100', () => {
    expect(summary.percents).toEqual({
      critical: 20,
      storm_warning: 20,
      watch: 20,
      fair_skies: 20,
      clear: 20,
    })

    // One of three rounds to 33 three times: 99, not 100.
    const thirds = [FIXTURE[0], FIXTURE[2], FIXTURE[4]] as AtlasEntry[]
    const thirdSummary = summarizeStormAtlas(thirds)
    expect(thirdSummary.percents.critical).toBe(33)
    expect(thirdSummary.percents.storm_warning).toBe(33)
    expect(thirdSummary.percents.watch).toBe(33)
    const thirdSum = ATLAS_BAND_ORDER.reduce((acc, band) => acc + thirdSummary.percents[band], 0)
    expect(thirdSum).toBe(99)
  })

  it('builds the baseline headline for the two bands under 3 months', () => {
    expect(summary.headlineBands).toEqual(DEFAULT_HEADLINE_BANDS)
    expect(summary.headlineThresholdWords).toBe(DEFAULT_HEADLINE_THRESHOLD_WORDS)
    expect(summary.headlineCount).toBe(4)
    expect(summary.headlinePercent).toBe(40)
    expect(summary.oneInN).toBe(3)
    expect(summary.scenarioLabel).toBe(DEFAULT_SCENARIO_LABEL)
    expect(summary.headline).toBe('40% of accounts have under 3 months of runway at baseline')
  })

  it('swaps the verb once the numbers ran under a twist', () => {
    const twisted = summarizeStormAtlas(FIXTURE, {
      scenarioLabel: 'under the laid off twist',
    })
    expect(twisted.headlineCount).toBe(4)
    expect(twisted.headlinePercent).toBe(40)
    expect(twisted.oneInN).toBe(3)
    expect(twisted.headline).toBe(
      '40% of accounts would have under 3 months of runway under the laid off twist',
    )
  })

  it('reports an honest zero when the band never fires', () => {
    const clearOnly = [entry('20001', 'no_shortfall', 1200)]
    const baseline = summarizeStormAtlas(clearOnly)
    expect(baseline.headlineCount).toBe(0)
    expect(baseline.headlinePercent).toBe(0)
    expect(baseline.oneInN).toBeNull()
    expect(baseline.headline).toBe('No accounts have under 3 months of runway at baseline')

    const twisted = summarizeStormAtlas(clearOnly, {
      scenarioLabel: 'under the laid off twist',
    })
    expect(twisted.oneInN).toBeNull()
    expect(twisted.headline).toBe(
      'No accounts would have under 3 months of runway under the laid off twist',
    )
  })

  it('reads an empty, null, or undefined population as not wired yet', () => {
    for (const input of [[], null, undefined]) {
      const summary = summarizeStormAtlas(input as AtlasEntry[] | null | undefined)
      expect(summary.total).toBe(0)
      expect(summary.headlineCount).toBe(0)
      expect(summary.oneInN).toBeNull()
      expect(summary.headline).toBe('No accounts in the atlas yet')
      expect(summary.percents.clear).toBe(0)
      expect(summary.counts.critical).toBe(0)
    }
  })

  it('honours a caller band subset with its own threshold words', () => {
    const watchOnly = summarizeStormAtlas(FIXTURE, {
      headlineBands: ['watch'],
      headlineThresholdWords: '6 months',
    })
    expect(watchOnly.headlineCount).toBe(2)
    expect(watchOnly.headlinePercent).toBe(20)
    expect(watchOnly.oneInN).toBe(5)
    expect(watchOnly.headline).toBe('20% of accounts have under 6 months of runway at baseline')
  })

  it('skips defensively invalid rows instead of crashing the count', () => {
    const messy = [null, undefined, entry('30001', 'no_shortfall', 1200), 7] as unknown as
      AtlasEntry[]
    const summary = summarizeStormAtlas(messy)
    expect(summary.total).toBe(1)
    expect(summary.headline).toBe(
      'No accounts have under 3 months of runway at baseline',
    )
  })
})

describe('accountsInBand and the shared ladder order', () => {
  it('lists the account ids behind one band in caller order', () => {
    expect(accountsInBand(FIXTURE, 'critical')).toEqual(['10001', '10002'])
    expect(accountsInBand(FIXTURE, 'storm_warning')).toEqual(['10003', '10004'])
    expect(accountsInBand(FIXTURE, 'watch')).toEqual(['10005', '10006'])
    expect(accountsInBand(FIXTURE, 'fair_skies')).toEqual(['10007', '10008'])
    expect(accountsInBand(FIXTURE, 'clear')).toEqual(['10009', '10010'])
    expect(accountsInBand([], 'clear')).toEqual([])
    expect(accountsInBand(null, 'clear')).toEqual([])
    expect(accountsInBand(undefined, 'clear')).toEqual([])
  })

  it('exports an empty count record in ladder order', () => {
    expect(Object.keys(emptyBandCounts())).toEqual(['critical', 'storm_warning', 'watch', 'fair_skies', 'clear'])
    expect(Object.keys(emptyBandCounts())).toEqual([...ATLAS_BAND_ORDER])
    expect(emptyBandCounts().critical).toBe(0)
  })

  it('keeps ATLAS_BAND_ORDER identical to the verdict ladder', () => {
    expect(ATLAS_BAND_ORDER).toEqual(DEFAULT_HEADLINE_BANDS.concat(['watch', 'fair_skies', 'clear']))
  })
})

describe('shockedAtlasScenario: wording only from the twist', () => {
  const baseline = shockedAtlasScenario(shippedProfiles, IDLE_TWIST)

  it('runs the idle twist as the recorded baseline, row for row', () => {
    expect(baseline.scenarioLabel).toBe(DEFAULT_SCENARIO_LABEL)
    const recorded = shippedProfiles.map((profile) => ({
      account_id: profile.account_id,
      runway_state: profile.runway_state,
      runway_deci_months: profile.runway_deci_months,
    }))
    expect(baseline.entries).toEqual(recorded)
  })

  it('quotes the matching preset label for every preset twist', () => {
    for (const preset of SHOCK_PRESETS) {
      const scenario = shockedAtlasScenario(shippedProfiles, normalizeTwist(preset.twist))
      expect(scenario.scenarioLabel).toBe(`under the ${preset.label.toLowerCase()} twist`)

      // The label may only exist because the numbers really ran: at
      // least one account's runway answer differs from baseline.
      const changed = scenario.entries.some((row, index) => {
        const before = baseline.entries[index]
        return (
          before !== undefined &&
          (before.runway_state !== row.runway_state ||
            before.runway_deci_months !== row.runway_deci_months)
        )
      })
      expect(changed, preset.id).toBe(true)
    }
  })

  it('calls an unmatched twist custom instead of quoting a preset', () => {
    const customBills = shockedAtlasScenario(shippedProfiles, normalizeTwist({ billsDeltaPct: 7 }))
    expect(customBills.scenarioLabel).toBe('under the custom twist')

    const horizonOnly = shockedAtlasScenario(
      shippedProfiles,
      normalizeTwist({ durationMonths: 6 }),
    )
    expect(horizonOnly.scenarioLabel).toBe('under the custom twist')
  })

  it('keeps the sentence and the numbers under the same twist', () => {
    const layoff = shockedAtlasScenario(
      shippedProfiles,
      normalizeTwist({ jobLoss: true, incomeFactor: 0.55, durationMonths: 6 }),
    )
    const summary = summarizeStormAtlas(layoff.entries, {
      scenarioLabel: layoff.scenarioLabel,
    })
    expect(summary.headline).toBe(
      `${summary.headlinePercent}% of accounts would have under 3 months of runway under the laid off twist`,
    )

    const atBaseline = summarizeStormAtlas(baseline.entries, {
      scenarioLabel: baseline.scenarioLabel,
    })
    expect(summary.headlineCount).toBeGreaterThan(atBaseline.headlineCount)
    expect(atBaseline.headline).toBe(
      `${atBaseline.headlinePercent}% of accounts have under 3 months of runway at baseline`,
    )
  })
})

describe('the shipped artifact: conservation', () => {
  const baseline = shockedAtlasScenario(shippedProfiles, IDLE_TWIST)
  const summary = summarizeStormAtlas(baseline.entries)

  it('counts every shipped account exactly once', () => {
    expect(baseline.entries).toHaveLength(4500)
    expect(summary.total).toBe(4500)
    expect(summary.total).toBe(artifact.meta.account_count)
    const counted = ATLAS_BAND_ORDER.reduce((acc, band) => acc + summary.counts[band], 0)
    expect(counted).toBe(summary.total)
  })

  it('keeps every percent a whole number of the population', () => {
    for (const band of ATLAS_BAND_ORDER) {
      expect(Number.isInteger(summary.percents[band])).toBe(true)
      expect(summary.percents[band]).toBe(
        roundHalfUp(summary.counts[band] * 100, summary.total),
      )
    }
    // Five bands rounding independently may drift by at most 2 points.
    const sum = ATLAS_BAND_ORDER.reduce((acc, band) => acc + summary.percents[band], 0)
    expect(sum).toBeGreaterThanOrEqual(98)
    expect(sum).toBeLessThanOrEqual(102)
  })

  it('builds the shipped headline from its own counts', () => {
    expect(summary.headlineCount).toBe(summary.counts.critical + summary.counts.storm_warning)
    expect(summary.headlinePercent).toBe(roundHalfUp(summary.headlineCount * 100, summary.total))
    expect(summary.oneInN).toBe(roundHalfUp(summary.total, summary.headlineCount))
    expect(summary.headline).toBe(
      `${summary.headlinePercent}% of accounts have under 3 months of runway at baseline`,
    )
  })
})
