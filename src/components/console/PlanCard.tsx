import type { PlanText } from '../../lib/planText'

/**
 * Make a plan: the goal block (build the cushion) and the backup block
 * (what the shock does to this account), side by side. Both blocks
 * arrive as finished sentences from buildPlanText in src/lib, so the view
 * renders strings only: the card and the numbers on screen cannot drift,
 * and Phase E4 can extend the levers without touching this component.
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
        </article>

        <article className="cp-plan__block cp-plan__block-backup" aria-labelledby="plan-backup-heading">
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
    </section>
  )
}
