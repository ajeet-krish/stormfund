import { readFileSync } from 'node:fs'
// The bundled artifact is read from disk here so the card is tested
// against the very profiles the booth ships.
import { URL as NodeURL } from 'node:url'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import BaselineCard from './BaselineCard'
import { parseProfilesArtifact } from '../../data/profiles'
import { verdictBand } from '../../lib/verdict'

/**
 * Current conditions contracts on the shipped artifact: the edge flag
 * chips print only the flags an account actually carries (one flag
 * prints one chip, an account with none prints no chip row at all, so
 * the old "not set" placeholders are gone), and the provenance line
 * stops at the recorded check sum and its source instead of claiming
 * anything about how this page handled the number. Server rendering is
 * enough: the card formats props and never touches the store.
 */

const artifact = parseProfilesArtifact(
  JSON.parse(
    readFileSync(new NodeURL('../../../public/data/engine/profiles.json', import.meta.url), 'utf8'),
  ) as unknown,
)

function renderCard(id: string): string {
  const profile = artifact.byId.get(id)
  if (!profile) {
    throw new Error(`missing profile ${id}`)
  }
  const band = verdictBand({
    state: profile.runway_state,
    deciMonths: profile.runway_deci_months,
  })
  return renderToString(createElement(BaselineCard, { profile, band }))
}

describe('BaselineCard edge flags', () => {
  it('prints one chip for the single flag the account carries', () => {
    const html = renderCard('20111')
    const flags = html.split('cp-flag cp-flag-on').length - 1
    expect(flags).toBe(1)
    expect(html).toContain('Defaulted loan')
    expect(html).not.toContain('Pensioner')
    expect(html).not.toContain('Thin history')
    expect(html).not.toContain('Zero income')
    expect(html).not.toContain('Negative buffer')
    expect(html).not.toContain('not set')
  })

  it('prints no chip row at all for an account with no flags', () => {
    const html = renderCard('68257')
    expect(html).not.toContain('cp-flags')
    expect(html).not.toContain('cp-flag')
    expect(html).not.toContain('Edge flags for this account')
    expect(html).not.toContain('not set')
    // The rest of the card still reads normally.
    expect(html).toContain('id="baseline-heading"')
    expect(html).toContain('68257')
  })
})

describe('BaselineCard provenance line', () => {
  it('keeps only the recorded check sum and its source', () => {
    const html = renderCard('68257')
    expect(html).toContain('Recorded check sum')
    expect(html).toContain(artifact.byId.get('68257')?.provenance.check_sum as string)
    expect(html).toContain(artifact.byId.get('68257')?.provenance.source as string)
    expect(html).not.toContain('written by scripts.engine.build')
    expect(html).not.toContain('does not recompute it')
    expect(html).not.toContain('This page shows the recorded value')
  })
})
