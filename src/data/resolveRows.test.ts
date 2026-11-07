import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeCheckSum, sha256Hex } from './checksum'
import { parseTransactions, parseWorld } from './loaders'
import { resolveRows } from './resolveRows'
import type { Provenance, TransactionRow } from './types'
import { worldEntities } from './types'

/**
 * Fixture rows mirror the column oriented transactions table materialized by
 * parseTransactions: string ids, integer CAD cents, debit/credit type.
 */
const fixtureRows: TransactionRow[] = [
  { id: 'T-0001', date: '2025-01-05', hour: 12, amountCents: -9240, balanceCents: 500760, type: 'debit', category: 'Transport', merchant: 'Presto' },
  { id: 'T-0002', date: '2025-01-12', hour: 9, amountCents: -41235, balanceCents: 459525, type: 'debit', category: 'Groceries', merchant: 'Market' },
  { id: 'T-0003', date: '2025-01-31', hour: 8, amountCents: 260000, balanceCents: 719525, type: 'credit', category: 'Income', merchant: 'Employer' },
  { id: 'T-0004', date: '2025-02-14', hour: 19, amountCents: -21590, balanceCents: 697935, type: 'debit', category: 'Dining', merchant: 'Bistro' },
  { id: 'T-0005', date: '2025-02-20', hour: 12, amountCents: -7500, balanceCents: 690435, type: 'debit', category: 'Dining', merchant: 'Cafe' },
]

const diningRows = fixtureRows.filter((row) => row.category === 'Dining')

const diningProvenance: Provenance = {
  rowIds: ['T-0004', 'T-0005'],
  filter: "rows with amount < 0 and merchant_category == 'Dining' in fixture.csv",
  agg: 'sum of abs(amount) per row in cents; checksum value = amountCents',
  checkSum: computeCheckSum(diningRows),
}

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))
}

describe('resolveRows', () => {
  it('resolves row ids, computes count and sum, and verifies the checksum', () => {
    const result = resolveRows(diningProvenance, fixtureRows)
    expect(result.missingIds).toEqual([])
    expect(result.count).toBe(2)
    expect(result.rows.map((row) => row.id)).toEqual(['T-0004', 'T-0005'])
    expect(result.sum).toBe(-29090)
    expect(result.computedCheckSum).toBe(diningProvenance.checkSum)
    expect(result.checksumOk).toBe(true)
  })

  it('matches the pipeline checksum recipe byte for byte', () => {
    // scripts/pipeline_lib.py: LF joined "{rowId}:{valueCents}" lines sorted
    // by row id, SHA256 hex of the UTF-8 bytes.
    expect(computeCheckSum(diningRows)).toBe(sha256Hex('T-0004:-21590\nT-0005:-7500'))
    const incomeRow = fixtureRows.find((row) => row.id === 'T-0003')
    expect(incomeRow).toBeDefined()
    if (!incomeRow) throw new Error('fixture income row missing')
    expect(computeCheckSum([incomeRow])).toBe(sha256Hex('T-0003:260000'))
  })

  it('fails verification when the checksum was tampered with', () => {
    const tampered: Provenance = { ...diningProvenance, checkSum: 'deadbeef' }
    const result = resolveRows(tampered, fixtureRows)
    expect(result.checksumOk).toBe(false)
    expect(result.computedCheckSum).not.toBe('deadbeef')
  })

  it('reports missing ids and refuses to vouch for a broken set', () => {
    const dangling: Provenance = { ...diningProvenance, rowIds: ['T-0004', 'T-0099'] }
    const result = resolveRows(dangling, fixtureRows)
    expect(result.missingIds).toEqual(['T-0099'])
    expect(result.count).toBe(1)
    expect(result.checksumOk).toBe(false)
  })

  it('rejects row id lists longer than the transaction table itself', () => {
    // Security review (docs/reviews.md): a tampered provenance with more
    // row ids than transactions must fail before the lookup map is built.
    expect(() => resolveRows(diningProvenance, fixtureRows.slice(0, 1))).toThrow(
      /exceeds the transaction row count/,
    )
  })

  it('detects a changed amount even when ids still resolve', () => {
    const tamperedRows = fixtureRows.map((row) =>
      row.id === 'T-0004' ? { ...row, amountCents: -21690 } : row,
    )
    const result = resolveRows(diningProvenance, tamperedRows)
    expect(result.count).toBe(2)
    expect(result.checksumOk).toBe(false)
  })

  it('verifies every provenance in the shipped fixture world', () => {
    const world = parseWorld(readJson('../../public/data/world.json'))
    const transactions = parseTransactions(readJson('../../public/data/transactions.json'))
    const entities = worldEntities(world)
    expect(entities.length).toBeGreaterThan(0)

    const provenances: Array<[string, Provenance]> = [
      ...entities.map((entity): [string, Provenance] => [entity.id, entity.provenance]),
      ...world.monthly_balance_series.map(
        (point): [string, Provenance] => [`balance:${point.month}`, point.provenance],
      ),
      ['debt_horizon', world.debt_horizon.provenance],
    ]

    for (const [label, provenance] of provenances) {
      const result = resolveRows(provenance, transactions.rows)
      expect(result.missingIds, `${label} missing rows`).toEqual([])
      expect(result.checksumOk, `${label} checksum`).toBe(true)
      expect(result.count, `${label} count`).toBe(provenance.rowIds.length)
    }
  })

  it('sizes each fixture category by its resolved rows', () => {
    const world = parseWorld(readJson('../../public/data/world.json'))
    const transactions = parseTransactions(readJson('../../public/data/transactions.json'))
    for (const category of world.categories) {
      const result = resolveRows(category.provenance, transactions.rows)
      // Every category row is a debit, so the signed sum mirrors the
      // generator's annualSpendCents (sum of abs(amount), see schema.md).
      expect(Math.abs(result.sum), category.id).toBe(category.annualSpendCents)
    }
  })
})
