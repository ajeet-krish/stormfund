/**
 * Median and mean over integer cents: the TypeScript twins of
 * scripts/engine/metrics.py, used by the golden fixture cross check in
 * shocks.golden.test.ts to prove the browser reproduces the pipeline's
 * judge numbers (I, S, F, H, B) from the recorded sorted arrays.
 *
 * roundHalfUp lives in shocks.ts as the single integer division
 * primitive for the whole lib layer (one rounding implementation, no
 * drift between modules); this module imports it rather than keeping a
 * second copy.
 */
import { roundHalfUp } from './shocks'

/**
 * Median of integer cents: middle value for an odd count, half up mean
 * of the two middles for an even count (ties away from zero, which is
 * how the half cent tie in account 23838 lands on 280403).
 */
export function medianCents(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error('medianCents requires at least one value')
  }
  const ordered = [...values].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  if (ordered.length % 2 === 1) {
    return ordered[middle] as number
  }
  return roundHalfUp((ordered[middle - 1] as number) + (ordered[middle] as number), 2)
}

/** Mean of integer cents rounded half up, ties away from zero. */
export function meanCents(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error('meanCents requires at least one value')
  }
  const total = values.reduce((sum, value) => sum + value, 0)
  return roundHalfUp(total, values.length)
}
