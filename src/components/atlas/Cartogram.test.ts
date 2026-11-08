// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
// The jsdom environment replaces the global URL with its own
// implementation, which does not resolve file: bases correctly, so
// node:url's URL reads the stylesheets from disk here.
import { URL as NodeURL } from 'node:url'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import Cartogram from './Cartogram'
import { CZECHIA_VIEW_BOX } from '../../assets/czechia-districts'
import type { AtlasDoc, BandCounts, DistrictRow } from '../../lib/atlasData'

/**
 * Cartogram markup and behavior on two inline fixtures: seven invented
 * districts over three regions, which the bundled map geometry does not
 * know, so they prove the tile fallback (one no_data district whose
 * source row is incomplete while its demographic cells and its
 * accounts are both real, the shipped artifact shape, shaded by the
 * severity bins with the counts they were handed); and four real Czech
 * district names, which the geometry does know, so they prove the map
 * paths (shade values, the accessible sentence, the hatch, click and
 * keyboard routing). The legend prints the severity definition and the
 * caveat that belongs to whichever surface rendered. The stylesheet
 * contract (gated motion) is asserted from disk. No test reads the
 * shipped atlas artifact.
 */

// React's act() refuses to run until the environment declares itself.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function counts(
  critical: number,
  storm_warning: number,
  watch: number,
  fair_skies: number,
  clear: number,
): BandCounts {
  return { critical, storm_warning, watch, fair_skies, clear }
}

const BASELINE: Record<string, BandCounts> = {
  '1': counts(6, 4, 10, 20, 20),
  '2': counts(0, 0, 5, 15, 20),
  '3': counts(2, 3, 10, 20, 20),
  '4': counts(1, 1, 8, 15, 20),
  '5': counts(0, 2, 8, 20, 20),
  '6': counts(3, 3, 14, 20, 20),
  '7': counts(0, 0, 0, 10, 20),
}

const LAYOFF: Record<string, BandCounts> = {
  '1': counts(10, 8, 10, 17, 15),
  '2': counts(2, 3, 5, 14, 16),
  '3': counts(6, 7, 10, 17, 15),
  '4': counts(4, 5, 8, 13, 15),
  '5': counts(5, 6, 8, 16, 15),
  '6': counts(8, 9, 14, 14, 15),
  '7': counts(1, 2, 0, 10, 17),
}

function district(
  district_id: number,
  district_name: string,
  region: string,
  account_count: number,
  no_data = false,
): DistrictRow {
  return {
    district_id,
    district_name,
    region,
    inhabitants: 40000 + district_id * 1000,
    // The no_data row keeps populated demographic cells, the way the
    // shipped hatched district does: the flag marks an incomplete
    // source row, not empty demographics.
    unemployment_rate_2023: 3.5,
    average_salary: 15000,
    account_count,
    no_data,
  }
}

function fixture(): AtlasDoc {
  return {
    schema_version: 1,
    generated_by: 'scripts.engine.build',
    verdict_bands: ['critical', 'storm_warning', 'watch', 'fair_skies', 'clear'],
    sources: [],
    districts: [
      district(1, 'Ashfield', 'North', 60),
      district(2, 'Brookline', 'North', 40),
      district(3, 'Copeland', 'Central', 55),
      district(4, 'Dunmore', 'Central', 45),
      district(5, 'Eastgate', 'South', 50),
      district(6, 'Fairview', 'South', 60, true),
      district(7, 'Alderwood', 'South', 30),
    ],
    account_district: {},
    baseline: BASELINE,
    scenarios: { layoff: LAYOFF },
  }
}

async function render(
  overrides: Partial<Parameters<typeof Cartogram>[0]> = {},
): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(Cartogram, overrides))
  })
  return { container, root }
}

async function cleanup(container: HTMLDivElement, root: Root): Promise<void> {
  await act(async () => {
    root.unmount()
  })
  container.remove()
}

describe('Cartogram tiles', () => {
  it('renders seven tiles inside three alphabetical region bands', async () => {
    const { container, root } = await render({
      doc: fixture(),
      districtCounts: BASELINE,
      scenarioLabel: 'at baseline',
    })

    expect(container.querySelectorAll('.ax-tile')).toHaveLength(7)
    const regions = [...container.querySelectorAll('.ax-region__label')].map(
      (node) => node.textContent,
    )
    expect(regions).toEqual(['Central', 'North', 'South'])
    expect(container.textContent).toContain('District counts at baseline')

    await cleanup(container, root)
  })

  it('shades every tile by its severity bin with the band color', async () => {
    const { container, root } = await render({
      doc: fixture(),
      districtCounts: BASELINE,
      scenarioLabel: 'at baseline',
    })

    // 10 of 60 is over 15 to 40 percent: storm warning shade.
    const heavy = container.querySelector('[data-district="1"]')
    expect(heavy?.getAttribute('data-bin')).toBe('3')
    expect(heavy?.getAttribute('data-band')).toBe('storm_warning')
    // 0 of 40 is exactly zero: clear shade.
    const calm = container.querySelector('[data-district="2"]')
    expect(calm?.getAttribute('data-bin')).toBe('0')
    expect(calm?.getAttribute('data-band')).toBe('clear')
    // 2 of 45 is under 5 percent: fair skies shade, bin 1.
    const light = container.querySelector('[data-district="4"]')
    expect(light?.getAttribute('data-bin')).toBe('1')
    expect(light?.getAttribute('data-band')).toBe('fair_skies')
    // 5 of 55 is over 5 to 15 percent: watch shade, bin 2.
    const mid = container.querySelector('[data-district="3"]')
    expect(mid?.getAttribute('data-bin')).toBe('2')
    expect(mid?.getAttribute('data-band')).toBe('watch')

    await cleanup(container, root)
  })

  it('prints the severity share and the raw counts on the tile face', async () => {
    const { container, root } = await render({
      doc: fixture(),
      districtCounts: BASELINE,
      scenarioLabel: 'at baseline',
    })

    const tile = container.querySelector('[data-district="1"]') as HTMLButtonElement
    expect(tile.textContent).toContain('17%')
    expect(tile.textContent).toContain('10 of 60')
    expect(tile.getAttribute('aria-label')).toBe(
      'Ashfield, 10 of 60 accounts critical or storm warning',
    )

    await cleanup(container, root)
  })

  it('hatches a no_data district and still shows its real accounts', async () => {
    const { container, root } = await render({
      doc: fixture(),
      districtCounts: BASELINE,
      scenarioLabel: 'at baseline',
    })

    const flagged = container.querySelector('[data-district="6"]') as HTMLButtonElement
    expect(flagged.className).toContain('ax-tile-no-data')
    expect(flagged.getAttribute('data-no-data')).toBe('true')
    expect(flagged.textContent).toContain('no data')
    // 6 of 60 accounts counted, never a zeroed tile.
    expect(flagged.textContent).toContain('10%')
    expect(flagged.textContent).toContain('6 of 60')
    expect(flagged.getAttribute('aria-label')).toBe(
      'Fairview, source data incomplete, 6 of 60 accounts critical or storm warning',
    )
    // The hatch marks an incomplete source row: the fixture's hatched
    // district still ships populated demographic cells, like district
    // 69 in the artifact.
    const hatchedRow = fixture().districts.find((row) => row.no_data) as DistrictRow
    expect(hatchedRow.unemployment_rate_2023).toBe(3.5)
    expect(hatchedRow.average_salary).toBe(15000)
    expect(hatchedRow.account_count).toBe(60)

    await cleanup(container, root)
  })

  it('routes a tile click to onSelectDistrict and only that district', async () => {
    const onSelectDistrict = vi.fn()
    const { container, root } = await render({
      doc: fixture(),
      districtCounts: BASELINE,
      onSelectDistrict,
    })

    const tile = container.querySelector('[data-district="3"]')
    await act(async () => {
      tile?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(onSelectDistrict).toHaveBeenCalledTimes(1)
    expect(onSelectDistrict).toHaveBeenCalledWith(3)

    await cleanup(container, root)
  })

  it('stays inert when no drill down callback is wired', async () => {
    const { container, root } = await render({
      doc: fixture(),
      districtCounts: BASELINE,
    })
    const tile = container.querySelector('[data-district="1"]')
    expect(tile).not.toBeNull()
    await act(async () => {
      tile?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await cleanup(container, root)
  })

  it('follows the scenario label contract onto the cartogram head', async () => {
    const { container, root } = await render({
      doc: fixture(),
      districtCounts: LAYOFF,
      scenarioLabel: 'under the laid off twist',
    })
    expect(container.textContent).toContain('District counts under the laid off twist')
    // The layoff split really moved the face of tile 1: 18 of 60.
    const tile = container.querySelector('[data-district="1"]') as HTMLButtonElement
    expect(tile.textContent).toContain('30%')
    expect(tile.textContent).toContain('18 of 60')
    await cleanup(container, root)
  })
})

/** Four real Czech district names, so the bundled geometry matches. */
function mapFixture(): AtlasDoc {
  const base = fixture()
  return {
    ...base,
    districts: [
      district(1, 'Hl.m. Praha', 'Prague', 60),
      district(2, 'Benesov', 'central Bohemia', 40),
      district(3, 'Cheb', 'Karlovy Vary', 55),
      district(4, 'Liberec', 'Liberec', 45, true),
    ],
  }
}

/** Two districts the geometry knows and one it does not. */
function mixedFixture(): AtlasDoc {
  const base = fixture()
  return {
    ...base,
    districts: [
      district(1, 'Hl.m. Praha', 'Prague', 60),
      district(2, 'Benesov', 'central Bohemia', 40),
      district(3, 'Ashfield', 'North', 55),
    ],
  }
}

describe('Cartogram map', () => {
  it('draws one path per district on the bundled viewBox', async () => {
    const { container, root } = await render({
      doc: mapFixture(),
      districtCounts: BASELINE,
      scenarioLabel: 'at baseline',
    })

    const svg = container.querySelector('svg.ax-map')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('viewBox')).toBe(CZECHIA_VIEW_BOX)
    expect(svg?.getAttribute('aria-label')).toBe('District map of Czechia')
    expect(container.querySelectorAll('.ax-map__path')).toHaveLength(4)
    // Every name here is a real Czech district, so no tile fallback.
    expect(container.querySelectorAll('.ax-tile')).toHaveLength(0)
    expect(container.textContent).toContain(
      'One path is one district, drawn where it sits in Czechia.',
    )

    await cleanup(container, root)
  })

  it('shades every path by its severity bin with the band color', async () => {
    const { container, root } = await render({
      doc: mapFixture(),
      districtCounts: BASELINE,
      scenarioLabel: 'at baseline',
    })

    // 10 of 60 is over 15 to 40 percent: storm warning shade.
    const heavy = container.querySelector('.ax-map__path[data-district="1"]')
    expect(heavy?.getAttribute('data-bin')).toBe('3')
    expect(heavy?.getAttribute('data-band')).toBe('storm_warning')
    // 0 of 40 is exactly zero: clear shade.
    const calm = container.querySelector('.ax-map__path[data-district="2"]')
    expect(calm?.getAttribute('data-bin')).toBe('0')
    expect(calm?.getAttribute('data-band')).toBe('clear')
    // 5 of 55 is over 5 to 15 percent: watch shade.
    const mid = container.querySelector('.ax-map__path[data-district="3"]')
    expect(mid?.getAttribute('data-bin')).toBe('2')
    expect(mid?.getAttribute('data-band')).toBe('watch')
    // 2 of 45 is under 5 percent: fair skies shade.
    const light = container.querySelector('.ax-map__path[data-district="4"]')
    expect(light?.getAttribute('data-bin')).toBe('1')
    expect(light?.getAttribute('data-band')).toBe('fair_skies')

    await cleanup(container, root)
  })

  it('says the full sentence in the accessible name and the tooltip', async () => {
    const { container, root } = await render({
      doc: mapFixture(),
      districtCounts: BASELINE,
      scenarioLabel: 'at baseline',
    })

    const path = container.querySelector('.ax-map__path[data-district="1"]')
    expect(path?.getAttribute('role')).toBe('button')
    expect(path?.getAttribute('tabindex')).toBe('0')
    expect(path?.getAttribute('aria-label')).toBe(
      'Hl.m. Praha, 10 of 60 accounts critical or storm warning',
    )
    expect(path?.querySelector('title')?.textContent).toBe(
      'Hl.m. Praha, 10 of 60 accounts critical or storm warning',
    )

    await cleanup(container, root)
  })

  it('hatches the no_data district over its shade and keeps its counts', async () => {
    const { container, root } = await render({
      doc: mapFixture(),
      districtCounts: BASELINE,
      scenarioLabel: 'at baseline',
    })

    const hatch = container.querySelector('.ax-map__hatch')
    expect(hatch).not.toBeNull()
    expect(container.querySelectorAll('.ax-map__hatch')).toHaveLength(1)
    expect(hatch?.getAttribute('data-no-data')).toBe('true')
    expect(hatch?.getAttribute('aria-hidden')).toBe('true')

    const flagged = container.querySelector('.ax-map__path[data-district="4"]')
    expect(flagged?.getAttribute('data-no-data')).toBe('true')
    expect(flagged?.getAttribute('aria-label')).toBe(
      'Liberec, source data incomplete, 2 of 45 accounts critical or storm warning',
    )

    await cleanup(container, root)
  })

  it('routes a path click and the Enter key to onSelectDistrict', async () => {
    const onSelectDistrict = vi.fn()
    const { container, root } = await render({
      doc: mapFixture(),
      districtCounts: BASELINE,
      onSelectDistrict,
    })

    const path = container.querySelector('.ax-map__path[data-district="3"]')
    await act(async () => {
      path?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(onSelectDistrict).toHaveBeenCalledTimes(1)
    expect(onSelectDistrict).toHaveBeenCalledWith(3)

    await act(async () => {
      path?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onSelectDistrict).toHaveBeenCalledTimes(2)
    expect(onSelectDistrict).toHaveBeenLastCalledWith(3)

    await cleanup(container, root)
  })

  it('stays inert when no drill down callback is wired', async () => {
    const { container, root } = await render({
      doc: mapFixture(),
      districtCounts: BASELINE,
    })
    const path = container.querySelector('.ax-map__path[data-district="1"]')
    expect(path).not.toBeNull()
    await act(async () => {
      path?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await cleanup(container, root)
  })

  it('takes no shade when the split did not arrive', async () => {
    const { container, root } = await render({
      doc: mapFixture(),
      districtCounts: null,
      scenarioLabel: 'at baseline',
    })

    expect(container.querySelectorAll('.ax-map__path')).toHaveLength(4)
    const path = container.querySelector('.ax-map__path[data-district="1"]')
    expect(path?.getAttribute('data-bin')).toBeNull()
    expect(path?.getAttribute('data-band')).toBeNull()
    expect(path?.getAttribute('aria-label')).toBe(
      'Hl.m. Praha, account split not precomputed',
    )

    await cleanup(container, root)
  })

  it('keeps a district the geometry does not know as a region tile', async () => {
    const { container, root } = await render({
      doc: mixedFixture(),
      districtCounts: BASELINE,
      scenarioLabel: 'at baseline',
    })

    expect(container.querySelectorAll('.ax-map__path')).toHaveLength(2)
    expect(container.querySelectorAll('.ax-tile')).toHaveLength(1)
    const tile = container.querySelector('.ax-tile[data-district="3"]')
    expect(tile?.textContent).toContain('Ashfield')
    expect(container.textContent).toContain(
      'Districts the map geometry does not know are listed as tiles below, arranged by region.',
    )

    await cleanup(container, root)
  })
})

describe('Cartogram legend', () => {
  it('prints five bins, the severity definition, and both caveats', async () => {
    const { container, root } = await render({
      doc: fixture(),
      districtCounts: BASELINE,
      scenarioLabel: 'at baseline',
    })

    const ranges = [...container.querySelectorAll('.ax-legend__range')].map(
      (node) => node.textContent,
    )
    expect(ranges).toEqual([
      'exactly 0%',
      'over 0 to 5%',
      'over 5 to 15%',
      'over 15 to 40%',
      'over 40%',
    ])
    const bands = [...container.querySelectorAll('.ax-legend__swatch')].map((node) =>
      node.getAttribute('data-band'),
    )
    expect(bands).toEqual(['clear', 'fair_skies', 'watch', 'storm_warning', 'critical'])

    expect(container.textContent).toContain(
      'Districts the map geometry does not know are listed as tiles below, arranged by region.',
    )
    expect(container.textContent).toContain(
      'Severity: critical plus storm warning share of the district accounts.',
    )
    expect(container.textContent).toContain(
      'Hatched districts mark an incomplete source row; their account counts are real.',
    )

    await cleanup(container, root)
  })
})

describe('Cartogram empty and partial states', () => {
  it('stays a note until the atlas artifact arrives', async () => {
    const { container, root } = await render({ doc: null })
    expect(container.querySelectorAll('.ax-tile')).toHaveLength(0)
    expect(container.textContent).toContain('District cartogram')
    expect(container.textContent).toContain('The district tiles arrive with the atlas artifact.')
    await cleanup(container, root)
  })

  it('prints the caller honesty note when the artifact was refused', async () => {
    const { container, root } = await render({
      doc: null,
      note: 'The atlas artifact did not load, so the district tiles are not shown.',
    })
    expect(container.textContent).toContain(
      'The atlas artifact did not load, so the district tiles are not shown.',
    )
    await cleanup(container, root)
  })

  it('never reads missing counts as a safe zero', async () => {
    const { container, root } = await render({
      doc: fixture(),
      districtCounts: null,
      scenarioLabel: 'at baseline',
    })

    expect(container.querySelectorAll('.ax-tile')).toHaveLength(7)
    const tile = container.querySelector('[data-district="1"]') as HTMLButtonElement
    expect(tile.textContent).toContain('n/a')
    expect(tile.getAttribute('data-bin')).toBeNull()
    expect(tile.getAttribute('data-band')).toBeNull()
    expect(tile.getAttribute('aria-label')).toBe(
      'Ashfield, account split not precomputed',
    )

    await cleanup(container, root)
  })

  it('server renders the same grid without a DOM', () => {
    const html = renderToString(
      createElement(Cartogram, {
        doc: fixture(),
        districtCounts: BASELINE,
        scenarioLabel: 'at baseline',
      }),
    )
    expect(html).toContain('ax-tile')
    expect(html).toContain('District counts at baseline')
    expect(html).toContain('arranged by region')
  })
})

describe('Cartogram stylesheet: gated motion only', () => {
  it('gates the 600ms tile shade transition behind no preference', () => {
    const css = readFileSync(new NodeURL('./atlas.css', import.meta.url), 'utf8')
    expect(css).toContain('@media (prefers-reduced-motion: no-preference)')
    // Every transition in the sheet sits inside a no preference gate.
    const found = [...css.matchAll(/transition\s*:/g)]
    expect(found.length).toBeGreaterThan(0)
    for (const match of found) {
      const index = match.index ?? 0
      const gate = css.lastIndexOf('@media (prefers-reduced-motion: no-preference)', index)
      expect(gate).toBeGreaterThanOrEqual(0)
    }
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) \{\s*\.ax-tile \{[^}]*background-color 600ms ease-out/,
    )
    // The hatch and the five band mappings ride on existing tokens only.
    expect(css).toContain('repeating-linear-gradient')
    expect(css).toContain("data-band='critical'")
  })
})
