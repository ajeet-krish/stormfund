import { useState, type KeyboardEvent } from 'react'
import type { AccountProfile } from '../../data/profiles'
import { useConsole } from '../../state/consoleStore'
import ShockChips from './ShockChips'

/**
 * Typed shock input, the gated Gemini add on that sits directly above the
 * preset cards. One sentence in, one parsed shock out, and nothing ever
 * applies without the explicit confirm in ShockChips. The mode badge
 * names which path is live so a video frame or screenshot can never be
 * ambiguous, "reading the sky" is the whole loading state (the storm
 * front animation belongs to E3, not here), and a fallback note hands the
 * judge back to the preset cards, which stay rendered and clickable the
 * whole time.
 */

interface TypedShockProps {
  profile: AccountProfile
}

export default function TypedShock({ profile }: TypedShockProps) {
  const typedStatus = useConsole((state) => state.typedStatus)
  const typedNote = useConsole((state) => state.typedNote)
  const shockMode = useConsole((state) => state.shockMode)
  const pendingShock = useConsole((state) => state.pendingShock)
  const parseTypedShock = useConsole((state) => state.parseTypedShock)
  const [sentence, setSentence] = useState('')

  const gemini = shockMode === 'gemini'

  const submit = () => {
    const text = sentence.trim()
    if (text.length === 0) {
      return
    }
    void parseTypedShock(text)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="cp-typed" aria-busy={typedStatus === 'reading'}>
      <div className="cp-typed__row">
        <label className="cp-label" htmlFor="shock-sentence">
          Say the shock
        </label>
        <span
          className={gemini ? 'cp-mode-badge cp-mode-badge-gemini' : 'cp-mode-badge'}
          data-mode={shockMode}
        >
          {gemini ? 'typed shock Gemini' : 'preset cards'}
        </span>
      </div>

      <div className="cp-typed__row">
        <input
          className="cp-input cp-typed__input"
          id="shock-sentence"
          type="text"
          value={sentence}
          placeholder="for example: they lose their job, EI covers half, and the furnace dies next month"
          onChange={(event) => setSentence(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="cp-button" onClick={submit}>
          Read the sky
        </button>
      </div>

      {typedStatus === 'reading' ? (
        <p className="cp-reading" role="status">
          reading the sky
        </p>
      ) : null}

      {typedStatus === 'fallback' && typedNote ? (
        <p className="cp-note cp-note-fallback">{typedNote}</p>
      ) : null}

      {typedStatus === 'pending' && pendingShock ? (
        <ShockChips profile={profile} pending={pendingShock} />
      ) : null}
    </div>
  )
}
