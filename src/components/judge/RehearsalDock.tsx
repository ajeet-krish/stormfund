import { useState } from 'react'
import { presetById } from '../../lib/shockPresets'
import {
  REHEARSAL_SCRIPT,
  REHEARSAL_TARGET_MS,
  rehearsalCard,
  rehearsalVerdict,
  type RehearsalStep,
} from '../../lib/rehearsal'
import { useConsole } from '../../state/consoleStore'

/**
 * The in app rehearsal dock (user confirmed, docs/decisions.md): five
 * timed steps over the golden fixture accounts, each with the twist
 * card sentence, the operator script line, a Run step control that
 * selects the account and plays the card through the store, and an
 * Answered control that stops the stopwatch and prints the verdict
 * against the 2000 ms target. State is local and never persisted: the
 * dock resets when the bar closes it, and the printed script ships in
 * the paper sheet either way.
 */

type Phase = 'idle' | 'running' | 'answered'

/** A monotonic millisecond reading, falling back to the wall clock. */
function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

export default function RehearsalDock() {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState<number | null>(null)

  const found = REHEARSAL_SCRIPT[Math.min(index, REHEARSAL_SCRIPT.length - 1)]
  if (!found) {
    return null
  }
  const step: RehearsalStep = found
  const preset = presetById(step.presetId)
  const isLast = index === REHEARSAL_SCRIPT.length - 1

  function runStep(): void {
    const store = useConsole.getState()
    store.selectAccount(step.accountId)
    store.applyPreset(step.presetId)
    setStartedAt(nowMs())
    setElapsed(null)
    setPhase('running')
  }

  function answered(): void {
    const start = startedAt ?? nowMs()
    setElapsed(Math.max(0, Math.round(nowMs() - start)))
    setPhase('answered')
  }

  function advance(): void {
    setIndex(isLast ? 0 : index + 1)
    setPhase('idle')
    setStartedAt(null)
    setElapsed(null)
  }

  const buttonLabel =
    phase === 'idle' ? 'Run step' : phase === 'running' ? 'Answered' : isLast ? 'Start over' : 'Next step'

  function primaryAction(): void {
    if (phase === 'idle') {
      runStep()
      return
    }
    if (phase === 'running') {
      answered()
      return
    }
    advance()
  }

  return (
    <section className="jg-dock" aria-label="Rehearsal">
      <p className="jg-dock__step">
        Rehearsal step {index + 1} of {REHEARSAL_SCRIPT.length}
      </p>
      <p className="jg-dock__card">{rehearsalCard(step)}</p>
      <p className="jg-dock__script">{step.scriptLine}</p>
      <p className="jg-dock__meta">
        Account {step.accountId}, card {preset?.label ?? step.presetId}, target{' '}
        {REHEARSAL_TARGET_MS} ms
      </p>
      <div className="jg-dock__controls">
        <button type="button" className="jg-tool" onClick={primaryAction}>
          {buttonLabel}
        </button>
        {phase === 'answered' && elapsed !== null ? (
          <p className="jg-dock__result" role="status">
            Answered in {elapsed} ms: {rehearsalVerdict(elapsed)}
          </p>
        ) : (
          <p className="jg-dock__hint">
            {phase === 'running' ? 'Stopwatch running' : 'Select Answered when the judge replies'}
          </p>
        )}
      </div>
    </section>
  )
}
