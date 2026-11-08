import { describe, expect, it } from 'vitest'
import { provenanceCheckSum, sha256Hex, valueFieldFromAgg } from './checksum'

/**
 * The player provenance recipe announces the monthlyIncomeCents value
 * column. This suite proves the TypeScript recipe verifies it exactly like
 * pipeline_lib.checksum: a fixed fixture with the digest computed by the
 * Python pipeline.
 */

const PLAYERS_AGG =
  'monthly_income of that row in cents (monthlyIncomeCents); checksum value = monthlyIncomeCents'

/** Digest computed by scripts/pipeline_lib.py checksum() over the fixture below. */
const FIXTURE_DIGEST =
  'ca16cec92f4eac0996cefc08bbdcbee1b9a9e8f6822c69f8cd9407de50252639'

describe('players provenance (monthlyIncomeCents)', () => {
  it('accepts the monthlyIncomeCents announcement in valueFieldFromAgg', () => {
    expect(valueFieldFromAgg(PLAYERS_AGG)).toBe('monthlyIncomeCents')
    // The transaction columns keep working alongside it.
    expect(valueFieldFromAgg('sum of abs(amount) per row; checksum value = amountCents')).toBe(
      'amountCents',
    )
    expect(valueFieldFromAgg('account_balance of that row; checksum value = balanceCents')).toBe(
      'balanceCents',
    )
    expect(() => valueFieldFromAgg('checksum value = salaryCents')).toThrow(/amountCents/)
    expect(() => valueFieldFromAgg('no suffix here')).toThrow(/checksum value/)
  })

  it('matches the Python pipeline digest for a players style fixture', () => {
    const fixture = [
      { rowId: '1001', valueCents: 706500 },
      { rowId: '1002', valueCents: 859900 },
      { rowId: '1003', valueCents: 821100 },
    ]
    // Same recipe as scripts/pipeline_lib.py checksum(): LF joined
    // "{rowId}:{valueCents}" lines sorted ascending by row id, SHA256 hex.
    expect(provenanceCheckSum(fixture)).toBe(FIXTURE_DIGEST)
    expect(provenanceCheckSum(fixture)).toBe(
      sha256Hex('1001:706500\n1002:859900\n1003:821100'),
    )
    // Order independence: the sort inside provenanceCheckSum owns ordering.
    expect(provenanceCheckSum([...fixture].reverse())).toBe(FIXTURE_DIGEST)
  })
})
