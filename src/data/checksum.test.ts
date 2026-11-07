import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { provenanceCheckSum, sha256Hex, valueFieldFromAgg } from './checksum'

/**
 * Player provenance (public/data/players.json, scripts/build_players.py)
 * announces the monthlyIncomeCents value column. This suite proves the
 * TypeScript recipe verifies it exactly like pipeline_lib.checksum: a fixed
 * fixture with the digest computed by the Python pipeline, then an end to
 * end pass over every shipped player against the source CSV values.
 */

const PLAYERS_AGG =
  'monthly_income of that row in cents (monthlyIncomeCents); checksum value = monthlyIncomeCents'

/** Digest computed by scripts/pipeline_lib.py checksum() over the fixture below. */
const FIXTURE_DIGEST =
  'ca16cec92f4eac0996cefc08bbdcbee1b9a9e8f6822c69f8cd9407de50252639'

interface PlayerFixture {
  id: string
  monthlyIncomeCents: number
  provenance: { rowIds: string[]; agg: string; checkSum: string }
}

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))
}

/**
 * Minimal reader for data/mock/ibm_hr.csv: line 1 is a # comment, headers
 * follow, and every row is comma separated with no quoting (the generator
 * writes plain cells). Values mirror build_players: income dollars times 100.
 */
function readIncomeCentsByRowId(relative: string): Map<string, number> {
  const text = readFileSync(new URL(relative, import.meta.url), 'utf8')
  const lines = text.split('\n').filter((line) => line.length > 0)
  const headerIndex = lines.findIndex((line) => line.startsWith('EmployeeNumber,'))
  if (headerIndex < 0) {
    throw new Error('ibm_hr.csv header row not found')
  }
  const header = (lines[headerIndex] ?? '').split(',')
  const idIndex = header.indexOf('EmployeeNumber')
  const incomeIndex = header.indexOf('MonthlyIncome')
  if (idIndex < 0 || incomeIndex < 0) {
    throw new Error('ibm_hr.csv is missing EmployeeNumber or MonthlyIncome')
  }
  const values = new Map<string, number>()
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = line.split(',')
    if (cells.length !== header.length) {
      throw new Error(`ibm_hr.csv row has ${cells.length} cells, expected ${header.length}`)
    }
    const rowId = cells[idIndex]
    const income = Number(cells[incomeIndex])
    if (rowId === undefined || !Number.isFinite(income)) {
      throw new Error(`ibm_hr.csv row is malformed: ${line}`)
    }
    values.set(rowId, Math.round(income * 100))
  }
  return values
}

describe('players provenance (monthlyIncomeCents)', () => {
  it('accepts the monthlyIncomeCents announcement in valueFieldFromAgg', () => {
    expect(valueFieldFromAgg(PLAYERS_AGG)).toBe('monthlyIncomeCents')
    // The transaction columns keep working alongside it.
    expect(valueFieldFromAgg('sum of abs(amount) per row; checksum value = amountCents')).toBe(
      'amountCents',
    )
    expect(valueFieldFromAgg('account_balance of that row; checksum value = balanceCents')).toBe(
      'balanceCents',
    )
    expect(() => valueFieldFromAgg('checksum value = salaryCents')).toThrow(/amountCents/)
    expect(() => valueFieldFromAgg('no suffix here')).toThrow(/checksum value/)
  })

  it('matches the Python pipeline digest for a players style fixture', () => {
    const fixture = [
      { rowId: '1001', valueCents: 706500 },
      { rowId: '1002', valueCents: 859900 },
      { rowId: '1003', valueCents: 821100 },
    ]
    // Same recipe as scripts/pipeline_lib.py checksum(): LF joined
    // "{rowId}:{valueCents}" lines sorted ascending by row id, SHA256 hex.
    expect(provenanceCheckSum(fixture)).toBe(FIXTURE_DIGEST)
    expect(provenanceCheckSum(fixture)).toBe(
      sha256Hex('1001:706500\n1002:859900\n1003:821100'),
    )
    // Order independence: the sort inside provenanceCheckSum owns ordering.
    expect(provenanceCheckSum([...fixture].reverse())).toBe(FIXTURE_DIGEST)
  })

  it('verifies every shipped player against the source CSV income values', () => {
    const payload = readJson('../../public/data/players.json') as { players: PlayerFixture[] }
    const players = payload.players
    expect(players.length).toBe(1200)

    const sourceValues = readIncomeCentsByRowId('../../data/mock/ibm_hr.csv')
    for (const player of players) {
      expect(valueFieldFromAgg(player.provenance.agg), player.id).toBe('monthlyIncomeCents')
      const pairs = player.provenance.rowIds.map((rowId) => {
        const valueCents = sourceValues.get(rowId)
        expect(valueCents, `${player.id}: row ${rowId} missing from ibm_hr.csv`).toBeDefined()
        return { rowId, valueCents: valueCents ?? 0 }
      })
      // The entity field itself must equal the source value in cents.
      expect(player.monthlyIncomeCents, player.id).toBe(pairs[0]?.valueCents)
      expect(provenanceCheckSum(pairs), player.id).toBe(player.provenance.checkSum)
    }
  })
})
