import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseProfilesArtifact, type AccountProfile } from '../../data/profiles'
import { projectForecast, type ForecastProjection } from '../../lib/forecast'
import { SHOCK_PRESETS, type PresetId } from '../../lib/shockPresets'
import { applyTwist, IDLE_TWIST, type Twist } from '../../lib/shocks'
import ForecastStrip, { MAX_HISTORY_SLOTS, stripLayout } from './ForecastStrip'

/**
 * The forecast strip must render in every wiring state: no props at
 * all (the placeholder), a live shock projection with its band slots,
 * pin, front, and history line, the no landfall fallback, and the two
 * adaptive horizon notes. Server rendering runs no effects, so these
 * assert the markup contract the WeatherPanel mounts against.
 */

const artifact = parseProfilesArtifact(
  JSON.parse(
    readFileSync(new URL('../../../public/data/engine/profiles.json', import.meta.url), 'utf8'),
  ) as unknown,
)

function presetTwist(id: PresetId): Twist {
  const preset = SHOCK_PRESETS.find((entry) => entry.id === id)
  if (!preset) {
    throw new Error(`missing preset ${id}`)
  }
  return { ...IDLE_TWIST, ...preset.twist }
}

function projectionOf(id: string, twist: Twist): ForecastProjection {
  const profile: AccountProfile | undefined = artifact.byId.get(id)
  if (!profile) {
    throw new Error(`missing profile ${id}`)
  }
  const result = applyTwist(profile, twist)
  return projectForecast(profile, result, twist)
}

function render(projection?: ForecastProjection | null, ariaLabel?: string): string {
  return renderToString(createElement(ForecastStrip, { projection, ariaLabel }))
}

/** The compact month label the strip prints on a sparse axis. */
function compactMonthLabel(labelMonth: string): string {
  const abbr = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  const monthIndex = Number(labelMonth.slice(5, 7)) - 1
  return `${abbr[monthIndex] ?? labelMonth.slice(5, 7)} ${labelMonth.slice(2, 4)}`
}

describe('ForecastStrip', () => {
  it('renders a labelled placeholder with no props at all', () => {
    const html = renderToString(createElement(ForecastStrip))
    expect(html).toContain('forecast not wired yet')
    expect(html).toContain('no forecast wired yet')
    expect(html).toContain('role="img"')
  })

  it('renders a placeholder for an explicit null projection', () => {
    expect(render(null)).toContain('forecast not wired yet')
  })

  it('draws band colored slots, the curve, the front, the pin, and the history line', () => {
    const projection = projectionOf('68257', presetTwist('combo'))
    const html = render(projection)

    // Band slots carry the verdict band hue and glyph (redundant encoding).
    expect(html).toContain('wx-slot text-cp-storm')
    expect(html).toContain('wx-slot text-cp-critical')
    expect(html).toContain('🌧')
    expect(html).toContain('⛈')

    // The projection polyline and the muted recorded history line.
    expect(html).toContain('wx-projection-line')
    expect(html).toContain('wx-history-line')
    expect(html).toContain('Recorded average balances')

    // The live storm front and the landfall pin with the headline figure.
    expect(html).toContain('wx-front wx-front-active')
    expect(html).toContain('wx-pin-stem')
    expect(html).toContain('wx-pin-dot text-cp-critical')
    expect(html).toContain('>1.5 months<')

    // The printed horizon note and dense month labels on a 12 month axis.
    expect(html).toContain('Projection horizon: 12 months')
    expect(html).toContain('>01<')
    expect(html).toContain('>12<')

    // The worst case second pin shows under a job loss twist. The combo
    // drains the buffer before the cliff, so the dashed segment has a
    // single point and only the pin draws.
    expect(html).toContain('wx-ei-pin')
    expect(html).not.toContain('wx-continuation-line')
  })

  it('draws the dashed worst case continuation while the buffer still rides at the cliff', () => {
    // Job loss at full pay keeps the idle flow, so the buffer survives
    // month 6 and the worst case drains over spending alone.
    const twist: Twist = { ...IDLE_TWIST, jobLoss: true, incomeFactor: 1 }
    const projection = projectionOf('68257', twist)
    const html = render(projection)
    expect(html).toContain('wx-continuation-line')
    expect(html).toContain('wx-ei-pin')
    // The headline figure at month 0 is untouched by the cliff block.
    expect(html).toContain('>9.8 months<')
  })

  it('compresses the band sequence into an aria label a reader can follow', () => {
    const projection = projectionOf('68257', presetTwist('combo'))
    const html = render(projection)
    expect(html).toContain('Forecast strip:')
    expect(html).toContain('recorded months')
    expect(html).toContain('storm warning for 1 month')
    expect(html).toContain('critical for 12 months')
    expect(html).toContain('Landfall pin at 1.5 months, 2026-03.')
    expect(html).toContain('Horizon 12 months.')
    expect(html).toContain('EI income stops after month 6')
  })

  it('honours a caller aria label', () => {
    const projection = projectionOf('68257', IDLE_TWIST)
    const html = render(projection, 'Judge forecast')
    expect(html).toContain('Judge forecast')
    expect(html).not.toContain('Forecast strip:')
  })

  it('prints the no landfall fallback when the gap never lands', () => {
    const projection = projectionOf('23838', IDLE_TWIST)
    const html = render(projection)
    expect(html).toContain('>no landfall in view<')
    expect(html).not.toContain('wx-pin-stem')
    expect(html).toContain('wx-front wx-front-idle')
    expect(html).not.toContain('wx-continuation-line')
  })

  it('prints the extended horizon note when landfall stretches the axis', () => {
    const projection = projectionOf('98952', IDLE_TWIST)
    const html = render(projection)
    expect(html).toContain('Projection horizon: 25 months, extended to the landfall month')
    expect(html).toContain('>24.6 months<')
    expect(html).toContain('Landfall pin at 24.6 months')
  })

  it('prints the capped horizon note when landfall sits beyond the longest axis', () => {
    const projection = projectionOf('49900', IDLE_TWIST)
    const html = render(projection)
    expect(html).toContain('Projection horizon: 120 months, landfall sits beyond this view')
    expect(html).toContain('>no landfall in view<')
    // Sparse axis: anchor months keep a compact label, glyphs hide.
    const firstMonth = projection.months[0]
    const lastMonth = projection.months[projection.months.length - 1]
    if (!firstMonth || !lastMonth) {
      throw new Error('projection holds no months')
    }
    expect(html).toContain(`>${compactMonthLabel(firstMonth.labelMonth)}<`)
    expect(html).toContain(`>${compactMonthLabel(lastMonth.labelMonth)}<`)
    expect(html).toContain('>Jan 25<')
    expect(html).not.toContain('>02<')
    expect(html).not.toContain('wx-strip__glyph')
  })

  it('shares one slot grid with the EI overlay', () => {
    const projection = projectionOf('68257', presetTwist('combo'))
    const layout = stripLayout(projection)
    expect(layout.historySlots).toBe(Math.min(projection.history.length, MAX_HISTORY_SLOTS))
    expect(layout.historySlots).toBeGreaterThan(0)
    expect(layout.totalSlots).toBe(layout.historySlots + projection.months.length)
    expect(layout.slotWidth).toBeCloseTo(720 / layout.totalSlots, 6)
    // The overlay percent formula lands on the same x the curve uses.
    const monthPercent = ((layout.historySlots + 6) / layout.totalSlots) * 100
    expect(monthPercent).toBeGreaterThan(0)
    expect(monthPercent).toBeLessThan(100)
  })
})
