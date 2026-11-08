import { dataBase } from '../data/loaders'
import { SHOCK_PRESETS } from './shockPresets'
import { VERDICT_BANDS, type VerdictBandId } from './verdict'

/**
 * Typed contract for public/data/engine/atlas.json, the district level
 * companion to profiles.json. Validation follows src/data/profiles.ts
 * and is deliberately strict: schema drift between
 * scripts/engine/build.py and this app throws here with the offending
 * field named, instead of feeding a wrong number into a judge facing
 * map. The fixed contract (docs, Phase E5 record) is: schema_version 1,
 * a five band list, provenance sources, one row per district, an
 * account to district map, a baseline split, and per preset scenario
 * splits. Two cross checks make silent drift impossible: every band
 * counts object must sum to its district account_count, and the
 * account map must agree with every district account_count.
 *
 * The band list may arrive under the verdict_bands key or the older
 * states key name, so the loader accepts either spelling of that one
 * key, but the count keys inside every counts object are always
 * exactly the five verdict band ids from verdict.ts.
 *
 * Helpers in this file answer the two cartogram questions: how severe
 * a district's split is, and which shading bin that severity falls in.
 * They read the counts they are handed and never recompute a runway.
 * The loader fetches one bundled artifact per shell, the same offline
 * pattern as loadSharedProfiles, and makes no external calls.
 */

/** Count per band, keyed by the canonical band union. Structurally the
 * same Record as stormAtlas's BandCounts, defined here so the loader
 * layer does not import the aggregation layer. */
export type BandCounts = Record<VerdictBandId, number>

/** One source file recorded in sources. */
export interface AtlasSource {
  path: string
  sha256: string
  rows: number
}

/** One district row. Demographic cells are nullable (district 69 has
 * real accounts with only demographics missing, which no_data flags). */
export interface DistrictRow {
  district_id: number
  district_name: string
  region: string
  inhabitants: number
  unemployment_rate_2023: number | null
  average_salary: number | null
  account_count: number
  no_data: boolean
}

/** The parsed artifact, JSON shaped: district maps are keyed by the
 * district id as a string, because that is how JSON stores them. */
export interface AtlasDoc {
  schema_version: number
  generated_by: string
  verdict_bands: VerdictBandId[]
  sources: AtlasSource[]
  districts: DistrictRow[]
  /** Account id to district id. */
  account_district: Record<string, number>
  /** District id to counts, every district present. */
  baseline: Record<string, BandCounts>
  /** Preset id to district id to counts. */
  scenarios: Record<string, Record<string, BandCounts>>
}

/** The schema version this loader accepts (any other value is refused). */
export const ATLAS_SCHEMA_VERSION = 1

/** Ladder order, lowest runway first, straight from verdict.ts. */
export const ATLAS_BAND_IDS: readonly VerdictBandId[] = VERDICT_BANDS.map((band) => band.id)

/**
 * The legend's severity definition, printed word for word under the
 * cartogram so a judge never has to guess what a shaded tile counts.
 */
export const SEVERITY_DEFINITION = 'critical plus storm warning share of the district accounts'

type RawRecord = Record<string, unknown>

const SHA256_PATTERN = /^[0-9a-f]{64}$/
const ACCOUNT_ID_PATTERN = /^\d+$/
const PRESET_IDS: ReadonlySet<string> = new Set(SHOCK_PRESETS.map((preset) => preset.id))

const DISTRICT_KEYS: readonly string[] = [
  'district_id',
  'district_name',
  'region',
  'inhabitants',
  'unemployment_rate_2023',
  'average_salary',
  'account_count',
  'no_data',
]

const SOURCE_KEYS: readonly string[] = ['path', 'sha256', 'rows']

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
    throw new Error(`${name} must be an integer number of accounts`)
  }
  return value
}

function asCount(value: unknown, name: string): number {
  const count = asInteger(value, name)
  if (count < 0) {
    throw new Error(`${name} must not be negative, got ${count}`)
  }
  return count
}

function asFiniteNumberOrNull(value: unknown, name: string): number | null {
  if (value === null) {
    return null
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number or null`)
  }
  return value
}

function asBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be a boolean`)
  }
  return value
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

/**
 * The band list key is the one spelling the loader tolerates in two
 * forms: verdict_bands or states. Every refusal below is written so
 * the message never echoes the received band names back, which keeps
 * retired vocabulary out of code, logs, and docs.
 */
function pickBandListKey(root: RawRecord): 'verdict_bands' | 'states' {
  const hasVerdictBands = Object.prototype.hasOwnProperty.call(root, 'verdict_bands')
  const hasStates = Object.prototype.hasOwnProperty.call(root, 'states')
  if (hasVerdictBands && hasStates) {
    throw new Error('atlas.json must carry one band list key, verdict_bands or states, not both')
  }
  if (hasVerdictBands) {
    return 'verdict_bands'
  }
  if (hasStates) {
    return 'states'
  }
  throw new Error('atlas.json is missing its band list key, verdict_bands or states')
}

function parseBandList(raw: unknown, name: string): VerdictBandId[] {
  const list = asArray(raw, name)
  if (list.length !== ATLAS_BAND_IDS.length) {
    throw new Error(`${name} must list the five verdict bands in ladder order`)
  }
  for (let index = 0; index < ATLAS_BAND_IDS.length; index += 1) {
    if (list[index] !== ATLAS_BAND_IDS[index]) {
      throw new Error(`${name} must list the five verdict bands in ladder order`)
    }
  }
  return [...ATLAS_BAND_IDS]
}

function parseBandCounts(raw: unknown, name: string): BandCounts {
  const record = asRecord(raw, name)
  requireExactKeys(record, ATLAS_BAND_IDS, name)
  const counts = {} as BandCounts
  for (const band of ATLAS_BAND_IDS) {
    counts[band] = asCount(record[band], `${name}.${band}`)
  }
  return counts
}

function parseSources(raw: unknown): AtlasSource[] {
  const sources = asArray(raw, 'sources')
  return sources.map((entry, index) => {
    const name = `sources[${index}]`
    const record = asRecord(entry, name)
    requireExactKeys(record, SOURCE_KEYS, name)
    const rows = asCount(record.rows, `${name}.rows`)
    return {
      path: asString(record.path, `${name}.path`),
      sha256: asHex64(record.sha256, `${name}.sha256`),
      rows,
    }
  })
}

function parseDistricts(raw: unknown): DistrictRow[] {
  const rows = asArray(raw, 'districts')
  const seen = new Set<number>()
  return rows.map((entry, index) => {
    const name = `districts[${index}]`
    const record = asRecord(entry, name)
    requireExactKeys(record, DISTRICT_KEYS, name)
    const districtId = asCount(record.district_id, `${name}.district_id`)
    if (seen.has(districtId)) {
      throw new Error(`${name}.district_id must be unique, got ${districtId} twice`)
    }
    seen.add(districtId)
    const accountCount = asCount(record.account_count, `${name}.account_count`)
    return {
      district_id: districtId,
      district_name: asString(record.district_name, `${name}.district_name`),
      region: asString(record.region, `${name}.region`),
      inhabitants: asCount(record.inhabitants, `${name}.inhabitants`),
      unemployment_rate_2023: asFiniteNumberOrNull(
        record.unemployment_rate_2023,
        `${name}.unemployment_rate_2023`,
      ),
      average_salary: asFiniteNumberOrNull(record.average_salary, `${name}.average_salary`),
      account_count: accountCount,
      no_data: asBoolean(record.no_data, `${name}.no_data`),
    }
  })
}

/**
 * Every account map value must name a district that exists, and each
 * district must be mapped exactly account_count times, so the map and
 * the district table can never disagree about how many accounts live
 * where.
 */
function parseAccountDistrict(
  raw: unknown,
  districts: readonly DistrictRow[],
): Record<string, number> {
  const record = asRecord(raw, 'account_district')
  const byDistrict = new Map(districts.map((row) => [row.district_id, row]))
  const mapped = new Map<number, number>()
  for (const [key, value] of Object.entries(record)) {
    if (!ACCOUNT_ID_PATTERN.test(key)) {
      throw new Error(`account_district key "${key}" must be an account id of digits`)
    }
    const districtId = asCount(value, `account_district["${key}"]`)
    if (!byDistrict.has(districtId)) {
      throw new Error(`account_district["${key}"] must name a district in districts, got ${districtId}`)
    }
    mapped.set(districtId, (mapped.get(districtId) ?? 0) + 1)
  }
  for (const row of districts) {
    const count = mapped.get(row.district_id) ?? 0
    if (count !== row.account_count) {
      throw new Error(
        `account_district maps ${count} accounts to district ${row.district_id}, expected districts account_count ${row.account_count}`,
      )
    }
  }
  return record as Record<string, number>
}

/**
 * A district split table: keys exactly the district ids, each counts
 * object exactly the five bands, each object summing to its district
 * account_count. Used for baseline and for every scenario.
 */
function parseDistrictCounts(
  raw: unknown,
  name: string,
  districts: readonly DistrictRow[],
): Record<string, BandCounts> {
  const record = asRecord(raw, name)
  const expected = districts.map((row) => String(row.district_id))
  requireExactKeys(record, expected, name)
  const out: Record<string, BandCounts> = {}
  for (const key of expected) {
    const counts = parseBandCounts(record[key], `${name}[${key}]`)
    const district = districts.find((row) => String(row.district_id) === key) as DistrictRow
    const total = bandTotal(counts)
    if (total !== district.account_count) {
      throw new Error(
        `${name}[${key}] band counts sum to ${total}, expected districts account_count ${district.account_count}`,
      )
    }
    out[key] = counts
  }
  return out
}

function parseScenarios(
  raw: unknown,
  districts: readonly DistrictRow[],
): Record<string, Record<string, BandCounts>> {
  const record = asRecord(raw, 'scenarios')
  const out: Record<string, Record<string, BandCounts>> = {}
  for (const [presetId, value] of Object.entries(record)) {
    if (!PRESET_IDS.has(presetId)) {
      throw new Error(`scenarios key "${presetId}" is not a shipped shock preset id`)
    }
    out[presetId] = parseDistrictCounts(value, `scenarios[${presetId}]`, districts)
  }
  return out
}

/**
 * Validate a parsed atlas.json payload against the fixed schema and
 * index nothing: the artifact is already keyed the way the UI reads
 * it. Every refusal names the field that broke the contract.
 */
export function parseAtlasDoc(raw: unknown): AtlasDoc {
  const root = asRecord(raw, 'atlas.json')
  const bandKey = pickBandListKey(root)
  requireExactKeys(
    root,
    ['schema_version', 'generated_by', bandKey, 'sources', 'districts', 'account_district', 'baseline', 'scenarios'],
    'atlas.json',
  )

  const schemaVersion = asInteger(root.schema_version, 'schema_version')
  if (schemaVersion !== ATLAS_SCHEMA_VERSION) {
    throw new Error(
      `schema_version must be ${ATLAS_SCHEMA_VERSION}, got ${schemaVersion}`,
    )
  }

  const districts = parseDistricts(root.districts)
  return {
    schema_version: schemaVersion,
    generated_by: asString(root.generated_by, 'generated_by'),
    verdict_bands: parseBandList(root[bandKey], bandKey),
    sources: parseSources(root.sources),
    districts,
    account_district: parseAccountDistrict(root.account_district, districts),
    baseline: parseDistrictCounts(root.baseline, 'baseline', districts),
    scenarios: parseScenarios(root.scenarios, districts),
  }
}

/** Fetch and validate the bundled atlas artifact (one bundled file). */
export async function loadAtlas(): Promise<AtlasDoc> {
  const response = await fetch(`${dataBase()}data/engine/atlas.json`)
  if (!response.ok) {
    throw new Error(`atlas.json fetch failed with status ${response.status}`)
  }
  return parseAtlasDoc(await response.json())
}

/**
 * The bundled artifact, fetched once for the whole shell: the same
 * pattern as loadSharedProfiles, one request and one parse per boot
 * and no external network. A failed load clears the memo so the next
 * boot retries instead of inheriting the rejection forever.
 */
let atlasLoad: Promise<AtlasDoc> | null = null

export function loadSharedAtlas(): Promise<AtlasDoc> {
  if (!atlasLoad) {
    atlasLoad = loadAtlas().catch((cause: unknown) => {
      atlasLoad = null
      throw cause
    })
  }
  return atlasLoad
}

/**
 * Total accounts a counts object counts: the sum of the five band
 * counts, used for every share this file and its callers print.
 */
export function bandTotal(counts: BandCounts): number {
  let total = 0
  for (const band of ATLAS_BAND_IDS) {
    total += counts[band]
  }
  return total
}

/**
 * District severity: the share of a district's counted accounts that
 * land in the critical or storm_warning bands, as a fraction from 0
 * to 1. This is the definition the cartogram legend prints (see
 * SEVERITY_DEFINITION): one number, two bands, denominator is the
 * district's own account total. A district with no accounts to count
 * reports 0, and callers must pass counts, never recompute them.
 */
export function districtSeverity(counts: BandCounts): number {
  const total = bandTotal(counts)
  if (total <= 0) {
    return 0
  }
  return (counts.critical + counts.storm_warning) / total
}

/** One shading bin: 0 is no severity, 4 is the heaviest. */
export type SeverityBin = 0 | 1 | 2 | 3 | 4

export interface SeverityBinSpec {
  bin: SeverityBin
  /** The verdict band whose color shades a tile in this bin. */
  band: VerdictBandId
  /** Bin range in whole percent, printed verbatim in the legend. */
  range: string
}

/**
 * Five shading bins over severity, low to high, each reusing one of
 * the five band colors in ladder order: a district with nothing in
 * the two risk bands reads Clear, the heaviest district reads
 * Critical. The thresholds sit low on purpose because a baseline
 * population spends most of its districts near zero, so a preset
 * twist has somewhere visible to cascade into. Bin 0 is exactly zero;
 * every other bin is a half open interval written as percent words.
 */
export const SEVERITY_BINS: readonly SeverityBinSpec[] = [
  { bin: 0, band: 'clear', range: 'exactly 0%' },
  { bin: 1, band: 'fair_skies', range: 'over 0 to 5%' },
  { bin: 2, band: 'watch', range: 'over 5 to 15%' },
  { bin: 3, band: 'storm_warning', range: 'over 15 to 40%' },
  { bin: 4, band: 'critical', range: 'over 40%' },
]

/**
 * Which bin a severity share falls in. Boundaries are fractions of a
 * district's accounts: an exact boundary lands in the lower bin, a
 * non finite share reads as zero, and anything above 40 percent is
 * the top bin.
 */
export function binFor(share: number): SeverityBin {
  if (!Number.isFinite(share) || share <= 0) {
    return 0
  }
  if (share <= 0.05) {
    return 1
  }
  if (share <= 0.15) {
    return 2
  }
  if (share <= 0.4) {
    return 3
  }
  return 4
}

/** The band whose color shades a bin (never undefined for a bin). */
export function bandForBin(bin: SeverityBin): VerdictBandId {
  const spec = SEVERITY_BINS.find((entry) => entry.bin === bin)
  if (!spec) {
    throw new Error(`unknown severity bin ${bin}`)
  }
  return spec.band
}

export interface RegionGroup {
  region: string
  districts: DistrictRow[]
}

/**
 * Districts grouped by region: regions alphabetical, districts
 * alphabetical within their region. The cartogram arranges tiles by
 * this order and never by geography, which is exactly what its legend
 * says.
 */
export function regionsGrouped(doc: AtlasDoc | null | undefined): RegionGroup[] {
  if (!doc) {
    return []
  }
  const groups = new Map<string, DistrictRow[]>()
  for (const row of doc.districts) {
    const bucket = groups.get(row.region)
    if (bucket) {
      bucket.push(row)
    } else {
      groups.set(row.region, [row])
    }
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en-CA'))
    .map(([region, districts]) => ({
      region,
      districts: [...districts].sort((left, right) =>
        left.district_name.localeCompare(right.district_name, 'en-CA'),
      ),
    }))
}
