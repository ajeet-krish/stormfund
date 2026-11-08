import { useState } from 'react'
import AtlasSection from './components/atlas/AtlasSection'
import ConsoleView from './components/console/ConsoleView'
import JudgeBar from './components/judge/JudgeBar'
import RehearsalDock from './components/judge/RehearsalDock'
import { useEdgeGuard } from './components/judge/useEdgeGuard'
import { useJudgeDispatcher, useJudgeShortcuts } from './components/judge/useJudgeShortcuts'

/**
 * App shell (Phase E2, docs/decisions.md): the engine owns the page.
 * The header names the instrument, the main slot mounts the Storm
 * Atlas section directly above the console (E5: the population
 * headline and strip plot, then the account cards it drills into),
 * and the footer cites the pipeline that wrote the bundled artifact.
 * E6 adds the judge layer: the key listener and the dispatcher wire
 * JUDGE_SHORTCUTS to the store, the sticky bar renders the keys with
 * the live guard report, the paper sheet link, and the rehearsal
 * toggle that opens the five step dock under the console. The
 * findings report and game views are gone: the Tier B cleanup
 * removed their files and tests, so this shell is the whole app.
 */

export default function App() {
  const dispatch = useJudgeDispatcher()
  useJudgeShortcuts(dispatch)
  const guard = useEdgeGuard()
  const [rehearsalOpen, setRehearsalOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-void text-ink">
      <header className="border-b border-grid bg-void-2">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}logo.svg`}
              alt="Storm Fund logo"
              className="h-9 w-9 shrink-0"
            />
            <div>
              <h1 className="font-mono text-xl font-semibold tracking-widest text-signal">
                Resilience Weather Station
              </h1>
              <p className="mt-1 text-xs text-ink-dim">
                A weather forecast for personal finance: pick an account, take a shock, read the
                verdict.
              </p>
            </div>
          </div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ink-faint">
            Tangerine track, Sheridan Datathon 2026
          </p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        <section id="atlas">
          <AtlasSection />
        </section>
        <div id="console">
          <ConsoleView />
        </div>
        {rehearsalOpen ? <RehearsalDock /> : null}
      </main>

      <JudgeBar
        onAction={dispatch}
        guard={guard}
        onToggleRehearsal={() => setRehearsalOpen((open) => !open)}
        rehearsalOpen={rehearsalOpen}
        paperHref={`${import.meta.env.BASE_URL}judge-sheet.html`}
      />

      <footer className="border-t border-grid px-4 py-3 text-center text-xs text-ink-dim sm:px-6">
        Profile pipeline: scripts/engine.build writes public/data/engine/profiles.json from the
        three canonical CSVs (integer CAD cents, recorded check sums).
      </footer>
    </div>
  )
}
