import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountProfile } from '../data/profiles'
import { applyTwist, scaleCents } from './shocks'
import {
  applySpecStep,
  cacheKeyFor,
  clearShockParseCache,
  GEMINI_MODEL,
  hashSentence,
  isShockPayload,
  normalizeSentence,
  PARSE_TIMEOUT_MS,
  parseShockSentence,
  promptMetrics,
  shockFormula,
  shockParseCacheSize,
  shockSpecToTwist,
  SYSTEM_INSTRUCTION,
  validateShockPayload,
  type ParseFix,
  type ParseOutcome,
  type PromptMetrics,
  type ShockSpec,
  type SpecField,
} from './shockParse'

/**
 * The typed shock boundary, fully mocked: the validation pipeline
 * (shape, percent, clamp, round, the three rejects), the request shape
 * and its failure mapping (timeout, 429 with no retry, 403, network),
 * the namespaced FIFO cache, and the conversions into the preset Twist
 * and the E2 formula. No test here touches the network.
 */

const SENTENCE = 'laid off and rent up 15%'

const METRICS: PromptMetrics = {
  accountId: '68257',
  incomeCents: 650_326,
  fixedCostsCents: 430_672,
  spendingCents: 716_084,
  bufferCents: 643_785,
  householdBillsCents: 430_672,
  loanPaymentCents: 284_493,
  runwayMonths: 9.8,
}

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
const infoMock = vi.fn<(label: string, payload: Record<string, unknown>) => void>()
const originalInfo = console.info

function makeProfile(overrides: Partial<AccountProfile> = {}): AccountProfile {
  return {
    account_id: '68257',
    income_cents: 650_326,
    fixed_costs_cents: 430_672,
    spending_cents: 716_084,
    buffer_cents: 643_785,
    household_bills_cents: 430_672,
    loan_payment_cents: 284_493,
    insurance_cents: 0,
    loan_payments_median_cents: 0,
    pension_in_cents: 0,
    gap_cents: -65_758,
    runway_state: 'finite',
    runway_deci_months: 98,
    history: {
      first_month: '2024-04',
      last_month: '2025-12',
      row_count: 21,
      months_contiguous: true,
    },
    loan: null,
    flags: {
      pensioner: false,
      thin_history: false,
      zero_income: false,
      defaulted_loan: false,
      negative_buffer: false,
    },
    balance_series: {
      start_month: '2025-01',
      values_cents: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    },
    provenance: {
      source: 'data/tangerine/monthly_summary.csv',
      filter: 'account_id = 68257 ordered by month ascending',
      agg: 'judge metrics; checksum value = money_in_cents',
      check_sum: 'a'.repeat(64),
    },
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response
}

function envelopeOf(text: string): unknown {
  return { candidates: [{ content: { parts: [{ text }] } }] }
}

function respondWith(payload: unknown): void {
  fetchMock.mockResolvedValue(jsonResponse(envelopeOf(JSON.stringify(payload))))
}

function modelPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    intent: 'job_loss',
    confidence: 'high',
    incomeFactor: 0.55,
    billsPct: 0.15,
    oneOffMonths: 0,
    durationMonths: 6,
    summary: 'Laid off with EI covering part of the income',
    ...overrides,
  }
}

function lastFetchCall(): [string, RequestInit] {
  const calls = fetchMock.mock.calls
  const call = calls[calls.length - 1]
  if (!call) {
    throw new Error('fetch was never called')
  }
  return call
}

beforeEach(() => {
  fetchMock.mockReset()
  infoMock.mockReset()
  clearShockParseCache()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_GEMINI_KEY', 'unit-test-key')
  console.info = infoMock
})

afterEach(() => {
  console.info = originalInfo
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('shockParse payload validation', () => {
  it('accepts only the exact seven key payload', () => {
    expect(isShockPayload(modelPayload())).toBe(true)
    expect(isShockPayload(null)).toBe(false)
    expect(isShockPayload([])).toBe(false)
    expect(isShockPayload('job_loss')).toBe(false)
    expect(isShockPayload({ ...modelPayload(), note: 'extra' })).toBe(false)
    const missing = modelPayload()
    delete missing.summary
    expect(isShockPayload(missing)).toBe(false)
    expect(isShockPayload(modelPayload({ confidence: 'maybe' }))).toBe(false)
    expect(isShockPayload(modelPayload({ intent: 'fired' }))).toBe(false)
    expect(isShockPayload(modelPayload({ incomeFactor: Number.NaN }))).toBe(false)
    expect(isShockPayload(modelPayload({ summary: '' }))).toBe(false)
  })

  it('clamps out of range values and flags each fix', () => {
    const clampCases: Array<{
      overrides: Record<string, unknown>
      field: SpecField
      expected: number
    }> = [
      { overrides: { incomeFactor: -0.4 }, field: 'incomeFactor', expected: 0 },
      { overrides: { incomeFactor: 150 }, field: 'incomeFactor', expected: 1 },
      { overrides: { billsPct: -10 }, field: 'billsPct', expected: 0 },
      { overrides: { billsPct: 150 }, field: 'billsPct', expected: 1 },
      { overrides: { oneOffMonths: 20 }, field: 'oneOffMonths', expected: 12 },
      { overrides: { oneOffMonths: -3 }, field: 'oneOffMonths', expected: 0 },
      { overrides: { durationMonths: 400 }, field: 'durationMonths', expected: 120 },
      { overrides: { durationMonths: -5 }, field: 'durationMonths', expected: 0 },
      { overrides: { durationMonths: 12.6 }, field: 'durationMonths', expected: 13 },
    ]
    for (const entry of clampCases) {
      const result = validateShockPayload(modelPayload(entry.overrides))
      expect(result.status, `${entry.field} must stay valid`).toBe('ok')
      if (result.status !== 'ok') {
        continue
      }
      expect(result.payload[entry.field], `${entry.field} clamp`).toBe(entry.expected)
      expect(result.fixes, `${entry.field} fix flags`).toEqual([
        { field: entry.field, fix: 'clamp' },
      ])
    }
  })

  it('detects percentages only on the two fraction fields', () => {
    const percentCases: Array<{
      overrides: Record<string, unknown>
      field: SpecField
      expected: number
      fixes: ParseFix[]
    }> = [
      { overrides: { incomeFactor: 1 }, field: 'incomeFactor', expected: 1, fixes: [] },
      {
        overrides: { incomeFactor: 1.5 },
        field: 'incomeFactor',
        expected: 0.02,
        fixes: [
          { field: 'incomeFactor', fix: 'percent' },
          { field: 'incomeFactor', fix: 'round' },
        ],
      },
      {
        overrides: { incomeFactor: 100 },
        field: 'incomeFactor',
        expected: 1,
        fixes: [{ field: 'incomeFactor', fix: 'percent' }],
      },
      {
        overrides: { incomeFactor: 101 },
        field: 'incomeFactor',
        expected: 1,
        fixes: [{ field: 'incomeFactor', fix: 'clamp' }],
      },
      { overrides: { billsPct: 1 }, field: 'billsPct', expected: 1, fixes: [] },
      {
        overrides: { billsPct: 15 },
        field: 'billsPct',
        expected: 0.15,
        fixes: [{ field: 'billsPct', fix: 'percent' }],
      },
      {
        overrides: { billsPct: 101 },
        field: 'billsPct',
        expected: 1,
        fixes: [{ field: 'billsPct', fix: 'clamp' }],
      },
      { overrides: { oneOffMonths: 2 }, field: 'oneOffMonths', expected: 2, fixes: [] },
      { overrides: { durationMonths: 5 }, field: 'durationMonths', expected: 5, fixes: [] },
    ]
    for (const entry of percentCases) {
      const result = validateShockPayload(modelPayload(entry.overrides))
      expect(result.status, `${entry.field} must stay valid`).toBe('ok')
      if (result.status !== 'ok') {
        continue
      }
      expect(result.payload[entry.field], `${entry.field} value`).toBe(entry.expected)
      expect(result.fixes, `${entry.field} fix flags`).toEqual(entry.fixes)
    }
  })

  it('rounds display values and records a round fix', () => {
    const income = validateShockPayload(modelPayload({ incomeFactor: 0.556 }))
    expect(income.status).toBe('ok')
    if (income.status === 'ok') {
      expect(income.payload.incomeFactor).toBe(0.56)
      expect(income.fixes).toEqual([{ field: 'incomeFactor', fix: 'round' }])
    }

    const bills = validateShockPayload(modelPayload({ billsPct: 0.155 }))
    expect(bills.status).toBe('ok')
    if (bills.status === 'ok') {
      expect(bills.payload.billsPct).toBe(0.16)
      expect(bills.fixes).toEqual([{ field: 'billsPct', fix: 'round' }])
    }

    const oneOff = validateShockPayload(modelPayload({ oneOffMonths: 1.26 }))
    expect(oneOff.status).toBe('ok')
    if (oneOff.status === 'ok') {
      expect(oneOff.payload.oneOffMonths).toBe(1.3)
      expect(oneOff.fixes).toEqual([{ field: 'oneOffMonths', fix: 'round' }])
    }
  })

  it('slices the summary to 90 characters without a fix', () => {
    const result = validateShockPayload(modelPayload({ summary: 'x'.repeat(120) }))
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.payload.summary).toHaveLength(90)
      expect(result.fixes).toEqual([])
    }
  })

  it('rejects a no_shock intent', () => {
    const result = validateShockPayload(modelPayload({ intent: 'no_shock' }))
    expect(result).toEqual({
      status: 'rejected',
      reason: 'no_shock',
      detail: expect.any(String),
    })
  })

  it('rejects low confidence', () => {
    const result = validateShockPayload(modelPayload({ confidence: 'low' }))
    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') {
      expect(result.reason).toBe('low_confidence')
    }
  })

  it('rejects an all neutral mapping', () => {
    const result = validateShockPayload(
      modelPayload({ incomeFactor: 1, billsPct: 0, oneOffMonths: 0 }),
    )
    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') {
      expect(result.reason).toBe('all_neutral')
    }
  })

  it('rejects a missing field, an extra field, and a wrong enum as bad shape', () => {
    const missing = modelPayload()
    delete missing.summary
    const missingResult = validateShockPayload(missing)
    expect(missingResult.status).toBe('rejected')
    if (missingResult.status === 'rejected') {
      expect(missingResult.reason).toBe('bad_shape')
      expect(missingResult.detail).toContain('missing: summary')
    }

    const extra = validateShockPayload(modelPayload({ note: 'extra' }))
    expect(extra.status).toBe('rejected')
    if (extra.status === 'rejected') {
      expect(extra.reason).toBe('bad_shape')
      expect(extra.detail).toContain('extra: note')
    }

    const badEnum = validateShockPayload(modelPayload({ intent: 'fired' }))
    expect(badEnum.status).toBe('rejected')
    if (badEnum.status === 'rejected') {
      expect(badEnum.reason).toBe('bad_shape')
    }

    const notAnObject = validateShockPayload('job_loss')
    expect(notAnObject.status).toBe('rejected')
    if (notAnObject.status === 'rejected') {
      expect(notAnObject.reason).toBe('bad_shape')
    }
  })
})

describe('shockParse request and failure mapping', () => {
  it('pins the model and the timeout budget', () => {
    expect(GEMINI_MODEL).toBe('gemini-3.5-flash-lite')
    expect(PARSE_TIMEOUT_MS).toBe(3000)
  })

  it('rejects an empty sentence without fetching', async () => {
    const outcome = await parseShockSentence('    ', METRICS)
    expect(outcome).toEqual({
      status: 'rejected',
      reason: 'empty_input',
      detail: expect.any(String),
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a pre aborted caller without fetching', async () => {
    const controller = new AbortController()
    controller.abort()
    const outcome = await parseShockSentence(SENTENCE, METRICS, controller.signal)
    expect(outcome.status).toBe('rejected')
    if (outcome.status === 'rejected') {
      expect(outcome.reason).toBe('aborted')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a missing key without fetching', async () => {
    vi.stubEnv('VITE_GEMINI_KEY', '')
    const outcome = await parseShockSentence(SENTENCE, METRICS)
    expect(outcome.status).toBe('rejected')
    if (outcome.status === 'rejected') {
      expect(outcome.reason).toBe('no_key')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the documented request shape with the key header', async () => {
    respondWith(modelPayload())
    const outcome = await parseShockSentence(SENTENCE, METRICS)
    expect(outcome.status).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = lastFetchCall()
    expect(url).toContain(GEMINI_MODEL)
    expect(url).toContain(':generateContent')
    expect(url).toContain('generativelanguage.googleapis.com')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['x-goog-api-key']).toBe('unit-test-key')
    expect(headers['Content-Type']).toBe('application/json')
    expect(init.signal).toBeInstanceOf(AbortSignal)

    const bodyText = String(init.body)
    expect(bodyText).not.toContain('balance_series')
    expect(bodyText).not.toContain('check_sum')
    expect(bodyText).not.toContain('history')
    const body = JSON.parse(bodyText) as Record<string, any>
    expect(body.store).toBe(false)
    expect(body.generationConfig.temperature).toBe(0)
    expect(body.generationConfig.maxOutputTokens).toBe(300)
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('minimal')

    const schema = body.generationConfig.responseSchema
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    expect(schema.required).toHaveLength(7)
    expect(schema.properties.intent.enum).toHaveLength(5)
    expect(schema.properties.confidence.enum).toEqual(['high', 'medium', 'low'])
    expect(schema.properties.incomeFactor).toEqual({ type: 'number', minimum: 0, maximum: 1 })
    expect(schema.properties.billsPct).toEqual({ type: 'number', minimum: 0, maximum: 1 })
    expect(schema.properties.oneOffMonths).toEqual({ type: 'number', minimum: 0, maximum: 12 })
    expect(schema.properties.durationMonths).toEqual({
      type: 'integer',
      minimum: 0,
      maximum: 120,
    })
    expect(schema.properties.summary).toEqual({ type: 'string', maxLength: 90 })

    expect(body.systemInstruction.parts[0].text).toBe(SYSTEM_INSTRUCTION)
    const prompt = String(body.contents[0].parts[0].text) as string
    expect(body.contents[0].role).toBe('user')
    expect(prompt).toContain(`sentence: "${SENTENCE}"`)
    expect(prompt).toContain('account_id: "68257"')
    expect(prompt).toContain('"income": 650326')
    expect(prompt).toContain('"runway_months": 9.8')
    expect(prompt).toContain('2000 dollars is 200000 cents')
  })

  it('maps an abort during the request to the timeout outcome', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation((_url, init) => {
      controller.abort()
      void init
      return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))
    })
    const outcome = await parseShockSentence(SENTENCE, METRICS, controller.signal)
    expect(outcome).toEqual({ status: 'timeout' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps a thrown abort cause to the timeout outcome', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'))
    const outcome = await parseShockSentence(SENTENCE, METRICS)
    expect(outcome).toEqual({ status: 'timeout' })
  })

  it('maps 429 to rate_limited with exactly one fetch and no retry', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 429))
    const outcome = await parseShockSentence(SENTENCE, METRICS)
    expect(outcome.status).toBe('rejected')
    if (outcome.status === 'rejected') {
      expect(outcome.reason).toBe('rate_limited')
      expect(outcome.detail).toBe('HTTP 429')
    }
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps 403 to http_error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 403))
    const outcome = await parseShockSentence(SENTENCE, METRICS)
    expect(outcome.status).toBe('rejected')
    if (outcome.status === 'rejected') {
      expect(outcome.reason).toBe('http_error')
      expect(outcome.detail).toBe('HTTP 403')
    }
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps a network failure to network_error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const outcome = await parseShockSentence(SENTENCE, METRICS)
    expect(outcome.status).toBe('rejected')
    if (outcome.status === 'rejected') {
      expect(outcome.reason).toBe('network_error')
      expect(outcome.detail).toContain('fetch failed')
    }
  })

  it('rejects a response body that is not JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse('not json'))
    const outcome = await parseShockSentence(SENTENCE, METRICS)
    expect(outcome.status).toBe('rejected')
    if (outcome.status === 'rejected') {
      expect(outcome.reason).toBe('malformed_json')
    }
  })

  it('rejects model text that is not JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse(envelopeOf('not json')))
    const outcome = await parseShockSentence(SENTENCE, METRICS)
    expect(outcome.status).toBe('rejected')
    if (outcome.status === 'rejected') {
      expect(outcome.reason).toBe('malformed_json')
    }
  })

  it('rejects an envelope with no candidates text as bad_shape', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    const outcome = await parseShockSentence(SENTENCE, METRICS)
    expect(outcome.status).toBe('rejected')
    if (outcome.status === 'rejected') {
      expect(outcome.reason).toBe('bad_shape')
    }
  })

  it('rejects parts with no text field as bad_shape', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ candidates: [{ content: { parts: [{ inlineData: {} }] } }] }),
    )
    const outcome = await parseShockSentence(SENTENCE, METRICS)
    expect(outcome.status).toBe('rejected')
    if (outcome.status === 'rejected') {
      expect(outcome.reason).toBe('bad_shape')
    }
  })

  it('logs every response with hash, latency, raw, validated, and cached', async () => {
    respondWith(modelPayload())
    await parseShockSentence(SENTENCE, METRICS)
    expect(infoMock).toHaveBeenCalledWith(
      'shockParse response',
      expect.objectContaining({
        hash: expect.stringMatching(/^[0-9a-f]{8}$/),
        latencyMs: expect.any(Number),
        raw: expect.any(String),
        validated: expect.any(Object),
        cached: false,
      }),
    )
  })
})

describe('shockParse cache', () => {
  it('serves the second identical call without a fetch and deep equals it', async () => {
    respondWith(modelPayload())
    const first = await parseShockSentence(SENTENCE, METRICS)
    const second = await parseShockSentence(SENTENCE, METRICS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
    expect(shockParseCacheSize()).toBe(1)
    expect(infoMock).toHaveBeenLastCalledWith(
      'shockParse response',
      expect.objectContaining({ cached: true }),
    )
  })

  it('namespaces the cache by account id', async () => {
    respondWith(modelPayload())
    await parseShockSentence(SENTENCE, METRICS)
    await parseShockSentence(SENTENCE, { ...METRICS, accountId: '42988' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(shockParseCacheSize()).toBe(2)
  })

  it('does not cache a rejection', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(envelopeOf(JSON.stringify(modelPayload({ intent: 'no_shock' })))),
    )
    const rejected = await parseShockSentence(SENTENCE, METRICS)
    expect(rejected.status).toBe('rejected')
    expect(shockParseCacheSize()).toBe(0)

    respondWith(modelPayload())
    await parseShockSentence(SENTENCE, METRICS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(shockParseCacheSize()).toBe(1)
  })

  it('evicts the oldest entry past 32 and clears on demand', async () => {
    respondWith(modelPayload())
    for (let index = 0; index < 35; index++) {
      await parseShockSentence(`sentence number ${index}`, METRICS)
    }
    expect(shockParseCacheSize()).toBe(32)
    expect(fetchMock).toHaveBeenCalledTimes(35)

    await parseShockSentence('sentence number 0', METRICS)
    expect(fetchMock).toHaveBeenCalledTimes(36)
    expect(shockParseCacheSize()).toBe(32)

    clearShockParseCache()
    expect(shockParseCacheSize()).toBe(0)
    await parseShockSentence('sentence number 5', METRICS)
    expect(fetchMock).toHaveBeenCalledTimes(37)
  })
})

describe('shockParse conversions', () => {
  it('derives prompt metrics from a profile', () => {
    expect(promptMetrics(makeProfile())).toEqual({
      accountId: '68257',
      incomeCents: 650_326,
      fixedCostsCents: 430_672,
      spendingCents: 716_084,
      bufferCents: 643_785,
      householdBillsCents: 430_672,
      loanPaymentCents: 284_493,
      runwayMonths: 9.8,
    })
  })

  it('normalizes and hashes sentences to 8 hex digits', () => {
    expect(normalizeSentence('  Laid   Off!! ')).toBe('laid off!!')
    expect(hashSentence('laid off')).toMatch(/^[0-9a-f]{8}$/)
    expect(hashSentence('laid off')).toBe(hashSentence('laid off'))
    expect(hashSentence('laid off')).not.toBe(hashSentence('laid off!!'))
    expect(cacheKeyFor('Laid Off', '68257')).toBe(`68257:${hashSentence('laid off')}`)
  })

  it('maps a spec onto the preset Twist shape', () => {
    const twist = shockSpecToTwist({
      incomeFactor: 0.55,
      billsPct: 0.15,
      oneOffMonths: 2.5,
      durationMonths: 6,
    })
    expect(twist).toEqual({
      jobLoss: true,
      incomeFactor: 0.55,
      billsDeltaPct: 15,
      oneOffMonthsTenths: 25,
      extraMonthlyCents: 0,
      durationMonths: 6,
    })
    const untouched = shockSpecToTwist({
      incomeFactor: 1,
      billsPct: 0,
      oneOffMonths: 0,
      durationMonths: 0,
    })
    expect(untouched.jobLoss).toBe(false)
  })

  it('steps one spec field and clamps through the shared helpers', () => {
    const base: ShockSpec = { incomeFactor: 0.55, billsPct: 0, oneOffMonths: 0, durationMonths: 0 }
    expect(applySpecStep(base, 'incomeFactor', 1)).toEqual({ ...base, incomeFactor: 0.6 })
    expect(applySpecStep(base, 'incomeFactor', -1).incomeFactor).toBe(0.5)
    expect(applySpecStep({ ...base, incomeFactor: 0.98 }, 'incomeFactor', 1).incomeFactor).toBe(1)
    expect(applySpecStep(base, 'billsPct', 1).billsPct).toBe(0.01)
    expect(applySpecStep(base, 'billsPct', -1).billsPct).toBe(0)
    expect(applySpecStep({ ...base, billsPct: 0.99 }, 'billsPct', 1).billsPct).toBe(1)
    expect(applySpecStep(base, 'oneOffMonths', 1).oneOffMonths).toBe(0.1)
    expect(applySpecStep({ ...base, oneOffMonths: 11.9 }, 'oneOffMonths', 1).oneOffMonths).toBe(12)
    expect(applySpecStep(base, 'oneOffMonths', -1).oneOffMonths).toBe(0)
    expect(applySpecStep({ ...base, durationMonths: 5 }, 'durationMonths', -1).durationMonths).toBe(4)
    expect(applySpecStep({ ...base, durationMonths: 120 }, 'durationMonths', 1).durationMonths).toBe(
      120,
    )
    expect(applySpecStep(base, 'durationMonths', -1).durationMonths).toBe(0)
  })

  it('cross checks shockFormula against applyTwist for three specs', () => {
    const profile = makeProfile()
    const specs: ShockSpec[] = [
      { incomeFactor: 0.55, billsPct: 0, oneOffMonths: 0, durationMonths: 6 },
      { incomeFactor: 1, billsPct: 0.15, oneOffMonths: 0, durationMonths: 0 },
      { incomeFactor: 0.5, billsPct: 0.1, oneOffMonths: 2.5, durationMonths: 12 },
    ]
    for (const spec of specs) {
      const twist = shockSpecToTwist(spec)
      const result = applyTwist(profile, twist)
      const formula = shockFormula(profile, spec)
      expect(formula.incomeAfterCents).toBe(result.incomeAfterCents)
      expect(formula.spendingAfterCents).toBe(result.spendingAfterCents)
      expect(formula.oneOffCents).toBe(result.oneOffCents)
      expect(formula.bufferLeftCents).toBe(result.bufferLeftCents)
      expect(formula.billsDeltaCents).toBe(result.spendingAfterCents - profile.spending_cents)
      expect(formula.billsDeltaCents).toBe(
        scaleCents(profile.household_bills_cents, twist.billsDeltaPct ?? 0),
      )
    }
  })

  it('logs a cached hit shape for the p50 write-up', async () => {
    respondWith(modelPayload())
    const outcome: ParseOutcome = await parseShockSentence(SENTENCE, METRICS)
    expect(outcome.status).toBe('ok')
    expect(infoMock).toHaveBeenCalledWith(
      'shockParse response',
      expect.objectContaining({ cached: false, validated: expect.any(Object) }),
    )
  })
})
