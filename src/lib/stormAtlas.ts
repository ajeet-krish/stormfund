import type { AccountProfile } from '../data/profiles'
import { SHOCK_PRESETS } from './shockPresets'
import {
  IDLE_TWIST,
  RUNWAY_CAP_DECI_MONTHS,
  applyTwist,
  normalizeTwist,
  roundHalfUp,
  sameTwist,
  type RunwayState,
  type Twist,
} from './shocks'
import { VERDICT_BANDS, verdictBand, type VerdictBandId } from './verdict'

/**
 * Phase E5 Storm Atlas aggregation: count a population of accounts by
 * verdict band under one twist, and build the headline the pitch opens
 * with, for example "10% of accounts would have under 3 months of
 * runway under the laid off twist".
 *
 * The fold is done in this file: the seven state ladder in
 * src/lib/weatherState.ts is deleted, and verdict.ts owns every band
 * id, label, glyph, and threshold. The atlas counts, the console
 * badge, and the forecast strip therefore read one vocabulary and can
 * never disagree about where a band boundary sits.
 *
 * Honesty rule, structural: scenario wording enters a summary only
 * through shockedAtlasScenario, the same call that ran applyTwist over
 * every profile, so a sentence can never claim a twist the numbers did
 * not run. AtlasSection is the production caller and passes the pair
 * together.
 *
 * Pure module: no React, no fetch, no artifact reads. Counts are
 * integers, whole percents come from roundHalfUp and may not sum to
 * 100, and no float ever decides a branch.
 */

/** One atlas row: an account id plus the runway answer it lands on. */
export interface AtlasEntry {
  account_id: string
  runway_state: RunwayState
  runway_deci_months: number
}

/** Count or percent per band, keyed by the canonical band union. */
export type BandCounts = Record<VerdictBandId, number>

export type BandPercents = Record<VerdictBandId, number>

/** Ladder order, lowest runway first, straight from verdict.ts. */
export const ATLAS_BAND_ORDER: readonly VerdictBandId[] = VERDICT_BANDS.map((band) => band.id)

/** The headline counts the two bands under the confirmed threshold. */
export const DEFAULT_HEADLINE_BANDS: readonly VerdictBandId[] = ['critical', 'storm_warning']

/** The user confirmed headline threshold, in plain words (docs/decisions.md). */
export const DEFAULT_HEADLINE_THRESHOLD_WORDS = '3 months'

/** Default scenario wording: only a caller that ran a twist says otherwise. */
export const DEFAULT_SCENARIO_LABEL = 'at baseline'

export interface StormAtlasSummary {
  /** Entries counted, the population under the caller's scenario. */
  total: number
  /** Accounts per band, integers. */
  counts: BandCounts
  /** Whole percent per band, roundHalfUp, may not sum to 100. */
  percents: BandPercents
  /** The bands the headline speaks about. */
  headlineBands: readonly VerdictBandId[]
  /** The threshold sentence the headline quotes, for example 3 months. */
  headlineThresholdWords: string
  /** Accounts across those bands. */
  headlineCount: number
  /** Whole percent of the population in those bands. */
  headlinePercent: number
  /** "1 in N" over the whole population, null when the count is 0. */
  oneInN: number | null
  /** The working sentence, ready to render. */
  headline: string
  /** What the numbers ran under, printed at the end of the headline. */
  scenarioLabel: string
}

export interface StormAtlasOptions {
  /** Bands the headline reports, default the two under 3 months. */
  headlineBands?: readonly VerdictBandId[]
  /** Threshold words the headline quotes, default 3 months. */
  headlineThresholdWords?: string
  /**
   * Scenario suffix, default the honest baseline wording. Callers pass
   * scenario.scenarioLabel from shockedAtlasScenario, never prose of
   * their own, which is what keeps the sentence honest by construction.
   */
  scenarioLabel?: string
}

/** All zero counts, in canonical ladder order. */
export function emptyBandCounts(): BandCounts {
  const counts = {} as BandCounts
  for (const band of ATLAS_BAND_ORDER) {
    counts[band] = 0
  }
  return counts
}

function emptyBandPercents(): BandPercents {
  const percents = {} as BandPercents
  for (const band of ATLAS_BAND_ORDER) {
    percents[band] = 0
  }
  return percents
}

/**
 * Clamp one runway reading to the artifact range the E1 loader
 * enforces (0 to 1200 tenths). A non finite reading reads 0, which
 * lands on Critical: unknown data must never render as clear skies.
 */
export function clampDeciMonths(raw: number): number {
  if (!Number.isFinite(raw)) {
    return 0
  }
  return Math.min(RUNWAY_CAP_DECI_MONTHS, Math.max(0, raw))
}

/**
 * One entry's band through the single verdict vocabulary: the two
 * special runway states are decided before any threshold, exactly as
 * verdictBand reads a RunwayAnswer, so an atlas count can never
 * disagree with the badge next to it.
 */
export function entryBand(entry: AtlasEntry): VerdictBandId {
  return verdictBand({
    state: entry.runway_state,
    deciMonths: clampDeciMonths(entry.runway_deci_months),
  }).id
}

/**
 * Count a population once. Null, undefined, and empty arrays
 * aggregate to a zero summary with an honest placeholder headline, so
 * the atlas can mount before the loader resolves.
 */
export function summarizeStormAtlas(
  entries: readonly AtlasEntry[] | null | undefined,
  options: StormAtlasOptions = {},
): StormAtlasSummary {
  const list = entries ?? []
  const headlineBands = options.headlineBands ?? DEFAULT_HEADLINE_BANDS
  const headlineThresholdWords = options.headlineThresholdWords ?? DEFAULT_HEADLINE_THRESHOLD_WORDS
  const scenarioLabel = options.scenarioLabel ?? DEFAULT_SCENARIO_LABEL

  const counts = emptyBandCounts()
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    counts[entryBand(entry)] += 1
  }

  // Total is the sum of the counts, so a defensively skipped row can
  // never inflate the population the percents divide by.
  let total = 0
  for (const band of ATLAS_BAND_ORDER) {
    total += counts[band]
  }

  const percents = emptyBandPercents()
  if (total > 0) {
    for (const band of ATLAS_BAND_ORDER) {
      percents[band] = roundHalfUp(counts[band] * 100, total)
    }
  }

  let headlineCount = 0
  for (const band of headlineBands) {
    if (ATLAS_BAND_ORDER.includes(band)) {
      headlineCount += counts[band]
    }
  }
  const headlinePercent =
    total > 0 && headlineCount > 0 ? roundHalfUp(headlineCount * 100, total) : 0
  const oneInN = headlineCount > 0 ? roundHalfUp(total, headlineCount) : null
  const headline = headlineSentence(
    total,
    headlineCount,
    headlinePercent,
    headlineThresholdWords,
    scenarioLabel,
  )

  return {
    total,
    counts,
    percents,
    headlineBands,
    headlineThresholdWords,
    headlineCount,
    headlinePercent,
    oneInN,
    headline,
    scenarioLabel,
  }
}

/**
 * The working sentence, word for word. Empty population reads as not
 * wired yet, a band that never fires reports an honest zero instead of
 * a ratio, and the verb swaps to "would have" the moment the numbers
 * ran under a twist instead of at baseline.
 */
function headlineSentence(
  total: number,
  headlineCount: number,
  headlinePercent: number,
  headlineThresholdWords: string,
  scenarioLabel: string,
): string {
  if (total === 0) {
    return 'No accounts in the atlas yet'
  }
  const verb = scenarioLabel === DEFAULT_SCENARIO_LABEL ? 'have' : 'would have'
  const threshold = `under ${headlineThresholdWords} of runway`
  if (headlineCount === 0) {
    return `No accounts ${verb} ${threshold} ${scenarioLabel}`
  }
  return `${headlinePercent}% of accounts ${verb} ${threshold} ${scenarioLabel}`
}

/**
 * Drill down helper: the account ids behind one band, in the order
 * the caller passed them. The atlas never navigates, it only reports
 * which ids sit in a band; the view owns what a click means.
 */
export function accountsInBand(
  entries: readonly AtlasEntry[] | null | undefined,
  band: VerdictBandId,
): readonly string[] {
  const list = entries ?? []
  const ids: string[] = []
  for (const entry of list) {
    if (entry && typeof entry === 'object' && entryBand(entry) === band) {
      ids.push(entry.account_id)
    }
  }
  return ids
}

/** One scenario: the shocked rows plus the wording that describes them. */
export interface AtlasScenario {
  entries: readonly AtlasEntry[]
  scenarioLabel: string
}

/**
 * Run one twist over every profile and hand back the rows and the
 * wording as one object. This is the only source of scenario wording
 * in the atlas: the label is derived from the same twist whose
 * applyTwist results are in entries, so the sentence and the numbers
 * cannot drift apart.
 */
export function shockedAtlasScenario(
  profiles: readonly AccountProfile[] | null | undefined,
  twist: Twist,
): AtlasScenario {
  const list = profiles ?? []
  const entries: AtlasEntry[] = new Array(list.length)
  for (let index = 0; index < list.length; index += 1) {
    const profile = list[index]
    if (!profile) {
      continue
    }
    const answer = applyTwist(profile, twist).runway
    entries[index] = {
      account_id: profile.account_id,
      runway_state: answer.state,
      runway_deci_months: answer.deciMonths,
    }
  }
  return { entries, scenarioLabel: atlasScenarioLabel(twist) }
}

/**
 * The wording for one twist, in priority order: untouched console
 * reads as baseline, a field for field preset match quotes that
 * preset's own label, and anything else is honestly called custom.
 * Deliberately not exported: prose about a scenario enters the atlas
 * only through shockedAtlasScenario.
 */
function atlasScenarioLabel(twist: Twist): string {
  if (sameTwist(twist, IDLE_TWIST)) {
    return DEFAULT_SCENARIO_LABEL
  }
  const normalized = normalizeTwist(twist)
  for (const preset of SHOCK_PRESETS) {
    if (sameTwist(normalizeTwist(preset.twist), normalized)) {
      return `under the ${preset.label.toLowerCase()} twist`
    }
  }
  return 'under the custom twist'
}
