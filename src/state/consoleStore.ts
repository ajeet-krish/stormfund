import { create } from 'zustand'
import { loadSharedProfiles, type ProfilesArtifact } from '../data/profiles'
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
 */

export type BootStatus = 'idle' | 'loading' | 'ready' | 'error'

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

export const useConsole = create<ConsoleState>((set, get) => ({
  status: 'idle',
  error: null,
  bundle: null,
  query: '',
  selectedId: null,
  twist: IDLE_TWIST,
  activePresetId: null,

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
    set({ selectedId: id })
  },

  applyPreset: (id) => {
    const preset = presetById(id)
    if (!preset) {
      return
    }
    set({ twist: normalizeTwist(preset.twist), activePresetId: preset.id })
  },

  setTwistField: (patch) => {
    const twist = normalizeTwist({ ...get().twist, ...patch })
    set({ twist, activePresetId: matchPreset(twist) })
  },

  resetTwist: () => {
    set({ twist: IDLE_TWIST, activePresetId: null })
  },

  resetAll: () => {
    set({
      query: '',
      selectedId: null,
      twist: IDLE_TWIST,
      activePresetId: null,
    })
  },
}))
