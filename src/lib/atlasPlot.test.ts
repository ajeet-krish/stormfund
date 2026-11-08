import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseProfilesArtifact } from '../data/profiles'
import { IDLE_TWIST } from './shocks'
import {
  emptyBandCounts,
  shockedAtlasScenario,
  summarizeStormAtlas,
  type AtlasEntry,
} from './stormAtlas'
import {
  ATLAS_BIN_BANDS,
  ATLAS_BIN_COUNT,
  ATLAS_BIN_SPECS,
  ATLAS_DOT_H,
  ATLAS_DOT_TOP,
  ATLAS_PAD_X,
  ATLAS_PLOT_W,
  ATLAS_TICK_LABELS,
  buildAtlasPlot,
  binIndexFor,
  jitterFor,
} from './atlasPlot'

/**
 * The strip plot geometry: a pinned golden hash, the integer bin
 * ladder at the verdict thresholds, conservation over the shipped
 * artifact (4,500 dots, one per account, bin sums and band sums
 * inside every bin), the boundary table, clamping, and the cap bin
 * that collects every reading at 120 months and up.
 */

function entry(
  account_id: string,
  runway_state: AtlasEntry['runway_state'],
  runway_deci_months: number,
): AtlasEntry {
  return { account_id, runway_state, runway_deci_months }
}

const artifact = parseProfilesArtifact(
  JSON.parse(
    readFileSync(new URL('../../public/data/engine/profiles.json', import.meta.url), 'utf8'),
  ),
)
const shippedProfiles = Object.values(artifact.profiles)

describe('jitterFor: deterministic placement', () => {
  it('pins one golden value for account 68257', () => {
    // FNV-1a of '68257' scaled by 2^32, pinned so a refactor of the
    // hash can never silently move every dot on the strip.
    expect(jitterFor('68257')).toBe(2756683695 / 4294967296)
    expect(jitterFor('68257')).toBe(0.6418404390569776)
    expect(jitterFor('68257')).toBe(jitterFor('68257'))
  })

  it('stays inside the unit interval and separates accounts', () => {
    const seen = new Set<number>()
    for (let index = 0; index < 200; index += 1) {
      const value = jitterFor(`id-${index}`)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      seen.add(value)
    }
    expect(seen.size).toBe(200)
  })
})

describe('bin ladder: integer edges at the verdict thresholds', () => {
  it('maps every boundary in the table to its bin', () => {
    const table: readonly (readonly [number, number])[] = [
      [9, 0],
      [10, 1],
      [29, 1],
      [30, 2],
      [59, 2],
      [60, 3],
      [119, 3],
      [120, 4],
      [1199, 4],
      [1200, 5],
    ]
    for (const [deci, expected] of table) {
      expect(binIndexFor(deci), `deci ${deci}`).toBe(expected)
    }
  })

  it('ships six bins with the printed month labels and one overflow', () => {
    expect(ATLAS_BIN_COUNT).toBe(6)
    expect(ATLAS_BIN_SPECS).toHaveLength(6)
    expect(ATLAS_BIN_SPECS.map((spec) => spec.label)).toEqual([
      '0 to 1',
      '1 to 3',
      '3 to 6',
      '6 to 12',
      '12 to 120',
      '120+',
    ])
    expect(ATLAS_BIN_SPECS.map((spec) => [spec.loDeci, spec.hiDeci])).toEqual([
      [0, 10],
      [10, 30],
      [30, 60],
      [60, 120],
      [120, 1200],
      [1200, 1200],
    ])
    const overflow = ATLAS_BIN_SPECS.filter((spec) => spec.overflow)
    expect(overflow).toHaveLength(1)
    expect(overflow[0]?.label).toBe('120+')
    expect([...ATLAS_TICK_LABELS]).toEqual(['0', '1', '3', '6', '12', '120', '120+'])
  })

  it('tints each segment with the band its edges belong to', () => {
    expect([...ATLAS_BIN_BANDS]).toEqual([
      'critical',
      'storm_warning',
      'watch',
      'fair_skies',
      'clear',
      'clear',
    ])
    expect(ATLAS_BIN_BANDS).toHaveLength(ATLAS_BIN_COUNT)
  })
})

describe('buildAtlasPlot: conservation and placement', () => {
  const fixture: readonly AtlasEntry[] = [
    entry('10001', 'buffer_depleted', 0),
    entry('10002', 'finite', 9),
    entry('10003', 'finite', 10),
    entry('10004', 'finite', 30),
    entry('10005', 'finite', 60),
    entry('10006', 'finite', 120),
    entry('10007', 'finite', 1199),
    entry('10008', 'finite', 1200),
    entry('10009', 'no_shortfall', 1200),
  ]
  const plot = buildAtlasPlot(fixture)

  it('places every id exactly once and keeps the bin sums whole', () => {
    expect(plot.total).toBe(9)
    expect(plot.dots).toHaveLength(9)
    expect(new Set(plot.dots.map((dot) => dot.account_id)).size).toBe(9)
    expect(plot.bins).toHaveLength(6)
    const binSum = plot.bins.reduce((acc, bin) => acc + bin.count, 0)
    expect(binSum).toBe(plot.total)
    for (const bin of plot.bins) {
      const bandSum = Object.values(bin.countsByBand).reduce((acc, count) => acc + count, 0)
      expect(bandSum, bin.label).toBe(bin.count)
    }
    expect(plot.capBin).toBe(plot.bins[5])
  })

  it('clamps readings to the artifact range and reads unknown as zero', () => {
    const messy = buildAtlasPlot([
      entry('20001', 'finite', -50),
      entry('20002', 'finite', 5000),
      entry('20003', 'finite', Number.NaN),
      entry('20004', 'finite', Number.POSITIVE_INFINITY),
    ])
    const byId = new Map(messy.dots.map((dot) => [dot.account_id, dot]))
    expect(byId.get('20001')?.deciMonths).toBe(0)
    expect(byId.get('20002')?.deciMonths).toBe(1200)
    expect(byId.get('20003')?.deciMonths).toBe(0)
    expect(byId.get('20004')?.deciMonths).toBe(0)
    // The unknown readings land on Critical, never on clear skies.
    expect(byId.get('20003')?.band).toBe('critical')
    expect(messy.bins[0]?.count).toBe(3)
    expect(messy.capBin.count).toBe(1)
  })

  it('collects every capped reading in the overflow bin, spread by hash', () => {
    const capped = plot.bins[5]
    expect(capped?.overflow).toBe(true)
    expect(capped?.loDeci).toBe(1200)
    expect(capped?.hiDeci).toBe(1200)
    expect(capped?.count).toBe(2)
    expect(plot.bins[4]?.count).toBe(2)

    const cappedDots = plot.dots.filter((dot) => dot.deciMonths === 1200)
    expect(cappedDots.map((dot) => dot.account_id)).toEqual(['10008', '10009'])
    // Both sit inside segment six, and the hash pulls them apart.
    const segmentStart = ATLAS_PAD_X + (5 / 6) * ATLAS_PLOT_W
    for (const dot of cappedDots) {
      expect(dot.x).toBeGreaterThanOrEqual(segmentStart)
      expect(dot.x).toBeLessThan(ATLAS_PAD_X + ATLAS_PLOT_W)
    }
    expect(cappedDots[0]?.x).not.toBe(cappedDots[1]?.x)
  })

  it('bands every dot through the single verdict ladder', () => {
    const byId = new Map(plot.dots.map((dot) => [dot.account_id, dot]))
    expect(byId.get('10001')?.band).toBe('critical')
    expect(byId.get('10002')?.band).toBe('critical')
    expect(byId.get('10003')?.band).toBe('storm_warning')
    expect(byId.get('10004')?.band).toBe('watch')
    expect(byId.get('10005')?.band).toBe('fair_skies')
    expect(byId.get('10006')?.band).toBe('clear')
    expect(byId.get('10009')?.band).toBe('clear')
  })

  it('keeps every dot inside the viewBox field, whatever the reading', () => {
    for (const dot of plot.dots) {
      expect(dot.x).toBeGreaterThanOrEqual(ATLAS_PAD_X)
      expect(dot.x).toBeLessThanOrEqual(ATLAS_PAD_X + ATLAS_PLOT_W)
      expect(dot.y).toBeGreaterThanOrEqual(ATLAS_DOT_TOP)
      expect(dot.y).toBeLessThan(ATLAS_DOT_TOP + ATLAS_DOT_H)
    }
  })

  it('reads null and undefined as an empty plot', () => {
    for (const input of [null, undefined]) {
      const empty = buildAtlasPlot(input as AtlasEntry[] | null | undefined)
      expect(empty.total).toBe(0)
      expect(empty.dots).toHaveLength(0)
      expect(empty.capBin.count).toBe(0)
    }
  })
})

describe('the shipped artifact: 4,500 dots', () => {
  const entries = shockedAtlasScenario(shippedProfiles, IDLE_TWIST).entries
  const plot = buildAtlasPlot(entries)

  it('draws one dot per account, each id exactly once', () => {
    expect(plot.total).toBe(4500)
    expect(plot.dots).toHaveLength(4500)
    const ids = plot.dots.map((dot) => dot.account_id).sort()
    expect(ids).toEqual([...shippedProfiles.map((profile) => profile.account_id)].sort())
  })

  it('conserves every account across the six bins', () => {
    const binSum = plot.bins.reduce((acc, bin) => acc + bin.count, 0)
    expect(binSum).toBe(4500)
    for (const bin of plot.bins) {
      const bandSum = Object.values(bin.countsByBand).reduce((acc, count) => acc + count, 0)
      expect(bandSum, bin.label).toBe(bin.count)
    }
    expect(plot.capBin.count).toBe(plot.bins[5]?.count)
  })

  it('agrees band for band with the headline summary', () => {
    const summary = summarizeStormAtlas(entries)
    const fromDots = emptyBandCounts()
    for (const dot of plot.dots) {
      fromDots[dot.band] += 1
    }
    expect(fromDots).toEqual(summary.counts)
  })
})
