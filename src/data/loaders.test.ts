import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_TRANSACTION_ROWS,
  loadTransactions,
  loadWorld,
  parseProvenance,
  parseTransactions,
  parseWorld,
} from './loaders'

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseWorld', () => {
  it('accepts the shipped fixture world', () => {
    const world = parseWorld(readJson('../../public/data/world.json'))
    expect(world.meta.schemaVersion).toBeGreaterThanOrEqual(1)
    expect(world.monthly_balance_series).toHaveLength(12)
    expect(world.categories.length).toBeGreaterThan(0)
    expect(world.debt_horizon.valueCents).toBe(
      world.debt_horizon.minBalanceCents - world.debt_horizon.bufferCents,
    )
    expect(Number.isInteger(world.debt_horizon.valueCents)).toBe(true)
  })

  it('rejects payloads that drift from the schema', () => {
    expect(() => parseWorld(null)).toThrow(/must be an object/)
    expect(() => parseWorld({})).toThrow(/meta/)

    const world = readJson('../../public/data/world.json') as Record<string, unknown>
    expect(() => parseWorld({ ...world, debt_horizon: 'soon' })).toThrow(/debt_horizon/)
    expect(() => parseWorld({ ...world, monthly_balance_series: [] })).toThrow(/exactly 12/)
    expect(() => parseWorld({ ...world, meta: null })).toThrow(/world\.meta must be an object/)

    const categories = world.categories as Record<string, unknown>[]
    const broken = categories.map((category) => ({
      ...category,
      provenance: { ...(category.provenance as object), checkSum: 'XYZ' },
    }))
    expect(() => parseWorld({ ...world, categories: broken })).toThrow(/64 lowercase hex/)
  })

  it('requires at least one entity', () => {
    const world = readJson('../../public/data/world.json') as Record<string, unknown>
    expect(() =>
      parseWorld({
        ...world,
        categories: [],
        subscriptions: [],
        splurges: [],
        income_events: [],
      }),
    ).toThrow(/at least one entity/)
  })

  it('rejects entity counts that disagree with meta.entityCounts', () => {
    const world = JSON.parse(
      readFileSync(new URL('../../public/data/world.json', import.meta.url), 'utf8'),
    ) as Record<string, unknown>
    const meta = { ...(world.meta as Record<string, unknown>) }
    const counts = { ...(meta.entityCounts as Record<string, unknown>) }
    counts.categories = 99
    meta.entityCounts = counts
    expect(() => parseWorld({ ...world, meta })).toThrow(/entityCounts\.categories/)
  })
})

describe('parseTransactions', () => {
  it('accepts the shipped fixture transactions', () => {
    const file = parseTransactions(readJson('../../public/data/transactions.json'))
    expect(file.columns).toEqual([
      'id',
      'date',
      'hour',
      'amountCents',
      'balanceCents',
      'type',
      'category',
      'merchant',
    ])
    expect(file.rows.length).toBeGreaterThan(0)
    expect(file.rows.every((row) => typeof row.id === 'string' && row.id.length > 0)).toBe(true)
    expect(file.rows.every((row) => Number.isInteger(row.amountCents))).toBe(true)
    expect(file.rows.every((row) => row.type === 'debit' || row.type === 'credit')).toBe(true)
  })

  it('rejects duplicate row ids', () => {
    const file = readJson('../../public/data/transactions.json') as Record<string, unknown>
    const rows = file.rows as unknown[][]
    const duplicated = [...rows, rows[0]]
    expect(() => parseTransactions({ ...file, rows: duplicated })).toThrow(/duplicate/)
  })

  it('rejects malformed rows', () => {
    const columns = [
      'id',
      'date',
      'hour',
      'amountCents',
      'balanceCents',
      'type',
      'category',
      'merchant',
    ]
    expect(() => parseTransactions({ columns, rows: [{ id: 'x' }] })).toThrow(/rows\[0\]/)
    expect(() => parseTransactions({ columns, rows: [['TAN-1']] })).toThrow(/rows\[0\]/)
    expect(() =>
      parseTransactions({ columns: ['id'], rows: [] }),
    ).toThrow(/transactions\.columns/)
  })
})

describe('allocation caps (security review)', () => {
  const validProvenance = {
    rowIds: ['T-1'],
    filter: "rows with type == 'debit' in fixture.csv",
    agg: 'sum of abs(amount) per row in cents; checksum value = amountCents',
    checkSum: 'a'.repeat(64),
  }

  it('rejects provenance row id lists above the row cap before mapping them', () => {
    const oversized = {
      ...validProvenance,
      rowIds: new Array<string>(MAX_TRANSACTION_ROWS + 1).fill('T-1'),
    }
    expect(() => parseProvenance(oversized, 'p')).toThrow(/row cap/)
  })

  it('rejects transaction tables above the row cap before mapping rows', () => {
    const file = readJson('../../public/data/transactions.json') as Record<string, unknown>
    const rows = new Array<unknown>(MAX_TRANSACTION_ROWS + 1)
    expect(() => parseTransactions({ ...file, rows })).toThrow(/row cap/)
  })

  it('keeps the shipped fixture comfortably under the cap', () => {
    const file = readJson('../../public/data/transactions.json') as { rows: unknown[] }
    expect(file.rows.length).toBeLessThan(MAX_TRANSACTION_ROWS)
  })
})

describe('loaders (fetch path)', () => {
  it('fetches world.json relative to the base URL and validates it', async () => {
    const payload = readJson('../../public/data/world.json')
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    )
    const world = await loadWorld()
    expect(spy).toHaveBeenCalledWith('/data/world.json')
    expect(world).toEqual(parseWorld(payload))
  })

  it('fetches transactions.json and validates it', async () => {
    const payload = readJson('../../public/data/transactions.json')
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    )
    const file = await loadTransactions()
    expect(spy).toHaveBeenCalledWith('/data/transactions.json')
    expect(file.rows).toHaveLength(parseTransactions(payload).rows.length)
  })

  it('surfaces HTTP failures instead of loading partial data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }))
    await expect(loadWorld()).rejects.toThrow(/404/)
  })
})
