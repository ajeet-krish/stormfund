/**
 * Typed contract for public/data/world.json and public/data/transactions.json.
 *
 * The committed artifacts are frozen at the engine pivot (the builder
 * scripts retired with the pre-pivot pipeline): these interfaces mirror the
 * shipped JSON field for field, including the snake_case top level keys
 * (income_events, monthly_balance_series, debt_horizon), the snake_case
 * entity fields (annualSpendCents, monthlyAmountCents, balanceCents),
 * integer CAD cents, and string row ids. Field-by-field documentation
 * lives in src/data/schema.md.
 *
 * Every entity carries Provenance so provenance verification can resolve
 * it back to source transaction rows: that link is the honesty anchor of
 * the project.
 */

/** Value columns a Provenance aggregation may announce (see checksum.ts). */
export type ValueField = 'amountCents' | 'balanceCents' | 'monthlyIncomeCents'

/**
 * Value columns that exist on a TransactionRow. monthlyIncomeCents is a
 * player value column from the retired player pipeline, so it verifies
 * through the shared recipe but never resolves against the transaction
 * table.
 */
export type TransactionValueField = 'amountCents' | 'balanceCents'

/**
 * Source traceability for one entity, as emitted by pipeline_lib.py:
 * rowIds are authoritative string ids (they resolve directly against
 * transactions.json); filter is the human-readable rule the generator
 * applied; agg is free text that always ends with the suffix
 * "checksum value = <column>" announcing the value column; checkSum is the
 * SHA256 hex digest of the LF joined "{rowId}:{valueCents}" lines sorted by
 * row id, so the Inspector can verify integrity live.
 */
export interface Provenance {
  rowIds: string[]
  filter: string
  agg: string
  checkSum: string
}

/** Category planet, sized by annual spend (integer cents). */
export interface Category {
  id: string
  name: string
  annualSpendCents: number
  transactionCount: number
  medianAmountCents: number
  recurrencesPerMonth: number
  medianGapDays: number | null
  /** Normalized 24 bin histogram of debit hours. */
  timeOfDay: number[]
  inclinationDeg: number
  ascendingNodeDeg: number
  orbitPhaseDeg: number
  provenance: Provenance
}

/** Subscription riding a stable orbit, detected from recurring charges. */
export interface Subscription {
  id: string
  merchant: string
  category: string
  monthlyAmountCents: number
  chargeCount: number
  firstDate: string
  lastDate: string
  medianGapDays: number | null
  provenance: Provenance
}

/** One-time splurge, flown as a slingshot burn. Signed debit amount. */
export interface Splurge {
  id: string
  date: string
  /** Signed debit amount in cents (negative). */
  amountCents: number
  /** Absolute spend in cents (positive). */
  spendCents: number
  category: string
  merchant: string
  thresholdCents: number
  ratioToMedian: number
  provenance: Provenance
}

/** Income event: a fuel depot (positive deposit row). */
export interface IncomeEvent {
  id: string
  date: string
  amountCents: number
  label: string
  category: string
  provenance: Provenance
}

/**
 * One monthly close of the savings altitude series: the account balance of
 * the final row of that calendar month, in cents. The generator emits the
 * final BALANCE_SERIES_LENGTH months present in the data (12).
 */
export interface BalancePoint {
  /** Calendar month label, for example 2026-04. */
  month: string
  date: string
  balanceCents: number
  provenance: Provenance
}

/**
 * Debt horizon: the minimum month end balance minus a fixed buffer. Nothing
 * shipped reads it today: the cancelled galaxy game used savings minus
 * this horizon as its loss line, and the value stays in the data contract.
 */
export interface DebtHorizon {
  valueCents: number
  minBalanceCents: number
  bufferCents: number
  derivation: string
  provenance: Provenance
}

/** Generator provenance block emitted under world.meta. */
export interface WorldMeta {
  schemaVersion: number
  generatedBy: string
  source: string
  sourceSha256: string
  rowCount: number
  dateRange: { start: string; end: string }
  moneyUnit: string
  checksumRecipe: string
  entityCounts: {
    categories: number
    subscriptions: number
    splurges: number
    income_events: number
    monthly_balance_series: number
  }
}

/** Everything the loaders need from the data layer, as emitted. */
export interface World {
  meta: WorldMeta
  categories: Category[]
  subscriptions: Subscription[]
  splurges: Splurge[]
  income_events: IncomeEvent[]
  monthly_balance_series: BalancePoint[]
  debt_horizon: DebtHorizon
}

/**
 * One transaction row. The file on disk is column oriented
 * ({columns, rows} with rows as arrays); the loader materializes this
 * object form so callers work with named fields.
 */
export interface TransactionRow {
  /** Stable string row id referenced by Provenance.rowIds (for example TAN-000001). */
  id: string
  /** ISO calendar date, yyyy-mm-dd. */
  date: string
  /** Hour of the transaction, 0 to 23. */
  hour: number
  /** Signed amount in integer cents: negative is spend, positive is income. */
  amountCents: number
  /** Account balance after the row, in integer cents. */
  balanceCents: number
  /** Transaction direction as emitted by the generator. */
  type: 'debit' | 'credit'
  /** Merchant category label, matches Category.name for mapped rows. */
  category: string
  /** Merchant label, may be empty when the source CSV has no merchant column. */
  merchant: string
}

/** Parsed transactions.json: validated column list plus materialized rows. */
export interface TransactionsFile {
  columns: string[]
  rows: TransactionRow[]
}

/** All entity kinds that carry provenance, as a discriminated union. */
export type WorldEntity =
  | ({ kind: 'category' } & Category)
  | ({ kind: 'subscription' } & Subscription)
  | ({ kind: 'splurge' } & Splurge)
  | ({ kind: 'income' } & IncomeEvent)

/** Flat list of every provenance-bearing entity in the world. */
export function worldEntities(world: World): WorldEntity[] {
  return [
    ...world.categories.map((entity) => ({ kind: 'category' as const, ...entity })),
    ...world.subscriptions.map((entity) => ({ kind: 'subscription' as const, ...entity })),
    ...world.splurges.map((entity) => ({ kind: 'splurge' as const, ...entity })),
    ...world.income_events.map((entity) => ({ kind: 'income' as const, ...entity })),
  ]
}

/**
 * Deterministic layout seed derived from the source checksum: the builder
 * emits no seed field, so the first 8 hex digits of meta.sourceSha256 stand
 * in for it (stable across rebuilds of an unchanged CSV). No shipped surface
 * reads it; it stayed behind with the cancelled game layouts.
 */
export function worldSeed(world: World): number {
  return parseInt(world.meta.sourceSha256.slice(0, 8), 16)
}
