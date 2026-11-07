import { describe, expect, it } from 'vitest'
import { provenanceCheckSum, sha256Hex } from './checksum'
import { resolveRows } from './resolveRows'
import type { Provenance, TransactionRow } from './types'

/**
 * resolveRows edge cases, complementing resolveRows.test.ts: a corrupted
 * but well formed checksum must be reported as a verification failure and
 * never thrown, an empty row id list resolves to an empty set, and row ids
 * that all miss leave nothing to vouch for.
 */

const fixtureRows: TransactionRow[] = [
  { id: 'T-0001', date: '2025-01-05', hour: 12, amountCents: -9240, balanceCents: 500760, type: 'debit', category: 'Transport', merchant: 'Presto' },
  { id: 'T-0002', date: '2025-01-12', hour: 9, amountCents: -41235, balanceCents: 459525, type: 'debit', category: 'Groceries', merchant: 'Market' },
]

const validAgg = 'sum of abs(amount) per row in cents; checksum value = amountCents'

const validProvenance: Provenance = {
  rowIds: ['T-0001', 'T-0002'],
  filter: "rows with amount < 0 in fixture.csv",
  agg: validAgg,
  checkSum: provenanceCheckSum([
    { rowId: 'T-0001', valueCents: -9240 },
    { rowId: 'T-0002', valueCents: -41235 },
  ]),
}

describe('resolveRows corrupted checksum', () => {
  it('reports verification failure without throwing on a well formed wrong digest', () => {
    const wrong = 'f'.repeat(64) // correct shape, wrong value
    const corrupted: Provenance = { ...validProvenance, checkSum: wrong }
    const result = resolveRows(corrupted, fixtureRows)
    expect(result.checksumOk).toBe(false)
    expect(result.computedCheckSum).not.toBe(wrong)
    expect(result.computedCheckSum).toMatch(/^[0-9a-f]{64}$/)
    // The rows themselves still resolve; only the vouch is refused.
    expect(result.count).toBe(2)
    expect(result.sum).toBe(-9240 - 41235)
  })

  it('reports verification failure when the digest is truncated garbage', () => {
    const corrupted: Provenance = { ...validProvenance, checkSum: 'deadbeef' }
    const result = resolveRows(corrupted, fixtureRows)
    expect(result.checksumOk).toBe(false)
    expect(result.missingIds).toEqual([])
  })
})

describe('resolveRows empty and fully missing row id lists', () => {
  it('resolves an empty row id list against the empty digest', () => {
    const empty: Provenance = {
      ...validProvenance,
      rowIds: [],
      checkSum: provenanceCheckSum([]),
    }
    const result = resolveRows(empty, fixtureRows)
    expect(result.rows).toEqual([])
    expect(result.count).toBe(0)
    expect(result.sum).toBe(0)
    expect(result.missingIds).toEqual([])
    // SHA256 of the empty line set is the recipe digest for an empty set.
    expect(result.computedCheckSum).toBe(sha256Hex(''))
    expect(result.checksumOk).toBe(true)
  })

  it('refuses an empty row id list vouched by a non empty digest', () => {
    const empty: Provenance = { ...validProvenance, rowIds: [] }
    const result = resolveRows(empty, fixtureRows)
    expect(result.count).toBe(0)
    expect(result.checksumOk).toBe(false)
  })

  it('resolves row ids that all miss to an empty broken set', () => {
    const dangling: Provenance = {
      ...validProvenance,
      rowIds: ['T-0098', 'T-0099'],
    }
    const result = resolveRows(dangling, fixtureRows)
    expect(result.rows).toEqual([])
    expect(result.count).toBe(0)
    expect(result.sum).toBe(0)
    expect(result.missingIds).toEqual(['T-0098', 'T-0099'])
    // Checksum of nothing cannot match the vouch for two rows.
    expect(result.computedCheckSum).toBe(sha256Hex(''))
    expect(result.checksumOk).toBe(false)
  })
})
