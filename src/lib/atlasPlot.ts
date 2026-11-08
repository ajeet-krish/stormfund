import {
  clampDeciMonths,
  emptyBandCounts,
  entryBand,
  type AtlasEntry,
  type BandCounts,
} from './stormAtlas'
import type { VerdictBandId } from './verdict'

/**
 * The Storm Atlas strip plot geometry (E5): pure functions that turn
 * one population of entries into positioned dots plus six month bins,
 * so the component only draws what this module decided.
 *
 * The axis is piecewise, not linear: six equal width segments whose
 * edges are the verdict band edges in tenths of a month (1, 3, 6, 12,
 * and the 120 month cap), because a linear axis would squash every
 * account under three months into the first two percent of the strip
 * where the pitch lives. Segment five is the cap bin: it holds every
 * account at 120 months and up, and those dots spread by hash instead
 * of by value.
 *
 * Placement is deterministic: a FNV-1a hash of the account id picks
 * the vertical slot (and the horizontal spread inside the cap bin),
 * so the same account lands on the same pixel across renders, filter
 * passes, and machines. The golden test pins one exact value.
 *
 * Pure module: no React, no DOM, no artifact reads. Bands come from
 * verdictBand through stormAtlas's entryBand, the single vocabulary.
 */

/** One account on the plot, already positioned in viewBox units. */
export interface AtlasDot {
  account_id: string
  band: VerdictBandId
  /** Clamped reading in tenths of a month, 0 to 1200. */
  deciMonths: number
  x: number
  y: number
}

/** One month bin: a label, its integer deci edges, and its counts. */
export interface AtlasBin {
  label: string
  loDeci: number
  hiDeci: number
  /** True for the cap bin, whose edges both read 1200. */
  overflow: boolean
  count: number
  countsByBand: BandCounts
}

export interface AtlasPlot {
  /** Every account, in caller order, positioned once. */
  dots: AtlasDot[]
  /** Exactly six bins; index 5 is the overflow cap bin. */
  bins: AtlasBin[]
  /** Dots drawn, equal to the entries counted. */
  total: number
  /** The cap bin, handed over so the view never indexes for it. */
  capBin: AtlasBin
}

/** Bin edges and labels in tenths of a month, mirroring verdict.ts. */
export interface AtlasBinSpec {
  label: string
  loDeci: number
  hiDeci: number
  overflow: boolean
}

/**
 * The six segments: five verdict band edges plus the cap split, so
 * the printed labels read as months while the edges stay integers.
 */
export const ATLAS_BIN_SPECS: readonly AtlasBinSpec[] = [
  { label: '0 to 1', loDeci: 0, hiDeci: 10, overflow: false },
  { label: '1 to 3', loDeci: 10, hiDeci: 30, overflow: false },
  { label: '3 to 6', loDeci: 30, hiDeci: 60, overflow: false },
  { label: '6 to 12', loDeci: 60, hiDeci: 120, overflow: false },
  { label: '12 to 120', loDeci: 120, hiDeci: 1200, overflow: false },
  { label: '120+', loDeci: 1200, hiDeci: 1200, overflow: true },
]

/** The bin count every layout and test agrees on. */
export const ATLAS_BIN_COUNT = 6

/** Tick labels: one per bin edge plus the cap marker at the far end. */
export const ATLAS_TICK_LABELS: readonly string[] = [
  '0',
  '1',
  '3',
  '6',
  '12',
  '120',
  '120+',
]

/**
 * The band each segment tints with, in bin order. The cap bin reads
 * as Clear too, so the last two segments share one hue and the split
 * shows as a tick, not as a new color.
 */
export const ATLAS_BIN_BANDS: readonly VerdictBandId[] = [
  'critical',
  'storm_warning',
  'watch',
  'fair_skies',
  'clear',
  'clear',
]

/** viewBox width and height for every surface that draws the plot. */
export const ATLAS_VIEW_W = 960
export const ATLAS_VIEW_H = 240

/** Left and right margin inside the viewBox, in viewBox units. */
export const ATLAS_PAD_X = 40

/** The drawn axis width between the margins (40 to 880). */
export const ATLAS_PLOT_W = 800

/** Silhouette bars grow up from ATLAS_DOT_TOP, their bar baseline, scaled by ATLAS_BAR_MAX_H. */
export const ATLAS_BAR_TOP = 8
export const ATLAS_BAR_MAX_H = 36

/** The dot field: vertical jitter spans this band of the viewBox. */
export const ATLAS_DOT_TOP = 58
export const ATLAS_DOT_H = 138

/** Axis line, tick baseline, and the unit note on the tick row. */
export const ATLAS_AXIS_Y = 202
export const ATLAS_TICK_Y = 218
export const ATLAS_UNIT_X = 890

/**
 * FNV-1a over UTF-16 code units, scaled to a unit fraction in [0, 1).
 * Deterministic across runs and platforms, which is what lets a dot
 * keep its place between renders and lets the golden test pin one
 * exact value: jitterFor('68257') is 2756683695 over 2^32.
 */
function hash01(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) / 0x100000000
}

/** The horizontal spread for one account, in [0, 1), pinned by test. */
export function jitterFor(accountId: string): number {
  return hash01(accountId)
}

/** Vertical slot for one account, in [0, 1), salted so it never mirrors x. */
function verticalFor(accountId: string): number {
  return hash01(`${accountId}:y`)
}

/**
 * Bin index for one clamped reading: integer ladder only, edges
 * exactly the verdict thresholds, and the cap itself falls into the
 * overflow bin rather than the last regular one.
 */
export function binIndexFor(deciMonths: number): number {
  if (deciMonths >= 1200) {
    return 5
  }
  if (deciMonths >= 120) {
    return 4
  }
  if (deciMonths >= 60) {
    return 3
  }
  if (deciMonths >= 30) {
    return 2
  }
  if (deciMonths >= 10) {
    return 1
  }
  return 0
}

/**
 * Position every entry once: band from the single verdict ladder,
 * reading clamped to the artifact range, x from the piecewise axis
 * (hash spread inside the cap bin), y from the salted hash. Invalid
 * rows are skipped the same way summarizeStormAtlas skips them, so
 * the plot and the headline count the same population.
 */
export function buildAtlasPlot(
  entries: readonly AtlasEntry[] | null | undefined,
): AtlasPlot {
  const list = entries ?? []
  const bins: AtlasBin[] = ATLAS_BIN_SPECS.map((spec) => ({
    label: spec.label,
    loDeci: spec.loDeci,
    hiDeci: spec.hiDeci,
    overflow: spec.overflow,
    count: 0,
    countsByBand: emptyBandCounts(),
  }))
  // The map above always builds one bin per spec, so the cap bin is
  // present even though indexed access is typed as optional.
  const capBin = bins[ATLAS_BIN_COUNT - 1] as AtlasBin

  const dots: AtlasDot[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const deciMonths = clampDeciMonths(entry.runway_deci_months)
    const band = entryBand(entry)
    const binIndex = binIndexFor(deciMonths)
    const bin = bins[binIndex]
    if (!bin) {
      continue
    }
    bin.count += 1
    bin.countsByBand[band] += 1

    const localT = bin.overflow
      ? jitterFor(entry.account_id)
      : (deciMonths - bin.loDeci) / (bin.hiDeci - bin.loDeci)
    dots.push({
      account_id: entry.account_id,
      band,
      deciMonths,
      x: ATLAS_PAD_X + ((binIndex + localT) / ATLAS_BIN_COUNT) * ATLAS_PLOT_W,
      y: ATLAS_DOT_TOP + verticalFor(entry.account_id) * ATLAS_DOT_H,
    })
  }

  return { dots, bins, total: dots.length, capBin }
}
