import { create } from 'zustand'
import { loadSharedProfiles, type ProfilesArtifact } from '../data/profiles'
import {
  applySpecStep,
  parseShockSentence,
  promptMetrics,
  shockSpecToTwist,
  type ParseFix,
  type ParseRejected,
  type ParseTimeout,
  type ShockIntent,
  type ShockSpec,
  type SpecField,
} from '../lib/shockParse'
import { presetById, SHOCK_PRESETS, type PresetId } from '../lib/shockPresets'
import { IDLE_TWIST, normalizeTwist, sameTwist, type Twist } from '../lib/shocks'

/**
 * Console state (Phase E2): one boot, one selected account, one twist.
 * The store holds only what is genuinely shared and asynchronous; every
 * derived number (shock result, verdict band, plan text) is computed in
 * ConsoleView with useMemo from pure lib functions, so the store never
 * carries a second copy of the math and no selector can drift from the
 * card it renders.
 *
 * E6 judge mode reserves these keys (NOT wired in E2, no listeners here):
 *   R           reset the twist, keep the account
 *   Shift + R   reset everything, account included
 *   1 to 4      play shock preset layoff, cost_spike, emergency_repair, combo
 *   /           focus the account lookup input (id="account-lookup")
 *   Esc         clear the lookup query
 *   N           open a random account from the id index
 * When E6 lands it will read and write this same store, which is why the
 * preset buttons already carry data-preset attributes and every button is
 * type="button" (no form, no accidental submit).
 *
 * Typed slice (gated Gemini add-on, docs/architecture.md): parseTypedShock
 * runs the shockParse boundary and parks an ok result in pendingShock.
 * pendingShock never writes twist, so the runway cannot move until
 * confirmTypedShock; every failure lands in typedStatus fallback with a
 * mapped note and the preset cards keep working. shockMode records which
 * path produced the live twist.
 */

export type BootStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Typed parse lifecycle: idle, reading, awaiting confirm, or fallback. */
export type TypedStatus = 'idle' | 'reading' | 'pending' | 'fallback'

/** Which path produced the live twist: preset cards or typed Gemini. */
export type ShockMode = 'preset' | 'gemini'

/** A parsed shock waiting for confirmation; sentence kept for the chips. */
export interface PendingShock {
  sentence: string
  spec: ShockSpec
  intent: ShockIntent
  confidence: 'high' | 'medium'
  summary: string
  fixes: ParseFix[]
}

export interface ConsoleState {
  /** Boot lifecycle: idle before the first attempt, error with a message. */
  status: BootStatus
  /** Human readable boot failure, null unless status is error. */
  error: string | null
  /** The parsed profiles artifact, null until the boot succeeds. */
  bundle: ProfilesArtifact | null
  /** Raw lookup text, exactly what the judge typed. */
  query: string
  /** Selected account id, validated against bundle.byId. */
  selectedId: string | null
  /** The live twist, always normalized. */
  twist: Twist
  /** The preset matching the twist field for field, else null. */
  activePresetId: PresetId | null
  /** Typed parse lifecycle: idle before the first attempt. */
  typedStatus: TypedStatus
  /** A parsed shock awaiting confirm; never writes twist on its own. */
  pendingShock: PendingShock | null
  /** Inline fallback note for the last typed attempt, else null. */
  typedNote: string | null
  /** Which path produced the live twist: preset cards or typed Gemini. */
  shockMode: ShockMode
  /** Idempotent boot: one fetch, retry only after a failure. */
  boot: () => Promise<void>
  setQuery: (query: string) => void
  /** Accept an id only when it exists in the bundle. */
  selectAccount: (id: string) => void
  applyPreset: (id: PresetId) => void
  /** Merge a partial twist, normalize it, then re match the preset. */
  setTwistField: (patch: Partial<Twist>) => void
  /** Back to no shock, account kept. */
  resetTwist: () => void
  /** Back to an empty console: no account, no query, no shock. */
  resetAll: () => void
  /** Run the Gemini parse for one sentence; ok lands in pendingShock. */
  parseTypedShock: (sentence: string) => Promise<void>
  /** The only path from pendingShock into twist. */
  confirmTypedShock: () => void
  /** Step one pending chip field by its unit, clamped by shockParse. */
  adjustPendingShock: (field: SpecField, delta: number) => void
  /** Drop the pending parse and its note; twist stays untouched. */
  cancelTypedShock: () => void
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function matchPreset(twist: Twist): PresetId | null {
  for (const preset of SHOCK_PRESETS) {
    if (sameTwist(normalizeTwist(preset.twist), twist)) {
      return preset.id
    }
  }
  return null
}

/** Fallback notes, one per reject category (docs/architecture.md). */
const NOTE_NO_KEY = 'Gemini key not configured, using preset cards'
const NOTE_UNAVAILABLE = 'Gemini unavailable, using preset cards'
const NOTE_NO_SHOCK = 'No clear shock in that sentence, using preset cards'
const NOTE_NO_ACCOUNT = 'No account selected, using preset cards'

function typedNoteFor(outcome: ParseRejected | ParseTimeout): string {
  if (outcome.status === 'timeout') {
    return NOTE_UNAVAILABLE
  }
  switch (outcome.reason) {
    case 'no_key':
      return NOTE_NO_KEY
    case 'rate_limited':
    case 'http_error':
    case 'network_error':
    case 'aborted':
      return NOTE_UNAVAILABLE
    case 'empty_input':
    case 'malformed_json':
    case 'bad_shape':
    case 'no_shock':
    case 'low_confidence':
    case 'all_neutral':
      return NOTE_NO_SHOCK
  }
}

/**
 * One generation counter owns every typed parse: starting a new
 * attempt or clearing typed state bumps it and aborts the in flight
 * controller, so a stale resolution can never write state after the
 * judge clicked something else.
 */
let parseGeneration = 0
let inFlightParse: AbortController | null = null

function retireTypedParse(): number {
  parseGeneration += 1
  if (inFlightParse) {
    inFlightParse.abort()
    inFlightParse = null
  }
  return parseGeneration
}

export const useConsole = create<ConsoleState>((set, get) => ({
  status: 'idle',
  error: null,
  bundle: null,
  query: '',
  selectedId: null,
  twist: IDLE_TWIST,
  activePresetId: null,
  typedStatus: 'idle',
  pendingShock: null,
  typedNote: null,
  shockMode: 'preset',

  boot: async () => {
    const status = get().status
    if (status === 'loading' || status === 'ready') {
      return
    }
    set({ status: 'loading', error: null })
    try {
      const bundle = await loadSharedProfiles()
      set({ status: 'ready', bundle, error: null })
    } catch (cause) {
      // The shared memo already cleared itself, so the next boot retries.
      set({ status: 'error', bundle: null, error: messageOf(cause) })
    }
  },

  setQuery: (query) => {
    set({ query })
  },

  selectAccount: (id) => {
    const bundle = get().bundle
    if (!bundle || !bundle.byId.has(id)) {
      return
    }
    retireTypedParse()
    set({
      selectedId: id,
      typedStatus: 'idle',
      pendingShock: null,
      typedNote: null,
      shockMode: 'preset',
    })
  },

  applyPreset: (id) => {
    const preset = presetById(id)
    if (!preset) {
      return
    }
    retireTypedParse()
    set({
      twist: normalizeTwist(preset.twist),
      activePresetId: preset.id,
      typedStatus: 'idle',
      pendingShock: null,
      typedNote: null,
      shockMode: 'preset',
    })
  },

  setTwistField: (patch) => {
    const twist = normalizeTwist({ ...get().twist, ...patch })
    set({ twist, activePresetId: matchPreset(twist) })
  },

  resetTwist: () => {
    retireTypedParse()
    set({
      twist: IDLE_TWIST,
      activePresetId: null,
      typedStatus: 'idle',
      pendingShock: null,
      typedNote: null,
      shockMode: 'preset',
    })
  },

  resetAll: () => {
    retireTypedParse()
    set({
      query: '',
      selectedId: null,
      twist: IDLE_TWIST,
      activePresetId: null,
      typedStatus: 'idle',
      pendingShock: null,
      typedNote: null,
      shockMode: 'preset',
    })
  },

  parseTypedShock: async (sentence) => {
    const generation = retireTypedParse()
    const { bundle, selectedId } = get()
    const profile = selectedId ? bundle?.byId.get(selectedId) : undefined
    if (!profile) {
      set({
        typedStatus: 'fallback',
        pendingShock: null,
        typedNote: NOTE_NO_ACCOUNT,
      })
      return
    }
    const controller = new AbortController()
    inFlightParse = controller
    set({ typedStatus: 'reading', pendingShock: null, typedNote: null })
    const outcome = await parseShockSentence(sentence, promptMetrics(profile), controller.signal)
    if (generation !== parseGeneration) {
      return
    }
    inFlightParse = null
    if (outcome.status === 'ok') {
      set({
        typedStatus: 'pending',
        pendingShock: {
          sentence,
          spec: outcome.spec,
          intent: outcome.intent,
          confidence: outcome.confidence,
          summary: outcome.summary,
          fixes: outcome.fixes,
        },
        typedNote: null,
      })
      return
    }
    set({
      typedStatus: 'fallback',
      pendingShock: null,
      typedNote: typedNoteFor(outcome),
    })
  },

  confirmTypedShock: () => {
    const pending = get().pendingShock
    if (!pending) {
      return
    }
    const twist = normalizeTwist(shockSpecToTwist(pending.spec))
    set({
      twist,
      activePresetId: matchPreset(twist),
      shockMode: 'gemini',
      typedStatus: 'idle',
      pendingShock: null,
      typedNote: null,
    })
  },

  adjustPendingShock: (field, delta) => {
    const pending = get().pendingShock
    if (!pending) {
      return
    }
    set({ pendingShock: { ...pending, spec: applySpecStep(pending.spec, field, delta) } })
  },

  cancelTypedShock: () => {
    retireTypedParse()
    set({ typedStatus: 'idle', pendingShock: null, typedNote: null })
  },
}))
