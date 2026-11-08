/**
 * District name join tests: the normalizer rules on their own, then the
 * contract that actually matters, every one of the 77 districts.csv
 * names resolves to an outline in the bundled geometry and every
 * outline is claimed by exactly one CSV row. The CSV is read from disk
 * as source data, not the shipped atlas artifact, so the join stays
 * pinned even before the engine runs.
 */
import { readFileSync } from 'node:fs'
// The jsdom environment replaces the global URL with its own
// implementation, which does not resolve file: bases correctly, so
// node:url's URL reads the source table from disk here.
import { URL as NodeURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CZECHIA_DISTRICT_COUNT,
  CZECHIA_DISTRICTS,
  CZECHIA_VIEW_BOX,
} from '../assets/czechia-districts'
import { districtKey, normalizeDistrictName } from './districtNames'

/** The district_name column of data/tangerine/districts.csv, in order. */
function csvDistrictNames(): string[] {
  const text = readFileSync(new NodeURL('../../data/tangerine/districts.csv', import.meta.url), 'utf8')
  const lines = text.trim().split('\n')
  const header = lines[0]?.split(',') ?? []
  const nameColumn = header.indexOf('district_name')
  expect(nameColumn).toBeGreaterThan(0)
  return lines.slice(1).map((line) => {
    const cell = line.split(',')[nameColumn] ?? ''
    return cell.trim()
  })
}

describe('normalizeDistrictName', () => {
  it('strips diacritics and punctuation down to plain words', () => {
    expect(normalizeDistrictName('České Budějovice')).toBe('ceske budejovice')
    expect(normalizeDistrictName('Ústí nad Labem')).toBe('usti nad labem')
    expect(normalizeDistrictName('Rychnov nad Kněžnou')).toBe('rychnov nad kneznou')
    expect(normalizeDistrictName('Frýdek-Místek')).toBe('frydek mistek')
  })

  it('drops the capital prefixes so Praha joins under one key', () => {
    expect(normalizeDistrictName('Hl.m. Praha')).toBe('praha')
    expect(normalizeDistrictName('Hlavní město Praha')).toBe('praha')
    expect(normalizeDistrictName('Plzeň-město')).toBe('plzen mesto')
  })

  it('keeps a mid name token and reads a lone n as nad', () => {
    expect(normalizeDistrictName('Plzeň-jih')).toBe('plzen jih')
    expect(normalizeDistrictName('Jablonec n. Nisou')).toBe('jablonec nad nisou')
    expect(normalizeDistrictName('Brno-venkov')).toBe('brno venkov')
  })
})

describe('districtKey', () => {
  it('maps the nine English geometry names onto the Czech wording', () => {
    expect(districtKey('Prague')).toBe('praha')
    expect(districtKey('Prague-East')).toBe('praha vychod')
    expect(districtKey('Plzeň-City')).toBe('plzen mesto')
    expect(districtKey('Ostrava-City')).toBe('ostrava mesto')
    expect(districtKey('Brno-Country')).toBe('brno venkov')
  })

  it('leaves an already Czech name alone', () => {
    expect(districtKey('Cheb')).toBe('cheb')
    expect(districtKey('Nový Jičín')).toBe('novy jicin')
  })
})

describe('bundled district geometry', () => {
  it('ships exactly 77 unique outlines on one viewBox', () => {
    expect(CZECHIA_DISTRICT_COUNT).toBe(77)
    expect(CZECHIA_DISTRICTS).toHaveLength(77)
    const keys = CZECHIA_DISTRICTS.map((entry) => entry.name)
    expect(new Set(keys).size).toBe(77)
    expect(CZECHIA_VIEW_BOX).toBe('0 0 1000 572')
    for (const entry of CZECHIA_DISTRICTS) {
      expect(entry.path.startsWith('M')).toBe(true)
      expect(entry.path.endsWith('Z')).toBe(true)
      expect(entry.path.length).toBeGreaterThan(40)
    }
  })

  it('joins every districts.csv row to an outline, and claims them all', () => {
    const names = csvDistrictNames()
    expect(names).toHaveLength(77)

    const byKey = new Map(CZECHIA_DISTRICTS.map((entry) => [entry.name, entry.path]))
    const claimed = new Set<string>()
    const missing: string[] = []
    for (const name of names) {
      const key = districtKey(name)
      if (!byKey.has(key)) {
        missing.push(`${name} as ${key}`)
      }
      claimed.add(key)
    }
    expect(missing).toEqual([])

    const orphans = [...byKey.keys()].filter((key) => !claimed.has(key))
    expect(orphans).toEqual([])
    expect(claimed.size).toBe(77)
  })
})
