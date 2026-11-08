import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import WeatherBands from './WeatherBands'
import { VERDICT_BANDS } from '../../lib/verdict'

/**
 * The condition bands must print all five verdict bands with glyph,
 * label, and threshold sentence for empty props, mark the active band
 * with aria-current, and stay on the single band vocabulary: this file
 * and the component it tests may never mention the quarantined seven
 * state ladder in src/lib/weatherState.ts.
 */

/** Every E3 component source, checked against the banned vocabulary. */
const E3_SOURCES = ['WeatherBands.tsx', 'ForecastStrip.tsx'] as const

function sourceOf(name: string): string {
  return readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
}

describe('WeatherBands', () => {
  it('renders the full verdict ladder with no props', () => {
    const html = renderToString(createElement(WeatherBands))
    expect(html).toContain('aria-label="Weather condition bands"')
    for (const band of VERDICT_BANDS) {
      expect(html).toContain(`wx-band-${band.id}`)
      expect(html).toContain(band.label)
      expect(html).toContain(band.glyph)
      expect(html).toContain(band.threshold)
      // The band color arrives as the band's own tailwind class.
      expect(html).toContain(band.tailwind)
    }
    expect(html).not.toContain('aria-current')
  })

  it('lays out five bands, lowest runway first', () => {
    const html = renderToString(createElement(WeatherBands))
    expect(html.split('wx-band wx-band-').length - 1).toBe(VERDICT_BANDS.length)
    expect(VERDICT_BANDS).toHaveLength(5)
    const criticalAt = html.indexOf('wx-band-critical')
    const clearAt = html.indexOf('wx-band-clear')
    expect(criticalAt).toBeGreaterThan(-1)
    expect(clearAt).toBeGreaterThan(criticalAt)
  })

  it('renders the full ladder for an empty bands array', () => {
    const html = renderToString(createElement(WeatherBands, { bands: [] }))
    expect(html.split('wx-band wx-band-').length - 1).toBe(VERDICT_BANDS.length)
  })

  it('marks the active band with aria-current and the active class', () => {
    const html = renderToString(createElement(WeatherBands, { activeBandId: 'storm_warning' }))
    expect(html).toContain('wx-band wx-band-storm_warning')
    expect(html).toContain('text-cp-storm')
    expect(html).toContain('wx-band-active')
    expect(html).toContain('aria-current="true"')
    // Only one band is active.
    expect(html.split('wx-band-active').length - 1).toBe(1)
  })

  it('honours a caller subset and keeps the ladder as the default', () => {
    const subset = VERDICT_BANDS.filter(
      (band) => band.id === 'watch' || band.id === 'clear',
    )
    const html = renderToString(createElement(WeatherBands, { bands: subset }))
    expect(html.split('wx-band wx-band-').length - 1).toBe(2)
    expect(html).toContain('wx-band-watch')
    expect(html).toContain('wx-band-clear')
    expect(html).not.toContain('wx-band-critical')
  })

  it('renders safely for an unknown active band', () => {
    const html = renderToString(
      createElement(WeatherBands, { activeBandId: 'hail' as never }),
    )
    expect(html).not.toContain('aria-current')
    expect(html.split('wx-band wx-band-').length - 1).toBe(VERDICT_BANDS.length)
  })

  it('keeps the quarantined seven state ladder out of every E3 source', () => {
    for (const name of E3_SOURCES) {
      expect(sourceOf(name), name).not.toContain('weatherState')
    }
    // The one string the quarantine banner owns must stay unique to it.
    expect(sourceOf('WeatherBands.tsx')).not.toContain('flood')
  })
})

describe('WeatherBands stylesheet: one line at judging widths', () => {
  it('keeps the five chips on a single flex row with one phone escape', () => {
    const css = readFileSync(new URL('./weather.css', import.meta.url), 'utf8')

    const ladder = css.match(/\.wx-bands \{[^}]*\}/)?.[0] ?? ''
    expect(ladder).toContain('display: flex')
    expect(ladder).toContain('flex-wrap: nowrap')

    // Each chip takes an equal share of the line and may shrink, so
    // five chips and their threshold sentences never wrap apart.
    const chip = css.match(/\.wx-band \{[^}]*\}/)?.[0] ?? ''
    expect(chip).toContain('flex: 1 1 0')
    expect(chip).toContain('min-width: 0')

    // The only place the line breaks sits under a narrow phone width.
    expect(css).toMatch(/@media \(max-width: 36rem\) \{\s*\.wx-bands \{[^}]*flex-wrap: wrap/)
    // The retired caption left the sheet with the markup.
    expect(css).not.toContain('wx-bands__title')
  })
})
