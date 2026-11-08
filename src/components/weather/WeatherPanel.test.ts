import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseProfilesArtifact } from '../../data/profiles'
import { projectForecast, type ForecastProjection } from '../../lib/forecast'
import { SHOCK_PRESETS, type PresetId } from '../../lib/shockPresets'
import { applyTwist, IDLE_TWIST, type Twist } from '../../lib/shocks'
import WeatherPanel from './WeatherPanel'

/**
 * The weather panel composes the strip, the EI overlay on the strip's
 * slot grid, the storm front caption, the history honesty note, and the
 * five band chips with month 0's band active. It must render in every
 * wiring state: no projection at all (placeholder strip plus the chips),
 * a live job loss projection (marker and worst case line visible), and
 * a live projection without a job loss (marker hidden).
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
  const profile = artifact.byId.get(id)
  if (!profile) {
    throw new Error(`missing profile ${id}`)
  }
  const result = applyTwist(profile, twist)
  return projectForecast(profile, result, twist)
}

function render(projection?: ForecastProjection | null): string {
  return renderToString(createElement(WeatherPanel, { projection }))
}

describe('WeatherPanel', () => {
  it('renders the shell with the placeholder strip and the band chips before any account', () => {
    const html = render()
    expect(html).toContain('id="forecast-heading"')
    expect(html).toContain('Your buffer, month by month')
    expect(html).toContain('forecast not wired yet')
    // The old band key caption is gone: the chips speak for themselves.
    expect(html).not.toContain('Band key')
    expect(html).toContain('aria-label="Weather condition bands"')
    // No projection means no account specific copy and no EI marker.
    expect(html).not.toContain('Recorded average balances')
    expect(html).not.toContain('wx-cliff-set')
    expect(html).not.toContain('aria-current')
  })

  it('wires the full job loss projection: strip, cliff, bands, and honesty note', () => {
    const projection = projectionOf('68257', presetTwist('combo'))
    const html = render(projection)

    // The landfall pin prints the headline figure inside the strip.
    expect(html).toContain('>1.5 months<')
    expect(html).toContain('Projection horizon: 12 months')

    // The EI marker and its answer key label, on the strip's slot grid.
    expect(html).toContain('wx-cliff-set')
    expect(html).toContain('Beyond the answer key: EI income stops after month 6')
    // 12 history slots plus 13 projected months: the marker lands at 72 percent.
    expect(html).toMatch(/left:\s*72%/)

    // The storm front caption carries the active preset card sentence.
    expect(html).toContain('Storm front')
    expect(html).toContain('They lose their job (EI at 55%)')

    // The history legend and the anchor honesty note.
    expect(html).toContain('Recorded average balances')
    expect(html).toContain('buffer B')
    expect(html).toContain('mean of the last 6 recorded balances')

    // The active band is month 0's band (the same band the badge shows).
    expect(html).toContain('aria-current="true"')
    expect(html).toContain('wx-band wx-band-storm_warning')
  })

  it('hides the EI marker for a projection without a job loss', () => {
    const projection = projectionOf('68257', IDLE_TWIST)
    const html = render(projection)
    expect(html).not.toContain('wx-cliff-set')
    expect(html).not.toContain('Beyond the answer key')
    expect(html).toContain('Shock lands this month')
    // Idle 68257 sits at 9.8 months, the fair skies band.
    expect(html).toContain('wx-band wx-band-fair_skies')
    expect(html).toContain('aria-current="true"')
    // The strip still prints the no landfall style pin only when needed;
    // this account lands inside the view, so the headline figure shows.
    expect(html).toContain('>9.8 months<')
  })
})
