import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import JudgeBar from './JudgeBar'
import { JUDGE_SHORTCUTS, edgeGuard } from '../../lib/judgeMode'

/**
 * The judge bar markup contract: the default registry with no props,
 * guard messages and the clean line in their two states, static
 * keycaps versus buttons depending on the callback, the rehearsal
 * toggle, the paper sheet link, and the active keycap highlight.
 * Server rendering runs no handlers, so callback firing is covered by
 * the lib tests (sameJudgeAction) and by the wiring view.
 */

describe('JudgeBar', () => {
  it('renders the default registry and an unwired guard line with no props', () => {
    const html = renderToString(createElement(JudgeBar))
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-label="Judge mode"')
    expect(html).toContain('Judge shortcuts')
    expect(html).toContain('Guard not wired yet')
    // Nine static keycaps (not buttons) from the default registry.
    expect(html).not.toContain('<button')
    expect(html.split('<kbd').length - 1).toBe(JUDGE_SHORTCUTS.length)
    for (const binding of JUDGE_SHORTCUTS) {
      expect(html).toContain(binding.label)
      expect(html).toContain(`>${binding.keys[0]}</kbd>`)
    }
    // No toggle and no sheet link without their props.
    expect(html).not.toContain('Rehearsal')
    expect(html).not.toContain('Judge sheet')
  })

  it('shows each guard flag message when a report arrives', () => {
    const guard = edgeGuard({
      accountId: '99999',
      knownAccountIds: ['20111', '20112'],
    })
    expect(guard.needsCare).toBe(true)
    expect(guard.flags.length).toBeGreaterThan(0)
    const html = renderToString(createElement(JudgeBar, { guard }))
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('Edge guard flags')
    for (const flag of guard.flags) {
      expect(html).toContain(flag.message)
      expect(html).toContain(`title="${flag.message}"`)
    }
    expect(html).not.toContain('Guard not wired yet')
  })

  it('shows the clean line for a guard report with no flags', () => {
    const guard = edgeGuard({ accountId: '20111', knownAccountIds: ['20111'] })
    expect(guard.needsCare).toBe(false)
    const html = renderToString(createElement(JudgeBar, { guard }))
    expect(html).toContain('No guard flags on this account')
    expect(html).not.toContain('Edge guard flags')
  })

  it('renders buttons only when an action callback is wired', () => {
    const html = renderToString(createElement(JudgeBar, { onAction: () => undefined }))
    const buttons = html.split('<button').length - 1
    expect(buttons).toBe(JUDGE_SHORTCUTS.length)
    expect(html).toContain('aria-pressed="false"')
  })

  it('renders the rehearsal toggle only with its callback, with aria-expanded', () => {
    const closed = renderToString(
      createElement(JudgeBar, { onAction: () => undefined, onToggleRehearsal: () => undefined }),
    )
    expect(closed).toContain('aria-expanded="false"')
    expect(closed).toContain('Rehearsal')
    expect(closed.split('<button').length - 1).toBe(JUDGE_SHORTCUTS.length + 1)

    const open = renderToString(
      createElement(JudgeBar, {
        onAction: () => undefined,
        onToggleRehearsal: () => undefined,
        rehearsalOpen: true,
      }),
    )
    expect(open).toContain('aria-expanded="true"')
    expect(open).toContain('Hide rehearsal')
  })

  it('renders the printable judge sheet link when a href arrives', () => {
    const html = renderToString(
      createElement(JudgeBar, { paperHref: '/judge-sheet.html' }),
    )
    expect(html).toContain('href="/judge-sheet.html"')
    expect(html).toContain('Judge sheet')
    const without = renderToString(createElement(JudgeBar, { onAction: () => undefined }))
    expect(without).not.toContain('Judge sheet')
  })

  it('marks the active shortcut', () => {
    const html = renderToString(
      createElement(JudgeBar, {
        activeAction: { kind: 'twist', preset: 2 },
        onAction: () => undefined,
      }),
    )
    expect(html).toContain('jg-shortcut jg-shortcut-active')
    expect(html).toContain('aria-pressed="true"')
    // Exactly one active keycap.
    expect(html.split('jg-shortcut-active').length - 1).toBe(1)
  })

  it('accepts a caller shortcut list', () => {
    const html = renderToString(
      createElement(JudgeBar, {
        shortcuts: [
          { id: 'only', keys: ['9'], label: 'Ninth key', action: { kind: 'random_account' } },
        ],
      }),
    )
    expect(html).toContain('Ninth key')
    expect(html).not.toContain('Laid off')
  })

  it('does not throw when guard and shortcuts are explicitly null', () => {
    const html = renderToString(
      createElement(JudgeBar, { shortcuts: null, guard: null, activeAction: null }),
    )
    expect(html).toContain('Judge mode')
    expect(html).toContain('Guard not wired yet')
    const noop = vi.fn()
    expect(noop).not.toHaveBeenCalled()
  })
})
