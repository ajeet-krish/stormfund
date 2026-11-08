import { formatCents } from '../../lib/format'
import type { VerdictBand } from '../../lib/verdict'
import type { AccountProfile, ProfileFlags } from '../../data/profiles'
import ReceiptStamp from './ReceiptStamp'
import VerdictBadge from './VerdictBadge'

/**
 * Current conditions for one account: the six judge numbers plus the
 * gap and the baseline verdict, the edge flags that are set, the
 * history span, and the recorded provenance line. Every figure is
 * formatted from the profile, never recomputed here, so the card and
 * the artifact agree by construction. The provenance line says
 * "recorded" on purpose: the browser shows the check_sum the pipeline
 * wrote and cannot recompute it from the CSVs, so claiming "verified"
 * would be a lie (the old report layer recomputes its own checksums,
 * this artifact does not).
 */

interface BaselineCardProps {
  profile: AccountProfile
  /** Baseline verdict band, derived once in ConsoleView. */
  band: VerdictBand
}

const FLAG_LABELS: readonly (readonly [keyof ProfileFlags, string])[] = [
  ['pensioner', 'Pensioner'],
  ['thin_history', 'Thin history'],
  ['zero_income', 'Zero income'],
  ['defaulted_loan', 'Defaulted loan'],
  ['negative_buffer', 'Negative buffer'],
]

export default function BaselineCard({ profile, band }: BaselineCardProps) {
  const baselineRunway = {
    state: profile.runway_state,
    deciMonths: profile.runway_deci_months,
  }

  // Only the flags this account actually carries are shown, so an
  // account with one edge prints one chip and an account with none
  // prints no chip row at all instead of five dimmed placeholders.
  const setFlags = FLAG_LABELS.filter(([key]) => profile.flags[key])

  return (
    <section className="cp-panel" aria-labelledby="baseline-heading">
      <header className="cp-panel__head">
        <p className="cp-eyebrow">Current conditions</p>
        <h2 className="cp-title" id="baseline-heading">
          Account {profile.account_id}
        </h2>
        <p className="cp-sub">
          History {profile.history.first_month} to {profile.history.last_month},{' '}
          {profile.history.row_count} monthly rows.
        </p>
      </header>

      <dl className="cp-metrics">
        <div className="cp-metric">
          <dt>Typical monthly money in (I)</dt>
          <dd>{formatCents(profile.income_cents)}</dd>
        </div>
        <div className="cp-metric">
          <dt>Typical fixed costs (F)</dt>
          <dd>{formatCents(profile.fixed_costs_cents)}</dd>
        </div>
        <div className="cp-metric">
          <dt>Typical monthly spending (S)</dt>
          <dd>{formatCents(profile.spending_cents)}</dd>
        </div>
        <div className="cp-metric">
          <dt>Savings buffer (B)</dt>
          <dd>{formatCents(profile.buffer_cents)}</dd>
        </div>
        <div className="cp-metric">
          <dt>Household bills (H)</dt>
          <dd>{formatCents(profile.household_bills_cents)}</dd>
        </div>
        <div className="cp-metric">
          <dt>Loan payment (P)</dt>
          <dd>{formatCents(profile.loan_payment_cents)}</dd>
        </div>
        <div className="cp-metric">
          <dt>Monthly gap (spending minus income)</dt>
          <dd>{formatCents(profile.gap_cents)}</dd>
        </div>
        <div className="cp-metric">
          <dt>Loan status</dt>
          <dd>{profile.loan ? profile.loan.status : 'No loan'}</dd>
        </div>
      </dl>

      <VerdictBadge band={band} runway={baselineRunway} caption="Baseline" variant="compact" />

      {setFlags.length > 0 ? (
        <ul className="cp-flags" aria-label="Edge flags for this account">
          {setFlags.map(([key, label]) => (
            <li key={key} className="cp-flag cp-flag-on" data-active={true}>
              {label}
              <span className="rp-sr-only"> set</span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="cp-provenance">
        Recorded check sum <code>{profile.provenance.check_sum}</code> from{' '}
        {profile.provenance.source}
      </p>

      <ReceiptStamp />
    </section>
  )
}
