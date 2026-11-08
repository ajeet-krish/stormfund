import { describe, expect, it } from 'vitest'
import {
  ATLAS_BAND_IDS,
  SEVERITY_BINS,
  SEVERITY_DEFINITION,
  bandForBin,
  bandTotal,
  binFor,
  districtSeverity,
  parseAtlasDoc,
  regionsGrouped,
} from './atlasData'
import type { BandCounts, DistrictRow } from './atlasData'

/**
 * Loader contract for public/data/engine/atlas.json: the refusal style
 * of src/data/profiles.ts, every rejection naming the field that broke
 * the fixed schema, plus the two cartogram helpers (severity share and
 * shading bin) and the region grouping. The fixture is inline: seven
 * districts, three regions, one no_data district whose source row is
 * incomplete while its demographic cells and its accounts are both
 * real (the shipped artifact shape), counts summing to every
 * district account_count, and all four preset scenario tables the
 * fixed contract requires. No test reads the shipped artifact.
 */

const SHA = 'a1'.repeat(32)

function counts(
  critical: number,
  storm_warning: number,
  watch: number,
  fair_skies: number,
  clear: number,
): BandCounts {
  return { critical, storm_warning, watch, fair_skies, clear }
}

/** One raw district row in the artifact shape. */
function district(
  district_id: number,
  district_name: string,
  region: string,
  account_count: number,
  no_data = false,
): Record<string, unknown> {
  return {
    district_id,
    district_name,
    region,
    inhabitants: 40000 + district_id * 1000,
    // Populated demographics under no_data, the way the shipped
    // hatched district ships them: the flag marks an incomplete source
    // row, not empty demographics.
    unemployment_rate_2023: 3.5,
    average_salary: 15000,
    account_count,
    no_data,
  }
}

const BASELINE_SPLITS: Record<number, BandCounts> = {
  1: counts(6, 4, 10, 20, 20),
  2: counts(0, 0, 5, 15, 20),
  3: counts(2, 3, 10, 20, 20),
  4: counts(1, 1, 8, 15, 20),
  5: counts(0, 2, 8, 20, 20),
  6: counts(3, 3, 14, 20, 20),
  7: counts(0, 0, 0, 10, 20),
}

const LAYOFF_SPLITS: Record<number, BandCounts> = {
  1: counts(10, 8, 10, 17, 15),
  2: counts(2, 3, 5, 14, 16),
  3: counts(6, 7, 10, 17, 15),
  4: counts(4, 5, 8, 13, 15),
  5: counts(5, 6, 8, 16, 15),
  6: counts(8, 9, 14, 14, 15),
  7: counts(1, 2, 0, 10, 17),
}

/**
 * The other three preset tables: each moves a slice of accounts from
 * clear into critical on top of one base table, so every district
 * total still matches its account_count while the four tables stay
 * distinguishable.
 */
function shifted(base: Record<number, BandCounts>, moved: number): Record<number, BandCounts> {
  const out: Record<number, BandCounts> = {}
  for (const [districtId, split] of Object.entries(base)) {
    out[Number(districtId)] = {
      ...split,
      critical: split.critical + moved,
      clear: split.clear - moved,
    }
  }
  return out
}

const COST_SPIKE_SPLITS = shifted(BASELINE_SPLITS, 2)
const EMERGENCY_REPAIR_SPLITS = shifted(BASELINE_SPLITS, 4)
const COMBO_SPLITS = shifted(LAYOFF_SPLITS, 1)

/**
 * A fresh fixture every call so a drift test can mutate its copy:
 * seven districts over three regions (North, Central, South, file
 * order not alphabetical), district 6 the no_data row, 340 accounts
 * mapped one each, and all four preset scenario tables the fixed
 * contract requires.
 */
function fixture(): Record<string, unknown> {
  const districts = [
    district(1, 'Ashfield', 'North', 60),
    district(2, 'Brookline', 'North', 40),
    district(3, 'Copeland', 'Central', 55),
    district(4, 'Dunmore', 'Central', 45),
    district(5, 'Eastgate', 'South', 50),
    district(6, 'Fairview', 'South', 60, true),
    district(7, 'Alderwood', 'South', 30),
  ]
  const account_district: Record<string, number> = {}
  let next = 10001
  for (const row of districts) {
    for (let index = 0; index < (row.account_count as number); index += 1) {
      account_district[String(next)] = row.district_id as number
      next += 1
    }
  }
  return {
    schema_version: 1,
    generated_by: 'scripts.engine.build',
    verdict_bands: ['critical', 'storm_warning', 'watch', 'fair_skies', 'clear'],
    sources: [{ path: 'public/data/engine/profiles.json', sha256: SHA, rows: 340 }],
    districts,
    account_district,
    baseline: structuredClone(BASELINE_SPLITS),
    scenarios: {
      layoff: structuredClone(LAYOFF_SPLITS),
      cost_spike: structuredClone(COST_SPIKE_SPLITS),
      emergency_repair: structuredClone(EMERGENCY_REPAIR_SPLITS),
      combo: structuredClone(COMBO_SPLITS),
    },
  }
}

function parsed() {
  return parseAtlasDoc(fixture())
}

describe('parseAtlasDoc: the contract it accepts', () => {
  it('parses the fixture into typed districts, bands, and splits', () => {
    const doc = parsed()
    expect(doc.schema_version).toBe(1)
    expect(doc.generated_by).toBe('scripts.engine.build')
    expect(doc.verdict_bands).toEqual(['critical', 'storm_warning', 'watch', 'fair_skies', 'clear'])
    expect(doc.verdict_bands).toEqual([...ATLAS_BAND_IDS])
    expect(doc.districts).toHaveLength(7)
    expect(doc.sources).toHaveLength(1)
    expect(Object.keys(doc.baseline)).toHaveLength(7)
    expect(Object.keys(doc.scenarios)).toEqual([
      'layoff',
      'cost_spike',
      'emergency_repair',
      'combo',
    ])
    expect(Object.keys(doc.account_district)).toHaveLength(340)
  })

  it('accepts the states key name for the band list', () => {
    const raw = fixture()
    const bands = raw.verdict_bands
    delete raw.verdict_bands
    raw.states = bands
    const doc = parseAtlasDoc(raw)
    expect(doc.verdict_bands).toEqual(['critical', 'storm_warning', 'watch', 'fair_skies', 'clear'])
  })

  it('keeps the no_data district honest: populated demographics, real accounts', () => {
    const doc = parsed()
    const flagged = doc.districts.find((row) => row.no_data) as DistrictRow
    expect(flagged.district_name).toBe('Fairview')
    // The flag marks an incomplete source row, not empty demographics:
    // the shipped hatched district carries its 2023 cells the same way.
    expect(flagged.unemployment_rate_2023).toBe(3.5)
    expect(flagged.average_salary).toBe(15000)
    expect(flagged.account_count).toBe(60)
    expect(bandTotal(doc.baseline['6']!)).toBe(flagged.account_count)
  })

  it('still accepts a null demographic cell', () => {
    const raw = fixture()
    const rows = raw.districts as Record<string, unknown>[]
    rows[0]!.unemployment_rate_2023 = null
    const doc = parseAtlasDoc(raw)
    expect(doc.districts[0]!.unemployment_rate_2023).toBeNull()
    expect(doc.districts[0]!.average_salary).toBe(15000)
  })

  it('maps every account exactly once per district', () => {
    const doc = parsed()
    const perDistrict = new Map<number, number>()
    for (const districtId of Object.values(doc.account_district)) {
      perDistrict.set(districtId, (perDistrict.get(districtId) ?? 0) + 1)
    }
    for (const row of doc.districts) {
      expect(perDistrict.get(row.district_id)).toBe(row.account_count)
    }
  })
})

describe('parseAtlasDoc: refusals that name the field', () => {
  it('refuses a different schema version', () => {
    const raw = fixture()
    raw.schema_version = 2
    expect(() => parseAtlasDoc(raw)).toThrow(/schema_version must be 1/)
  })

  it('refuses a missing or unexpected top level key', () => {
    const missing = fixture()
    delete missing.scenarios
    expect(() => parseAtlasDoc(missing)).toThrow(/missing scenarios/)

    const extra = fixture()
    extra.extra_block = {}
    expect(() => parseAtlasDoc(extra)).toThrow(/unexpected extra_block/)
  })

  it('refuses a band list that is not the five ids in ladder order', () => {
    const swapped = fixture()
    swapped.verdict_bands = ['storm_warning', 'critical', 'watch', 'fair_skies', 'clear']
    expect(() => parseAtlasDoc(swapped)).toThrow(/five verdict bands in ladder order/)

    const both = fixture()
    both.states = (both.verdict_bands as string[]).slice()
    expect(() => parseAtlasDoc(both)).toThrow(/one band list key/)

    const neither = fixture()
    delete neither.verdict_bands
    expect(() => parseAtlasDoc(neither)).toThrow(/missing its band list key/)
  })

  it('refuses a count object whose keys are not exactly the five bands', () => {
    const raw = fixture()
    const split = raw.baseline as Record<string, Record<string, number>>
    split['1']!.clearCount = 20
    expect(() => parseAtlasDoc(raw)).toThrow(/unexpected clearCount/)
  })

  it('refuses a negative count', () => {
    const raw = fixture()
    const split = raw.baseline as Record<string, Record<string, number>>
    split['2']!.critical = -1
    expect(() => parseAtlasDoc(raw)).toThrow(/must not be negative, got -1/)
  })

  it('refuses counts that do not sum to the district account_count', () => {
    const raw = fixture()
    const split = raw.baseline as Record<string, Record<string, number>>
    split['1']!.critical = 7
    expect(() => parseAtlasDoc(raw)).toThrow(/baseline\[1\] band counts sum to 61/)
  })

  it('refuses a baseline missing a district or inventing one', () => {
    const missing = fixture()
    delete (missing.baseline as Record<string, unknown>)['7']
    expect(() => parseAtlasDoc(missing)).toThrow(/missing 7/)

    const extra = fixture()
    ;(extra.baseline as Record<string, unknown>)['99'] = counts(0, 0, 0, 0, 0)
    expect(() => parseAtlasDoc(extra)).toThrow(/unexpected 99/)
  })

  it('refuses a scenario that is not a shipped preset id', () => {
    const raw = fixture()
    const scenarios = raw.scenarios as Record<string, unknown>
    scenarios.overtime = scenarios.layoff
    delete scenarios.layoff
    expect(() => parseAtlasDoc(raw)).toThrow(/not a shipped shock preset id/)
  })

  it('refuses a scenarios block that is not exactly the four preset tables', () => {
    const subset = fixture()
    delete (subset.scenarios as Record<string, unknown>).combo
    expect(() => parseAtlasDoc(subset)).toThrow(
      /all four shipped preset tables, missing combo/,
    )

    const trimmed = fixture()
    const scenarios = trimmed.scenarios as Record<string, unknown>
    delete scenarios.cost_spike
    delete scenarios.emergency_repair
    expect(() => parseAtlasDoc(trimmed)).toThrow(/missing cost_spike, emergency_repair/)
  })

  it('refuses an account mapped to a district that does not exist', () => {
    const raw = fixture()
    const mapping = raw.account_district as Record<string, number>
    mapping['10001'] = 99
    expect(() => parseAtlasDoc(raw)).toThrow(/must name a district in districts, got 99/)
  })

  it('refuses an account map that disagrees with account_count', () => {
    const raw = fixture()
    const mapping = raw.account_district as Record<string, number>
    delete mapping['10001']
    expect(() => parseAtlasDoc(raw)).toThrow(/maps 59 accounts to district 1/)
  })

  it('refuses duplicate district ids and malformed district cells', () => {
    const duplicate = fixture()
    const rows = duplicate.districts as Record<string, unknown>[]
    rows[1]!.district_id = 1
    expect(() => parseAtlasDoc(duplicate)).toThrow(/district_id must be unique/)

    const badFlag = fixture()
    ;(badFlag.districts as Record<string, unknown>[])[0]!.no_data = 'true'
    expect(() => parseAtlasDoc(badFlag)).toThrow(/no_data must be a boolean/)

    const badNumber = fixture()
    ;(badNumber.districts as Record<string, unknown>[])[0]!.unemployment_rate_2023 = '4.5'
    expect(() => parseAtlasDoc(badNumber)).toThrow(/finite number or null/)
  })
})

describe('districtSeverity and binFor: the legend math', () => {
  it('is the critical plus storm warning share of the district accounts', () => {
    expect(districtSeverity(counts(6, 4, 10, 20, 20))).toBeCloseTo(10 / 60, 10)
    expect(districtSeverity(counts(0, 0, 5, 15, 20))).toBe(0)
    // A district with nothing to count reports zero, never a division error.
    expect(districtSeverity(counts(0, 0, 0, 0, 0))).toBe(0)
    expect(SEVERITY_DEFINITION).toContain('critical plus storm warning share')
  })

  it('bands a share into exactly five bins at the printed boundaries', () => {
    expect(binFor(0)).toBe(0)
    expect(binFor(0.0001)).toBe(1)
    expect(binFor(0.05)).toBe(1)
    expect(binFor(0.051)).toBe(2)
    expect(binFor(0.15)).toBe(2)
    expect(binFor(0.151)).toBe(3)
    expect(binFor(0.4)).toBe(3)
    expect(binFor(0.401)).toBe(4)
    expect(binFor(1.5)).toBe(4)
    expect(binFor(Number.NaN)).toBe(0)
    expect(binFor(-3)).toBe(0)
  })

  it('reuses the five band colors, low severity to high, for the bins', () => {
    expect(SEVERITY_BINS.map((entry) => entry.bin)).toEqual([0, 1, 2, 3, 4])
    expect(SEVERITY_BINS.map((entry) => entry.band)).toEqual([
      'clear',
      'fair_skies',
      'watch',
      'storm_warning',
      'critical',
    ])
    expect(SEVERITY_BINS.map((entry) => entry.range)).toEqual([
      'exactly 0%',
      'over 0 to 5%',
      'over 5 to 15%',
      'over 15 to 40%',
      'over 40%',
    ])
    const bins = [0, 1, 2, 3, 4] as const
    expect(bins.map((bin) => bandForBin(bin))).toEqual([
      'clear',
      'fair_skies',
      'watch',
      'storm_warning',
      'critical',
    ])
  })

  it('totals a counts object over the five bands', () => {
    expect(bandTotal(counts(6, 4, 10, 20, 20))).toBe(60)
  })
})

describe('regionsGrouped: region bands, not geography', () => {
  it('groups districts by region, alphabetical in both directions', () => {
    const doc = parsed()
    const groups = regionsGrouped(doc)
    expect(groups.map((group) => group.region)).toEqual(['Central', 'North', 'South'])
    expect(groups[0]!.districts.map((row) => row.district_name)).toEqual(['Copeland', 'Dunmore'])
    expect(groups[1]!.districts.map((row) => row.district_name)).toEqual(['Ashfield', 'Brookline'])
    // The file lists Eastgate, Fairview, Alderwood: grouping must sort them.
    expect(groups[2]!.districts.map((row) => row.district_name)).toEqual([
      'Alderwood',
      'Eastgate',
      'Fairview',
    ])
    expect(groups[2]!.districts.map((row) => row.district_id)).toEqual([7, 5, 6])
  })

  it('carries the no_data flag through the grouping', () => {
    const groups = regionsGrouped(parsed())
    const flagged = groups
      .flatMap((group) => group.districts)
      .filter((row) => row.no_data)
    expect(flagged.map((row) => row.district_name)).toEqual(['Fairview'])
    expect(flagged[0]!.account_count).toBe(60)
  })

  it('renders safely with no document at all', () => {
    expect(regionsGrouped(null)).toEqual([])
    expect(regionsGrouped(undefined)).toEqual([])
  })
})
