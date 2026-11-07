/**
 * Phase E6 judge mode: the pure keyboard shortcut registry and the edge
 * account guard the bottom bar renders. Both are plain functions over
 * typed inputs, no React and no DOM here, so the E6 view only wires
 * listeners and markup while the rules stay unit tested.
 *
 * Shortcut rules follow the five minute judging format
 * (docs/tangerine-challenge.md): number keys pick a twist card, zero
 * clears the shock so the console returns to baseline between judges,
 * and the arrow keys walk the account list. Any modifier held down
 * (ctrl, meta, alt, or shift) returns null, so judge mode never hijacks
 * a browser shortcut, a devtools command, or a text selection.
 *
 * The guard flags accounts that need care before a judge reads them
 * aloud: short histories, negative buffers, no loan, zero household
 * bills, and unknown ids. It reports, it never blocks: the console must
 * still render every account without a special case (hard constraint in
 * docs/architecture.md).
 */

/** One action the console can take from a key press or a bar click. */
export type JudgeAction =
  | { kind: 'twist'; preset: 1 | 2 | 3 }
  | { kind: 'clear_shock' }
  | { kind: 'account_prev' }
  | { kind: 'account_next' }

/** One registered shortcut: the keys it listens for and what it fires. */
export interface ShortcutBinding {
  /** Stable id for React keys and active state comparison. */
  id: string
  /** KeyboardEvent.key values that fire this binding, first is displayed. */
  keys: readonly string[]
  /** Sentence case label shown in the bar. */
  label: string
  action: JudgeAction
}

/**
 * The registry, in the order the bar renders it: the three twist card
 * presets, clear, then account navigation. The twist actions carry a
 * 1 to 3 preset index that maps onto the SHOCK_PRESETS order in
 * src/lib/shockPresets.ts (wiring note: the console renders four cards
 * today, so extending the registry with a fourth binding is one entry).
 */
export const JUDGE_SHORTCUTS: readonly ShortcutBinding[] = [
  { id: 'twist-1', keys: ['1'], label: 'Twist card 1', action: { kind: 'twist', preset: 1 } },
  { id: 'twist-2', keys: ['2'], label: 'Twist card 2', action: { kind: 'twist', preset: 2 } },
  { id: 'twist-3', keys: ['3'], label: 'Twist card 3', action: { kind: 'twist', preset: 3 } },
  { id: 'clear-shock', keys: ['0'], label: 'Clear the shock', action: { kind: 'clear_shock' } },
  {
    id: 'account-prev',
    keys: ['ArrowLeft'],
    label: 'Previous account',
    action: { kind: 'account_prev' },
  },
  {
    id: 'account-next',
    keys: ['ArrowRight'],
    label: 'Next account',
    action: { kind: 'account_next' },
  },
]

/** The subset of a KeyboardEvent this registry reads (node test friendly). */
export interface ShortcutKeyEvent {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

function hasModifier(event: ShortcutKeyEvent): boolean {
  return event.ctrlKey === true || event.metaKey === true || event.altKey === true || event.shiftKey === true
}

/**
 * Resolve one key event against the registry: the matching action, or
 * null for an unbound key or any modified key. Matching is exact on
 * KeyboardEvent.key, so "1" fires and "!" (shift held on most layouts)
 * does not, and a caller may pass a custom registry to test or extend
 * the bindings.
 */
export function matchShortcut(
  event: ShortcutKeyEvent | null | undefined,
  shortcuts: readonly ShortcutBinding[] = JUDGE_SHORTCUTS,
): JudgeAction | null {
  if (!event || typeof event.key !== 'string' || event.key.length === 0) {
    return null
  }
  if (hasModifier(event)) {
    return null
  }
  for (const binding of shortcuts) {
    if (binding.keys.includes(event.key)) {
      return binding.action
    }
  }
  return null
}

/** Field by field action equality, used to mark the active keycap. */
export function sameJudgeAction(left: JudgeAction | null, right: JudgeAction | null): boolean {
  if (!left || !right) {
    return false
  }
  if (left.kind !== right.kind) {
    return false
  }
  if (left.kind === 'twist' && right.kind === 'twist') {
    return left.preset === right.preset
  }
  return true
}

/** Look a binding up for one action, for the bar's active highlight. */
export function bindingForAction(
  action: JudgeAction | null,
  shortcuts: readonly ShortcutBinding[] = JUDGE_SHORTCUTS,
): ShortcutBinding | null {
  if (!action) {
    return null
  }
  return shortcuts.find((binding) => sameJudgeAction(binding.action, action)) ?? null
}

/** The five guard flags, in the order the bar lists them. */
export const GUARD_FLAG_ORDER = [
  'unknown_account',
  'short_history',
  'negative_buffer',
  'no_loan',
  'zero_household_bills',
] as const

export type GuardFlagId = (typeof GUARD_FLAG_ORDER)[number]

export interface GuardFlag {
  id: GuardFlagId
  /** One line the bar prints for this flag. */
  message: string
}

export interface GuardReport {
  /** The account the guard ran over, null when no account was given. */
  accountId: string | null
  /** Flags in canonical order, empty when nothing needs care. */
  flags: readonly GuardFlag[]
  /** True when at least one flag fired. */
  needsCare: boolean
}

/** Everything the guard reads. Missing values mean unknown, not zero. */
export interface GuardInput {
  accountId?: string | null
  /** Loaded profile ids; pass null when no index exists yet. */
  knownAccountIds?: readonly string[] | null
  /** Monthly row count from the profile history. */
  rowCount?: number | null
  /** Buffer B in integer cents, may be negative. */
  bufferCents?: number | null
  /** Loan payment P in integer cents: 0 means no running loan. */
  loanPaymentCents?: number | null
  /** Household bills H in integer cents. */
  householdBillsCents?: number | null
}

/** Printed line per flag, one sentence, no dashes. */
export const GUARD_MESSAGES: Record<GuardFlagId, string> = {
  unknown_account: 'Account id is not in the loaded profile set',
  short_history: 'Fewer than 6 monthly rows, treat the baseline as low confidence',
  negative_buffer: 'Savings buffer is below zero',
  no_loan: 'No running loan, so the loan payment lever does not apply',
  zero_household_bills: 'Household bills are 0, so a bills shock cannot move this account',
}

/** Fewer than this many monthly rows needs care (the guard threshold). */
export const GUARD_MIN_ROWS = 6

function fire(id: GuardFlagId): GuardFlag {
  return { id, message: GUARD_MESSAGES[id] }
}

function isCount(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Flag the accounts that need care before a judge reads them. The rules,
 * each firing only on an explicit value (an unknown field is unknown,
 * never a false alarm):
 *
 * 1. unknown_account: the id is missing, empty, or absent from the
 *    loaded id index when an index was supplied.
 * 2. short_history: fewer than 6 monthly rows.
 * 3. negative_buffer: buffer B below 0 cents.
 * 4. no_loan: loan payment P exactly 0 (no running loan).
 * 5. zero_household_bills: household bills H exactly 0.
 *
 * A null or undefined input means no account is under guard yet, and
 * returns an empty report so a view can mount the bar before the first
 * lookup. Flags never change a metric and never block a render: they
 * are advice the UI prints (docs/architecture.md, any account must work).
 */
export function edgeGuard(input: GuardInput | null | undefined): GuardReport {
  if (!input) {
    return { accountId: null, flags: [], needsCare: false }
  }

  const accountId = typeof input.accountId === 'string' ? input.accountId : null
  const flags: GuardFlag[] = []

  const known = input.knownAccountIds
  const idKnown =
    accountId !== null &&
    accountId.length > 0 &&
    (known === null || known === undefined || known.includes(accountId))
  if (!idKnown) {
    flags.push(fire('unknown_account'))
  }

  if (isCount(input.rowCount) && input.rowCount < GUARD_MIN_ROWS) {
    flags.push(fire('short_history'))
  }
  if (isCount(input.bufferCents) && input.bufferCents < 0) {
    flags.push(fire('negative_buffer'))
  }
  if (isCount(input.loanPaymentCents) && input.loanPaymentCents === 0) {
    flags.push(fire('no_loan'))
  }
  if (isCount(input.householdBillsCents) && input.householdBillsCents === 0) {
    flags.push(fire('zero_household_bills'))
  }

  // Canonical order, independent of the detection order above, so the
  // bar renders a stable list for the same account every time.
  const ordered = GUARD_FLAG_ORDER.map((id) => flags.find((flag) => flag.id === id)).filter(
    (flag): flag is GuardFlag => flag !== undefined,
  )

  return { accountId, flags: ordered, needsCare: ordered.length > 0 }
}
