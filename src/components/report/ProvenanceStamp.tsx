import { formatCents } from '../../lib/format'
import type { FindingId } from '../../data/findings'
import type {
  FindingProvenance,
  ResolvedProvenanceGroup,
} from '../../lib/reportProvenance'

/**
 * Provenance stamp: the report's honesty badge. Every finding carries a
 * double ruled audit stamp with its verified row count, and the stamp is a
 * native <details> that expands into the row level inspector: per entity
 * checksum verification, the generator filter text, and a sample of the
 * resolved transaction rows.
 *
 * Nothing here is hard coded from the finding text: counts, sums, and the
 * ok / mismatch verdict come from resolveRows over transactions.json, so a
 * tampered bundle flips the stamp to the failure state instead of lying.
 */

export type ProvenanceStatus = 'loading' | 'ready' | 'error'

interface ProvenanceStampProps {
  findingId: FindingId
  provenance: FindingProvenance | null
  status: ProvenanceStatus
  error: string | null
}

function groupValueLabel(group: ResolvedProvenanceGroup): string {
  return group.items.every((item) => item.valueField === 'balanceCents')
    ? 'Balance'
    : 'Sum'
}

function stampText(props: ProvenanceStampProps): string {
  const { provenance, status } = props
  if (status === 'loading') {
    return 'Verifying source rows'
  }
  if (status === 'error' || !provenance) {
    return 'Source rows unavailable'
  }
  if (!provenance.checksumOk) {
    const failed = provenance.groups.reduce(
      (count, group) => count + group.items.filter((item) => !item.checksumOk).length,
      0,
    )
    return `Checksum mismatch on ${failed} entities`
  }
  return `Verified against ${provenance.rowCount.toLocaleString('en-CA')} rows, checksum ok`
}

function stampMark(props: ProvenanceStampProps): string {
  const { provenance, status } = props
  if (status === 'loading') {
    return '?'
  }
  if (status === 'error' || !provenance) {
    return '!'
  }
  return provenance.checksumOk ? '✓' : '!'
}

export default function ProvenanceStamp(props: ProvenanceStampProps) {
  const { findingId, provenance, status, error } = props
  const failed = provenance !== null && provenance !== undefined && !provenance.checksumOk

  return (
    <details className={`rp-stamp${failed ? ' rp-stamp-failed' : ''}`}>
      <summary>
        <span className="rp-stamp__badge">
          <span className="rp-stamp__mark" aria-hidden="true">
            {stampMark(props)}
          </span>
          {stampText(props)}
        </span>
        <span className="rp-stamp__hint">expand for the row level inspector</span>
      </summary>

      <div className="rp-inspector">
        {status === 'loading' ? (
          <p className="rp-status">
            {findingId}: loading world.json and transactions.json, then recomputing every
            checksum in your browser.
          </p>
        ) : null}

        {status === 'error' ? (
          <p className="rp-status rp-status-bad">
            {findingId}: source rows could not be loaded, so this stamp cannot verify yet.
            {error ? ` ${error}` : ''}
          </p>
        ) : null}

        {status === 'ready' && provenance ? (
          <ProvenanceDetail provenance={provenance} />
        ) : null}
      </div>
    </details>
  )
}

function ProvenanceDetail({ provenance }: { provenance: FindingProvenance }) {
  const uniqueFilters = Array.from(
    new Set(provenance.groups.flatMap((group) => group.items.map((item) => item.filter))),
  )
  const missingTotal = provenance.groups.reduce(
    (count, group) => count + group.items.reduce((sum, item) => sum + item.missingIds, 0),
    0,
  )

  return (
    <div>
      <dl className="rp-inspector__rollup">
        <div className="rp-inspector__stat">
          <dt>Rows</dt>
          <dd>{provenance.rowCount.toLocaleString('en-CA')}</dd>
        </div>
        <div className="rp-inspector__stat">
          <dt>Entities</dt>
          <dd>{provenance.entityCount}</dd>
        </div>
        <div className="rp-inspector__stat">
          <dt>Checksums</dt>
          <dd className={provenance.checksumOk ? 'rp-ok' : 'rp-bad'}>
            {provenance.checksumOk ? 'ok' : 'mismatch'}
          </dd>
        </div>
        <div className="rp-inspector__stat">
          <dt>Missing ids</dt>
          <dd className={missingTotal === 0 ? 'rp-ok' : 'rp-bad'}>{missingTotal}</dd>
        </div>
      </dl>

      <p className="rp-inspector__note">
        Every checksum is SHA256 over the sorted row id and value lines, recomputed here from
        transactions.json, then compared with the value the pipeline stamped into world.json.
        Sums read the value column each aggregation announced.
      </p>

      {provenance.groups.map((group) => (
        <div key={group.key} className="rp-table-wrap">
          <table className="rp-table">
            <caption>{`${group.label}: ${group.count.toLocaleString('en-CA')} rows across ${group.items.length} entities`}</caption>
            <thead>
              <tr>
                <th scope="col">Entity</th>
                <th scope="col">Rows</th>
                <th scope="col">{groupValueLabel(group)}</th>
                <th scope="col">Checksum</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((item) => (
                <tr key={item.key}>
                  <td className="rp-strong">{item.label}</td>
                  <td className="rp-num">{item.count}</td>
                  <td className="rp-num">{formatCents(item.sum)}</td>
                  <td className={item.checksumOk ? 'rp-ok' : 'rp-bad'}>
                    {item.checksumOk ? 'ok' : 'mismatch'}
                    {item.missingIds > 0 ? ` (${item.missingIds} missing)` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="rp-table-wrap">
        <table className="rp-table">
          <caption>{`First ${provenance.sampleRows.length} of ${provenance.rowCount.toLocaleString(
            'en-CA',
          )} rows, sorted by date`}</caption>
          <thead>
            <tr>
              <th scope="col">Row</th>
              <th scope="col">Date</th>
              <th scope="col">Merchant</th>
              <th scope="col">Category</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {provenance.sampleRows.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.date}</td>
                <td className="rp-strong">{row.merchant || '(none)'}</td>
                <td>{row.category}</td>
                <td className="rp-num">{formatCents(row.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="rp-details">
        <summary>{`Generator filters (${uniqueFilters.length})`}</summary>
        <div className="rp-details__body">
          <ul>
            {uniqueFilters.map((filter) => (
              <li key={filter}>{filter}</li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  )
}
