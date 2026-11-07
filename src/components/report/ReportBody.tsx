import type { FindingsReport, ModelCard, ReportMeta } from '../../data/findings'
import type { FindingProvenanceById } from '../../lib/reportProvenance'
import FindingSection from './FindingSection'
import ModelCardSection from './ModelCardSection'
import { exploreToPlay, type ExploreHandler } from './explore'
import type { ProvenanceStatus } from './ProvenanceStamp'
import BalanceRiver from '../river/BalanceRiver'

/**
 * The FINDINGS report body: hazard tape synthetic banner, hero with the
 * five number readout strip, how to read panel with the ledger facts, the
 * F1 to F5 sections, the model card, the limits index, and the explore CTA.
 * Pure props over the validated findings.json and model_card.json payloads,
 * so tests render the shipped artifacts straight through this component.
 */

export interface ReportBodyProps {
  report: FindingsReport
  modelCard: ModelCard
  provenance: FindingProvenanceById | null
  provenanceStatus: ProvenanceStatus
  provenanceError: string | null
  /** Same seam FindingsView and App pass: the finding id travels along. */
  onExplore?: ExploreHandler
}

/** Loud, unmissable synthetic data banner (seed and transfer note). */
export function SyntheticBanner({ meta }: { meta: ReportMeta }) {
  return (
    <aside className="rp-banner" aria-label="Synthetic data notice">
      <div className="rp-banner__body">
        <div>
          <p className="rp-banner__title">{`Synthetic data, seed ${meta.seed}`}</p>
          <p className="rp-banner__text">{meta.syntheticNotice}</p>
        </div>
        <p className="rp-banner__seed">No real bank data</p>
      </div>
    </aside>
  )
}

export default function ReportBody({
  report,
  modelCard,
  provenance,
  provenanceStatus,
  provenanceError,
  onExplore,
}: ReportBodyProps) {
  const { meta, sections } = report
  const f2 = sections.find((section) => section.id === 'F2')
  const f4 = sections.find((section) => section.id === 'F4')
  const shortHash = `${meta.transactionSha256.slice(0, 16)}...`

  return (
    <div className="rp-report">
      <div className="rp-inner">
        <SyntheticBanner meta={meta} />

        <header className="rp-hero">
          <p className="rp-eyebrow">
            {`Findings report | seed ${meta.seed} | ${meta.transactionRowCount.toLocaleString(
              'en-CA',
            )} rows | ${meta.dateRange.start} to ${meta.dateRange.end}`}
          </p>
          <h2 className="rp-title">One year of a Tangerine style ledger, audited row by row.</h2>
          <p className="rp-lede">
            Of one year of transactions, <strong>how much spending is locked by the calendar
            rather than by choice</strong>, when does the balance actually run out, and what would
            it cost to move spending onto the payday cycle? Every number below resolves to source
            rows you can open here, with the checksum recomputed in your browser.
          </p>

          {/* Money River hero: landscape first, chart second, every element
              data. It loads the bundled world.json and transactions.json in
              an effect, so server rendering shows only the quiet frame and
              the synthetic banner above stays in the first viewport. */}
          <BalanceRiver report={report} />

          <ol className="rp-readout">
            {sections.map((section) => (
              <li key={section.id}>
                <a className="rp-readout__tile" href={`#${section.id.toLowerCase()}`}>
                  <span className="rp-readout__id">{section.id}</span>
                  <span className="rp-readout__value">{section.metric.value}</span>
                  <span className="rp-readout__label">{section.metric.label}</span>
                </a>
              </li>
            ))}
          </ol>
        </header>

        <section className="rp-panel" aria-labelledby="how-to-read-title">
          <p className="rp-eyebrow">How to read this report</p>
          <h3 className="rp-section-title" id="how-to-read-title">
            Five questions, five declared answers, every number traceable
          </h3>
          <p className="rp-lede">
            Each finding states its question, the method that answered it, one chart twin, and the
            limitations that bound it. The teal stamp under every chart verifies the finding
            against the shipped transaction rows: expand it to see the row counts, the sums, and
            each checksum recomputed live.
          </p>
          <dl className="rp-facts">
            <div className="rp-facts__cell">
              <dt className="rp-facts__label">Rows</dt>
              <dd className="rp-facts__value">{meta.transactionRowCount.toLocaleString('en-CA')}</dd>
            </div>
            <div className="rp-facts__cell">
              <dt className="rp-facts__label">Days</dt>
              <dd className="rp-facts__value">{meta.dayCount}</dd>
            </div>
            <div className="rp-facts__cell">
              <dt className="rp-facts__label">Categories</dt>
              <dd className="rp-facts__value">{meta.categoryCount}</dd>
            </div>
            <div className="rp-facts__cell">
              <dt className="rp-facts__label">Ledger window</dt>
              <dd className="rp-facts__value">{`${meta.dateRange.start} to ${meta.dateRange.end}`}</dd>
            </div>
          </dl>
          <dl className="rp-facts rp-facts-provenance">
            <div className="rp-facts__cell">
              <dt className="rp-facts__label">Source CSV</dt>
              <dd className="rp-facts__value rp-facts__value-amber">{meta.sourceCsvPath}</dd>
            </div>
            <div className="rp-facts__cell">
              <dt className="rp-facts__label">Transactions sha256</dt>
              <dd className="rp-facts__value rp-facts__value-teal">{shortHash}</dd>
            </div>
            <div className="rp-facts__cell">
              <dt className="rp-facts__label">Reproduce</dt>
              <dd className="rp-facts__value">
                {meta.generatedBy.replace('scripts.analysis.', 'uv run python -m scripts.analysis.')}
              </dd>
            </div>
          </dl>
        </section>

        <p className="rp-footnote">
          {`Structural means the category repeats on a monthly cycle after removing day of week and holiday effects; discretionary means it does not. Money is integer cents CAD in the data and dollars on this page (${meta.moneyUnit}).`}
        </p>

        {sections.map((section) => (
          <FindingSection
            key={section.id}
            section={section}
            provenance={provenance?.[section.id] ?? null}
            provenanceStatus={provenanceStatus}
            provenanceError={provenanceError}
            onExplore={onExplore}
          />
        ))}

        <ModelCardSection modelCard={modelCard} />

        <section id="limits" className="rp-block" aria-labelledby="limits-title">
          <p className="rp-eyebrow">Limits index</p>
          <h3 className="rp-section-title" id="limits-title">
            What this report does not claim
          </h3>
          <ul className="rp-limits">
            <li>
              <strong>Synthetic input.</strong> Every number comes from {meta.sourceCsvPath}, the
              seeded mock ledger (seed {meta.seed}). The methods transfer unchanged to the real
              Tangerine dataset: only the input CSV path changes, because the build step already
              consumes either file.
            </li>
            <li>
              <strong>Association, not causation.</strong> {modelCard.correlationNotCausation}
            </li>
            {f4 ? (
              <li>
                <strong>Counterfactual, not causal estimate.</strong> {f4.limitations[0]}
              </li>
            ) : null}
            <li>
              <strong>Declared thresholds.</strong>{' '}
              {f2
                ? `The verdict cutoffs in F2 (holiday lift ${f2.holidayLiftThreshold.toFixed(
                    2,
                  )}, weekend deviation ${f2.weeklyDeviationThreshold.toFixed(2)}, ${
                    f2.minimumWeeklyRows
                  } row floor) are declared design choices, not hypothesis tests.`
                : 'The verdict cutoffs declared in findings.json are design choices, not hypothesis tests.'}{' '}
              Each of the five sections carries its own limitations chip with the full declared
              list.
            </li>
          </ul>
        </section>

        <section className="rp-cta" aria-labelledby="cta-title">
          <div>
            <p className="rp-eyebrow">Exploration layer</p>
            <h3 className="rp-cta__title" id="cta-title">
              Fly the same numbers in the game
            </h3>
            <p className="rp-cta__text">
              Every figure above exists in the flight layer: category planets sized by annual
              spend, provenance you can resolve row by row, and the drawdown you just read as the
              altitude band.
            </p>
          </div>
          <a
            className="rp-explore"
            href="#play"
            onClick={(event) => {
              event.preventDefault()
              exploreToPlay(onExplore)
            }}
          >
            Explore in game
            <span className="rp-explore__arrow" aria-hidden="true">
              →
            </span>
          </a>
        </section>

        <p className="rp-footnote">
          {`${meta.generatedBy} published this report from ${meta.sourceCsvPath} (${shortHash}). ${meta.verification}`}
        </p>
      </div>
    </div>
  )
}
