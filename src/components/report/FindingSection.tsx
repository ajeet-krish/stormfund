import type { ReactNode } from 'react'
import { formatCents } from '../../lib/format'
import type { ReportSection } from '../../data/findings'
import type { FindingProvenance } from '../../lib/reportProvenance'
import { lookupFriction } from '../../lib/friction'
import { frictionSentence } from '../../lib/frictionSentence'
import ProvenanceStamp, { type ProvenanceStatus } from './ProvenanceStamp'
import { F1Chart, F2Chart, F3Chart, F4Chart, F5Chart } from './charts'
import { exploreToPlay, type ExploreHandler } from './explore'

/**
 * One numbered finding: rail with the F marker and the headline readout,
 * body with the question, the claim, the method one liner, the chart twin,
 * the provenance stamp, the declared limitations, the reverse bridge note
 * (F4 only: the same figure prints on the game's transfer card), and the
 * explore in game deep link. Pure props, so the tests render the real
 * findings.json here.
 */

export interface FindingSectionProps {
  section: ReportSection
  provenance: FindingProvenance | null
  provenanceStatus: ProvenanceStatus
  provenanceError: string | null
  onExplore?: ExploreHandler
}

function signedMoney(cents: number): string {
  return cents > 0 ? `+${formatCents(cents)}` : formatCents(cents)
}

/**
 * Days in the month of an ISO date (2025-12-24 becomes 31), or null when
 * the date does not parse. Used so the binding month claim follows the
 * trough date in findings.json instead of pinning a "31 day month".
 */
function daysInMonth(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-/.exec(isoDate)
  if (!match || !match[1] || !match[2]) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isFinite(year) || month < 1 || month > 12) {
    return null
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** "f1StructuralVsDiscretionary" becomes "structural vs discretionary". */
function topicOf(section: ReportSection): string {
  return section.key
    .replace(/^f\d/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toLowerCase()
}

function claimFor(section: ReportSection): ReactNode {
  switch (section.id) {
    case 'F1':
      return (
        <>
          <strong>
            Only {section.metric.value} of the year's spending repeats on a monthly cycle.
          </strong>{' '}
          {section.structuralCategories.join(' and ')} clear the recurrence test at{' '}
          {formatCents(section.structuralSpendCents)} of {formatCents(section.totalAnnualSpendCents)}
          ; every other category ({section.discretionaryCategories.join(', ')}) behaves like a
          choice. The persona's problem is behavioral, not structural.
        </>
      )
    case 'F2': {
      const verdict =
        section.categoryVerdicts.find(
          (entry) => entry.name === section.strongestCalendarCategory,
        )?.verdict ?? section.overallVerdict
      return (
        <>
          <strong>{section.strongestCalendarCategory} answers to the calendar.</strong>{' '}
          {(section.strongestHolidayShare * 100).toFixed(1)}% of its spend lands in the{' '}
          {section.holidayWindowDays} day holiday window,{' '}
          {section.strongestCalendarLift.toFixed(2)}x its calendar share, so its verdict reads{' '}
          {verdict}. {section.strongestBehavioralCategory} answers to the week instead: its weekend
          share sits {(section.strongestBehavioralDeviation * 100).toFixed(0)}% from the 2/7
          baseline. Overall: {section.overallVerdict}.
        </>
      )
    }
    case 'F3': {
      const top = section.coefficients.find(
        (entry) => entry.feature === section.chartCoefficientFeatures[0],
      )
      const second = section.coefficients.find(
        (entry) => entry.feature === section.chartCoefficientFeatures[1],
      )
      return (
        <>
          <strong>The night before screen beats a coin flip, not a crystal ball.</strong> Test AUC{' '}
          {section.testAuc.toFixed(3)} across {section.testDays} held out days that carry{' '}
          {section.testEvents} deficit events, against train AUC {section.trainAuc.toFixed(3)}.
          {top ? ` ${top.feature} (${signedMoney(Math.round(top.coefficient * 10000) / 10000)})` : ''}
          {second ? ` and ${second.feature}` : ''} carry the signal. Accuracy{' '}
          {(section.accuracyAtHalf * 100).toFixed(1)}% sits under the{' '}
          {(section.majorityAccuracy * 100).toFixed(1)}% majority baseline because deficit days
          shift sharply between train and test, so AUC is the headline metric.
        </>
      )
    }
    case 'F4': {
      const floor = formatCents(section.baselineMinMonthEndCents)
      // The binding month is the trough's own month; its length comes from
      // the trough date in findings.json, not a pinned "31 day" claim.
      const monthDays = daysInMonth(section.baselineTroughDate)
      return (
        <>
          <strong>Timing buys the trough, not the month end floor.</strong> Aligning{' '}
          {section.bestAlignedCategory} debits into the income phase tightens drawdown by{' '}
          {formatCents(section.bestAlignedDrawdownImprovementCents)} (
          {section.bestAlignedDrawdownPctOfBaseline.toFixed(1)}% of{' '}
          {formatCents(section.baselineDrawdownCents)}) and lifts the true trough by the same
          amount, with the low on {section.baselineTroughDate}. Every aligned scenario leaves the
          month end floor at {floor}, because no forward shift escapes the{' '}
          {monthDays === null
            ? 'binding month'
            : `binding ${monthDays} day month`}
          .
        </>
      )
    }
    case 'F5': {
      const best = section.interventions.find(
        (entry) => entry.id === section.bestInterventionId,
      )
      const realign = section.interventions.find(
        (entry) => entry.id === 'realign_top_discretionary',
      )
      const after = best?.minMonthEndAfterCents ?? 0
      const before = after - section.bestMinMonthEndImprovementCents
      return (
        <>
          <strong>
            Capping {section.topSurgeCategory}'s holiday surge wins the floor.
          </strong>{' '}
          The rule lifts the minimum month end balance by{' '}
          {formatCents(section.bestMinMonthEndImprovementCents)}, from {formatCents(before)} to{' '}
          {formatCents(after)}, while giving back{' '}
          {formatCents(Math.abs(best?.drawdownImprovementCents ?? 0))} of drawdown.
          {realign ? ` ${realign.name} wins drawdown instead at ${signedMoney(realign.drawdownImprovementCents)}.` : ''}{' '}
          The auto save row is the honest null: on the combined checking plus reserve view it moves
          neither metric ({section.autoSaveAuxiliary.deficitDaysLifted} deficit days lifted of{' '}
          {section.autoSaveAuxiliary.deficitDaysBaseline}).
        </>
      )
    }
    default:
      return null
  }
}

interface LegendEntry {
  tone?: 'teal' | 'amber' | 'red'
  text: string
}

interface FigureMeta {
  title: string
  legend: LegendEntry[]
  caption: string
  chart: ReactNode
}

function figureFor(section: ReportSection): FigureMeta {
  switch (section.id) {
    case 'F1':
      return {
        title: 'Structural share and lag autocorrelation',
        legend: [
          { tone: 'teal', text: 'structural spend' },
          { tone: 'amber', text: 'discretionary spend' },
        ],
        caption: `Annual spend per category with lag autocorrelation over lags 1 to ${section.lags.length}. The shaded band is the ${section.lagWindowDays[0]} to ${section.lagWindowDays[1]} day monthly window and each dashed line is that category's significance threshold.`,
        chart: <F1Chart section={section} />,
      }
    case 'F2': {
      const series = section.monthShares.find(
        (entry) => entry.name === section.strongestCalendarCategory,
      )
      const peakIndex = (series?.shares ?? []).indexOf(Math.max(...(series?.shares ?? [0])))
      return {
        title: `${section.strongestCalendarCategory} month share against calendar share`,
        legend: [
          { tone: 'amber', text: 'share of annual spend' },
          { tone: 'teal', text: 'peak month' },
        ],
        caption: `Each bar is ${section.strongestCalendarCategory}'s share of annual spend in one ledger month; ticks mark the share of days that month covers. The shaded band is the ${section.holidayWindowDays} day holiday window (${section.holidayWindowStart} to ${section.holidayWindowEnd}), and the peak month is ${
          section.monthLabels[peakIndex] ?? ''
        }.`,
        chart: <F2Chart section={section} />,
      }
    }
    case 'F3':
      return {
        title: 'Deficit model: ROC, confusion, coefficients',
        legend: [
          { tone: 'teal', text: 'curve and lower odds' },
          { tone: 'red', text: 'higher odds' },
        ],
        caption: `Held out ROC after the ${section.splitDate} split (AUC ${section.testAuc.toFixed(
          3,
        )}), beside the confusion matrix (${section.decisionRule}). Coefficients are standardized: red raises the odds of a deficit day and teal lowers them.`,
        chart: <F3Chart section={section} />,
      }
    case 'F4':
      return {
        title: 'Drawdown waterfall: baseline to aligned',
        legend: [
          { tone: 'amber', text: 'baseline drawdown' },
          { tone: 'teal', text: 'aligned step and sum' },
        ],
        caption: `Each teal step is one category's aligned scenario measured against the ${formatCents(
          section.baselineDrawdownCents,
        )} baseline. Steps are separate simulations, so the summed column is an upper bound, not a combined result: aligned timing lifts the trough by up to ${formatCents(
          section.bestAlignedDrawdownImprovementCents,
        )} and never moves the month end floor.`,
        chart: <F4Chart section={section} />,
      }
    case 'F5': {
      const realign = section.interventions.find(
        (entry) => entry.id === 'realign_top_discretionary',
      )
      return {
        title: 'Ranked interventions on one dollar axis',
        legend: [
          { tone: 'teal', text: 'floor lift' },
          { tone: 'amber', text: 'drawdown improvement' },
          { tone: 'red', text: 'drawdown given back' },
        ],
        caption: `${section.bestInterventionName} wins the floor at ${signedMoney(
          section.bestMinMonthEndImprovementCents,
        )}${
          realign ? `; ${realign.name.toLowerCase()} wins drawdown at ${signedMoney(realign.drawdownImprovementCents)}` : ''
        }. Every row is a simulated counterfactual, ranked by minimum month end balance first and drawdown improvement second.`,
        chart: <F5Chart section={section} />,
      }
    }
    default:
      return { title: '', legend: [], caption: '', chart: null }
  }
}

export default function FindingSection({
  section,
  provenance,
  provenanceStatus,
  provenanceError,
  onExplore,
}: FindingSectionProps) {
  const topic = topicOf(section)
  const sequence = section.id.slice(1)
  const figure = figureFor(section)

  // Reverse bridge (F4 only): the figure the game's transfer card prints
  // for this finding's category, read through the same shared lookup the
  // card uses, so the two surfaces cannot drift. The note quotes the
  // card's own sign aware sentence (tightens, unchanged, widens) through
  // the shared frictionSentence helper, so a zero or negative delta can
  // never read as an improvement. Null means no figure and no note,
  // never a fabricated one.
  const bridge =
    section.id === 'F4' ? lookupFriction(section, section.bestAlignedCategory) : null

  return (
    <section
      id={section.id.toLowerCase()}
      className="rp-finding"
      aria-labelledby={`${section.id.toLowerCase()}-question`}
    >
      <div className="rp-finding__rail">
        <p className="rp-finding__id" aria-hidden="true">
          {section.id}
        </p>
        <p className="rp-finding__topic">{topic}</p>
        <div className="rp-metric">
          <p className="rp-metric__value">{section.metric.value}</p>
          <p className="rp-metric__label">{section.metric.label}</p>
          <p className="rp-metric__note">{section.metric.note}</p>
        </div>
      </div>

      <div className="rp-finding__body">
        <p className="rp-eyebrow">{`Finding ${sequence} of 5`}</p>
        <h3 className="rp-question" id={`${section.id.toLowerCase()}-question`}>
          {section.question}
        </h3>
        <p className="rp-claim">{claimFor(section)}</p>

        <div className="rp-method">
          <p className="rp-eyebrow">Method</p>
          <p className="rp-method__text">{section.methodOneLiner}</p>
        </div>
        <details className="rp-details rp-details-method">
          <summary>Full method, verbatim from findings.json</summary>
          <div className="rp-details__body">
            <p>{section.method}</p>
          </div>
        </details>

        <figure className="rp-figure">
          <figcaption className="rp-figure__head">
            <p className="rp-figure__title">{figure.title}</p>
            <div className="rp-figure__legend" aria-hidden="true">
              {figure.legend.map((entry) => (
                <span key={entry.text}>
                  {entry.tone ? (
                    <span className={`rp-swatch rp-swatch-${entry.tone}`} />
                  ) : null}
                  {entry.text}
                </span>
              ))}
            </div>
          </figcaption>
          <p className="rp-figure__hint">Chart scrolls sideways on narrow screens</p>
          <div
            className="rp-figure__scroll"
            role="region"
            aria-label={`${figure.title}, scrolls horizontally on narrow screens`}
            tabIndex={0}
          >
            {figure.chart}
          </div>
          <p className="rp-figure__caption">{figure.caption}</p>
        </figure>

        <ProvenanceStamp
          findingId={section.id}
          provenance={provenance}
          status={provenanceStatus}
          error={provenanceError}
        />

        <details className="rp-details rp-details-limits">
          <summary>{`${section.limitations.length} limitations for this finding`}</summary>
          <div className="rp-details__body">
            <ul>
              {section.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </div>
        </details>

        {bridge ? (
          <p className="rp-bridge">
            The transfer card in the game shows this same figure:{' '}
            {frictionSentence(bridge, (cents) => <strong>{formatCents(cents)}</strong>)}, tagged
            as a simulated counterfactual.
          </p>
        ) : null}

        <a
          className="rp-explore"
          href="#play"
          onClick={(event) => {
            event.preventDefault()
            // The section owns its id, so the deep link carries it
            // explicitly instead of relying on the focused element lookup.
            exploreToPlay(onExplore, section.id)
          }}
        >
          Explore in game
          <span className="rp-explore__arrow" aria-hidden="true">
            →
          </span>
        </a>
      </div>
    </section>
  )
}
