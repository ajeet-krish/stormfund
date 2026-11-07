import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ForecastStrip, { FORECAST_MONTH_COUNT, type ForecastMonth } from './ForecastStrip'

/**
 * The forecast strip must render in every wiring state: no props at all
 * (the placeholder), and a full 12 month array colored by state. Server
 * rendering runs no effects, so these assert the markup contract the E3
 * view mounts against.
 */

function months(): ForecastMonth[] {
  const states = [
    'clear',
    'cloudy',
    'overcast',
    'rain',
    'drought',
    'storm',
    'flood',
    'clear',
    'rain',
    'storm',
    'cloudy',
    'clear',
  ] as const
  return states.map((state, index) => ({
    month: `2026-${String(index + 1).padStart(2, '0')}`,
    state,
    runwayDeciMonths: 120 - index * 9,
  }))
}

describe('ForecastStrip', () => {
  it('renders a labelled placeholder with no props at all', () => {
    const html = renderToString(createElement(ForecastStrip))
    expect(html).toContain('forecast not wired yet')
    expect(html).toContain('no forecast wired yet')
    expect(html).toContain('role="img"')
  })

  it('renders a placeholder for an empty months array', () => {
    const html = renderToString(createElement(ForecastStrip, { months: [] }))
    expect(html).toContain('forecast not wired yet')
  })

  it('draws one state colored tile per month with the month label', () => {
    const html = renderToString(createElement(ForecastStrip, { months: months() }))
    expect(html).not.toContain('forecast not wired yet')
    for (const state of ['clear', 'cloudy', 'overcast', 'rain', 'drought', 'storm', 'flood']) {
      expect(html).toContain(`wx-tile-${state}`)
    }
    expect(html).toContain('wx-strip__tile')
    // Month labels are the MM tail of each YYYY-MM label.
    expect(html).toContain('>01<')
    expect(html).toContain('>12<')
    expect(html).toContain('Forecast strip, 12 months')
    expect(html).toContain('runway 12.0 months')
  })

  it('honours a caller aria label and the exported tile count', () => {
    expect(FORECAST_MONTH_COUNT).toBe(12)
    const html = renderToString(
      createElement(ForecastStrip, { months: months(), ariaLabel: 'Judge forecast' }),
    )
    expect(html).toContain('Judge forecast')
  })

  it('renders one tile per provided month, not a fixed twelve', () => {
    const three = months().slice(0, 3)
    const html = renderToString(createElement(ForecastStrip, { months: three }))
    const tiles = html.split('wx-strip__tile').length - 1
    expect(tiles).toBe(3)
    expect(html).toContain('Forecast strip, 3 months')
  })
})
