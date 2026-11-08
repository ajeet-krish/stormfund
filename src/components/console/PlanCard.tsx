import { formatCents } from '../../lib/format'
import { formatMonthsToReach, type PlanText } from '../../lib/planText'

/**
 * Make a plan: the goal block (build the cushion) with its milestone
 * chips, the backup block (what the shock does to this account), the
 * backup lever ladder with each step's +N gain, and the five line
 * definition strip. Every sentence and every formatted figure arrives
 * finished from buildPlanText in src/lib, so the view renders strings
 * and formatters only: no component does money math, and the card and
 * the numbers on screen cannot drift.
 */

interface PlanCardProps {
  plan: PlanText
}

export default function PlanCard({ plan }: PlanCardProps) {
  return (
    <section className="cp-panel cp-plan" aria-labelledby="plan-heading">
      <header className="cp-panel__head">
        <p className="cp-eyebrow">Make a plan</p>
        <h2 className="cp-title" id="plan-heading">
          Goal and backup
        </h2>
      </header>

      <div className="cp-plan__grid">
        <article className="cp-plan__block" aria-labelledby="plan-goal-heading">
          <h3 className="cp-plan__heading" id="plan-goal-heading">
            Goal: build the cushion
          </h3>
          <ul className="cp-plan__list">
            {plan.goal.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <ul className="cp-plan__chips" aria-label="Cushion milestones">
            {plan.goalChips.map((chip) => (
              <li key={chip.label} className={`cp-plan__chip cp-plan__chip-${chip.highlight}`}>
                <span className="cp-plan__chip-label">{chip.label}</span>
                <span className="cp-plan__chip-amount">{formatCents(chip.amountCents)}</span>
                <span className="cp-plan__chip-reach">{formatMonthsToReach(chip.monthsToReach)}</span>
                {chip.highlight === 'goal' && <span className="cp-plan__chip-badge">goal</span>}
                {chip.highlight === 'stretch' && (
                  <span className="cp-plan__chip-badge">stretch</span>
                )}
              </li>
            ))}
          </ul>
        </article>

        <article
          className="cp-plan__block cp-plan__block-backup"
          aria-labelledby="plan-backup-heading"
        >
          <h3 className="cp-plan__heading" id="plan-backup-heading">
            Backup: if the shock lands
          </h3>
          <ul className="cp-plan__list">
            {plan.backup.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </article>
      </div>

      <article className="cp-plan__levers" aria-labelledby="plan-levers-heading">
        <h3 className="cp-plan__heading" id="plan-levers-heading">
          Backup levers, in order
        </h3>
        {plan.levers.length > 0 ? (
          <div className="cp-table-wrap">
            <table className="cp-table cp-plan__lever-table">
              <caption>Simulated counterfactuals, applied one after another</caption>
              <thead>
                <tr>
                  <th scope="col">Lever</th>
                  <th scope="col" className="cp-num">
                    Monthly effect
                  </th>
                  <th scope="col">Runway after</th>
                  <th scope="col" className="cp-num">
                    Gain
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.levers.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">
                      <span className="cp-plan__lever-name">{row.label}</span>
                      <span className="cp-plan__lever-caveat">{row.caveat}</span>
                    </th>
                    <td className="cp-num">{formatCents(row.effectCents)}</td>
                    <td>{row.runwayAfter}</td>
                    <td className="cp-num cp-plan__lever-gain">{row.plusLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="cp-hint">
            No lever applies to this account: no insurance premium, no loan payment, and no
            spending above the fixed cost floor to move.
          </p>
        )}
      </article>

      <article className="cp-plan__definitions" aria-labelledby="plan-definitions-heading">
        <h3 className="cp-plan__heading" id="plan-definitions-heading">
          How the plan counts
        </h3>
        <ol className="cp-plan__definition-list">
          {plan.definitions.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </article>
    </section>
  )
}
