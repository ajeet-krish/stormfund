import { roundHalfUp } from './shocks'
import {
  SEVERITY_ORDER,
  WEATHER_META,
  WEATHER_STATES,
  weatherState,
  type WeatherMetrics,
  type WeatherState,
} from './weatherState'

/**
 * Phase E5 Storm Atlas aggregation: count every profile's weather state
 * and build the population headline the pitch opens with, for example
 * "1 in 5 accounts hits storm warning under the standard EI twist".
 *
 * The counting is fully implemented because it is simple integer work:
 * each entry's state comes from the same weatherState ladder the
 * forecast strip draws (one vocabulary, one parity contract), counts are
 * integers, and whole percents are integer divisions rounded half up.
 * The headline sentence is a working template: callers that pass
 * baseline metrics get the honest "at baseline" wording, and callers
 * that pass metrics already shocked by applyTwist pass the matching
 * scenario label, so the sentence can never claim a twist the numbers
 * did not run.
 *
 * Pure module: no React, no fetch, no artifact reads. The E5 view feeds
 * it the profiles the loader already parsed.
 */

/** One atlas row: a profile id plus the metrics the ladder reads. */
export interface AtlasEntry extends WeatherMetrics {
  account_id: string
}

/** Count or percent per state, keyed by the canonical state union. */
export type WeatherCounts = Record<WeatherState, number>

export interface StormAtlasSummary {
  /** Entries counted (the population under the caller's scenario). */
  total: number
  /** Accounts per weather state, integers. */
  counts: WeatherCounts
  /** Whole percent per state (rounding may drift a point across states). */
  percents: WeatherPercents
  /** The state the headline speaks about. */
  headlineState: WeatherState
  /** Accounts in that state. */
  headlineCount: number
  /** "1 in N" divisor over the whole population, null when the count is 0. */
  oneInN: number | null
  /** The working template sentence, ready to render. */
  headline: string
  /** What the numbers ran under, printed at the end of the headline. */
  scenarioLabel: string
}

export type WeatherPercents = Record<WeatherState, number>

export interface StormAtlasOptions {
  /** State the headline reports, default storm (the warning vocabulary). */
  headlineState?: WeatherState
  /** Scenario suffix, default honest baseline wording. */
  scenarioLabel?: string
}

/** Default headline state: the storm warning the pitch quotes. */
export const DEFAULT_HEADLINE_STATE: WeatherState = 'storm'

/** Default scenario wording: only a caller that ran a twist says otherwise. */
export const DEFAULT_SCENARIO_LABEL = 'at baseline'

/** All zero counts, in canonical key order. */
export function emptyCounts(): WeatherCounts {
  const counts = {} as WeatherCounts
  for (const state of WEATHER_STATES) {
    counts[state] = 0
  }
  return counts
}

function emptyPercents(): WeatherPercents {
  const percents = {} as WeatherPercents
  for (const state of WEATHER_STATES) {
    percents[state] = 0
  }
  return percents
}

/**
 * Count every entry's weather state once. Null, undefined, and empty
 * arrays aggregate to a zero summary with an honest placeholder
 * headline, so the atlas grid can mount before the loader resolves.
 */
export function summarizeStormAtlas(
  entries: readonly AtlasEntry[] | null | undefined,
  options: StormAtlasOptions = {},
): StormAtlasSummary {
  const list = entries ?? []
  const headlineState = options.headlineState ?? DEFAULT_HEADLINE_STATE
  const scenarioLabel = options.scenarioLabel ?? DEFAULT_SCENARIO_LABEL

  const counts = emptyCounts()
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    counts[weatherState(entry)] += 1
  }

  // Total is the sum of the counts, so a defensively skipped entry can
  // never inflate the population the percents divide by.
  let total = 0
  for (const state of WEATHER_STATES) {
    total += counts[state]
  }
  const percents = emptyPercents()
  if (total > 0) {
    for (const state of WEATHER_STATES) {
      percents[state] = roundHalfUp(counts[state] * 100, total)
    }
  }

  const headlineCount = counts[headlineState]
  const oneInN = headlineCount > 0 ? roundHalfUp(total, headlineCount) : null
  const headline = headlineSentence(total, headlineState, headlineCount, oneInN, scenarioLabel)

  return {
    total,
    counts,
    percents,
    headlineState,
    headlineCount,
    oneInN,
    headline,
    scenarioLabel,
  }
}

/**
 * The working headline template: "1 in N accounts hits storm warning
 * under the standard EI twist", with honest fallbacks for an empty
 * population and a state that never fires in the data.
 */
function headlineSentence(
  total: number,
  state: WeatherState,
  count: number,
  oneInN: number | null,
  scenarioLabel: string,
): string {
  const label = WEATHER_META[state].label.toLowerCase()
  if (total === 0) {
    return 'No accounts in the atlas yet'
  }
  if (count === 0 || oneInN === null) {
    return `No accounts hit ${label} ${scenarioLabel}`
  }
  return `1 in ${oneInN} accounts hits ${label} ${scenarioLabel}`
}

/**
 * Drill down helper: the account ids behind one state's cell, in the
 * order the caller passed them. The atlas cell click hands its state
 * here, and the view decides what to render with the list (this module
 * never navigates).
 */
export function accountsInState(
  entries: readonly AtlasEntry[] | null | undefined,
  state: WeatherState,
): readonly string[] {
  const list = entries ?? []
  return list
    .filter((entry) => entry && typeof entry === 'object' && weatherState(entry) === state)
    .map((entry) => entry.account_id)
}

/** Severity ordered state list for atlas grids and legends. */
export const ATLAS_ORDER: readonly WeatherState[] = SEVERITY_ORDER
