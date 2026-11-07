import { describe, expect, it } from 'vitest'
import { VERDICT_BANDS, verdictBand, verdictBandById } from './verdict'

/**
 * The confirmed band boundaries (docs/decisions.md, Phase E2): contiguous
 * integer deci month thresholds with the two special states pinned to the
 * ends, so the badge a judge reads and the forecast strip E3 draws can
 * never disagree about where a band starts.
 */

describe('verdictBand', () => {
  it('ships the five bands in ladder order', () => {
    expect(VERDICT_BANDS.map((band) => band.id)).toEqual([
      'critical',
      'storm_warning',
      'watch',
      'fair_skies',
      'clear',
    ])
    for (const band of VERDICT_BANDS) {
      expect(band.label.length).toBeGreaterThan(0)
      expect(band.glyph.length).toBeGreaterThan(0)
      expect(band.tailwind).toMatch(/^text-cp-/)
      expect(band.threshold.length).toBeGreaterThan(0)
    }
  })

  it('puts buffer_depleted in critical and no_shortfall in clear', () => {
    expect(verdictBand({ state: 'buffer_depleted', deciMonths: 0 }).id).toBe('critical')
    expect(verdictBand({ state: 'no_shortfall', deciMonths: 1200 }).id).toBe('clear')
  })

  it('holds the boundaries at 10, 30, 60, and 120 deci months', () => {
    const cases: readonly (readonly [number, string])[] = [
      [0, 'critical'],
      [9, 'critical'],
      [10, 'storm_warning'],
      [29, 'storm_warning'],
      [30, 'watch'],
      [59, 'watch'],
      [60, 'fair_skies'],
      [119, 'fair_skies'],
      [120, 'clear'],
      [1200, 'clear'],
    ]
    for (const [deciMonths, expected] of cases) {
      expect(verdictBand({ state: 'finite', deciMonths }).id).toBe(expected)
    }
  })

  it('looks bands up by id', () => {
    expect(verdictBandById('storm_warning').label).toBe('Storm warning')
    expect(verdictBandById('clear').threshold).toContain('12.0 months')
    expect(() => verdictBandById('hail' as never)).toThrow('unknown verdict band')
  })
})
