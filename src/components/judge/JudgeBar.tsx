import './judge.css'
import {
  JUDGE_SHORTCUTS,
  sameJudgeAction,
  type GuardReport,
  type JudgeAction,
  type ShortcutBinding,
} from '../../lib/judgeMode'

/**
 * The judge bar: the bottom strip that shows the active keyboard
 * shortcuts, the rehearsal toggle, the paper sheet link, and the guard
 * messages for the account on screen. It is presentational by design
 * (E6): the registry and the guard rules live in src/lib/judgeMode.ts,
 * and this component only renders them.
 *
 * Two safe modes: with an onAction callback every shortcut renders as a
 * button (touch friendly, 44px targets, visible focus from the global
 * focus-visible rule), and without one the same list renders as static
 * keycaps, so a half wired view never shows a dead control. With no
 * props at all it shows the default registry and an honest clean guard
 * line, so it can mount before the first lookup. The rehearsal toggle
 * and the sheet link appear only when their props arrive, so a bare bar
 * never shows a dead control either.
 */

export interface JudgeBarProps {
  /** Bindings to show; defaults to the registry in src/lib/judgeMode.ts. */
  shortcuts?: readonly ShortcutBinding[] | null
  /** Guard report for the current account; null means none yet. */
  guard?: GuardReport | null
  /** Action to highlight as active, matched field by field. */
  activeAction?: JudgeAction | null
  /** Fires when a keycap button is clicked; omit to render static caps. */
  onAction?: (action: JudgeAction) => void
  /** Fires on the rehearsal toggle; omit to hide the toggle. */
  onToggleRehearsal?: () => void
  /** Whether the rehearsal dock is open, for aria-expanded. */
  rehearsalOpen?: boolean
  /** href of the printable judge sheet; omit to hide the link. */
  paperHref?: string | null
}

export default function JudgeBar(props: JudgeBarProps) {
  const shortcuts = props.shortcuts && props.shortcuts.length > 0 ? props.shortcuts : JUDGE_SHORTCUTS
  const guard = props.guard ?? null
  const active = props.activeAction ?? null
  const onAction = props.onAction
  const onToggleRehearsal = props.onToggleRehearsal
  const rehearsalOpen = props.rehearsalOpen === true
  const paperHref = props.paperHref ?? null
  const flags = guard?.flags ?? []

  return (
    <div className="jg-bar jg-bar-sticky" role="region" aria-label="Judge mode">
      <ul className="jg-shortcuts" aria-label="Judge shortcuts">
        {shortcuts.map((binding) => {
          const isActive = active !== null && sameJudgeAction(binding.action, active)
          const key = binding.keys[0] ?? '?'
          const body = (
            <>
              <kbd className="jg-key">{key}</kbd>
              <span className="jg-shortcut__label">{binding.label}</span>
            </>
          )
          const className = `jg-shortcut${isActive ? ' jg-shortcut-active' : ''}`
          return (
            <li key={binding.id}>
              {onAction ? (
                <button
                  type="button"
                  className={className}
                  aria-pressed={isActive}
                  onClick={() => onAction(binding.action)}
                >
                  {body}
                </button>
              ) : (
                <span className={className}>{body}</span>
              )}
            </li>
          )
        })}
      </ul>

      <div className="jg-tools">
        {onToggleRehearsal ? (
          <button
            type="button"
            className="jg-tool"
            aria-expanded={rehearsalOpen}
            onClick={onToggleRehearsal}
          >
            {rehearsalOpen ? 'Hide rehearsal' : 'Rehearsal'}
          </button>
        ) : null}
        {paperHref ? (
          <a className="jg-tool" href={paperHref}>
            Judge sheet
          </a>
        ) : null}
      </div>

      <div className="jg-guard" aria-live="polite">
        {flags.length > 0 ? (
          <ul className="jg-guard__flags" aria-label="Edge guard flags">
            {flags.map((flag) => (
              <li key={flag.id} className="jg-flag" title={flag.message}>
                <span className="jg-flag__mark" aria-hidden="true">
                  !
                </span>
                {flag.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="jg-clean">
            {guard ? 'No guard flags on this account' : 'Guard not wired yet'}
          </p>
        )}
      </div>
    </div>
  )
}
