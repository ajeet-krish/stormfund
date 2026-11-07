import type { FindingId } from '../data/findings'

/**
 * EXPLORATION placeholder (pivot recorded in docs/decisions.md): the 3D
 * galaxy game is cancelled, and the interactive exploration surface comes
 * back next phase as the Balance River. This view keeps the second nav
 * slot alive so the "Explore in game" seam still lands somewhere real, and
 * it carries the finding id the seam hands it so the ExploreHandler
 * contract keeps meaning something. No store, no data fetch, no idle
 * attractor: those were game surface concerns and they went with the game.
 *
 * What it must not do: lose the reader. So it says what was cancelled,
 * what replaces it, where the pivot is recorded, and where the honest
 * surface (the report and its provenance stamps) still lives, plus one way
 * back.
 */

interface PlayViewProps {
  /** Finding the reader explored from; undefined when opened from the nav. */
  findingId?: FindingId
  /** Returns to the findings report (the nav tab does the same job). */
  onBack?: () => void
}

/**
 * The migration rail: two stops, current and next. The structure encodes
 * the actual state of the project (one surface live, one promised), not
 * decoration, so the solid card is the shipped report and the dashed card
 * is the Balance River that has not landed yet.
 */
const STATUS_STOPS: readonly {
  label: string
  title: string
  detail: string
  pending: boolean
}[] = [
  {
    label: 'Now',
    title: 'Findings report',
    detail:
      'Five findings with chart twins, honesty badges, row level provenance stamps, and the F4 counterfactual bridge.',
    pending: false,
  },
  {
    label: 'Next',
    title: 'Balance River',
    detail:
      'Interactive exploration of the daily balance flow, replacing the galaxy game and landing next phase.',
    pending: true,
  },
]

export default function PlayView({ findingId, onBack }: PlayViewProps) {
  return (
    <section aria-labelledby="explore-heading" className="mx-auto w-full max-w-2xl">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-signal">
        Exploration layer, next phase
      </p>
      <h2
        id="explore-heading"
        className="mt-3 font-mono text-2xl font-semibold leading-snug tracking-wide text-ink"
      >
        The galaxy game is retired. The Balance River comes next.
      </h2>
      <p className="mt-4 text-sm leading-relaxed text-ink-dim">
        The 3D galaxy game from the prototype is cancelled. The interactive
        exploration surface returns next phase as the Balance River, a chart of
        daily balance flow. The pivot is recorded in docs/decisions.md. Until it
        lands, the findings report is the product.
      </p>

      {findingId ? (
        <p className="mt-4 inline-block rounded border border-grid bg-void-2 px-3 py-2 font-mono text-xs tracking-wider text-ink-dim">
          Arrived from finding {findingId}
        </p>
      ) : null}

      <ol className="mt-6 grid gap-3 sm:grid-cols-2">
        {STATUS_STOPS.map((stop) => (
          <li
            key={stop.title}
            className={
              stop.pending
                ? 'rounded border border-dashed border-grid bg-void-2 p-4'
                : 'rounded border border-signal bg-void-2 p-4'
            }
          >
            <p
              className={
                stop.pending
                  ? 'font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dim'
                  : 'font-mono text-[11px] uppercase tracking-[0.18em] text-signal'
              }
            >
              {stop.label}
            </p>
            <p className="mt-2 font-mono text-sm text-ink">{stop.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-dim">{stop.detail}</p>
          </li>
        ))}
      </ol>

      <p className="mt-6 text-sm leading-relaxed text-ink-dim">
        Row level provenance is not going anywhere: on the FINDINGS tab, expand
        any finding's stamp to recompute its checksums against
        transactions.json in your browser.
      </p>

      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mt-6 min-h-[44px] rounded border border-signal bg-signal-dim px-5 py-2 font-mono text-sm tracking-wider text-ink transition-colors hover:bg-signal hover:text-void"
        >
          Back to the findings report
        </button>
      ) : null}
    </section>
  )
}
