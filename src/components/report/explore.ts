import type { FindingId } from '../../data/findings'

/**
 * Explore navigation seam.
 *
 * The report's "Explore in game" links call this with the shell's
 * onExplore callback, which App.tsx wires to switch to the exploration
 * slot (the Balance River placeholder; docs/decisions.md pivot). The
 * finding id travels with the callback: a caller may pass it, and when it
 * does not, the seam reads it from the focused explore link's section,
 * because every finding renders as a section with id f1 to f5 and
 * activating the link focuses it. Switching views is therefore always the
 * callback path; the #play hash remains only for the no-shell case
 * (server rendering or a direct import without a callback wired).
 */

/** What the shell does with one explore click: switch view, name a finding. */
export type ExploreHandler = (findingId?: FindingId) => void

/** Section ids the report renders for findings, in either case. */
const FINDING_SECTION_ID = /^f[1-5]$/i

/** Normalize a section id ("f4" or "F4") to the report's FindingId. */
function asFindingId(raw: string | null | undefined): FindingId | undefined {
  if (!raw || !FINDING_SECTION_ID.test(raw)) {
    return undefined
  }
  return raw.toUpperCase() as FindingId
}

/**
 * Finding id of the section that owns the focused element. Pointer and
 * keyboard activation both focus the explore link, so the closest section
 * with an id is the finding the reader was looking at; links outside a
 * finding section (the closing call to action) report no id and the shell
 * switches to the exploration placeholder without a finding to name.
 */
function focusedFindingId(): FindingId | undefined {
  if (typeof document === 'undefined') {
    return undefined
  }
  const active = document.activeElement as Partial<Element> | null
  if (!active || typeof active.closest !== 'function') {
    return undefined
  }
  return asFindingId(active.closest('section[id]')?.id)
}

/**
 * Switch the shell to the exploration slot through the injected callback,
 * carrying the finding id so the placeholder can acknowledge it. Without a
 * callback the link falls back to the #play hash (no shell wired).
 */
export function exploreToPlay(onExplore?: ExploreHandler, findingId?: string): void {
  const id = asFindingId(findingId) ?? focusedFindingId()
  if (onExplore) {
    onExplore(id)
    return
  }
  if (typeof document === 'undefined') {
    return
  }
  window.location.hash = 'play'
}
