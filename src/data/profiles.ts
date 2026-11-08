import { dataBase } from './loaders'

/**
 * Typed contract for public/data/engine/profiles.json, the Phase E1
 * artifact (docs/profiles-schema.md). Validation follows loaders.ts and
 * is deliberately strict: schema drift between scripts/engine/build.py
 * and this app throws here with the offending field named, instead of
 * feeding a wrong number into a judge facing card. The E2 loader
 * checklist is the spec: exact top level keys, schema_version 1, exact
 * profile key set, integer cents, the runway enum and range, five
 * boolean flags, a 64 hex check_sum, and account_count equal to the
 * profile count.
 *
 * No math and no React in this layer: parse, index, fetch. The runway
 * twin lives in src/lib/shocks.ts and is cross checked against every
 * shipped profile in profiles.test.ts.
 */

/** Runway states as emitted by the artifact (the contract enum). */
export type RunwayState = 'finite' | 'no_shortfall' | 'buffer_depleted'

/** One source CSV recorded in meta.sources. */
export interface ProfileSource {
  path: string
  sha256: string
  rows: number
}

/** The meta block: pipeline facts a provenance line can quote. */
export interface ProfilesMeta {
  schema_version: number
  generated_by: string
  sources: ProfileSource[]
  account_count: number
  date_range: { start: string; end: string }
  money_unit: string
  runway_unit: string
  rounding: string
  definitions: Record<string, string>
  checksum_recipe: string
  edge_flag_counts: Record<string, number>
}

/** History span for one account. */
export interface ProfileHistory {
  first_month: string
  last_month: string
  row_count: number
  months_contiguous: boolean
  /** Present only when months_contiguous is false. */
  months?: string[]
}

/** The loan record, null when the account has no row in loans.csv. */
export interface ProfileLoan {
  loan_id: number
  status: string
  defaulted: boolean
  amount_cents: number
  duration_months: number
  monthly_payment_cents: number
  loan_start: string
  scheduled_end_month: string
}

/** The five edge flags. */
export interface ProfileFlags {
  pensioner: boolean
  thin_history: boolean
  zero_income: boolean
  defaulted_loan: boolean
  negative_buffer: boolean
}

/** Last balance window for the E3 chart input. */
export interface ProfileBalanceSeries {
  start_month: string
  values_cents: number[]
}

/** Recorded provenance: check_sum is what the pipeline wrote, not a claim. */
export interface ProfileProvenance {
  source: string
  filter: string
  agg: string
  check_sum: string
}

/** One account: the judge metrics in integer cents plus its context. */
export interface AccountProfile {
  account_id: string
  income_cents: number
  fixed_costs_cents: number
  spending_cents: number
  buffer_cents: number
  household_bills_cents: number
  loan_payment_cents: number
  insurance_cents: number
  loan_payments_median_cents: number
  pension_in_cents: number
  gap_cents: number
  runway_state: RunwayState
  runway_deci_months: number
  history: ProfileHistory
  loan: ProfileLoan | null
  flags: ProfileFlags
  balance_series: ProfileBalanceSeries
  provenance: ProfileProvenance
}

/** The parsed artifact plus the two indexes the console needs. */
export interface ProfilesArtifact {
  meta: ProfilesMeta
  profiles: Record<string, AccountProfile>
  /** Account ids in ascending numeric order. */
  ids: string[]
  /** O(1) selection lookup for the store. */
  byId: Map<string, AccountProfile>
}

type RawRecord = Record<string, unknown>

const SHA256_PATTERN = /^[0-9a-f]{64}$/
const MONTH_PATTERN = /^\d{4}-\d{2}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ACCOUNT_ID_PATTERN = /^\d+$/
const LOAN_STATUS_PATTERN = /^[ABCD]$/

const PROFILE_KEYS: readonly string[] = [
  'account_id',
  'income_cents',
  'fixed_costs_cents',
  'spending_cents',
  'buffer_cents',
  'household_bills_cents',
  'loan_payment_cents',
  'insurance_cents',
  'loan_payments_median_cents',
  'pension_in_cents',
  'gap_cents',
  'runway_state',
  'runway_deci_months',
  'history',
  'loan',
  'flags',
  'balance_series',
  'provenance',
]

const FLAG_KEYS: readonly string[] = [
  'pensioner',
  'thin_history',
  'zero_income',
  'defaulted_loan',
  'negative_buffer',
]

const LOAN_KEYS: readonly string[] = [
  'loan_id',
  'status',
  'defaulted',
  'amount_cents',
  'duration_months',
  'monthly_payment_cents',
  'loan_start',
  'scheduled_end_month',
]

const HISTORY_KEYS: readonly string[] = [
  'first_month',
  'last_month',
  'row_count',
  'months_contiguous',
]

const META_KEYS: readonly string[] = [
  'schema_version',
  'generated_by',
  'sources',
  'account_count',
  'date_range',
  'money_unit',
  'runway_unit',
  'rounding',
  'definitions',
  'checksum_recipe',
  'edge_flag_counts',
]

/** The schema version this loader accepts (any other value is refused). */
export const PROFILE_SCHEMA_VERSION = 1

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

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
  return value
}

function asInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${name} must be an integer number of cents`)
  }
  return value
}

function asBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be a boolean`)
  }
  return value
}

function asMonth(value: unknown, name: string): string {
  const text = asString(value, name)
  if (!MONTH_PATTERN.test(text)) {
    throw new Error(`${name} must be a yyyy-mm label, got "${text}"`)
  }
  return text
}

function asHex64(value: unknown, name: string): string {
  const text = asString(value, name)
  if (!SHA256_PATTERN.test(text)) {
    throw new Error(`${name} must be 64 lowercase hex digits (sha256)`)
  }
  return text
}

/** Refuse any extra or missing key so the contract cannot silently grow. */
function requireExactKeys(record: RawRecord, expected: readonly string[], name: string): void {
  const actual = Object.keys(record)
  const missing = expected.filter((key) => !actual.includes(key))
  const extra = actual.filter((key) => !expected.includes(key))
  if (missing.length > 0 || extra.length > 0) {
    const parts: string[] = []
    if (missing.length > 0) {
      parts.push(`missing ${missing.join(', ')}`)
    }
    if (extra.length > 0) {
      parts.push(`unexpected ${extra.join(', ')}`)
    }
    throw new Error(`${name} keys must be exactly ${expected.join(', ')} (${parts.join('; ')})`)
  }
}

function parseHistory(raw: unknown, name: string): ProfileHistory {
  const record = asRecord(raw, name)
  requireExactKeys(record, HISTORY_KEYS, name)
  const history: ProfileHistory = {
    first_month: asMonth(record.first_month, `${name}.first_month`),
    last_month: asMonth(record.last_month, `${name}.last_month`),
    row_count: asInteger(record.row_count, `${name}.row_count`),
    months_contiguous: asBoolean(record.months_contiguous, `${name}.months_contiguous`),
  }
  if (history.row_count < 1) {
    throw new Error(`${name}.row_count must be at least 1, got ${history.row_count}`)
  }
  if (record.months !== undefined) {
    history.months = asArray(record.months, `${name}.months`).map((month, index) =>
      asMonth(month, `${name}.months[${index}]`),
    )
  }
  return history
}

function parseLoan(raw: unknown, name: string): ProfileLoan | null {
  if (raw === null) {
    return null
  }
  const record = asRecord(raw, name)
  requireExactKeys(record, LOAN_KEYS, name)
  const status = asString(record.status, `${name}.status`)
  if (!LOAN_STATUS_PATTERN.test(status)) {
    throw new Error(`${name}.status must be A, B, C, or D, got "${status}"`)
  }
  const loanStart = asString(record.loan_start, `${name}.loan_start`)
  if (!DATE_PATTERN.test(loanStart)) {
    throw new Error(`${name}.loan_start must be a yyyy-mm-dd date, got "${loanStart}"`)
  }
  return {
    loan_id: asInteger(record.loan_id, `${name}.loan_id`),
    status,
    defaulted: asBoolean(record.defaulted, `${name}.defaulted`),
    amount_cents: asInteger(record.amount_cents, `${name}.amount_cents`),
    duration_months: asInteger(record.duration_months, `${name}.duration_months`),
    monthly_payment_cents: asInteger(record.monthly_payment_cents, `${name}.monthly_payment_cents`),
    loan_start: loanStart,
    scheduled_end_month: asMonth(record.scheduled_end_month, `${name}.scheduled_end_month`),
  }
}

function parseFlags(raw: unknown, name: string): ProfileFlags {
  const record = asRecord(raw, name)
  requireExactKeys(record, FLAG_KEYS, name)
  return {
    pensioner: asBoolean(record.pensioner, `${name}.pensioner`),
    thin_history: asBoolean(record.thin_history, `${name}.thin_history`),
    zero_income: asBoolean(record.zero_income, `${name}.zero_income`),
    defaulted_loan: asBoolean(record.defaulted_loan, `${name}.defaulted_loan`),
    negative_buffer: asBoolean(record.negative_buffer, `${name}.negative_buffer`),
  }
}

function parseBalanceSeries(raw: unknown, name: string): ProfileBalanceSeries {
  const record = asRecord(raw, name)
  requireExactKeys(record, ['start_month', 'values_cents'], name)
  const values = asArray(record.values_cents, `${name}.values_cents`).map((value, index) =>
    asInteger(value, `${name}.values_cents[${index}]`),
  )
  if (values.length < 1 || values.length > 12) {
    throw new Error(`${name}.values_cents must hold 1 to 12 months, got ${values.length}`)
  }
  return {
    start_month: asMonth(record.start_month, `${name}.start_month`),
    values_cents: values,
  }
}

function parseProvenance(raw: unknown, name: string): ProfileProvenance {
  const record = asRecord(raw, name)
  requireExactKeys(record, ['source', 'filter', 'agg', 'check_sum'], name)
  return {
    source: asString(record.source, `${name}.source`),
    filter: asString(record.filter, `${name}.filter`),
    agg: asString(record.agg, `${name}.agg`),
    check_sum: asHex64(record.check_sum, `${name}.check_sum`),
  }
}

function parseRunwayState(value: unknown, name: string): RunwayState {
  const text = asString(value, name)
  if (text !== 'finite' && text !== 'no_shortfall' && text !== 'buffer_depleted') {
    throw new Error(`${name} must be finite, no_shortfall, or buffer_depleted, got "${text}"`)
  }
  return text
}

function parseProfile(key: string, raw: unknown): AccountProfile {
  const name = `profiles entry ${key}`
  const record = asRecord(raw, name)
  requireExactKeys(record, PROFILE_KEYS, name)

  const accountId = asString(record.account_id, `${name}.account_id`)
  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    throw new Error(`${name}.account_id must be digits, got "${accountId}"`)
  }
  if (accountId !== key) {
    throw new Error(`${name}.account_id must match its key, got "${accountId}"`)
  }

  const runwayDeciMonths = asInteger(record.runway_deci_months, `${name}.runway_deci_months`)
  if (runwayDeciMonths < 0 || runwayDeciMonths > 1200) {
    throw new Error(
      `${name}.runway_deci_months must be within 0 to 1200, got ${runwayDeciMonths}`,
    )
  }

  return {
    account_id: accountId,
    income_cents: asInteger(record.income_cents, `${name}.income_cents`),
    fixed_costs_cents: asInteger(record.fixed_costs_cents, `${name}.fixed_costs_cents`),
    spending_cents: asInteger(record.spending_cents, `${name}.spending_cents`),
    buffer_cents: asInteger(record.buffer_cents, `${name}.buffer_cents`),
    household_bills_cents: asInteger(
      record.household_bills_cents,
      `${name}.household_bills_cents`,
    ),
    loan_payment_cents: asInteger(record.loan_payment_cents, `${name}.loan_payment_cents`),
    insurance_cents: asInteger(record.insurance_cents, `${name}.insurance_cents`),
    loan_payments_median_cents: asInteger(
      record.loan_payments_median_cents,
      `${name}.loan_payments_median_cents`,
    ),
    pension_in_cents: asInteger(record.pension_in_cents, `${name}.pension_in_cents`),
    gap_cents: asInteger(record.gap_cents, `${name}.gap_cents`),
    runway_state: parseRunwayState(record.runway_state, `${name}.runway_state`),
    runway_deci_months: runwayDeciMonths,
    history: parseHistory(record.history, `${name}.history`),
    loan: parseLoan(record.loan, `${name}.loan`),
    flags: parseFlags(record.flags, `${name}.flags`),
    balance_series: parseBalanceSeries(record.balance_series, `${name}.balance_series`),
    provenance: parseProvenance(record.provenance, `${name}.provenance`),
  }
}

function parseMeta(raw: unknown): ProfilesMeta {
  const name = 'meta'
  const record = asRecord(raw, name)
  requireExactKeys(record, META_KEYS, name)

  const schemaVersion = asInteger(record.schema_version, `${name}.schema_version`)
  if (schemaVersion !== PROFILE_SCHEMA_VERSION) {
    throw new Error(
      `${name}.schema_version must be ${PROFILE_SCHEMA_VERSION}, got ${schemaVersion}`,
    )
  }

  const sources = asArray(record.sources, `${name}.sources`).map((source, index) => {
    const entryName = `${name}.sources[${index}]`
    const entry = asRecord(source, entryName)
    requireExactKeys(entry, ['path', 'sha256', 'rows'], entryName)
    return {
      path: asString(entry.path, `${entryName}.path`),
      sha256: asHex64(entry.sha256, `${entryName}.sha256`),
      rows: asInteger(entry.rows, `${entryName}.rows`),
    }
  })
  if (sources.length !== 3) {
    throw new Error(`${name}.sources must hold the three canonical CSVs, got ${sources.length}`)
  }

  const dateRange = asRecord(record.date_range, `${name}.date_range`)
  requireExactKeys(dateRange, ['start', 'end'], `${name}.date_range`)

  const definitions = asRecord(record.definitions, `${name}.definitions`)
  const edgeFlagCounts = asRecord(record.edge_flag_counts, `${name}.edge_flag_counts`)

  return {
    schema_version: schemaVersion,
    generated_by: asString(record.generated_by, `${name}.generated_by`),
    sources,
    account_count: asInteger(record.account_count, `${name}.account_count`),
    date_range: {
      start: asMonth(dateRange.start, `${name}.date_range.start`),
      end: asMonth(dateRange.end, `${name}.date_range.end`),
    },
    money_unit: asString(record.money_unit, `${name}.money_unit`),
    runway_unit: asString(record.runway_unit, `${name}.runway_unit`),
    rounding: asString(record.rounding, `${name}.rounding`),
    definitions: Object.fromEntries(
      Object.entries(definitions).map(([key, value]) => [
        key,
        asString(value, `${name}.definitions.${key}`),
      ]),
    ),
    checksum_recipe: asString(record.checksum_recipe, `${name}.checksum_recipe`),
    edge_flag_counts: Object.fromEntries(
      Object.entries(edgeFlagCounts).map(([key, value]) => [
        key,
        asInteger(value, `${name}.edge_flag_counts.${key}`),
      ]),
    ),
  }
}

/**
 * Validate a parsed profiles.json payload against docs/profiles-schema.md
 * and index it: ids sorted ascending by numeric value plus a Map for O(1)
 * selection. Every refusal names the field that broke the contract.
 */
export function parseProfilesArtifact(raw: unknown): ProfilesArtifact {
  const root = asRecord(raw, 'profiles.json')
  requireExactKeys(root, ['meta', 'profiles'], 'profiles.json')

  const meta = parseMeta(root.meta)
  const profilesRecord = asRecord(root.profiles, 'profiles')

  const entries = Object.entries(profilesRecord)
  if (meta.account_count !== entries.length) {
    throw new Error(
      `meta.account_count must equal the profile count (${entries.length}), got ${meta.account_count}`,
    )
  }

  const profiles: Record<string, AccountProfile> = {}
  for (const [key, value] of entries) {
    if (!ACCOUNT_ID_PATTERN.test(key)) {
      throw new Error(`profiles key "${key}" must be an account id of digits`)
    }
    profiles[key] = parseProfile(key, value)
  }

  const ids = Object.keys(profiles).sort((left, right) => Number(left) - Number(right))
  return {
    meta,
    profiles,
    ids,
    byId: new Map(ids.map((id) => [id, profiles[id] as AccountProfile])),
  }
}

/** Fetch and validate the bundled profiles artifact (one bundled file). */
export async function loadProfiles(): Promise<ProfilesArtifact> {
  const response = await fetch(`${dataBase()}data/engine/profiles.json`)
  if (!response.ok) {
    throw new Error(`profiles.json fetch failed with status ${response.status}`)
  }
  return parseProfilesArtifact(await response.json())
}

/**
 * The bundled artifact, fetched once for the whole shell: the console
 * renders it and any other consumer reads the same parsed object, so the
 * 4.7 MB file stays one request with one parse. A failed load clears the
 * memo so the next boot retries instead of inheriting the rejection
 * forever.
 */
let profilesLoad: Promise<ProfilesArtifact> | null = null

export function loadSharedProfiles(): Promise<ProfilesArtifact> {
  if (!profilesLoad) {
    profilesLoad = loadProfiles().catch((cause: unknown) => {
      profilesLoad = null
      throw cause
    })
  }
  return profilesLoad
}

/**
 * Prefix matches first, then substring matches, over the sorted id
 * index. No fuzzy library: a judge types digits, so exact prefixes are
 * the useful order and an empty query returns nothing (the UI shows the
 * example id instead of a 4,500 row list).
 */
export function searchAccountIds(
  ids: readonly string[],
  query: string,
  limit = 8,
): string[] {
  const needle = query.trim()
  if (needle.length === 0 || limit <= 0) {
    return []
  }
  const prefixes: string[] = []
  const substrings: string[] = []
  for (const id of ids) {
    if (id.startsWith(needle)) {
      prefixes.push(id)
    } else if (id.includes(needle)) {
      substrings.push(id)
    }
    if (prefixes.length >= limit) {
      break
    }
  }
  return [...prefixes, ...substrings].slice(0, limit)
}
