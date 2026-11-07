import { afterEach, describe, expect, it, vi } from 'vitest'
import { exploreToPlay } from './explore'

/**
 * The seam App.tsx wires into the shell: the callback always wins and now
 * carries the finding id (explicit argument, else the focused finding
 * section), so the game opens with the finding selected. The node test
 * environment has no document, so the focus and hash paths run against
 * stubbed globals, exactly as they would against a browser DOM.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Stub a focused element whose closest() answer is one section id. */
function stubFocus(sectionId: string | null): void {
  vi.stubGlobal('document', {
    activeElement: {
      closest: (selector: string) =>
        selector === 'section[id]' && sectionId ? { id: sectionId } : null,
    },
  })
}

describe('exploreToPlay callback path', () => {
  it('hands the shell callback the finding id the caller passed', () => {
    const onExplore = vi.fn()
    exploreToPlay(onExplore, 'f4')
    expect(onExplore).toHaveBeenCalledTimes(1)
    expect(onExplore).toHaveBeenCalledWith('F4')
  })

  it('reads the finding id from the focused section when the caller passes none', () => {
    stubFocus('f2')
    const onExplore = vi.fn()
    exploreToPlay(onExplore)
    expect(onExplore).toHaveBeenCalledWith('F2')
  })

  it('reports no finding when focus sits outside a finding section', () => {
    stubFocus(null)
    const onExplore = vi.fn()
    exploreToPlay(onExplore)
    expect(onExplore).toHaveBeenCalledWith(undefined)
  })

  it('ignores ids outside the five findings', () => {
    stubFocus(null)
    const onExplore = vi.fn()
    exploreToPlay(onExplore, 'F9')
    expect(onExplore).toHaveBeenCalledWith(undefined)
  })

  it('never touches the hash while a callback is wired', () => {
    vi.stubGlobal('window', { location: { hash: '' } })
    stubFocus('f1')
    exploreToPlay(vi.fn())
    expect(window.location.hash).toBe('')
  })
})

describe('exploreToPlay without a shell callback', () => {
  it('falls back to the #play hash when a document exists', () => {
    vi.stubGlobal('document', {})
    vi.stubGlobal('window', { location: { hash: '' } })
    exploreToPlay()
    expect(window.location.hash).toBe('play')
  })

  it('stays silent without a callback and without a document', () => {
    expect(() => exploreToPlay()).not.toThrow()
  })
})
