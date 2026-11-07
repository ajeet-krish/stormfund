import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import WeatherBands from './WeatherBands'
import { SEVERITY_ORDER, WEATHER_META, WEATHER_STATES } from '../../lib/weatherState'

/**
 * The condition bands must print all seven states with glyph, label,
 * and threshold sentence for empty props, and mark the active state
 * with aria-current so the console can point at the account's sky.
 */

describe('WeatherBands', () => {
  it('renders the full severity ladder with no props', () => {
    const html = renderToString(createElement(WeatherBands))
    expect(html).toContain('aria-label="Weather condition bands"')
    for (const state of WEATHER_STATES) {
      expect(html).toContain(`wx-band-${state}`)
      expect(html).toContain(WEATHER_META[state].label)
      expect(html).toContain(WEATHER_META[state].glyph)
      expect(html).toContain(WEATHER_META[state].threshold)
    }
    expect(html).not.toContain('aria-current')
  })

  it('renders nothing but the ladder for an empty states array', () => {
    const html = renderToString(createElement(WeatherBands, { states: [] }))
    const bands = html.split('wx-band wx-band-').length - 1
    expect(bands).toBe(WEATHER_STATES.length)
  })

  it('marks the active state with aria-current and the active class', () => {
    const html = renderToString(createElement(WeatherBands, { activeState: 'storm' }))
    expect(html).toContain('wx-band wx-band-storm wx-band-active')
    expect(html).toContain('aria-current="true"')
    // Only one band is active.
    expect(html.split('wx-band-active').length - 1).toBe(1)
  })

  it('honours a caller order and keeps severity order as the default', () => {
    expect([...SEVERITY_ORDER][0]).toBe('flood')
    const subset = ['rain', 'clear'] as const
    const html = renderToString(createElement(WeatherBands, { states: subset }))
    expect(html.split('wx-band wx-band-').length - 1).toBe(2)
    expect(html).toContain('wx-band-rain')
    expect(html).toContain('wx-band-clear')
    expect(html).not.toContain('wx-band-flood')
  })

  it('renders safely for an unknown active state', () => {
    const html = renderToString(
      createElement(WeatherBands, { activeState: 'hail' as never }),
    )
    expect(html).not.toContain('aria-current')
    expect(html.split('wx-band wx-band-').length - 1).toBe(WEATHER_STATES.length)
  })
})
