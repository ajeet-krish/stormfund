import { provenanceCheckSum, valueFieldFromAgg } from './checksum'
import type { Provenance, TransactionRow } from './types'

/**
 * Result of resolving provenance row ids against the transaction table.
 * The Inspector shows count and sum and verifies the checksum live.
 */
export interface ResolvedRows {
  /** Rows actually found (missing ids are excluded). */
  rows: TransactionRow[]
  /** Resolved row count. */
  count: number
  /** Sum over the provenance value column (amountCents or balanceCents), in cents. */
  sum: number
  /** Provenance row ids with no matching transaction row. */
  missingIds: string[]
  /** Checksum recomputed from the resolved rows (SHA256 hex). */
  computedCheckSum: string
  /** True when the recomputed checksum matches provenance.checkSum. */
  checksumOk: boolean
}

/**
 * Resolve provenance row ids against the transaction table, compute count
 * and sum, and verify the checksum against the pipeline recipe (SHA256 over
 * sorted "{rowId}:{valueCents}" lines, see checksum.ts). Pure: the input
 * rows are never mutated.
 *
 * rowIds are authoritative; provenance.filter documents the rule the
 * generator applied but is not re-evaluated here.
 */
export function resolveRows(
  provenance: Provenance,
  transactions: readonly TransactionRow[],
): ResolvedRows {
  const field = valueFieldFromAgg(provenance.agg)
  if (field === 'monthlyIncomeCents') {
    // Player value column (public/data/players.json): it verifies through
    // provenanceCheckSum but has no column on a transaction row.
    throw new Error(
      'monthlyIncomeCents provenance belongs to players.json and cannot resolve against the transaction table',
    )
  }
  if (provenance.rowIds.length > transactions.length) {
    // A provenance can never legitimately reference more rows than the
    // transaction table holds, so reject before building the lookup map and
    // a tampered payload cannot force an unbounded resolve (security
    // review, docs/reviews.md).
    throw new Error(
      `provenance.rowIds length ${provenance.rowIds.length} exceeds the transaction row count ${transactions.length}`,
    )
  }
  const byId = new Map<string, TransactionRow>()
  for (const row of transactions) {
    byId.set(row.id, row)
  }

  const rows: TransactionRow[] = []
  const missingIds: string[] = []
  for (const id of provenance.rowIds) {
    const row = byId.get(id)
    if (row) {
      rows.push(row)
    } else {
      missingIds.push(id)
    }
  }

  const sum = rows.reduce((total, row) => total + row[field], 0)
  const computedCheckSum = provenanceCheckSum(
    rows.map((row) => ({ rowId: row.id, valueCents: row[field] })),
  )

  return {
    rows,
    count: rows.length,
    sum,
    missingIds,
    computedCheckSum,
    checksumOk: computedCheckSum === provenance.checkSum,
  }
}
