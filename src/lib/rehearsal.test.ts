import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseProfilesArtifact, type ProfilesArtifact } from '../data/profiles'
import { GUARD_FLAG_ORDER, edgeGuard } from './judgeMode'
import { SHOCK_PRESETS, presetById } from './shockPresets'
import {
  REHEARSAL_SCRIPT,
  REHEARSAL_TARGET_MS,
  rehearsalCard,
  rehearsalVerdict,
  type RehearsalStep,
} from './rehearsal'

/**
 * Rehearsal contract (Phase E6): the five steps cover every E1 flag
 * and every twist card, each accountId parses from the shipped
 * profiles.json and yields exactly the flags the step promises under
 * that card (job loss live for the layoff and combo cards), every
 * script line quotes the guard table, and the stopwatch verdict flips
 * at 2000 and 4000 ms.
 */

const ARTIFACT: ProfilesArtifact = parseProfilesArtifact(
  JSON.parse(readFileSync(new URL('../../public/data/engine/profiles.json', import.meta.url), 'utf8')),
)

/** True for the presets that carry a live job loss twist. */
function jobLossFor(step: RehearsalStep): boolean {
  return step.presetId === 'layoff' || step.presetId === 'combo'
}

function flagsFor(step: RehearsalStep): string[] {
  const profile = ARTIFACT.byId.get(step.accountId)
  if (!profile) {
    throw new Error(`rehearsal account ${step.accountId} is not in profiles.json`)
  }
  return edgeGuard({
    accountId: step.accountId,
    knownAccountIds: ARTIFACT.ids,
    profile,
    jobLossActive: jobLossFor(step),
  }).flags.map((flag) => flag.id)
}

describe('REHEARSAL_SCRIPT: five steps over the golden fixtures', () => {
  it('ships five steps with unique ids and account ids', () => {
    expect(REHEARSAL_SCRIPT).toHaveLength(5)
    expect(new Set(REHEARSAL_SCRIPT.map((step) => step.id)).size).toBe(5)
    expect(new Set(REHEARSAL_SCRIPT.map((step) => step.accountId)).size).toBe(5)
    expect(REHEARSAL_SCRIPT.map((step) => step.accountId)).toEqual([
      '68257',
      '23838',
      '98952',
      '49900',
      '42988',
    ])
  })

  it('covers all four preset ids', () => {
    const played = REHEARSAL_SCRIPT.map((step) => step.presetId)
    expect(new Set(played).size).toBe(4)
    for (const preset of SHOCK_PRESETS) {
      expect(played).toContain(preset.id)
      expect(presetById(preset.id)).toBeDefined()
    }
  })

  it('covers all five E1 flags across the expected flag lists', () => {
    const promised = new Set(REHEARSAL_SCRIPT.flatMap((step) => [...step.expectFlags]))
    for (const id of ['pensioner', 'zero_income', 'thin_history', 'negative_buffer', 'defaulted_loan'] as const) {
      expect(promised.has(id), id).toBe(true)
    }
    expect(promised.has('no_loan')).toBe(true)
    expect(promised.has('zero_household_bills')).toBe(true)
    for (const id of promised) {
      expect(GUARD_FLAG_ORDER).toContain(id)
    }
  })

  it('promises exactly the flags the shipped profile prints under that card', () => {
    for (const step of REHEARSAL_SCRIPT) {
      expect(flagsFor(step), step.id).toEqual([...step.expectFlags])
    }
  })

  it('pins the flag order to GUARD_FLAG_ORDER inside every step', () => {
    for (const step of REHEARSAL_SCRIPT) {
      const order = [...GUARD_FLAG_ORDER]
      const sorted = [...step.expectFlags].sort(
        (left, right) => order.indexOf(left) - order.indexOf(right),
      )
      expect([...step.expectFlags], step.id).toEqual(sorted)
    }
  })

  it('reads the guard table aloud in every script line', () => {
    for (const step of REHEARSAL_SCRIPT) {
      const profile = ARTIFACT.byId.get(step.accountId)
      expect(profile, step.id).toBeDefined()
      if (!profile) continue
      const flags = edgeGuard({
        accountId: step.accountId,
        knownAccountIds: ARTIFACT.ids,
        profile,
        jobLossActive: jobLossFor(step),
      }).flags
      expect(step.scriptLine, step.id).toContain(step.accountId)
      expect(step.scriptLine, step.id).toContain(presetById(step.presetId)?.label ?? '')
      if (flags.length > 0) {
        const lead = flags[0]
        expect(lead, step.id).toBeDefined()
        if (lead) {
          expect(step.scriptLine, step.id).toContain(lead.message)
        }
      }
    }
  })

  it('keeps the whole script free of dashes', () => {
    const dashCodePoints = new Set([0x2014, 0x2013, 0x2212])
    for (const step of REHEARSAL_SCRIPT) {
      for (const text of [step.id, step.accountId, step.presetId, step.scriptLine]) {
        expect(
          [...text].some((character) => dashCodePoints.has(character.codePointAt(0) ?? 0)),
          text,
        ).toBe(false)
        expect(text.includes('-'.repeat(2)), text).toBe(false)
        expect(text.includes([' ', '-', ' '].join('')), text).toBe(false)
      }
    }
  })
})

describe('rehearsalCard', () => {
  it('quotes the shipped twist card sentence for each step', () => {
    for (const step of REHEARSAL_SCRIPT) {
      expect(rehearsalCard(step), step.id).toBe(presetById(step.presetId)?.card)
      expect(rehearsalCard(step).length, step.id).toBeGreaterThan(20)
    }
  })

  it('returns an empty string for an unknown step shape', () => {
    const orphan = { id: 'x', accountId: '1', presetId: 'nope', expectFlags: [], scriptLine: '' }
    expect(rehearsalCard(orphan as unknown as RehearsalStep)).toBe('')
  })
})

describe('rehearsalVerdict', () => {
  it('uses the 2000 ms target and the 4000 ms slow line', () => {
    expect(REHEARSAL_TARGET_MS).toBe(2000)
    expect(rehearsalVerdict(0)).toBe('fast')
    expect(rehearsalVerdict(1)).toBe('fast')
    expect(rehearsalVerdict(1999)).toBe('fast')
    expect(rehearsalVerdict(2000)).toBe('ok')
    expect(rehearsalVerdict(2001)).toBe('ok')
    expect(rehearsalVerdict(3999)).toBe('ok')
    expect(rehearsalVerdict(4000)).toBe('slow')
    expect(rehearsalVerdict(9000)).toBe('slow')
  })

  it('reads a broken clock as slow, never as fast', () => {
    expect(rehearsalVerdict(Number.NaN)).toBe('slow')
    expect(rehearsalVerdict(Number.POSITIVE_INFINITY)).toBe('slow')
    expect(rehearsalVerdict(-1)).toBe('fast')
  })
})
