import { useEdgeGuard } from './useEdgeGuard'

/**
 * The console's guard chip row: one short chip per flag for the
 * selected account, the full sentence behind the title tooltip and in
 * a visually hidden span so a screen reader hears the whole message.
 * Prop free on purpose: it reads the store through useEdgeGuard, which
 * is why ConsoleView can drop it in as one line after the card grid,
 * and an empty report renders nothing at all.
 */
export default function GuardChips() {
  const guard = useEdgeGuard()
  const flags = guard?.flags ?? []

  if (flags.length === 0) {
    return null
  }

  return (
    <ul className="jg-chips" aria-label="Edge guard flags">
      {flags.map((flag) => (
        <li key={flag.id} className="jg-chip" title={flag.message}>
          <span className="jg-chip__mark" aria-hidden="true">
            !
          </span>
          <span className="jg-chip__label">{flag.label}</span>
          <span className="jg-sr">{flag.message}</span>
        </li>
      ))}
    </ul>
  )
}
