import { valueFieldFromAgg } from '../data/checksum'
import { resolveRows, type ResolvedRows } from '../data/resolveRows'
import type { Provenance, TransactionRow, World } from '../data/types'
import type { FindingId } from '../data/findings'

/**
 * Report provenance: maps each finding to the world.json entity bundles its
 * numbers rest on, then resolves those bundles against transactions.json so
 * every FINDINGS stamp can say "verified against N rows, checksum ok" and
 * expand into a row level inspector.
 *
 * The mapping is a declaration, not a computation: F1 and F2 decompose the
 * seven spending categories, F3 and F5 also need the deposit rows (the
 * running balance and the payroll cadence), F4 additionally cross-checks the
 * twelve month end balance closes. Resolution reuses resolveRows, so the
 * report recomputes every SHA256 over the sorted "{rowId}:{valueCents}"
 * lines in the browser instead of trusting a stored hash.
 */

/** One provenance bearing world entity selected for a finding. */
export interface ProvenanceItem {
  key: string
  label: string
  provenance: Provenance
}

/** A named bundle of entities inside one finding's provenance. */
export interface ProvenanceGroup {
  key: string
  label: string
  items: ProvenanceItem[]
}

/** One entity after checksum verification against transactions.json. */
export interface ResolvedProvenanceItem {
  key: string
  label: string
  /** Resolved row count (missing ids excluded). */
  count: number
  /** Sum over the provenance value column, in cents. */
  sum: number
  /** Value column the aggregation announced (amountCents or balanceCents). */
  valueField: 'amountCents' | 'balanceCents'
  /** True when the recomputed checksum matches provenance.checkSum. */
  checksumOk: boolean
  /** Row ids with no matching transaction row. */
  missingIds: number
  /** Provenance filter text, shown in the inspector. */
  filter: string
  /** Aggregation text, shown in the inspector. */
  agg: string
}

/** A group of entities after verification. */
export interface ResolvedProvenanceGroup {
  key: string
  label: string
  items: ResolvedProvenanceItem[]
  /** Union of the group's resolved row ids. */
  count: number
  /** True when every item in the group verified. */
  checksumOk: boolean
}

/** Everything one finding's provenance stamp renders. */
export interface FindingProvenance {
  findingId: FindingId
  groups: ResolvedProvenanceGroup[]
  /** Union of all group row ids: the stamp's row count. */
  rowCount: number
  /** Number of world entities verified. */
  entityCount: number
  /** True when every entity checksum matched. */
  checksumOk: boolean
  /** First rows of the union, sorted by (date, id), for the row table. */
  sampleRows: TransactionRow[]
}

/** Provenance by finding id (only findings that carry a bundle). */
export type FindingProvenanceById = Partial<Record<FindingId, FindingProvenance>>

/** Rows shown in the expanded inspector before the count summary takes over. */
export const SAMPLE_ROW_COUNT = 12

function categoryGroup(world: World): ProvenanceGroup {
  return {
    key: 'categories',
    label: 'Spending categories',
    items: world.categories.map((category) => ({
      key: category.id,
      label: category.name,
      provenance: category.provenance,
    })),
  }
}

function incomeGroup(world: World): ProvenanceGroup {
  return {
    key: 'income',
    label: 'Income deposits',
    items: world.income_events.map((event) => ({
      key: event.id,
      label: `${event.date} deposit`,
      provenance: event.provenance,
    })),
  }
}

function balanceGroup(world: World): ProvenanceGroup {
  return {
    key: 'balance',
    label: 'Month end balance closes',
    items: world.monthly_balance_series.map((point) => ({
      key: point.month,
      label: `${point.month} close`,
      provenance: point.provenance,
    })),
  }
}

/** The declared provenance bundle for every finding, in report order. */
export function findingProvenanceGroups(world: World): Record<FindingId, ProvenanceGroup[]> {
  return {
    F1: [categoryGroup(world)],
    F2: [categoryGroup(world)],
    F3: [categoryGroup(world), incomeGroup(world)],
    F4: [categoryGroup(world), incomeGroup(world), balanceGroup(world)],
    F5: [categoryGroup(world), incomeGroup(world)],
  }
}

interface ResolveCache {
  byCheckSum: Map<string, ResolvedRows>
}

/**
 * Resolve every finding's declared bundle against the transaction table,
 * verifying each entity checksum once (shared cache keyed by checksum, so
 * the seven categories resolve once for F1 to F5).
 */
export function resolveFindingProvenance(
  world: World,
  transactions: readonly TransactionRow[],
): FindingProvenanceById {
  const cache: ResolveCache = { byCheckSum: new Map() }
  const byId: FindingProvenanceById = {}
  const groupsById = findingProvenanceGroups(world)

  for (const [findingId, groups] of Object.entries(groupsById) as [FindingId, ProvenanceGroup[]][]) {
    const resolvedGroups: ResolvedProvenanceGroup[] = []
    const union = new Set<string>()
    let entityCount = 0
    let checksumOk = true

    for (const group of groups) {
      const items: ResolvedProvenanceItem[] = []
      const groupUnion = new Set<string>()
      for (const item of group.items) {
        const cached = cache.byCheckSum.get(item.provenance.checkSum)
        const result =
          cached ??
          (() => {
            const resolved = resolveRows(item.provenance, transactions)
            cache.byCheckSum.set(item.provenance.checkSum, resolved)
            return resolved
          })()
        const valueField = valueFieldFromAgg(item.provenance.agg)
        if (valueField === 'monthlyIncomeCents') {
          throw new Error('report provenance must resolve against the transaction table')
        }
        items.push({
          key: item.key,
          label: item.label,
          count: result.count,
          sum: result.sum,
          valueField,
          checksumOk: result.checksumOk,
          missingIds: result.missingIds.length,
          filter: item.provenance.filter,
          agg: item.provenance.agg,
        })
        for (const row of result.rows) {
          groupUnion.add(row.id)
        }
        if (!result.checksumOk) {
          checksumOk = false
        }
      }
      for (const id of groupUnion) {
        union.add(id)
      }
      entityCount += group.items.length
      resolvedGroups.push({
        key: group.key,
        label: group.label,
        items,
        count: groupUnion.size,
        checksumOk: items.every((item) => item.checksumOk),
      })
    }

    const rows = transactions.filter((row) => union.has(row.id))
    rows.sort((left, right) =>
      left.date === right.date
        ? left.id < right.id
          ? -1
          : left.id > right.id
            ? 1
            : 0
        : left.date < right.date
          ? -1
          : 1,
    )

    byId[findingId] = {
      findingId,
      groups: resolvedGroups,
      rowCount: union.size,
      entityCount,
      checksumOk,
      sampleRows: rows.slice(0, SAMPLE_ROW_COUNT),
    }
  }

  return byId
}
