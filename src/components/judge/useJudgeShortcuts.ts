import { useCallback, useEffect, useRef } from 'react'
import { pickRandomAccount, resolveJudgeKey, type JudgeAction } from '../../lib/judgeMode'
import { SHOCK_PRESETS } from '../../lib/shockPresets'
import { IDLE_TWIST, sameTwist } from '../../lib/shocks'
import { useConsole } from '../../state/consoleStore'

/**
 * The E6 wiring layer: one dispatcher that maps a JudgeAction onto the
 * existing console store actions (plus the lookup focus), and one
 * window keydown listener that resolves a key press through
 * resolveJudgeKey before it ever reaches the dispatcher. Both live
 * outside React state: the store is the state, the listener is a
 * subscription, and neither re-renders the page on a key press.
 *
 * The layered dismiss is decided here because it needs the live store:
 * an open typed shock gate cancels first, then a non empty lookup
 * query clears, then a selection or a live twist resets everything, and
 * with nothing on screen the key does nothing at all.
 */

/** Options the dispatcher takes; the rng pins the N draw in tests. */
export interface JudgeDispatcherOptions {
  /** Injectable random source for the random account draw. */
  rng?: () => number
}

/** One judge action applied to the live console store. */
export type JudgeDispatcher = (action: JudgeAction) => void

/** True while the typed shock gate reads or waits to confirm. */
export function isTypedGateOpen(status: string): boolean {
  return status === 'reading' || status === 'pending'
}

/** True when the key landed in an input, textarea, select, or editable. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (target === null || typeof (target as Partial<Element>).tagName !== 'string') {
    return false
  }
  const element = target as HTMLElement
  const tag = element.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true
  }
  return element.isContentEditable === true
}

/** The layered Esc rule, decided against the live store. */
function runDismiss(): void {
  const state = useConsole.getState()
  if (isTypedGateOpen(state.typedStatus)) {
    state.cancelTypedShock()
    return
  }
  if (state.query.length > 0) {
    state.setQuery('')
    return
  }
  if (state.selectedId !== null || !sameTwist(state.twist, IDLE_TWIST)) {
    state.resetAll()
    return
  }
  // Nothing on screen: Esc is a no op.
}

/**
 * Build the dispatcher: a stable function that reads the store on
 * demand, so the bar buttons and the key listener share one mapping.
 * Guards inform, they never gate: the random draw and the preset keys
 * only ever hand the store ids and presets it already accepts.
 */
export function useJudgeDispatcher(options: JudgeDispatcherOptions = {}): JudgeDispatcher {
  const rngRef = useRef<(() => number) | undefined>(options.rng)
  rngRef.current = options.rng

  return useCallback((action: JudgeAction) => {
    const store = useConsole.getState()
    switch (action.kind) {
      case 'twist': {
        const preset = SHOCK_PRESETS[action.preset - 1]
        if (preset) {
          store.applyPreset(preset.id)
        }
        return
      }
      case 'reset_twist':
        store.resetTwist()
        return
      case 'reset_all':
        store.resetAll()
        return
      case 'focus_lookup': {
        const input = document.getElementById('account-lookup')
        if (input instanceof HTMLElement) {
          input.focus()
        }
        return
      }
      case 'dismiss':
        runDismiss()
        return
      case 'random_account': {
        const id = pickRandomAccount(store.bundle, {
          excludeId: store.selectedId,
          rng: rngRef.current,
        })
        if (id !== null) {
          store.selectAccount(id)
        }
        return
      }
    }
  }, [])
}

/**
 * Subscribe the window keydown listener: bubble phase, straight to
 * resolveJudgeKey with the live context, isComposing and repeat
 * ignored before anything else, and preventDefault only for the lookup
 * focus so a slash in the lookup still types a slash.
 */
export function useJudgeShortcuts(dispatch?: JudgeDispatcher): void {
  const ownDispatcher = useJudgeDispatcher()
  const dispatchAction = dispatch ?? ownDispatcher

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing || event.repeat) {
        return
      }
      const state = useConsole.getState()
      const action = resolveJudgeKey(
        event,
        {
          // A real key press targets the focused element, so either
          // reading says the same thing: the key landed in a text entry.
          inTextEntry:
            isTextEntryTarget(event.target) || isTextEntryTarget(document.activeElement),
          typedGateOpen: isTypedGateOpen(state.typedStatus),
        },
      )
      if (!action) {
        return
      }
      if (action.kind === 'focus_lookup') {
        event.preventDefault()
      }
      dispatchAction(action)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatchAction])
}
