import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseProfilesArtifact, type AccountProfile, type ProfilesArtifact } from '../data/profiles'
import {
  GUARD_FLAG_ORDER,
  GUARD_LABELS,
  GUARD_MESSAGES,
  JUDGE_SHORTCUTS,
  LOAN_CLOSED_DEFAULT_MESSAGE,
  LOAN_IN_ARREARS_MESSAGE,
  PENSIONER_IDLE_MESSAGE,
  PENSIONER_JOB_LOSS_MESSAGE,
  bindingForAction,
  edgeGuard,
  matchShortcut,
  pickRandomAccount,
  randomAccountPool,
  resolveJudgeKey,
  sameJudgeAction,
  type ShortcutBinding,
} from './judgeMode'
import { SHOCK_PRESETS } from './shockPresets'
import { useConsole } from '../state/consoleStore'

/**
 * Judge mode unit tests (Phase E6): the one key table fires every
 * binding in bar order, the context matrix keeps shortcuts out of text
 * entry and out of the typed shock gate while Esc always resolves, the
 * eight guard flags fire at their boundaries with the exact shipped
 * copy, the N picker draws only from the safe demo pool under a
 * stubbed rng, and a property test proves guards inform but never gate:
 * every known id stays selectable whatever its flags say.
 */

const ARTIFACT: ProfilesArtifact = parseProfilesArtifact(
  JSON.parse(readFileSync(new URL('../../public/data/engine/profiles.json', import.meta.url), 'utf8')),
)

/** Every KeyboardEvent.key the registry binds, in bar order. */
const BAR_KEYS = ['1', '2', '3', '4', 'r', 'R', '/', 'Escape', 'n'] as const

function bindingById(id: string): ShortcutBinding {
  const binding = JUDGE_SHORTCUTS.find((entry) => entry.id === id)
  if (!binding) {
    throw new Error(`missing binding ${id}`)
  }
  return binding
}

/** A full AccountProfile with safe defaults; overrides per test. */
function makeProfile(overrides: Partial<AccountProfile> = {}): AccountProfile {
  const base: AccountProfile = {
    account_id: '20111',
    income_cents: 400_000,
    fixed_costs_cents: 150_000,
    spending_cents: 300_000,
    buffer_cents: 500_000,
    household_bills_cents: 120_000,
    loan_payment_cents: 30_000,
    insurance_cents: 10_000,
    loan_payments_median_cents: 30_000,
    pension_in_cents: 0,
    gap_cents: -100_000,
    runway_state: 'finite',
    runway_deci_months: 180,
    history: {
      first_month: '2020-01',
      last_month: '2025-12',
      row_count: 72,
      months_contiguous: true,
    },
    loan: {
      loan_id: 1,
      status: 'C',
      defaulted: false,
      amount_cents: 3_600_000,
      duration_months: 60,
      monthly_payment_cents: 60_000,
      loan_start: '2023-01-15',
      scheduled_end_month: '2028-01',
    },
    flags: {
      pensioner: false,
      thin_history: false,
      zero_income: false,
      defaulted_loan: false,
      negative_buffer: false,
    },
    balance_series: { start_month: '2025-01', values_cents: [500_000, 510_000] },
    provenance: {
      source: 'monthly_summary.csv',
      filter: 'account_id',
      agg: 'monthly',
      check_sum: 'a'.repeat(64),
    },
  }
  return { ...base, ...overrides, flags: { ...base.flags, ...overrides.flags } }
}

describe('JUDGE_SHORTCUTS: registry shape', () => {
  it('holds nine bindings in bar order with unique ids', () => {
    expect(JUDGE_SHORTCUTS).toHaveLength(9)
    expect(new Set(JUDGE_SHORTCUTS.map((binding) => binding.id)).size).toBe(9)
    expect(JUDGE_SHORTCUTS.map((binding) => binding.keys[0])).toEqual([...BAR_KEYS])
    for (const binding of JUDGE_SHORTCUTS) {
      expect(binding.label.length).toBeGreaterThan(3)
      expect(binding.keys.length).toBeGreaterThan(0)
    }
  })

  it('maps presets 1 to 4 onto the shipped twist cards in order', () => {
    expect(SHOCK_PRESETS.map((preset) => preset.id)).toEqual([
      'layoff',
      'cost_spike',
      'emergency_repair',
      'combo',
    ])
    for (let index = 0; index < 4; index += 1) {
      const binding = JUDGE_SHORTCUTS[index]
      expect(binding?.action).toEqual({ kind: 'twist', preset: (index + 1) as 1 | 2 | 3 | 4 })
      expect(binding?.label).toBe(SHOCK_PRESETS[index]?.label)
    }
  })

  it('marks exactly one allowShift binding and one allowInTextEntry binding', () => {
    const shifted = JUDGE_SHORTCUTS.filter((binding) => binding.allowShift === true)
    const inText = JUDGE_SHORTCUTS.filter((binding) => binding.allowInTextEntry === true)
    expect(shifted.map((binding) => binding.id)).toEqual(['reset-all'])
    expect(inText.map((binding) => binding.id)).toEqual(['dismiss'])
  })

  it('wires the five non twist actions to the documented stores of intent', () => {
    expect(bindingById('reset-twist').action).toEqual({ kind: 'reset_twist' })
    expect(bindingById('reset-all').action).toEqual({ kind: 'reset_all' })
    expect(bindingById('focus-lookup').action).toEqual({ kind: 'focus_lookup' })
    expect(bindingById('dismiss').action).toEqual({ kind: 'dismiss' })
    expect(bindingById('random-account').action).toEqual({ kind: 'random_account' })
  })
})

describe('matchShortcut: every key fires on a plain page', () => {
  it('fires all nine bindings with no modifiers and no context', () => {
    for (const binding of JUDGE_SHORTCUTS) {
      expect(matchShortcut({ key: binding.keys[0] as string }), binding.id).toEqual(binding.action)
    }
  })

  it('returns null for unbound keys, empty keys, and missing events', () => {
    expect(matchShortcut({ key: 'a' })).toBeNull()
    expect(matchShortcut({ key: '!' })).toBeNull()
    expect(matchShortcut({ key: '0' })).toBeNull()
    expect(matchShortcut({ key: 'ArrowRight' })).toBeNull()
    expect(matchShortcut({ key: '' })).toBeNull()
    expect(matchShortcut(null)).toBeNull()
    expect(matchShortcut(undefined)).toBeNull()
    expect(matchShortcut({ key: 4 as unknown as string })).toBeNull()
  })

  it('rejects ctrl, meta, and alt for every binding', () => {
    for (const binding of JUDGE_SHORTCUTS) {
      const key = binding.keys[0] as string
      expect(matchShortcut({ key, ctrlKey: true }), key).toBeNull()
      expect(matchShortcut({ key, metaKey: true }), key).toBeNull()
      expect(matchShortcut({ key, altKey: true }), key).toBeNull()
    }
  })

  it('allows shift only for the one allowShift binding', () => {
    for (const binding of JUDGE_SHORTCUTS) {
      const key = binding.keys[0] as string
      const expected = binding.allowShift === true ? binding.action : null
      expect(matchShortcut({ key, shiftKey: true }), key).toEqual(expected)
    }
    // Caps Lock R has no shift held and still reads as reset all.
    expect(matchShortcut({ key: 'R' })).toEqual({ kind: 'reset_all' })
  })

  it('ignores a repeated key and a composing key', () => {
    for (const binding of JUDGE_SHORTCUTS) {
      const key = binding.keys[0] as string
      expect(matchShortcut({ key, repeat: true }), key).toBeNull()
      expect(matchShortcut({ key, isComposing: true }), key).toBeNull()
    }
  })

  it('matches against a caller supplied registry', () => {
    const custom: readonly ShortcutBinding[] = [
      { id: 'only-9', keys: ['9'], label: 'Ninth key', action: { kind: 'random_account' } },
    ]
    expect(matchShortcut({ key: '9' }, custom)).toEqual({ kind: 'random_account' })
    expect(matchShortcut({ key: '1' }, custom)).toBeNull()
  })
})

describe('resolveJudgeKey: the context matrix', () => {
  const plain = { inTextEntry: false, typedGateOpen: false }

  it('fires every binding outside a text entry with the gate closed', () => {
    for (const binding of JUDGE_SHORTCUTS) {
      const key = binding.keys[0] as string
      expect(resolveJudgeKey({ key }, plain), key).toEqual(binding.action)
    }
  })

  it('suppresses every binding in a text entry except the Esc dismiss', () => {
    const inText = { inTextEntry: true, typedGateOpen: false }
    for (const binding of JUDGE_SHORTCUTS) {
      const key = binding.keys[0] as string
      const expected = binding.id === 'dismiss' ? binding.action : null
      expect(resolveJudgeKey({ key }, inText), key).toEqual(expected)
    }
    // This branch is the grep proof: a typed "1" or "n" in the lookup
    // resolves to null, so no non Esc shortcut can fire in text entry.
    expect(resolveJudgeKey({ key: '1' }, inText)).toBeNull()
    expect(resolveJudgeKey({ key: 'n' }, inText)).toBeNull()
    expect(resolveJudgeKey({ key: '/' }, inText)).toBeNull()
    expect(resolveJudgeKey({ key: 'Escape' }, inText)).toEqual({ kind: 'dismiss' })
  })

  it('suppresses every binding while the typed gate is open except Esc', () => {
    const gated = { inTextEntry: false, typedGateOpen: true }
    for (const binding of JUDGE_SHORTCUTS) {
      const key = binding.keys[0] as string
      const expected = binding.id === 'dismiss' ? binding.action : null
      expect(resolveJudgeKey({ key }, gated), key).toEqual(expected)
    }
  })

  it('lets Esc resolve through every layer of the context', () => {
    const layers = [
      { inTextEntry: false, typedGateOpen: false },
      { inTextEntry: true, typedGateOpen: false },
      { inTextEntry: false, typedGateOpen: true },
      { inTextEntry: true, typedGateOpen: true },
    ]
    for (const context of layers) {
      expect(resolveJudgeKey({ key: 'Escape' }, context), JSON.stringify(context)).toEqual({
        kind: 'dismiss',
      })
    }
  })

  it('keeps the modifier, repeat, and composing rules under context', () => {
    expect(resolveJudgeKey({ key: 'r', ctrlKey: true }, plain)).toBeNull()
    expect(resolveJudgeKey({ key: 'R', shiftKey: true }, plain)).toEqual({ kind: 'reset_all' })
    expect(resolveJudgeKey({ key: 'r', shiftKey: true }, plain)).toBeNull()
    expect(resolveJudgeKey({ key: '1', repeat: true }, plain)).toBeNull()
    expect(resolveJudgeKey({ key: '1', isComposing: true }, plain)).toBeNull()
    expect(resolveJudgeKey(null, plain)).toBeNull()
  })
})

describe('sameJudgeAction and bindingForAction', () => {
  it('compares actions field by field', () => {
    expect(sameJudgeAction({ kind: 'twist', preset: 1 }, { kind: 'twist', preset: 1 })).toBe(true)
    expect(sameJudgeAction({ kind: 'twist', preset: 1 }, { kind: 'twist', preset: 4 })).toBe(false)
    expect(sameJudgeAction({ kind: 'reset_twist' }, { kind: 'reset_twist' })).toBe(true)
    expect(sameJudgeAction({ kind: 'reset_twist' }, { kind: 'reset_all' })).toBe(false)
    expect(sameJudgeAction(null, { kind: 'dismiss' })).toBe(false)
    expect(sameJudgeAction({ kind: 'dismiss' }, null)).toBe(false)
    expect(sameJudgeAction(null, null)).toBe(false)
  })

  it('finds the keycap to highlight for an active action', () => {
    expect(bindingForAction({ kind: 'twist', preset: 4 })?.id).toBe('twist-4')
    expect(bindingForAction({ kind: 'reset_all' })?.id).toBe('reset-all')
    expect(bindingForAction({ kind: 'random_account' })?.id).toBe('random-account')
    expect(bindingForAction(null)).toBeNull()
    expect(bindingForAction({ kind: 'dismiss' }, [])).toBeNull()
  })
})

describe('edgeGuard: eight flags at their boundaries', () => {
  const known = ['20111', '20112', '20113']

  it('reads a healthy account as no care needed', () => {
    const report = edgeGuard({
      accountId: '20111',
      knownAccountIds: known,
      profile: makeProfile(),
    })
    expect(report.accountId).toBe('20111')
    expect(report.flags).toEqual([])
    expect(report.needsCare).toBe(false)
  })

  it('flags an unknown account id, and only an unknown one', () => {
    const unknown = edgeGuard({ accountId: '99999', knownAccountIds: known, profile: null })
    expect(unknown.flags.map((flag) => flag.id)).toContain('unknown_account')
    expect(unknown.needsCare).toBe(true)

    const missing = edgeGuard({ knownAccountIds: known })
    expect(missing.flags[0]?.id).toBe('unknown_account')
    expect(missing.accountId).toBeNull()

    const empty = edgeGuard({ accountId: '', knownAccountIds: known })
    expect(empty.flags.map((flag) => flag.id)).toContain('unknown_account')

    // No index supplied means nothing to check, not a false alarm.
    const noIndex = edgeGuard({ accountId: '99999' })
    expect(noIndex.flags.map((flag) => flag.id)).not.toContain('unknown_account')
  })

  it('flags the pensioner idle, and swaps the message under a live layoff', () => {
    const profile = makeProfile({ flags: { ...makeProfile().flags, pensioner: true } })
    const idle = edgeGuard({ accountId: '20111', knownAccountIds: known, profile })
    expect(idle.flags).toEqual([
      { id: 'pensioner', label: GUARD_LABELS.pensioner, message: PENSIONER_IDLE_MESSAGE },
    ])

    const jobLoss = edgeGuard({
      accountId: '20111',
      knownAccountIds: known,
      profile,
      jobLossActive: true,
    })
    expect(jobLoss.flags).toEqual([
      {
        id: 'pensioner',
        label: 'pension vs layoff',
        message: PENSIONER_JOB_LOSS_MESSAGE,
      },
    ])
    expect(jobLoss.needsCare).toBe(true)

    // A cost spike twist is not a layoff, so the idle copy stands.
    const otherTwist = edgeGuard({
      accountId: '20111',
      knownAccountIds: known,
      profile,
      jobLossActive: false,
    })
    expect(otherTwist.flags[0]?.message).toBe(PENSIONER_IDLE_MESSAGE)
  })

  it('flags zero income, thin history, and a negative buffer on the E1 flags', () => {
    const zeroIncome = edgeGuard({
      accountId: '20111',
      knownAccountIds: known,
      profile: makeProfile({ flags: { ...makeProfile().flags, zero_income: true } }),
    })
    expect(zeroIncome.flags.map((flag) => flag.id)).toContain('zero_income')

    const thin = edgeGuard({
      accountId: '20111',
      knownAccountIds: known,
      profile: makeProfile({ flags: { ...makeProfile().flags, thin_history: true } }),
    })
    expect(thin.flags.map((flag) => flag.id)).toContain('thin_history')

    const negative = edgeGuard({
      accountId: '20111',
      knownAccountIds: known,
      profile: makeProfile({ flags: { ...makeProfile().flags, negative_buffer: true } }),
    })
    expect(negative.flags.map((flag) => flag.id)).toContain('negative_buffer')

    // The flag false side: even a below zero buffer with the flag off
    // stays quiet, because the guard reads the E1 flags, not the raw.
    const quiet = edgeGuard({
      accountId: '20111',
      knownAccountIds: known,
      profile: makeProfile({ buffer_cents: -1 }),
    })
    expect(quiet.flags).toEqual([])
  })

  it('flags defaulted loans with the status D line, and the status B line', () => {
    const inArrears = makeProfile({
      flags: { ...makeProfile().flags, defaulted_loan: true },
      loan: {
        loan_id: 7,
        status: 'D',
        defaulted: true,
        amount_cents: 1_000_000,
        duration_months: 24,
        monthly_payment_cents: 41_666,
        loan_start: '2024-02-01',
        scheduled_end_month: '2026-02',
      },
    })
    const reportD = edgeGuard({ accountId: '20111', knownAccountIds: known, profile: inArrears })
    expect(reportD.flags).toEqual([
      { id: 'defaulted_loan', label: 'defaulted loan', message: LOAN_IN_ARREARS_MESSAGE },
    ])

    const closed = makeProfile({
      flags: { ...makeProfile().flags, defaulted_loan: true },
      loan: {
        loan_id: 8,
        status: 'B',
        defaulted: true,
        amount_cents: 900_000,
        duration_months: 18,
        monthly_payment_cents: 50_000,
        loan_start: '2022-05-01',
        scheduled_end_month: '2023-11',
      },
    })
    const reportB = edgeGuard({ accountId: '20111', knownAccountIds: known, profile: closed })
    expect(reportB.flags).toEqual([
      { id: 'defaulted_loan', label: 'defaulted loan', message: LOAN_CLOSED_DEFAULT_MESSAGE },
    ])
    expect(LOAN_CLOSED_DEFAULT_MESSAGE).not.toBe(LOAN_IN_ARREARS_MESSAGE)
  })

  it('flags no loan on an explicit zero payment only', () => {
    const noLoan = edgeGuard({
      accountId: '20111',
      knownAccountIds: known,
      profile: makeProfile({ loan_payment_cents: 0 }),
    })
    expect(noLoan.flags.map((flag) => flag.id)).toContain('no_loan')

    const oneCent = edgeGuard({
      accountId: '20111',
      knownAccountIds: known,
      profile: makeProfile({ loan_payment_cents: 1 }),
    })
    expect(oneCent.flags.map((flag) => flag.id)).not.toContain('no_loan')
  })

  it('flags household bills at exactly zero', () => {
    const noBills = edgeGuard({
      accountId: '20111',
      knownAccountIds: known,
      profile: makeProfile({ household_bills_cents: 0 }),
    })
    expect(noBills.flags.map((flag) => flag.id)).toContain('zero_household_bills')

    const oneCent = edgeGuard({
      accountId: '20111',
      knownAccountIds: known,
      profile: makeProfile({ household_bills_cents: 1 }),
    })
    expect(oneCent.flags.map((flag) => flag.id)).not.toContain('zero_household_bills')
  })

  it('reports every flag at once in canonical order with shipped copy', () => {
    const everything = edgeGuard({
      accountId: null,
      knownAccountIds: known,
      jobLossActive: true,
      profile: makeProfile({
        loan_payment_cents: 0,
        household_bills_cents: 0,
        flags: {
          pensioner: true,
          thin_history: true,
          zero_income: true,
          defaulted_loan: true,
          negative_buffer: true,
        },
      }),
    })
    expect(everything.flags.map((flag) => flag.id)).toEqual([...GUARD_FLAG_ORDER])
    expect(everything.needsCare).toBe(true)
    for (const flag of everything.flags) {
      expect(flag.label.length).toBeGreaterThan(2)
      expect(flag.message.length).toBeGreaterThan(10)
    }
    expect(everything.flags[1]?.message).toBe(PENSIONER_JOB_LOSS_MESSAGE)
    expect(everything.flags[1]?.label).toBe('pension vs layoff')
  })

  it('returns an empty report for a null or undefined input', () => {
    for (const input of [null, undefined]) {
      const report = edgeGuard(input)
      expect(report.accountId).toBeNull()
      expect(report.flags).toEqual([])
      expect(report.needsCare).toBe(false)
    }
  })

  it('treats non finite counts as unknown, not as firing values', () => {
    const profile = makeProfile({
      loan_payment_cents: Number.NaN,
      household_bills_cents: Number.NaN,
    })
    const report = edgeGuard({ accountId: '20111', knownAccountIds: known, profile })
    expect(report.flags).toEqual([])
    expect(report.needsCare).toBe(false)
  })
})

describe('guards inform, never gate: property over every flagged profile', () => {
  it('selects every known id whatever flags it carries', () => {
    const flagged = ARTIFACT.ids.filter((id) => {
      const profile = ARTIFACT.byId.get(id)
      if (!profile) {
        return false
      }
      const flags = profile.flags
      return (
        flags.pensioner ||
        flags.thin_history ||
        flags.zero_income ||
        flags.defaulted_loan ||
        flags.negative_buffer
      )
    })
    expect(flagged.length).toBeGreaterThan(500)

    useConsole.setState({ status: 'ready', error: null, bundle: ARTIFACT })
    for (const id of flagged) {
      // The guard would report at least one flag for every one of these,
      // and selection still takes the id without a special case.
      const report = edgeGuard({
        accountId: id,
        knownAccountIds: ARTIFACT.ids,
        profile: ARTIFACT.byId.get(id) ?? null,
        jobLossActive: true,
      })
      expect(report.needsCare, id).toBe(true)
      useConsole.getState().selectAccount(id)
      expect(useConsole.getState().selectedId, id).toBe(id)
    }
    useConsole.setState({ bundle: null, selectedId: null, status: 'idle' })
  })
})

describe('randomAccountPool and pickRandomAccount', () => {
  it('keeps only safe demo accounts in the pool', () => {
    const pool = randomAccountPool(ARTIFACT)
    expect(pool.length).toBeGreaterThan(100)
    expect(pool).toContain('68257')
    for (const id of pool) {
      const profile = ARTIFACT.byId.get(id)
      expect(profile, id).toBeDefined()
      if (!profile) continue
      const flags = profile.flags
      expect(
        flags.pensioner || flags.thin_history || flags.zero_income || flags.defaulted_loan || flags.negative_buffer,
        id,
      ).toBe(false)
      expect(profile.income_cents, id).toBeGreaterThan(0)
      expect(profile.household_bills_cents, id).toBeGreaterThan(0)
      expect(profile.runway_state, id).toBe('finite')
      expect(profile.runway_deci_months, id).toBeGreaterThanOrEqual(20)
      expect(profile.runway_deci_months, id).toBeLessThanOrEqual(600)
    }
  })

  it('excludes every flagged, zero, non finite, and out of range account', () => {
    const pool = new Set(randomAccountPool(ARTIFACT))
    expect(pool.has('98952')).toBe(false)
    expect(pool.has('49900')).toBe(false)
    expect(pool.has('42988')).toBe(false)
    expect(pool.has('23838')).toBe(false)
    for (const id of ARTIFACT.ids) {
      const profile = ARTIFACT.byId.get(id)
      if (!profile) continue
      const unsafe =
        profile.flags.pensioner ||
        profile.flags.thin_history ||
        profile.flags.zero_income ||
        profile.flags.defaulted_loan ||
        profile.flags.negative_buffer ||
        profile.income_cents <= 0 ||
        profile.household_bills_cents <= 0 ||
        profile.runway_state !== 'finite' ||
        profile.runway_deci_months < 20 ||
        profile.runway_deci_months > 600
      expect(pool.has(id), id).toBe(!unsafe)
    }
  })

  it('draws deterministically under a stubbed rng', () => {
    const pool = randomAccountPool(ARTIFACT)
    expect(pickRandomAccount(ARTIFACT, { rng: () => 0 })).toBe(pool[0])
    expect(pickRandomAccount(ARTIFACT, { rng: () => 0.5 })).toBe(
      pool[Math.floor(0.5 * pool.length)],
    )
    expect(pickRandomAccount(ARTIFACT, { rng: () => 0.999999 })).toBe(pool[pool.length - 1])
    // An rng that overshoots or returns nonsense still lands in range.
    expect(pickRandomAccount(ARTIFACT, { rng: () => 1 })).toBe(pool[pool.length - 1])
    expect(pickRandomAccount(ARTIFACT, { rng: () => Number.NaN })).toBe(pool[0])
  })

  it('honors excludeId on every draw position', () => {
    const pool = randomAccountPool(ARTIFACT)
    const first = pool[0] as string
    const last = pool[pool.length - 1] as string
    expect(pickRandomAccount(ARTIFACT, { excludeId: first, rng: () => 0 })).toBe(pool[1])
    expect(pickRandomAccount(ARTIFACT, { excludeId: last, rng: () => 0.999999 })).toBe(
      pool[pool.length - 2],
    )
    const only = pickRandomAccount(ARTIFACT, { excludeId: first, rng: () => 0 })
    expect(only).not.toBe(first)
  })

  it('returns null with no artifact, an empty pool, or everything excluded', () => {
    expect(randomAccountPool(null)).toEqual([])
    expect(randomAccountPool(undefined)).toEqual([])
    expect(pickRandomAccount(null, { rng: () => 0 })).toBeNull()
    const pool = randomAccountPool(ARTIFACT)
    expect(pickRandomAccount(ARTIFACT, { excludeId: null, rng: () => 0 })).toBe(pool[0])
    for (const id of pool) {
      const draw = pickRandomAccount(ARTIFACT, { excludeId: id, rng: () => 0 })
      expect(draw, id).not.toBe(id)
    }
  })
})

describe('content rule: no dash copy anywhere in the judge mode sources', () => {
  const SOURCES = [
    'src/lib/judgeMode.ts',
    'src/lib/judgeMode.test.ts',
    'src/lib/rehearsal.ts',
    'src/lib/rehearsal.test.ts',
    'src/components/judge/JudgeBar.tsx',
    'src/components/judge/GuardChips.tsx',
    'src/components/judge/RehearsalDock.tsx',
    'src/components/judge/useJudgeShortcuts.ts',
    'src/components/judge/useEdgeGuard.ts',
    'public/judge-sheet.html',
  ]

  /** Comments, strings, and JSX text out of one source: that is the copy. */
  function proseOf(text: string): string[] {
    const chunks: string[] = []
    const withoutBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (chunk) => {
      chunks.push(chunk)
      return ' '
    })
    const withoutComments = withoutBlocks.replace(/\/\/[^\n]*/g, (chunk) => {
      chunks.push(chunk)
      return ' '
    })
    const stringPattern = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g
    let match: RegExpExecArray | null
    while ((match = stringPattern.exec(withoutComments)) !== null) {
      chunks.push(match[0].replace(/\$\{[^}]*\}/g, ''))
    }
    const prosePattern = />([^<>{}]+)</g
    while ((match = prosePattern.exec(withoutComments)) !== null) {
      const chunk = match[1] ?? ''
      if (/[\p{L}]/u.test(chunk) && /^[\p{L}\p{N} .,:()'"/!?&+%-]+$/u.test(chunk)) {
        chunks.push(chunk)
      }
    }
    return chunks
  }

  it('keeps dash code points and dash copy out of the sources', () => {
    const emDash = String.fromCharCode(0x2014)
    const enDash = String.fromCharCode(0x2013)
    const minusSign = String.fromCharCode(0x2212)
    const doubleHyphen = '-'.repeat(2)
    const spacedHyphen = [' ', '-', ' '].join('')
    const found: string[] = []
    for (const relative of SOURCES) {
      const file = new URL(`../../${relative}`, import.meta.url)
      const text = readFileSync(file, 'utf8')
      text.split('\n').forEach((line, index) => {
        for (const character of [emDash, enDash, minusSign]) {
          if (line.includes(character)) {
            found.push(`${relative}:${index + 1}: dash code point`)
          }
        }
      })
      for (const chunk of proseOf(text)) {
        if (chunk.includes(doubleHyphen) || chunk.includes(spacedHyphen)) {
          found.push(`${relative}: hyphen copy in copy: ${chunk.trim().slice(0, 120)}`)
        }
      }
    }
    expect(found).toEqual([])
  })

  it('keeps every shipped label and message free of dashes', () => {
    const dashCodePoints = new Set([0x2014, 0x2013, 0x2212])
    const copy = [
      ...JUDGE_SHORTCUTS.flatMap((binding) => [binding.label, binding.id]),
      ...Object.values(GUARD_MESSAGES),
      ...Object.values(GUARD_LABELS),
      PENSIONER_IDLE_MESSAGE,
      PENSIONER_JOB_LOSS_MESSAGE,
      LOAN_IN_ARREARS_MESSAGE,
      LOAN_CLOSED_DEFAULT_MESSAGE,
    ]
    for (const line of copy) {
      expect([...line].some((character) => dashCodePoints.has(character.codePointAt(0) ?? 0))).toBe(
        false,
      )
      expect(line.includes('-'.repeat(2))).toBe(false)
      expect(line.includes([' ', '-', ' '].join(''))).toBe(false)
    }
  })
})
