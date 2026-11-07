import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseFindingsReport, type FindingsReport } from '../data/findings'
import { parseWorld } from '../data/loaders'
import { worldEntities } from '../data/types'
import { frictionKeyForEntity, lookupFriction } from './friction'

/**
 * The shared F4 bridge against the shipped public/data/findings.json: the
 * exact dollars the report prints, the null contract for everything that
 * has no F4 entry (unknown categories, other finding ids, missing report),
 * and the method plus caveats text that keeps the honest language shared.
 */

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))
}

const report: FindingsReport = parseFindingsReport(readJson('../../public/data/findings.json'))
const world = parseWorld(readJson('../../public/data/world.json'))

describe('lookupFriction: shipped F4 dollars', () => {
  it('returns the Travel figures the report prints ($1,005.93)', () => {
    const friction = lookupFriction(report, 'Travel')
    expect(friction).not.toBeNull()
    expect(friction?.name).toBe('Travel')
    expect(friction?.drawdownImprovementCents).toBe(100593)
    expect(friction?.troughLiftCents).toBe(100593)
    expect(friction?.floorDeltaCents).toBe(0)
  })

  it('returns the Dining figures ($932.20 of drawdown, $2,336.29 of trough)', () => {
    const friction = lookupFriction(report, 'Dining')
    expect(friction?.name).toBe('Dining')
    expect(friction?.drawdownImprovementCents).toBe(93220)
    expect(friction?.troughLiftCents).toBe(233629)
    expect(friction?.floorDeltaCents).toBe(0)
  })

  it('matches every F4 category bar without recomputing anything', () => {
    const f4 = report.sections.find((section) => section.id === 'F4')
    if (!f4 || f4.id !== 'F4') {
      throw new Error('the shipped report must carry F4')
    }
    for (const bar of f4.bars) {
      const friction = lookupFriction(report, bar.name)
      expect(friction?.name).toBe(bar.name)
      expect(friction?.drawdownImprovementCents).toBe(bar.alignedDrawdownImprovementCents)
      expect(friction?.troughLiftCents).toBe(bar.alignedTroughDeltaCents)
      expect(friction?.floorDeltaCents).toBe(bar.alignedFloorDeltaCents)
    }
  })
})

describe('lookupFriction: keys, ids, and the null contract', () => {
  it('matches names case insensitively and entity ids by their tail', () => {
    expect(lookupFriction(report, 'travel')?.name).toBe('Travel')
    expect(lookupFriction(report, '  Travel  ')?.name).toBe('Travel')
    expect(lookupFriction(report, 'cat-dining')?.drawdownImprovementCents).toBe(93220)
    expect(lookupFriction(report, 'spl-2025-12-22-travel')?.drawdownImprovementCents).toBe(100593)
  })

  it('returns null for keys with no F4 entry, including other finding ids', () => {
    expect(lookupFriction(report, 'Parking')).toBeNull()
    expect(lookupFriction(report, 'Income')).toBeNull()
    expect(lookupFriction(report, 'F1')).toBeNull()
    expect(lookupFriction(report, 'f1')).toBeNull()
    expect(lookupFriction(report, '')).toBeNull()
    expect(lookupFriction(report, '   ')).toBeNull()
    expect(lookupFriction(report, null)).toBeNull()
    expect(lookupFriction(report, undefined)).toBeNull()
  })

  it('never throws on a report that has not loaded', () => {
    expect(lookupFriction(null, 'Travel')).toBeNull()
    expect(lookupFriction(undefined, 'Travel')).toBeNull()
    expect(lookupFriction(null, null)).toBeNull()
  })

  it('accepts the F4 section itself and refuses a section that is not F4', () => {
    const f4 = report.sections.find((section) => section.id === 'F4') ?? null
    expect(lookupFriction(f4, 'Dining')?.drawdownImprovementCents).toBe(93220)

    const f1 = report.sections.find((section) => section.id === 'F1') ?? null
    expect(lookupFriction(f1, 'Dining')).toBeNull()
    expect(lookupFriction(f1, 'Travel')).toBeNull()
  })
})

describe('lookupFriction: method and caveats from the data', () => {
  it('carries the F4 method one liner verbatim', () => {
    const f4 = report.sections.find((section) => section.id === 'F4')
    if (!f4 || f4.id !== 'F4') {
      throw new Error('the shipped report must carry F4')
    }
    const friction = lookupFriction(report, 'Travel')
    expect(friction?.methodOneLiner).toBe(f4.methodOneLiner)
    expect(friction?.methodOneLiner.startsWith('Rebuild the daily balance path')).toBe(true)
    expect(friction?.methodOneLiner.endsWith('.')).toBe(true)
    expect(friction?.methodOneLiner.length).toBeLessThan(f4.method.length)
  })

  it('carries the F4 caveats string from the declared limitations', () => {
    const friction = lookupFriction(report, 'Dining')
    expect(friction?.caveats).toContain('counterfactual simulation, not a causal estimate')
    expect(friction?.caveats).toContain('Only timing moves')
  })
})

describe('frictionKeyForEntity: world entity to F4 category key', () => {
  const entities = worldEntities(world)

  function entityById(id: string) {
    return entities.find((entity) => entity.id === id) ?? null
  }

  it('keys category entities by name and looks their figures up', () => {
    const travel = entityById('cat-travel')
    expect(frictionKeyForEntity(travel)).toBe('Travel')
    expect(lookupFriction(report, frictionKeyForEntity(travel))?.drawdownImprovementCents).toBe(
      100593,
    )
  })

  it('keys subscription and splurge entities by their ledger category', () => {
    expect(frictionKeyForEntity(entityById('sub-amazon-prime'))).toBe('Subscriptions')
    expect(frictionKeyForEntity(entityById('spl-2025-12-22-travel'))).toBe('Travel')
    expect(lookupFriction(report, frictionKeyForEntity(entityById('sub-amazon-prime')))?.drawdownImprovementCents).toBe(1099)
  })

  it('keys income events as null (no F4 entry, no figure)', () => {
    expect(frictionKeyForEntity(entityById('inc-2025-11-25'))).toBeNull()
    expect(lookupFriction(report, frictionKeyForEntity(entityById('inc-2025-11-25')))).toBeNull()
    expect(frictionKeyForEntity(null)).toBeNull()
  })
})
