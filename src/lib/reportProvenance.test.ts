import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseTransactions, parseWorld } from '../data/loaders'
import { findingProvenanceGroups, resolveFindingProvenance, SAMPLE_ROW_COUNT } from './reportProvenance'

/**
 * Report provenance: the finding to entity declaration and the live
 * checksum verification behind every stamp. Runs against the shipped
 * world.json and transactions.json, so a pipeline that changes row ids,
 * filters, or checksums fails here instead of stamping a false "ok".
 */

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))
}

const world = parseWorld(readJson('../../public/data/world.json'))
const transactions = parseTransactions(readJson('../../public/data/transactions.json'))
const resolved = resolveFindingProvenance(world, transactions.rows)

describe('finding provenance declaration', () => {
  it('declares one bundle per finding in report order', () => {
    expect(Object.keys(findingProvenanceGroups(world))).toEqual(['F1', 'F2', 'F3', 'F4', 'F5'])
    const groups = findingProvenanceGroups(world)
    expect(groups.F1).toHaveLength(1)
    expect(groups.F1[0]?.items).toHaveLength(7)
    expect(groups.F3).toHaveLength(2)
    expect(groups.F3[1]?.items).toHaveLength(13)
    expect(groups.F4).toHaveLength(3)
    expect(groups.F4[2]?.items).toHaveLength(12)
    expect(groups.F5).toHaveLength(2)
  })

  it('labels the bundles the way the inspector reads them', () => {
    const groups = findingProvenanceGroups(world)
    expect(groups.F1[0]?.label).toBe('Spending categories')
    expect(groups.F3[1]?.label).toBe('Income deposits')
    expect(groups.F4[2]?.label).toBe('Month end balance closes')
    expect(groups.F1[0]?.items[0]?.label).toBe('Dining')
  })
})

describe('finding provenance resolution', () => {
  it('verifies every checksum against the shipped transaction table', () => {
    for (const findingId of ['F1', 'F2', 'F3', 'F4', 'F5'] as const) {
      const finding = resolved[findingId]
      expect(finding, findingId).toBeDefined()
      expect(finding?.checksumOk, findingId).toBe(true)
      expect(finding?.entityCount, findingId).toBeGreaterThan(0)
      for (const group of finding?.groups ?? []) {
        expect(group.checksumOk, `${findingId}/${group.key}`).toBe(true)
        for (const item of group.items) {
          expect(item.checksumOk, `${findingId}/${item.key}`).toBe(true)
          expect(item.missingIds, `${findingId}/${item.key}`).toBe(0)
          expect(item.filter.length).toBeGreaterThan(0)
          expect(item.agg).toContain('checksum value =')
        }
      }
    }
  })

  it('counts the union of source rows behind each finding', () => {
    const categoryIds = new Set(world.categories.flatMap((category) => category.provenance.rowIds))
    const incomeIds = new Set(world.income_events.map((event) => event.provenance.rowIds[0] ?? ''))
    const allIds = new Set([...categoryIds, ...incomeIds])

    expect(resolved.F1?.rowCount).toBe(categoryIds.size)
    expect(resolved.F2?.rowCount).toBe(categoryIds.size)
    expect(resolved.F3?.rowCount).toBe(allIds.size)
    expect(resolved.F4?.rowCount).toBe(allIds.size)
    expect(resolved.F5?.rowCount).toBe(allIds.size)
    // The full ledger resolves to the row count the meta block declares.
    expect(resolved.F3?.rowCount).toBe(world.meta.rowCount)
    expect(resolved.F3?.rowCount).toBe(transactions.rows.length)
  })

  it('samples the first rows sorted by date', () => {
    const finding = resolved.F3
    expect(finding?.sampleRows).toHaveLength(SAMPLE_ROW_COUNT)
    const dates = finding?.sampleRows.map((row) => row.date) ?? []
    const sorted = [...dates].sort()
    expect(dates).toEqual(sorted)
    expect(dates[0]).toBe('2025-11-01')
  })

  it('leaves the input rows untouched', () => {
    const before = transactions.rows.length
    const firstId = transactions.rows[0]?.id
    resolveFindingProvenance(world, transactions.rows)
    expect(transactions.rows).toHaveLength(before)
    expect(transactions.rows[0]?.id).toBe(firstId)
  })
})
