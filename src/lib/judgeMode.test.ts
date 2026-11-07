import { describe, expect, it } from 'vitest'
import {
  GUARD_FLAG_ORDER,
  GUARD_MIN_ROWS,
  GUARD_MESSAGES,
  JUDGE_SHORTCUTS,
  bindingForAction,
  edgeGuard,
  matchShortcut,
  sameJudgeAction,
  type ShortcutBinding,
} from './judgeMode'

/**
 * Judge mode unit tests: the shortcut registry fires the three twist
 * keys, clear, and account navigation, modified keys never fire, and
 * every one of the five edge guard flags fires at its boundary and
 * stays quiet just past it.
 */

describe('matchShortcut: the registry', () => {
  it('fires the three twist presets on number keys 1 to 3', () => {
    expect(matchShortcut({ key: '1' })).toEqual({ kind: 'twist', preset: 1 })
    expect(matchShortcut({ key: '2' })).toEqual({ kind: 'twist', preset: 2 })
    expect(matchShortcut({ key: '3' })).toEqual({ kind: 'twist', preset: 3 })
  })

  it('fires clear on 0 and account navigation on the arrow keys', () => {
    expect(matchShortcut({ key: '0' })).toEqual({ kind: 'clear_shock' })
    expect(matchShortcut({ key: 'ArrowLeft' })).toEqual({ kind: 'account_prev' })
    expect(matchShortcut({ key: 'ArrowRight' })).toEqual({ kind: 'account_next' })
  })

  it('returns null for unbound keys, empty keys, and missing events', () => {
    expect(matchShortcut({ key: 'a' })).toBeNull()
    expect(matchShortcut({ key: '!' })).toBeNull()
    expect(matchShortcut({ key: '' })).toBeNull()
    expect(matchShortcut({ key: 'F5' })).toBeNull()
    expect(matchShortcut(null)).toBeNull()
    expect(matchShortcut(undefined)).toBeNull()
    expect(matchShortcut({ key: 4 as unknown as string })).toBeNull()
  })

  it('never fires with a modifier held, so browser shortcuts stay safe', () => {
    expect(matchShortcut({ key: '1', ctrlKey: true })).toBeNull()
    expect(matchShortcut({ key: '1', metaKey: true })).toBeNull()
    expect(matchShortcut({ key: '0', altKey: true })).toBeNull()
    expect(matchShortcut({ key: 'ArrowRight', shiftKey: true })).toBeNull()
    expect(matchShortcut({ key: 'ArrowRight', ctrlKey: false, metaKey: false })).toEqual({
      kind: 'account_next',
    })
  })

  it('matches against a caller supplied registry', () => {
    const custom: readonly ShortcutBinding[] = [
      { id: 'only-4', keys: ['4'], label: 'Fourth card', action: { kind: 'twist', preset: 3 } },
    ]
    expect(matchShortcut({ key: '4' }, custom)).toEqual({ kind: 'twist', preset: 3 })
    expect(matchShortcut({ key: '1' }, custom)).toBeNull()
  })

  it('exports six bindings in bar order with unique ids', () => {
    expect(JUDGE_SHORTCUTS).toHaveLength(6)
    expect(new Set(JUDGE_SHORTCUTS.map((binding) => binding.id)).size).toBe(6)
    expect(JUDGE_SHORTCUTS[0]?.keys[0]).toBe('1')
    expect(JUDGE_SHORTCUTS[5]?.keys[0]).toBe('ArrowRight')
    for (const binding of JUDGE_SHORTCUTS) {
      expect(binding.label.length).toBeGreaterThan(3)
      expect(binding.keys.length).toBeGreaterThan(0)
    }
  })
})

describe('sameJudgeAction and bindingForAction', () => {
  it('compares actions field by field', () => {
    expect(sameJudgeAction({ kind: 'twist', preset: 1 }, { kind: 'twist', preset: 1 })).toBe(true)
    expect(sameJudgeAction({ kind: 'twist', preset: 1 }, { kind: 'twist', preset: 2 })).toBe(false)
    expect(sameJudgeAction({ kind: 'clear_shock' }, { kind: 'clear_shock' })).toBe(true)
    expect(sameJudgeAction({ kind: 'account_prev' }, { kind: 'account_next' })).toBe(false)
    expect(sameJudgeAction(null, { kind: 'clear_shock' })).toBe(false)
    expect(sameJudgeAction({ kind: 'clear_shock' }, null)).toBe(false)
    expect(sameJudgeAction(null, null)).toBe(false)
  })

  it('finds the keycap to highlight for an active action', () => {
    expect(bindingForAction({ kind: 'twist', preset: 2 })?.id).toBe('twist-2')
    expect(bindingForAction({ kind: 'clear_shock' })?.id).toBe('clear-shock')
    expect(bindingForAction({ kind: 'account_prev' })?.id).toBe('account-prev')
    expect(bindingForAction(null)).toBeNull()
    expect(bindingForAction({ kind: 'twist', preset: 3 }, [])).toBeNull()
  })
})

describe('edgeGuard: each flag at its boundary', () => {
  const known = ['20111', '20112', '20113']

  it('reads a healthy account as no care needed', () => {
    const report = edgeGuard({
      accountId: '20111',
      knownAccountIds: known,
      rowCount: 72,
      bufferCents: 500_000,
      loanPaymentCents: 30_000,
      householdBillsCents: 120_000,
    })
    expect(report.accountId).toBe('20111')
    expect(report.flags).toEqual([])
    expect(report.needsCare).toBe(false)
  })

  it('flags an unknown account id, and only an unknown one', () => {
    const unknown = edgeGuard({ accountId: '99999', knownAccountIds: known })
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

  it('flags fewer than 6 monthly rows, and stays quiet at exactly 6', () => {
    const short = edgeGuard({ accountId: '20111', rowCount: GUARD_MIN_ROWS - 1 })
    expect(short.flags.map((flag) => flag.id)).toContain('short_history')
    expect(short.needsCare).toBe(true)

    const atLine = edgeGuard({ accountId: '20111', rowCount: 6 })
    expect(atLine.flags.map((flag) => flag.id)).not.toContain('short_history')

    const unknownRows = edgeGuard({ accountId: '20111', rowCount: null })
    expect(unknownRows.flags.map((flag) => flag.id)).not.toContain('short_history')
  })

  it('flags a negative buffer, and stays quiet at exactly zero', () => {
    const negative = edgeGuard({ accountId: '20111', bufferCents: -1 })
    expect(negative.flags.map((flag) => flag.id)).toContain('negative_buffer')
    expect(negative.needsCare).toBe(true)

    const zero = edgeGuard({ accountId: '20111', bufferCents: 0 })
    expect(zero.flags.map((flag) => flag.id)).not.toContain('negative_buffer')
  })

  it('flags no loan on an explicit zero payment only', () => {
    const noLoan = edgeGuard({ accountId: '20111', loanPaymentCents: 0 })
    expect(noLoan.flags.map((flag) => flag.id)).toContain('no_loan')
    expect(noLoan.needsCare).toBe(true)

    const withLoan = edgeGuard({ accountId: '20111', loanPaymentCents: 1 })
    expect(withLoan.flags.map((flag) => flag.id)).not.toContain('no_loan')

    const unknownLoan = edgeGuard({ accountId: '20111', loanPaymentCents: null })
    expect(unknownLoan.flags.map((flag) => flag.id)).not.toContain('no_loan')
  })

  it('flags household bills at exactly zero', () => {
    const noBills = edgeGuard({ accountId: '20111', householdBillsCents: 0 })
    expect(noBills.flags.map((flag) => flag.id)).toContain('zero_household_bills')
    expect(noBills.needsCare).toBe(true)

    const oneCent = edgeGuard({ accountId: '20111', householdBillsCents: 1 })
    expect(oneCent.flags.map((flag) => flag.id)).not.toContain('zero_household_bills')
  })

  it('reports every flag at once in canonical order with messages', () => {
    const everything = edgeGuard({
      accountId: null,
      knownAccountIds: known,
      rowCount: 3,
      bufferCents: -5_000,
      loanPaymentCents: 0,
      householdBillsCents: 0,
    })
    expect(everything.flags.map((flag) => flag.id)).toEqual([...GUARD_FLAG_ORDER])
    expect(everything.needsCare).toBe(true)
    for (const flag of everything.flags) {
      expect(flag.message).toBe(GUARD_MESSAGES[flag.id])
      expect(flag.message.length).toBeGreaterThan(10)
      // Dash code points by value (em dash U+2014, en dash U+2013,
      // minus sign U+2212) plus the double hyphen check.
      const dashCodePoints = new Set([0x2014, 0x2013, 0x2212])
      const hasDash = [...flag.message].some((char) =>
        dashCodePoints.has(char.codePointAt(0) ?? 0),
      )
      expect(hasDash).toBe(false)
      // Assembled from code points so this test file holds no dash glyph.
      expect(flag.message.includes('-'.repeat(2))).toBe(false)
    }
  })

  it('returns an empty report for a null or undefined input', () => {
    for (const input of [null, undefined]) {
      const report = edgeGuard(input)
      expect(report.accountId).toBeNull()
      expect(report.flags).toEqual([])
      expect(report.needsCare).toBe(false)
    }
  })

  it('treats non finite numbers as unknown, not as firing values', () => {
    const report = edgeGuard({
      accountId: '20111',
      rowCount: Number.NaN,
      bufferCents: Number.POSITIVE_INFINITY,
      loanPaymentCents: Number.NaN,
      householdBillsCents: Number.NaN,
    })
    expect(report.flags).toEqual([])
    expect(report.needsCare).toBe(false)
  })
})
