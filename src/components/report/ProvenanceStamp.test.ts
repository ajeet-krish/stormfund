import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseTransactions, parseWorld } from '../../data/loaders'
import { resolveFindingProvenance, type FindingProvenance } from '../../lib/reportProvenance'
import ProvenanceStamp from './ProvenanceStamp'

/**
 * The provenance stamp is the report's honesty anchor: it must show the
 * verified row count when the data is ready, expose the row level inspector
 * when expanded, and fail loudly (never silently) when the source rows are
 * missing or a checksum does not match.
 */

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))
}

const world = parseWorld(readJson('../../../public/data/world.json'))
const transactions = parseTransactions(readJson('../../../public/data/transactions.json'))
const resolved = resolveFindingProvenance(world, transactions.rows)

const f1 = resolved.F1 as FindingProvenance
const f4 = resolved.F4 as FindingProvenance

function render(props: Partial<Parameters<typeof ProvenanceStamp>[0]>): string {
  return renderToString(
    createElement(ProvenanceStamp, {
      findingId: 'F1',
      provenance: null,
      status: 'loading',
      error: null,
      ...props,
    }),
  )
}

describe('ProvenanceStamp', () => {
  it('announces verification while the source rows load', () => {
    const html = render({ status: 'loading' })
    expect(html).toContain('Verifying source rows')
    expect(html).toContain('expand for the row level inspector')
    expect(html).toContain('recomputing every')
  })

  it('stamps the verified row count and opens into the row level inspector', () => {
    const html = render({ provenance: f1, status: 'ready' })

    expect(html).toContain('Verified against 5,689 rows, checksum ok')
    expect(html).toContain('<details')
    expect(html).toContain('Rows')
    expect(html).toContain('Entities')
    expect(html).toContain('Checksums')
    expect(html).toContain('Missing ids')
    expect(html).toContain('Spending categories: 5,689 rows across 7 entities')
    expect(html).toContain('First 12 of 5,689 rows, sorted by date')
    expect(html).toContain('TAN-000001')
    expect(html).toContain('Generator filters (7)')
    expect(html).toContain('Dining')
    expect(html).toContain('-$27,766.09')
  })

  it('shows the balance value column for the month end group', () => {
    const html = render({ findingId: 'F4', provenance: f4, status: 'ready' })
    expect(html).toContain('Month end balance closes: 12 rows across 12 entities')
    expect(html).toContain('Balance')
    expect(html).toContain('Income deposits: 13 rows across 13 entities')
  })

  it('flips to the failure state when a checksum does not match', () => {
    const tampered: FindingProvenance = {
      ...f1,
      checksumOk: false,
      groups: f1.groups.map((group, groupIndex) =>
        groupIndex === 0
          ? {
              ...group,
              checksumOk: false,
              items: group.items.map((item, itemIndex) =>
                itemIndex === 0 ? { ...item, checksumOk: false } : item,
              ),
            }
          : group,
      ),
    }
    const html = render({ provenance: tampered, status: 'ready' })
    expect(html).toContain('Checksum mismatch on 1 entities')
    expect(html).toContain('rp-stamp-failed')
    expect(html).toContain('mismatch')
  })

  it('refuses to claim verification when the source rows failed to load', () => {
    const html = render({ status: 'error', error: 'transactions.json fetch failed with status 404' })
    expect(html).toContain('Source rows unavailable')
    expect(html).toContain('source rows could not be loaded')
    expect(html).toContain('transactions.json fetch failed with status 404')
    expect(html).not.toContain('checksum ok')
  })
})
