import ConsoleView from './components/console/ConsoleView'

/**
 * App shell (Phase E2, docs/decisions.md): the engine console is the
 * only mounted surface. The header names the instrument, the main slot
 * mounts ConsoleView (boot, lookup, baseline, shock, verdict, plan), and
 * the footer cites the pipeline that wrote the bundled artifact. The old
 * findings report and game views stay in the tree as files but are not
 * mounted here; their own tests keep them honest until the pivot fully
 * retires them.
 */

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-void text-ink">
      <header className="border-b border-grid bg-void-2">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <h1 className="font-mono text-xl font-semibold tracking-widest text-signal">
              Resilience Weather Station
            </h1>
            <p className="mt-1 text-xs text-ink-dim">
              A weather forecast for personal finance: pick an account, take a shock, read the
              verdict.
            </p>
          </div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ink-faint">
            Tangerine track, Sheridan Datathon 2026
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <ConsoleView />
      </main>

      <footer className="border-t border-grid px-4 py-3 text-center text-xs text-ink-dim sm:px-6">
        Profile pipeline: scripts/engine.build writes public/data/engine/profiles.json from the
        three canonical CSVs (integer CAD cents, recorded check sums).
      </footer>
    </div>
  )
}
