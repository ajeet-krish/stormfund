import type { AccountProfile, ProfilesArtifact } from '../data/profiles'

/**
 * Phase E6 judge mode: the one key table and the edge account guard.
 * Both are plain functions over typed inputs, no React and no DOM here,
 * so the E6 view only wires listeners and markup while the rules stay
 * unit tested.
 *
 * JUDGE_SHORTCUTS is the single source for every judge key on the page
 * (docs/decisions.md, Phase E6): the four twist cards, the two resets,
 * the lookup focus, the layered dismiss, and the random account draw.
 * The consoleStore comment block points here instead of repeating the
 * map, so the registry can never drift from the store again.
 *
 * Context rules live in resolveJudgeKey: a binding only fires when the
 * focus is outside a text entry, or the binding opts in with
 * allowInTextEntry (only Esc does), and while the typed shock gate is
 * open only Esc resolves. Modifiers are rejected as a class except the
 * one allowShift binding (Shift + R), and a repeated or composing key
 * press never fires.
 *
 * The guard flags accounts that need care before a judge reads them
 * aloud: the five E1 flags straight off profile.flags, the no loan and
 * zero bills rules off the profile fields, and the pensioner message
 * that changes under a live layoff twist. It reports, it never blocks:
 * any known account id stays selectable whatever its flags are (hard
 * constraint in docs/architecture.md).
 */

/** One action the console can take from a key press or a bar click. */
export type JudgeAction =
  | { kind: 'twist'; preset: 1 | 2 | 3 | 4 }
  | { kind: 'reset_twist' }
  | { kind: 'reset_all' }
  | { kind: 'focus_lookup' }
  | { kind: 'dismiss' }
  | { kind: 'random_account' }

/** One registered shortcut: the keys it listens for and what it fires. */
export interface ShortcutBinding {
  /** Stable id for React keys and active state comparison. */
  id: string
  /** KeyboardEvent.key values that fire this binding, first is displayed. */
  keys: readonly string[]
  /** Sentence case label shown in the bar. */
  label: string
  action: JudgeAction
  /** True when a held Shift still fires this binding (only Shift + R). */
  allowShift?: boolean
  /** True when the binding fires with focus inside a text entry (only Esc). */
  allowInTextEntry?: boolean
}

/**
 * The registry, in the order the bar renders it: the four twist cards
 * in SHOCK_PRESETS order (src/lib/shockPresets.ts), then the two
 * resets, the lookup focus, the layered dismiss, and the random draw.
 */
export const JUDGE_SHORTCUTS: readonly ShortcutBinding[] = [
  {
    id: 'twist-1',
    keys: ['1'],
    label: 'Laid off',
    action: { kind: 'twist', preset: 1 },
  },
  {
    id: 'twist-2',
    keys: ['2'],
    label: 'Bills up 15%',
    action: { kind: 'twist', preset: 2 },
  },
  {
    id: 'twist-3',
    keys: ['3'],
    label: 'Furnace repair',
    action: { kind: 'twist', preset: 3 },
  },
  {
    id: 'twist-4',
    keys: ['4'],
    label: 'Laid off and bills up',
    action: { kind: 'twist', preset: 4 },
  },
  {
    id: 'reset-twist',
    keys: ['r'],
    label: 'Reset the twist',
    action: { kind: 'reset_twist' },
  },
  {
    id: 'reset-all',
    keys: ['R'],
    label: 'Reset everything',
    action: { kind: 'reset_all' },
    allowShift: true,
  },
  {
    id: 'focus-lookup',
    keys: ['/'],
    label: 'Focus the lookup',
    action: { kind: 'focus_lookup' },
  },
  {
    id: 'dismiss',
    keys: ['Escape'],
    label: 'Dismiss',
    action: { kind: 'dismiss' },
    allowInTextEntry: true,
  },
  {
    id: 'random-account',
    keys: ['n'],
    label: 'Random account',
    action: { kind: 'random_account' },
  },
]

/** The subset of a KeyboardEvent this registry reads (node test friendly). */
export interface ShortcutKeyEvent {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  repeat?: boolean
  isComposing?: boolean
}

/** What the key press landed in: text entry, gate state, or plain page. */
export interface JudgeKeyContext {
  /** True when focus sits in an input, textarea, select, or editable. */
  inTextEntry: boolean
  /** True while the typed shock gate reads or waits to confirm. */
  typedGateOpen: boolean
}

function hasHardModifier(event: ShortcutKeyEvent): boolean {
  return event.ctrlKey === true || event.metaKey === true || event.altKey === true
}

/**
 * Resolve one key event to its binding, or null. The rules, in order:
 * ctrl, meta, and alt are always rejected; a repeated or composing key
 * press is ignored; the key must match a binding exactly; and a held
 * Shift only survives for a binding that sets allowShift. Matching is
 * exact on KeyboardEvent.key, so "1" fires and "!" (shift held on most
 * layouts) does not, and a caller may pass a custom registry to test or
 * extend the bindings.
 */
function matchBinding(
  event: ShortcutKeyEvent | null | undefined,
  shortcuts: readonly ShortcutBinding[],
): ShortcutBinding | null {
  if (!event || typeof event.key !== 'string' || event.key.length === 0) {
    return null
  }
  if (hasHardModifier(event) || event.repeat === true || event.isComposing === true) {
    return null
  }
  const shiftKey = event.shiftKey === true
  for (const binding of shortcuts) {
    if (!binding.keys.includes(event.key)) {
      continue
    }
    if (shiftKey && binding.allowShift !== true) {
      return null
    }
    return binding
  }
  return null
}

/** The matching action, or null for an unbound, modified, or repeated key. */
export function matchShortcut(
  event: ShortcutKeyEvent | null | undefined,
  shortcuts: readonly ShortcutBinding[] = JUDGE_SHORTCUTS,
): JudgeAction | null {
  return matchBinding(event, shortcuts)?.action ?? null
}

/**
 * The full context gate: the same matching rules plus where the key
 * landed. While focus is in a text entry only a binding with
 * allowInTextEntry resolves (the Esc dismiss, so a judge can always
 * back out), and while the typed shock gate is open only Esc resolves.
 * This branch is the whole reason typing "1" or "n" in the lookup
 * cannot fire a shortcut.
 */
export function resolveJudgeKey(
  event: ShortcutKeyEvent | null | undefined,
  context: JudgeKeyContext,
  shortcuts: readonly ShortcutBinding[] = JUDGE_SHORTCUTS,
): JudgeAction | null {
  const binding = matchBinding(event, shortcuts)
  if (!binding) {
    return null
  }
  if (context.inTextEntry === true && binding.allowInTextEntry !== true) {
    return null
  }
  if (context.typedGateOpen === true && binding.action.kind !== 'dismiss') {
    return null
  }
  return binding.action
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

/** The eight guard flags, in the order the bar lists them. */
export const GUARD_FLAG_ORDER = [
  'unknown_account',
  'pensioner',
  'zero_income',
  'thin_history',
  'negative_buffer',
  'defaulted_loan',
  'no_loan',
  'zero_household_bills',
] as const

export type GuardFlagId = (typeof GUARD_FLAG_ORDER)[number]

export interface GuardFlag {
  id: GuardFlagId
  /** Short chip caption for the row of chips. */
  label: string
  /** Full sentence the chip expands to on hover and for screen readers. */
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

/** Everything the guard reads: the loaded ids, the profile, the twist. */
export interface GuardInput {
  accountId?: string | null
  /** Loaded profile ids; pass null when no index exists yet. */
  knownAccountIds?: readonly string[] | null
  /** The parsed profile for this id; null means no profile to read. */
  profile?: AccountProfile | null
  /** True while a job loss twist (layoff or combo) is live. */
  jobLossActive?: boolean
}

/** Printed line per flag, one sentence, no dashes. */
export const GUARD_MESSAGES = {
  unknown_account: 'Account id is not in the loaded profile set',
  zero_income: 'Zero income: money in is 0, so the layoff and EI framing does not apply',
  thin_history:
    'Thin history: fewer than 18 monthly rows, so the baseline medians rest on a short window',
  negative_buffer: 'Savings buffer is below zero: the baseline already reads 0.0 months of runway',
  no_loan: 'No running loan payment: the loan deferral lever does not apply',
  zero_household_bills: 'Household bills are 0: a bills shock cannot move this account',
} as const

/** The pensioner message, idle versus a live layoff twist. */
export const PENSIONER_IDLE_MESSAGE =
  'Pension income account: money in is pension, not wages'
export const PENSIONER_JOB_LOSS_MESSAGE =
  'Layoff twist simulated against pension income: this account has no wage to lose, read the verdict as a stress test'

/** The defaulted loan message, by the shipped loan status letter. */
export const LOAN_IN_ARREARS_MESSAGE =
  'Loan in arrears (status D): the account still pays a loan it is behind on.'
export const LOAN_CLOSED_DEFAULT_MESSAGE =
  'Loan defaulted and closed (status B): no payment runs, so the loan levers do not apply'

/** Chip captions, one per flag, with the pensioner variant. */
export const GUARD_LABELS = {
  unknown_account: 'unknown id',
  pensioner: 'pension income',
  zero_income: 'zero income',
  thin_history: 'thin history',
  negative_buffer: 'negative buffer',
  defaulted_loan: 'defaulted loan',
  no_loan: 'no loan',
  zero_household_bills: 'zero bills',
} as const

export const PENSIONER_JOB_LOSS_LABEL = 'pension vs layoff'

/** Everything a flag message can vary on. */
interface GuardContext {
  jobLossActive: boolean
  loanStatus: string | null
}

function fire(id: GuardFlagId, context: GuardContext): GuardFlag {
  if (id === 'pensioner') {
    return {
      id,
      label: context.jobLossActive ? PENSIONER_JOB_LOSS_LABEL : GUARD_LABELS.pensioner,
      message: context.jobLossActive ? PENSIONER_JOB_LOSS_MESSAGE : PENSIONER_IDLE_MESSAGE,
    }
  }
  if (id === 'defaulted_loan') {
    return {
      id,
      label: GUARD_LABELS.defaulted_loan,
      message:
        context.loanStatus === 'B' ? LOAN_CLOSED_DEFAULT_MESSAGE : LOAN_IN_ARREARS_MESSAGE,
    }
  }
  return { id, label: GUARD_LABELS[id], message: GUARD_MESSAGES[id] }
}

function isCount(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Flag the accounts that need care before a judge reads them. The rules:
 *
 * 1. unknown_account: the id is missing, empty, or absent from the
 *    loaded id index when an index was supplied.
 * 2. pensioner: the E1 pensioner flag, with the message that changes
 *    when a layoff twist is live against pension income.
 * 3. zero_income, 4. thin_history, 5. negative_buffer, 6. defaulted_loan:
 *    the E1 flags read straight off profile.flags, with the defaulted
 *    loan line chosen by the loan status letter (D or B).
 * 7. no_loan: loan payment P exactly 0 (no running loan).
 * 8. zero_household_bills: household bills H exactly 0.
 *
 * A null or undefined input returns an empty report so a view can mount
 * the bar before the first lookup. Flags never change a metric and
 * never block a render: they are advice the UI prints, and every known
 * account id stays selectable whatever its flags say
 * (docs/architecture.md, any account must work).
 */
export function edgeGuard(input: GuardInput | null | undefined): GuardReport {
  if (!input) {
    return { accountId: null, flags: [], needsCare: false }
  }

  const accountId = typeof input.accountId === 'string' && input.accountId.length > 0
    ? input.accountId
    : null
  const known = input.knownAccountIds
  const idKnown =
    accountId !== null && (known === null || known === undefined || known.includes(accountId))

  const flags: GuardFlag[] = []
  const context: GuardContext = {
    jobLossActive: input.jobLossActive === true,
    loanStatus: null,
  }

  if (!idKnown) {
    flags.push(fire('unknown_account', context))
  }

  const profile = input.profile ?? null
  if (profile) {
    context.loanStatus = profile.loan === null ? null : profile.loan.status
    if (profile.flags.pensioner) flags.push(fire('pensioner', context))
    if (profile.flags.zero_income) flags.push(fire('zero_income', context))
    if (profile.flags.thin_history) flags.push(fire('thin_history', context))
    if (profile.flags.negative_buffer) flags.push(fire('negative_buffer', context))
    if (profile.flags.defaulted_loan) flags.push(fire('defaulted_loan', context))
    if (isCount(profile.loan_payment_cents) && profile.loan_payment_cents === 0) {
      flags.push(fire('no_loan', context))
    }
    if (isCount(profile.household_bills_cents) && profile.household_bills_cents === 0) {
      flags.push(fire('zero_household_bills', context))
    }
  }

  // Canonical order, independent of the detection order above, so the
  // bar renders a stable list for the same account every time.
  const ordered = GUARD_FLAG_ORDER.map((id) => flags.find((flag) => flag.id === id)).filter(
    (flag): flag is GuardFlag => flag !== undefined,
  )

  return { accountId, flags: ordered, needsCare: ordered.length > 0 }
}

/**
 * The N key pool: safe demo accounts only. Every flag false, money in
 * and household bills above zero, a finite runway, and a baseline
 * between 2.0 and 60.0 months, so a random draw never surprises a judge
 * with an account that needs a caveat first.
 */
export function randomAccountPool(artifact: ProfilesArtifact | null | undefined): string[] {
  if (!artifact) {
    return []
  }
  const pool: string[] = []
  for (const id of artifact.ids) {
    const profile = artifact.byId.get(id)
    if (!profile) {
      continue
    }
    const flags = profile.flags
    const anyFlag =
      flags.pensioner ||
      flags.thin_history ||
      flags.zero_income ||
      flags.defaulted_loan ||
      flags.negative_buffer
    if (anyFlag) {
      continue
    }
    if (profile.income_cents <= 0 || profile.household_bills_cents <= 0) {
      continue
    }
    if (profile.runway_state !== 'finite') {
      continue
    }
    if (profile.runway_deci_months < 20 || profile.runway_deci_months > 600) {
      continue
    }
    pool.push(id)
  }
  return pool
}

export interface PickRandomOptions {
  /** Never return this id (the account already on screen). */
  excludeId?: string | null
  /** Injectable random source in [0, 1); defaults to Math.random. */
  rng?: () => number
}

/**
 * One pseudo random draw from the safe demo pool, or null when the pool
 * runs dry (no artifact, every id excluded, or nothing qualifies). The
 * rng is injectable so the smoke test can pin the answer.
 */
export function pickRandomAccount(
  artifact: ProfilesArtifact | null | undefined,
  options: PickRandomOptions = {},
): string | null {
  const excludeId = options.excludeId ?? null
  const rng = options.rng ?? Math.random
  const pool = randomAccountPool(artifact).filter((id) => id !== excludeId)
  if (pool.length === 0) {
    return null
  }
  const sample = rng()
  const index = Number.isFinite(sample) ? Math.floor(sample * pool.length) : 0
  const clamped = Math.min(pool.length - 1, Math.max(0, index))
  return pool[clamped] ?? null
}
