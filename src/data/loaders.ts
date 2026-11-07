import type {
  BalancePoint,
  Category,
  DebtHorizon,
  IncomeEvent,
  Provenance,
  Splurge,
  Subscription,
  TransactionRow,
  TransactionsFile,
  World,
  WorldMeta,
} from './types'
import { valueFieldFromAgg } from './checksum'

/**
 * Typed loaders for public/data/world.json and public/data/transactions.json.
 *
 * scripts/build_world.py is the source of truth for both files (snake_case
 * keys, integer CAD cents, string row ids, SHA256 provenance checksums, and
 * the column oriented transactions table). The files are bundled for offline
 * booths (no external network), fetched relative to the Pages base URL, and
 * validated on the way in: schema drift between the Python generator and this
 * app fails loudly here instead of feeding corrupt rows into the report.
 * See src/data/schema.md for the field-by-field contract.
 */

type RawRecord = Record<string, unknown>

function asRecord(value: unknown, name: string): RawRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value as RawRecord
}

function asArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`)
  }
  return value
}

function asNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`)
  }
  return value
}

function asInteger(value: unknown, name: string): number {
  const number = asNumber(value, name)
  if (!Number.isInteger(number)) {
    throw new Error(`${name} must be an integer`)
  }
  return number
}

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
  return value
}

function asNullableNumber(value: unknown, name: string): number | null {
  if (value === null) {
    return null
  }
  return asNumber(value, name)
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/
const MONTH_PATTERN = /^\d{4}-\d{2}$/

/**
 * Upper bound on rows accepted from the bundled JSON files. The shipped
 * fixture carries 5702 transaction rows and the largest provenance
 * references 2572 of them, so 100_000 is generous; a tampered world.json or
 * transactions.json above it is rejected before the parsers allocate or
 * deduplicate an unbounded table (security review, docs/reviews.md).
 */
export const MAX_TRANSACTION_ROWS = 100_000

/** Validate one Provenance block as emitted by pipeline_lib.make_provenance. */
export function parseProvenance(raw: unknown, name: string): Provenance {
  const record = asRecord(raw, name)
  const rawRowIds = asArray(record.rowIds, `${name}.rowIds`)
  if (rawRowIds.length > MAX_TRANSACTION_ROWS) {
    throw new Error(
      `${name}.rowIds has ${rawRowIds.length} entries, above the ${MAX_TRANSACTION_ROWS} row cap`,
    )
  }
  const rowIds = rawRowIds.map((id, index) => asString(id, `${name}.rowIds[${index}]`))
  const filter = asString(record.filter, `${name}.filter`)
  const agg = asString(record.agg, `${name}.agg`)
  // Fails unless the aggregation announces "checksum value = <value column>".
  valueFieldFromAgg(agg)
  const checkSum = asString(record.checkSum, `${name}.checkSum`)
  if (!SHA256_PATTERN.test(checkSum)) {
    throw new Error(`${name}.checkSum must be 64 lowercase hex digits (sha256)`)
  }
  return { rowIds, filter, agg, checkSum }
}

function parseCategory(raw: unknown, index: number): Category {
  const name = `categories[${index}]`
  const record = asRecord(raw, name)
  const timeOfDay = asArray(record.timeOfDay, `${name}.timeOfDay`)
  if (timeOfDay.length !== 24) {
    throw new Error(`${name}.timeOfDay must have exactly 24 bins, got ${timeOfDay.length}`)
  }
  timeOfDay.forEach((bin, binIndex) => asNumber(bin, `${name}.timeOfDay[${binIndex}]`))
  return {
    id: asString(record.id, `${name}.id`),
    name: asString(record.name, `${name}.name`),
    annualSpendCents: asInteger(record.annualSpendCents, `${name}.annualSpendCents`),
    transactionCount: asInteger(record.transactionCount, `${name}.transactionCount`),
    medianAmountCents: asInteger(record.medianAmountCents, `${name}.medianAmountCents`),
    recurrencesPerMonth: asNumber(record.recurrencesPerMonth, `${name}.recurrencesPerMonth`),
    medianGapDays: asNullableNumber(record.medianGapDays, `${name}.medianGapDays`),
    timeOfDay: timeOfDay as number[],
    inclinationDeg: asNumber(record.inclinationDeg, `${name}.inclinationDeg`),
    ascendingNodeDeg: asNumber(record.ascendingNodeDeg, `${name}.ascendingNodeDeg`),
    orbitPhaseDeg: asNumber(record.orbitPhaseDeg, `${name}.orbitPhaseDeg`),
    provenance: parseProvenance(record.provenance, `${name}.provenance`),
  }
}

function parseSubscription(raw: unknown, index: number): Subscription {
  const name = `subscriptions[${index}]`
  const record = asRecord(raw, name)
  return {
    id: asString(record.id, `${name}.id`),
    merchant: asString(record.merchant, `${name}.merchant`),
    category: asString(record.category, `${name}.category`),
    monthlyAmountCents: asInteger(record.monthlyAmountCents, `${name}.monthlyAmountCents`),
    chargeCount: asInteger(record.chargeCount, `${name}.chargeCount`),
    firstDate: asString(record.firstDate, `${name}.firstDate`),
    lastDate: asString(record.lastDate, `${name}.lastDate`),
    medianGapDays: asNullableNumber(record.medianGapDays, `${name}.medianGapDays`),
    provenance: parseProvenance(record.provenance, `${name}.provenance`),
  }
}

function parseSplurge(raw: unknown, index: number): Splurge {
  const name = `splurges[${index}]`
  const record = asRecord(raw, name)
  return {
    id: asString(record.id, `${name}.id`),
    date: asString(record.date, `${name}.date`),
    amountCents: asInteger(record.amountCents, `${name}.amountCents`),
    spendCents: asInteger(record.spendCents, `${name}.spendCents`),
    category: asString(record.category, `${name}.category`),
    merchant: asString(record.merchant, `${name}.merchant`),
    thresholdCents: asInteger(record.thresholdCents, `${name}.thresholdCents`),
    ratioToMedian: asNumber(record.ratioToMedian, `${name}.ratioToMedian`),
    provenance: parseProvenance(record.provenance, `${name}.provenance`),
  }
}

function parseIncomeEvent(raw: unknown, index: number): IncomeEvent {
  const name = `income_events[${index}]`
  const record = asRecord(raw, name)
  return {
    id: asString(record.id, `${name}.id`),
    date: asString(record.date, `${name}.date`),
    amountCents: asInteger(record.amountCents, `${name}.amountCents`),
    label: asString(record.label, `${name}.label`),
    category: asString(record.category, `${name}.category`),
    provenance: parseProvenance(record.provenance, `${name}.provenance`),
  }
}

/**
 * Month count of the shipped fixture year (one month end close per month).
 * parseWorld requires exactly this many points; a source CSV covering fewer
 * months builds a shorter series the loader rejects. That is a known
 * coupling, documented in src/data/schema.md, and nothing pads the data.
 */
export const BALANCE_SERIES_LENGTH = 12

function parseBalanceSeries(raw: unknown): BalancePoint[] {
  const points = asArray(raw, 'monthly_balance_series')
  if (points.length !== BALANCE_SERIES_LENGTH) {
    throw new Error(
      `monthly_balance_series must have exactly ${BALANCE_SERIES_LENGTH} points (the fixture year length, one month end close per month; a shorter source series is a known coupling, see src/data/schema.md), got ${points.length}`,
    )
  }
  return points.map((point, index) => {
    const name = `monthly_balance_series[${index}]`
    const record = asRecord(point, name)
    const month = asString(record.month, `${name}.month`)
    if (!MONTH_PATTERN.test(month)) {
      throw new Error(`${name}.month must be a yyyy-mm label, got "${month}"`)
    }
    return {
      month,
      date: asString(record.date, `${name}.date`),
      balanceCents: asInteger(record.balanceCents, `${name}.balanceCents`),
      provenance: parseProvenance(record.provenance, `${name}.provenance`),
    }
  })
}

function parseDebtHorizon(raw: unknown): DebtHorizon {
  const record = asRecord(raw, 'world.debt_horizon')
  return {
    valueCents: asInteger(record.valueCents, 'world.debt_horizon.valueCents'),
    minBalanceCents: asInteger(record.minBalanceCents, 'world.debt_horizon.minBalanceCents'),
    bufferCents: asInteger(record.bufferCents, 'world.debt_horizon.bufferCents'),
    derivation: asString(record.derivation, 'world.debt_horizon.derivation'),
    provenance: parseProvenance(record.provenance, 'world.debt_horizon.provenance'),
  }
}

function parseMeta(raw: unknown): WorldMeta {
  const record = asRecord(raw, 'world.meta')
  const sourceSha256 = asString(record.sourceSha256, 'world.meta.sourceSha256')
  if (!SHA256_PATTERN.test(sourceSha256)) {
    throw new Error('world.meta.sourceSha256 must be 64 lowercase hex digits (sha256)')
  }
  const dateRange = asRecord(record.dateRange, 'world.meta.dateRange')
  const counts = asRecord(record.entityCounts, 'world.meta.entityCounts')
  return {
    schemaVersion: asInteger(record.schemaVersion, 'world.meta.schemaVersion'),
    generatedBy: asString(record.generatedBy, 'world.meta.generatedBy'),
    source: asString(record.source, 'world.meta.source'),
    sourceSha256,
    rowCount: asInteger(record.rowCount, 'world.meta.rowCount'),
    dateRange: {
      start: asString(dateRange.start, 'world.meta.dateRange.start'),
      end: asString(dateRange.end, 'world.meta.dateRange.end'),
    },
    moneyUnit: asString(record.moneyUnit, 'world.meta.moneyUnit'),
    checksumRecipe: asString(record.checksumRecipe, 'world.meta.checksumRecipe'),
    entityCounts: {
      categories: asInteger(counts.categories, 'world.meta.entityCounts.categories'),
      subscriptions: asInteger(counts.subscriptions, 'world.meta.entityCounts.subscriptions'),
      splurges: asInteger(counts.splurges, 'world.meta.entityCounts.splurges'),
      income_events: asInteger(counts.income_events, 'world.meta.entityCounts.income_events'),
      monthly_balance_series: asInteger(
        counts.monthly_balance_series,
        'world.meta.entityCounts.monthly_balance_series',
      ),
    },
  }
}

/** Validate a parsed world.json payload against the documented schema. */
export function parseWorld(raw: unknown): World {
  const record = asRecord(raw, 'world')
  const meta = parseMeta(record.meta)
  const categories = asArray(record.categories, 'world.categories').map(parseCategory)
  const subscriptions = asArray(record.subscriptions, 'world.subscriptions').map(
    parseSubscription,
  )
  const splurges = asArray(record.splurges, 'world.splurges').map(parseSplurge)
  const incomeEvents = asArray(record.income_events, 'world.income_events').map(parseIncomeEvent)
  const balanceSeries = parseBalanceSeries(record.monthly_balance_series)
  const debtHorizon = parseDebtHorizon(record.debt_horizon)

  if (categories.length + subscriptions.length + splurges.length + incomeEvents.length === 0) {
    throw new Error('world must contain at least one entity')
  }

  // The generator announces its own counts; a mismatch means the file was
  // hand edited or two pipeline runs were spliced together.
  const counts = meta.entityCounts
  const actual = {
    categories: categories.length,
    subscriptions: subscriptions.length,
    splurges: splurges.length,
    income_events: incomeEvents.length,
    monthly_balance_series: balanceSeries.length,
  }
  for (const key of Object.keys(actual) as (keyof typeof actual)[]) {
    if (counts[key] !== actual[key]) {
      throw new Error(
        `world.meta.entityCounts.${key} must equal the emitted array length (${actual[key]}), got ${counts[key]}`,
      )
    }
  }

  return {
    meta,
    categories,
    subscriptions,
    splurges,
    income_events: incomeEvents,
    monthly_balance_series: balanceSeries,
    debt_horizon: debtHorizon,
  }
}

/** Column order emitted by scripts/build_world.py (TRANSACTION_COLUMNS). */
export const TRANSACTION_COLUMNS: readonly string[] = [
  'id',
  'date',
  'hour',
  'amountCents',
  'balanceCents',
  'type',
  'category',
  'merchant',
]

function parseTransactionRow(raw: unknown, index: number): TransactionRow {
  const name = `rows[${index}]`
  if (!Array.isArray(raw)) {
    throw new Error(`${name} must be an array of ${TRANSACTION_COLUMNS.length} values`)
  }
  if (raw.length !== TRANSACTION_COLUMNS.length) {
    throw new Error(
      `${name} must have ${TRANSACTION_COLUMNS.length} values, got ${raw.length}`,
    )
  }
  const type = raw[5]
  if (type !== 'debit' && type !== 'credit') {
    throw new Error(`${name}.type must be "debit" or "credit"`)
  }
  return {
    id: asString(raw[0], `${name}.id`),
    date: asString(raw[1], `${name}.date`),
    hour: asInteger(raw[2], `${name}.hour`),
    amountCents: asInteger(raw[3], `${name}.amountCents`),
    balanceCents: asInteger(raw[4], `${name}.balanceCents`),
    type,
    category: asString(raw[6], `${name}.category`),
    // The generator may emit an empty merchant when the source CSV has no
    // merchant_name column, so only the type is validated here.
    merchant: typeof raw[7] === 'string' ? raw[7] : asString(raw[7], `${name}.merchant`),
  }
}

/** Validate a parsed transactions.json payload against the documented schema. */
export function parseTransactions(raw: unknown): TransactionsFile {
  const record = asRecord(raw, 'transactions')
  const columns = asArray(record.columns, 'transactions.columns').map((column, index) =>
    asString(column, `transactions.columns[${index}]`),
  )
  if (columns.join(',') !== TRANSACTION_COLUMNS.join(',')) {
    throw new Error(
      `transactions.columns must be ${JSON.stringify(TRANSACTION_COLUMNS)}, got ${JSON.stringify(columns)}`,
    )
  }
  const rawRows = asArray(record.rows, 'transactions.rows')
  if (rawRows.length > MAX_TRANSACTION_ROWS) {
    throw new Error(
      `transactions.rows has ${rawRows.length} rows, above the ${MAX_TRANSACTION_ROWS} row cap`,
    )
  }
  const rows = rawRows.map(parseTransactionRow)
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.id)) {
      throw new Error(`duplicate transaction row id ${row.id}`)
    }
    seen.add(row.id)
  }
  return { columns, rows }
}

/** Base URL for bundled data assets (Pages subpath aware). */
export function dataBase(): string {
  return import.meta.env.BASE_URL ?? '/'
}

/** Fetch and validate world.json. */
export async function loadWorld(): Promise<World> {
  const response = await fetch(`${dataBase()}data/world.json`)
  if (!response.ok) {
    throw new Error(`world.json fetch failed with status ${response.status}`)
  }
  return parseWorld(await response.json())
}

/** Fetch and validate transactions.json. */
export async function loadTransactions(): Promise<TransactionsFile> {
  const response = await fetch(`${dataBase()}data/transactions.json`)
  if (!response.ok) {
    throw new Error(`transactions.json fetch failed with status ${response.status}`)
  }
  return parseTransactions(await response.json())
}
