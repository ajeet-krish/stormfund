import type { AccountProfile } from '../data/profiles'
import { applyTwist, scaleCents, type Twist } from './shocks'

/**
 * The Gemini typed shock input boundary (docs/architecture.md, Gemini
 * shock input). One short sentence goes in and one validated ShockSpec
 * comes out, or a named reject reason the store turns into a fallback
 * note. Nothing here touches React or app state: parseShockSentence is
 * the only network call in the app, it runs with a hard 3 second
 * timeout, and every payload is shape checked, percent corrected,
 * clamped, and rounded before it is handed back. The math fields then
 * convert through shockSpecToTwist into the same Twist the preset cards
 * produce, so the judge formula in src/lib/shocks.ts stays the single
 * consumer of both paths.
 *
 * The prompt carries the sentence, the account id, and the six baseline
 * metrics as integer cents (user approved Nov 07 2026, docs/
 * decisions.md). Raw rows, transaction history, and balance series
 * never leave the browser.
 */

/** The pinned model for the typed shock parse. */
export const GEMINI_MODEL = 'gemini-3.5-flash-lite'

/** Hard cap for one parse request, matched to the 3 second UX budget. */
export const PARSE_TIMEOUT_MS = 3000

/** What the model may map a sentence to. */
export type ShockIntent = 'job_loss' | 'bills_up' | 'one_off_cost' | 'mixed' | 'no_shock'

/** The model's confidence in its own mapping. */
export type ShockConfidence = 'high' | 'medium' | 'low'

/** The four ShockSpec fields, the only keys a chip stepper can move. */
export type SpecField = 'incomeFactor' | 'billsPct' | 'oneOffMonths' | 'durationMonths'

/** Which normalization step auto corrected a field. */
export type ParseFixKind = 'percent' | 'clamp' | 'round'

/** One auto correction: the field that moved and the step that moved it. */
export interface ParseFix {
  field: SpecField
  fix: ParseFixKind
}

/** Mapped shock parameters, normalized into their schema ranges. */
export interface ShockSpec {
  /** Fraction of usual monthly income kept, 0 to 1, two decimals. */
  incomeFactor: number
  /** Fractional rise in household bills, 0 to 1, two decimals. */
  billsPct: number
  /** One off cost in months of typical spending, 0 to 12, one decimal. */
  oneOffMonths: number
  /** Display only horizon in months, integer 0 to 120. */
  durationMonths: number
}

/** The full model payload: the spec fields plus the mapping metadata. */
export interface ShockPayload extends ShockSpec {
  intent: ShockIntent
  confidence: ShockConfidence
  summary: string
}

/** A payload that passed every check, with low confidence ruled out. */
export type ParseOkPayload = Omit<ShockPayload, 'confidence'> & {
  confidence: 'high' | 'medium'
}

/** What leaves the browser in the prompt: baseline figures only. */
export interface PromptMetrics {
  accountId: string
  incomeCents: number
  fixedCostsCents: number
  spendingCents: number
  bufferCents: number
  householdBillsCents: number
  loanPaymentCents: number
  runwayMonths: number
}

/** Why a parse was rejected before any state change could happen. */
export type RejectReason =
  | 'empty_input'
  | 'no_key'
  | 'malformed_json'
  | 'bad_shape'
  | 'no_shock'
  | 'low_confidence'
  | 'all_neutral'
  | 'rate_limited'
  | 'http_error'
  | 'network_error'
  | 'aborted'

/** A successful parse: the spec plus what the model said it mapped. */
export interface ParseOk {
  status: 'ok'
  spec: ShockSpec
  intent: ShockIntent
  confidence: 'high' | 'medium'
  summary: string
  fixes: ParseFix[]
}

/** A rejected parse: the reason the store turns into a fallback note. */
export interface ParseRejected {
  status: 'rejected'
  reason: RejectReason
  detail: string
}

/** A hard timeout or an abort during the request. */
export interface ParseTimeout {
  status: 'timeout'
}

/** The parse result union: ok, rejected, or timeout. */
export type ParseOutcome = ParseOk | ParseRejected | ParseTimeout

/** What validateShockPayload returns: a normalized payload or a reject. */
export type ValidateOutcome =
  | { status: 'ok'; payload: ParseOkPayload; fixes: ParseFix[] }
  | { status: 'rejected'; reason: RejectReason; detail: string }

/** Summary cap enforced after validation (the schema caps it too). */
export const SUMMARY_MAX_CHARS = 90

/** One click chip step per field, in the field's own unit. */
export const SPEC_STEPS: Record<SpecField, number> = {
  incomeFactor: 0.05,
  billsPct: 0.01,
  oneOffMonths: 0.1,
  durationMonths: 1,
}

/** The generateContent endpoint for the pinned model. */
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

/** FIFO cache cap: identical sentences on one account stay free. */
const CACHE_LIMIT = 32

const INTENT_VALUES: readonly string[] = [
  'job_loss',
  'bills_up',
  'one_off_cost',
  'mixed',
  'no_shock',
]

const CONFIDENCE_VALUES: readonly string[] = ['high', 'medium', 'low']

const PAYLOAD_KEYS: readonly string[] = [
  'intent',
  'confidence',
  'incomeFactor',
  'billsPct',
  'oneOffMonths',
  'durationMonths',
  'summary',
]

const SPEC_FIELDS: readonly SpecField[] = [
  'incomeFactor',
  'billsPct',
  'oneOffMonths',
  'durationMonths',
]

/**
 * The system instruction, verbatim and unit free: the fields are
 * fractions and counts, never money, and the baseline figures in the
 * user message exist only to turn a dollar amount named in the sentence
 * into months of spending.
 */
export const SYSTEM_INSTRUCTION =
  'You map one short financial shock sentence to structured shock parameters for a resilience calculator. ' +
  'Return only the JSON object the schema requires, no markdown, no extra keys. ' +
  'Field meanings, all unit free: intent is job_loss, bills_up, one_off_cost, mixed, or no_shock; ' +
  'use no_shock when the sentence describes no change at all. ' +
  'incomeFactor is the fraction of usual monthly income the customer keeps, 0 to 1, use 1 when income is unchanged; ' +
  'when income stops and a benefit replaces a stated share of it, use that share (a benefit covering 55 percent means 0.55), ' +
  'and when income stops with no benefit stated, use 0. ' +
  'billsPct is the fractional rise in household bills, 0 to 1 (15 percent up is 0.15), use 0 when bills are unchanged. ' +
  'oneOffMonths is a one off cost expressed in months of typical spending, 0 to 12, use 0 when there is none. ' +
  'durationMonths is an integer count of months the change lasts, 0 to 120, display only, ' +
  'use 0 when the sentence gives no duration or implies a permanent change. ' +
  'confidence is high when the mapping is clear, medium when you had to assume, ' +
  'low when the sentence is ambiguous or not about money. ' +
  'summary restates the mapped shock in plain words, at most 90 characters. ' +
  'Rules: the fields are fractions and counts, never money. ' +
  "The user message carries the customer's baseline figures as plain numbers; " +
  'use them only to turn amounts named in the sentence into oneOffMonths of spending. ' +
  'Never copy customer data into the summary. ' +
  'Percents in the sentence always become fraction values here.'

/** Strict structured output: seven required keys, no extras, ranged numbers. */
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: { type: 'string', enum: INTENT_VALUES },
    confidence: { type: 'string', enum: CONFIDENCE_VALUES },
    incomeFactor: { type: 'number', minimum: 0, maximum: 1 },
    billsPct: { type: 'number', minimum: 0, maximum: 1 },
    oneOffMonths: { type: 'number', minimum: 0, maximum: 12 },
    durationMonths: { type: 'integer', minimum: 0, maximum: 120 },
    summary: { type: 'string', maxLength: SUMMARY_MAX_CHARS },
  },
  required: [
    'intent',
    'confidence',
    'incomeFactor',
    'billsPct',
    'oneOffMonths',
    'durationMonths',
    'summary',
  ],
}

/**
 * Collapse whitespace and case for the cache key so two spellings of
 * one sentence share a single fetch. The prompt itself keeps the
 * original wording.
 */
export function normalizeSentence(sentence: string): string {
  return sentence.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** FNV-1a 32 bit over UTF-16 units, rendered as 8 hex digits. */
export function hashSentence(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * The cache key is namespaced by account id because a one off cost
 * converts through that account's spending, so the same sentence on a
 * different account is a different parse.
 */
export function cacheKeyFor(sentence: string, accountId: string): string {
  return `${accountId}:${hashSentence(normalizeSentence(sentence))}`
}

/** Successful parses only, 32 entries in FIFO order. */
const parseCache = new Map<string, ParseOutcome>()

/** Drop every cached parse (used between tests). */
export function clearShockParseCache(): void {
  parseCache.clear()
}

/** How many successful parses are cached right now. */
export function shockParseCacheSize(): number {
  return parseCache.size
}

function rememberParse(key: string, outcome: ParseOk): void {
  parseCache.set(key, outcome)
  while (parseCache.size > CACHE_LIMIT) {
    const oldest = parseCache.keys().next()
    if (oldest.done) {
      break
    }
    parseCache.delete(oldest.value)
  }
}

/** The eight prompt metrics derived from one selected profile. */
export function promptMetrics(profile: AccountProfile): PromptMetrics {
  return {
    accountId: profile.account_id,
    incomeCents: profile.income_cents,
    fixedCostsCents: profile.fixed_costs_cents,
    spendingCents: profile.spending_cents,
    bufferCents: profile.buffer_cents,
    householdBillsCents: profile.household_bills_cents,
    loanPaymentCents: profile.loan_payment_cents,
    runwayMonths: profile.runway_deci_months / 10,
  }
}

/** The user prompt: sentence, account id, and six metrics in cents. */
function buildUserPrompt(sentence: string, metrics: PromptMetrics): string {
  return [
    'Map this shock sentence.',
    `sentence: "${sentence}"`,
    `account_id: "${metrics.accountId}"`,
    `baseline: {"income": ${metrics.incomeCents}, "fixed_costs": ${metrics.fixedCostsCents}, ` +
      `"spending": ${metrics.spendingCents}, "buffer": ${metrics.bufferCents}, ` +
      `"household_bills": ${metrics.householdBillsCents}, "loan_payment": ${metrics.loanPaymentCents}, ` +
      `"runway_months": ${metrics.runwayMonths}}`,
    'The six money figures are cents and amounts in the sentence are dollars, ' +
      'so 2000 dollars is 200000 cents.',
  ].join('\n')
}

/** The exact request body: prompt fields only, store false, no history. */
function buildRequestBody(sentence: string, metrics: PromptMetrics): unknown {
  return {
    contents: [{ role: 'user', parts: [{ text: buildUserPrompt(sentence, metrics) }] }],
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 300,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingLevel: 'minimal' },
    },
    store: false,
  }
}

/** The key is read per call so a missing build env fails closed. */
function readGeminiKey(): string {
  const key: unknown = import.meta.env.VITE_GEMINI_KEY
  return typeof key === 'string' ? key.trim() : ''
}

/**
 * Manual abort fan in: the caller signal and AbortSignal.timeout both
 * drive one controller, without AbortSignal.any (older Safari lacks it).
 * dispose() detaches the listeners so a settled parse leaks nothing.
 */
function combineWithTimeout(
  caller: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const timeout = AbortSignal.timeout(timeoutMs)
  const onCallerAbort = (): void => controller.abort(caller?.reason)
  const onTimeoutAbort = (): void => controller.abort(timeout.reason)
  if (caller) {
    if (caller.aborted) {
      controller.abort(caller.reason)
    } else {
      caller.addEventListener('abort', onCallerAbort, { once: true })
    }
  }
  timeout.addEventListener('abort', onTimeoutAbort, { once: true })
  return {
    signal: controller.signal,
    dispose: () => {
      caller?.removeEventListener('abort', onCallerAbort)
      timeout.removeEventListener('abort', onTimeoutAbort)
    },
  }
}

/** Abort and timeout both surface as DOMException style causes. */
function isAbortCause(cause: unknown): boolean {
  if (typeof cause !== 'object' || cause === null) {
    return false
  }
  const name = (cause as { name?: unknown }).name
  return name === 'AbortError' || name === 'TimeoutError'
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** Every response and every cache hit lands in the console for the p50. */
function logResponse(
  hash: string,
  latencyMs: number,
  raw: string | null,
  validated: ShockSpec | null,
  cached: boolean,
): void {
  console.info('shockParse response', { hash, latencyMs, raw, validated, cached })
}

function isIntent(value: unknown): value is ShockIntent {
  return typeof value === 'string' && INTENT_VALUES.includes(value)
}

function isConfidence(value: unknown): value is ShockConfidence {
  return typeof value === 'string' && CONFIDENCE_VALUES.includes(value)
}

/** Why a raw payload fails step 2, or null when the shape is exact. */
function shapeProblem(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return 'payload is not a plain object'
  }
  const record = raw as Record<string, unknown>
  const keys = Object.keys(record)
  const missing = PAYLOAD_KEYS.filter((key) => !keys.includes(key))
  const extra = keys.filter((key) => !PAYLOAD_KEYS.includes(key))
  if (missing.length > 0 || extra.length > 0) {
    const missingText = missing.length > 0 ? missing.join(', ') : 'none'
    const extraText = extra.length > 0 ? extra.join(', ') : 'none'
    return `keys must be exactly the seven payload keys (missing: ${missingText}, extra: ${extraText})`
  }
  if (!isIntent(record.intent)) {
    return 'intent must be job_loss, bills_up, one_off_cost, mixed, or no_shock'
  }
  if (!isConfidence(record.confidence)) {
    return 'confidence must be high, medium, or low'
  }
  for (const field of SPEC_FIELDS) {
    const value = record[field]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `${field} must be a finite number`
    }
  }
  if (typeof record.summary !== 'string' || record.summary.length === 0) {
    return 'summary must be a non empty string'
  }
  return null
}

/** Step 2 type guard: plain object, exactly seven keys, valid enums. */
export function isShockPayload(raw: unknown): raw is ShockPayload {
  return shapeProblem(raw) === null
}

function clampField(field: SpecField, value: number): number {
  switch (field) {
    case 'incomeFactor':
    case 'billsPct':
      return Math.min(1, Math.max(0, value))
    case 'oneOffMonths':
      return Math.min(12, Math.max(0, value))
    case 'durationMonths':
      return Math.min(120, Math.max(0, Math.round(value)))
  }
}

function roundField(field: SpecField, value: number): number {
  switch (field) {
    case 'incomeFactor':
    case 'billsPct':
      return Math.round(value * 100) / 100
    case 'oneOffMonths':
      return Math.round(value * 10) / 10
    case 'durationMonths':
      return value
  }
}

/**
 * Steps 3 to 5 for one field, in order: percent detection (only the
 * two fraction fields; oneOffMonths and durationMonths legitimately
 * exceed 1), then the clamp, then display rounding. A fix is recorded
 * only when a step actually changes the value.
 */
function normalizeField(field: SpecField, value: number, fixes: ParseFix[]): number {
  let current = value
  if ((field === 'incomeFactor' || field === 'billsPct') && current > 1 && current <= 100) {
    current = current / 100
    fixes.push({ field, fix: 'percent' })
  }
  const clamped = clampField(field, current)
  if (clamped !== current) {
    fixes.push({ field, fix: 'clamp' })
    current = clamped
  }
  const rounded = roundField(field, current)
  if (rounded !== current) {
    fixes.push({ field, fix: 'round' })
    current = rounded
  }
  return current
}

/**
 * The whole validation pipeline for one parsed payload: shape check,
 * percent detection, clamping, rounding, then the three reject rules
 * (no_shock intent, low confidence, all fields neutral). This is the
 * only path from model output to a ShockSpec.
 */
export function validateShockPayload(raw: unknown): ValidateOutcome {
  const problem = shapeProblem(raw)
  if (problem !== null) {
    return { status: 'rejected', reason: 'bad_shape', detail: problem }
  }
  const record = raw as Record<string, unknown>
  const fixes: ParseFix[] = []
  const payload: ShockPayload = {
    intent: record.intent as ShockIntent,
    confidence: record.confidence as ShockConfidence,
    incomeFactor: normalizeField('incomeFactor', record.incomeFactor as number, fixes),
    billsPct: normalizeField('billsPct', record.billsPct as number, fixes),
    oneOffMonths: normalizeField('oneOffMonths', record.oneOffMonths as number, fixes),
    durationMonths: normalizeField('durationMonths', record.durationMonths as number, fixes),
    summary: (record.summary as string).slice(0, SUMMARY_MAX_CHARS),
  }
  if (payload.intent === 'no_shock') {
    return { status: 'rejected', reason: 'no_shock', detail: 'the model mapped no shock' }
  }
  if (payload.confidence === 'low') {
    return { status: 'rejected', reason: 'low_confidence', detail: 'the model reported low confidence' }
  }
  if (payload.incomeFactor === 1 && payload.billsPct === 0 && payload.oneOffMonths === 0) {
    return {
      status: 'rejected',
      reason: 'all_neutral',
      detail: 'every math field sits at its neutral value',
    }
  }
  const okPayload: ParseOkPayload = {
    intent: payload.intent,
    confidence: payload.confidence,
    incomeFactor: payload.incomeFactor,
    billsPct: payload.billsPct,
    oneOffMonths: payload.oneOffMonths,
    durationMonths: payload.durationMonths,
    summary: payload.summary,
  }
  return { status: 'ok', payload: okPayload, fixes }
}

function specOf(payload: ShockPayload): ShockSpec {
  return {
    incomeFactor: payload.incomeFactor,
    billsPct: payload.billsPct,
    oneOffMonths: payload.oneOffMonths,
    durationMonths: payload.durationMonths,
  }
}

/**
 * The one conversion from typed spec to the preset Twist shape, so the
 * preset path and the typed path converge on the same applyTwist
 * consumer. jobLoss follows the factor: anything below 1 means income
 * changed, which is exactly when applyTwist scales I.
 */
export function shockSpecToTwist(spec: ShockSpec): Partial<Twist> {
  return {
    jobLoss: spec.incomeFactor < 1,
    incomeFactor: spec.incomeFactor,
    billsDeltaPct: Math.round(spec.billsPct * 100),
    oneOffMonthsTenths: Math.round(spec.oneOffMonths * 10),
    extraMonthlyCents: 0,
    durationMonths: spec.durationMonths,
  }
}

/**
 * One chip click: move one field by its step and pass the result
 * through the same clamp and round helpers the validation pipeline
 * uses, so a stepper can never push a pending spec out of range.
 */
export function applySpecStep(spec: ShockSpec, field: SpecField, delta: number): ShockSpec {
  const moved = clampField(field, spec[field] + delta * SPEC_STEPS[field])
  return { ...spec, [field]: roundField(field, moved) }
}

/** The formula strip numbers, all derived through the E2 shock math. */
export interface ShockFormula {
  incomeAfterCents: number
  billsDeltaCents: number
  spendingAfterCents: number
  oneOffCents: number
  bufferLeftCents: number
}

/**
 * The dollars a pending spec would produce, computed by delegating to
 * applyTwist and scaleCents (never a second copy of the runway math),
 * so the confirmation strip and the live verdict always agree.
 */
export function shockFormula(profile: AccountProfile, spec: ShockSpec): ShockFormula {
  const twist = shockSpecToTwist(spec)
  const result = applyTwist(profile, twist)
  const billsDeltaPct = twist.billsDeltaPct ?? 0
  return {
    incomeAfterCents: result.incomeAfterCents,
    billsDeltaCents: scaleCents(profile.household_bills_cents, billsDeltaPct),
    spendingAfterCents: result.spendingAfterCents,
    oneOffCents: result.oneOffCents,
    bufferLeftCents: result.bufferLeftCents,
  }
}

/**
 * candidates[0].content.parts[].text joined, or null when the envelope
 * holds no text at all (mapped to bad_shape by the caller).
 */
function envelopeText(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) {
    return null
  }
  const candidates = (body as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null
  }
  const first: unknown = candidates[0]
  if (typeof first !== 'object' || first === null) {
    return null
  }
  const content = (first as { content?: unknown }).content
  if (typeof content !== 'object' || content === null) {
    return null
  }
  const parts = (content as { parts?: unknown }).parts
  if (!Array.isArray(parts)) {
    return null
  }
  const texts: string[] = []
  for (const part of parts) {
    if (typeof part !== 'object' || part === null) {
      continue
    }
    const text = (part as { text?: unknown }).text
    if (typeof text === 'string') {
      texts.push(text)
    }
  }
  if (texts.length === 0) {
    return null
  }
  return texts.join('')
}

/**
 * The typed path: one sentence plus one account's baseline metrics in,
 * one ParseOutcome out. Cache hit returns without a fetch, a missing
 * key rejects without a fetch, and exactly one fetch is ever attempted
 * (429 never retries). The caller signal combines with the 3 second
 * timeout; any abort during the request maps to the timeout outcome.
 */
export async function parseShockSentence(
  sentence: string,
  metrics: PromptMetrics,
  signal?: AbortSignal,
): Promise<ParseOutcome> {
  const startedAt = Date.now()
  const normalized = normalizeSentence(sentence)
  if (normalized.length === 0) {
    return { status: 'rejected', reason: 'empty_input', detail: 'the sentence is empty' }
  }
  const hash = hashSentence(normalized)
  const key = cacheKeyFor(sentence, metrics.accountId)
  const cached = parseCache.get(key)
  if (cached) {
    logResponse(hash, Date.now() - startedAt, null, cached.status === 'ok' ? cached.spec : null, true)
    return cached
  }
  if (signal?.aborted) {
    return { status: 'rejected', reason: 'aborted', detail: 'the caller aborted before the request' }
  }
  const apiKey = readGeminiKey()
  if (apiKey.length === 0) {
    return { status: 'rejected', reason: 'no_key', detail: 'VITE_GEMINI_KEY is not set' }
  }

  const combined = combineWithTimeout(signal, PARSE_TIMEOUT_MS)
  let text = ''
  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(buildRequestBody(sentence, metrics)),
      signal: combined.signal,
    })
    const latencyMs = Date.now() - startedAt
    if (response.status === 429) {
      logResponse(hash, latencyMs, null, null, false)
      return { status: 'rejected', reason: 'rate_limited', detail: 'HTTP 429' }
    }
    if (!response.ok) {
      logResponse(hash, latencyMs, null, null, false)
      return { status: 'rejected', reason: 'http_error', detail: `HTTP ${response.status}` }
    }
    text = await response.text()
  } catch (cause) {
    if (combined.signal.aborted || isAbortCause(cause)) {
      return { status: 'timeout' }
    }
    return { status: 'rejected', reason: 'network_error', detail: messageOf(cause) }
  } finally {
    combined.dispose()
  }

  const latencyMs = Date.now() - startedAt
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    logResponse(hash, latencyMs, text, null, false)
    return { status: 'rejected', reason: 'malformed_json', detail: 'the response body is not JSON' }
  }
  const modelText = envelopeText(body)
  if (modelText === null) {
    logResponse(hash, latencyMs, text, null, false)
    return { status: 'rejected', reason: 'bad_shape', detail: 'the response has no candidates text' }
  }
  let modelJson: unknown
  try {
    modelJson = JSON.parse(modelText)
  } catch {
    logResponse(hash, latencyMs, modelText, null, false)
    return { status: 'rejected', reason: 'malformed_json', detail: 'the model text is not JSON' }
  }
  const validated = validateShockPayload(modelJson)
  if (validated.status === 'rejected') {
    logResponse(hash, latencyMs, modelText, null, false)
    return validated
  }
  const outcome: ParseOk = {
    status: 'ok',
    spec: specOf(validated.payload),
    intent: validated.payload.intent,
    confidence: validated.payload.confidence,
    summary: validated.payload.summary,
    fixes: validated.fixes,
  }
  rememberParse(key, outcome)
  logResponse(hash, latencyMs, modelText, outcome.spec, false)
  return outcome
}
