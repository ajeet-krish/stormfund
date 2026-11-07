import { useState } from 'react'
import FindingsView from './components/FindingsView'
import PlayView from './components/PlayView'
import type { FindingId } from './data/findings'

/**
 * App shell (findings-first, docs/decisions.md): the site leads with the
 * FINDINGS report view, and the second nav slot is the exploration layer.
 * The galaxy game that used to live there is cancelled; the slot now
 * mounts a placeholder that points at the Balance River landing next
 * phase. No router: two view slots switched by state, so the explore seam
 * has exactly one place to wrap, and this file owns it: an "Explore in
 * game" click switches views and remembers which finding the reader was
 * on, which the placeholder acknowledges. The report itself (charts,
 * provenance stamps, counterfactual bridge) is untouched by the switch.
 */

export type ViewName = 'findings' | 'play'

const VIEWS: readonly { name: ViewName; label: string }[] = [
  { name: 'findings', label: 'FINDINGS' },
  // The slot keeps its internal 'play' name so the explore seam and the
  // #play fallback hash stay valid; the label reads EXPLORE because the
  // game surface is retired and the Balance River is what exploration
  // will mean next phase.
  { name: 'play', label: 'EXPLORE' },
]

export default function App() {
  const [view, setView] = useState<ViewName>('findings')
  const [exploredFindingId, setExploredFindingId] = useState<FindingId | undefined>(undefined)

  /**
   * The explore seam: switch to the exploration slot immediately and carry
   * the finding id along so the placeholder can say which finding led the
   * reader here. No entity selection, no store, no dispatch: the scene
   * those depended on is cancelled, and the report already carries the
   * finding's numbers and provenance.
   */
  function handleExplore(findingId?: FindingId): void {
    setExploredFindingId(findingId)
    setView('play')
  }

  return (
    <div className="flex min-h-screen flex-col bg-void text-ink">
      <header className="border-b border-grid bg-void-2">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="font-mono text-xl font-semibold tracking-widest text-signal">
              Ledger Odyssey
            </h1>
            <p className="mt-1 text-xs text-ink-dim">
              Findings first, exploration next: five falsifiable claims over a real
              personal finance ledger.
            </p>
          </div>
          <nav aria-label="Views" className="flex gap-2">
            {VIEWS.map((slot) => (
              <button
                key={slot.name}
                type="button"
                onClick={() => setView(slot.name)}
                aria-current={view === slot.name ? 'page' : undefined}
                className={
                  view === slot.name
                    ? 'rounded border border-signal bg-signal-dim px-4 py-2 font-mono text-sm tracking-wider text-ink'
                    : 'rounded border border-grid px-4 py-2 font-mono text-sm tracking-wider text-ink-dim hover:border-signal hover:text-ink'
                }
              >
                {slot.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {view === 'findings' ? (
          <FindingsView onExplore={handleExplore} />
        ) : (
          <PlayView findingId={exploredFindingId} onBack={() => setView('findings')} />
        )}
      </main>

      <footer className="border-t border-grid px-6 py-3 text-center text-xs text-ink-dim">
        Data pipeline: scripts/build_world.py emits public/data/world.json and
        transactions.json (integer CAD cents, SHA256 provenance).
      </footer>
    </div>
  )
}
