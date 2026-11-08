import { useState } from 'react'
import './components/sky/sky.css'
import AtlasSection from './components/atlas/AtlasSection'
import ConsoleView from './components/console/ConsoleView'
import JudgeBar from './components/judge/JudgeBar'
import RehearsalDock from './components/judge/RehearsalDock'
import PixelMascot from './components/sky/PixelMascot'
import { useEdgeGuard } from './components/judge/useEdgeGuard'
import { useJudgeDispatcher, useJudgeShortcuts } from './components/judge/useJudgeShortcuts'

/**
 * App shell (Phase E2, docs/decisions.md): the engine owns the page.
 * The header names the instrument over the shipped pixel landscape
 * (public/art/background.jpg, a static header backdrop instead of the
 * live PixelSky band, which stays on disk as an unmounted module), the
 * main slot mounts the console first so a judge reaches account entry
 * before anything else (its internal order is already lookup, baseline
 * plus shock, forecast, plan), then the Storm Atlas section below it
 * (E5: the population headline and strip plot, then the account cards
 * it drills into), and the footer cites the pipeline that wrote the
 * bundled artifact. E6 adds the judge layer: the key listener and the
 * dispatcher wire JUDGE_SHORTCUTS to the store, the sticky bar renders
 * the keys with the live guard report, the paper sheet link, and the
 * rehearsal toggle that opens the five step dock under the console.
 * The findings report and game views are gone: the Tier B cleanup
 * removed their files and tests, so this shell is the whole app.
 */

export default function App() {
  const dispatch = useJudgeDispatcher()
  useJudgeShortcuts(dispatch)
  const guard = useEdgeGuard()
  const [rehearsalOpen, setRehearsalOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-void text-ink">
      <header className="px-header">
        <img
          className="px-header__art"
          src={`${import.meta.env.BASE_URL}art/background.jpg`}
          alt=""
          width={1920}
          height={1080}
        />
        <div className="relative mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="px-plate">
            <img
              src={`${import.meta.env.BASE_URL}logo.svg`}
              alt="Storm Fund logo"
              className="h-9 w-9 shrink-0"
            />
            <div>
              <h1 className="px-title">Storm Fund Weather Station</h1>
              <p className="px-tagline">A weather forecast for personal finance</p>
            </div>
          </div>
          <div className="px-plate">
            <PixelMascot />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        <div id="console">
          <ConsoleView />
        </div>
        <section id="atlas">
          <AtlasSection />
        </section>
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
