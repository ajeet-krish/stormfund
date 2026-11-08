import { useState, type KeyboardEvent } from 'react'
import './atlas.css'
import {
  ATLAS_BAND_IDS,
  SEVERITY_BINS,
  SEVERITY_DEFINITION,
  bandForBin,
  bandTotal,
  binFor,
  districtSeverity,
  regionsGrouped,
  type AtlasDoc,
  type BandCounts,
  type DistrictRow,
  type SeverityBin,
} from '../../lib/atlasData'
import { districtKey } from '../../lib/districtNames'
import { roundHalfUp } from '../../lib/shocks'
import { verdictBandById, type VerdictBandId } from '../../lib/verdict'
import {
  CZECHIA_DISTRICTS,
  CZECHIA_VIEW_BOX,
  type DistrictGeometry,
} from '../../assets/czechia-districts'

/**
 * The district cartogram (E5 extension, now a real map): one path per
 * district drawn where the district sits in Czechia, shaded by the five
 * band colors through the severity bins in atlasData. The outlines are
 * bundled geometry (src/assets/czechia-districts.ts, simplified at build
 * time from the public domain geoBoundaries ADM2 release), so the map
 * makes no network call at runtime; the name join between a districts.csv
 * row and an outline runs through districtNames, and a district whose
 * name the geometry does not know falls back to the old region tile
 * instead of disappearing.
 *
 * Selecting a district (click, Enter, or Space) opens the detail panel
 * under the map: the district name plus its account count in each of
 * the five bands, read straight from the precomputed split the tiles
 * were handed, never from raw rows. A district whose counts did not
 * arrive says so instead of printing zeros, and a hatched no_data
 * district keeps its real counts next to the incomplete source note.
 *
 * Honesty by construction: the path prints the raw critical plus
 * storm warning count over the district's own account total in its
 * accessible name and its tooltip, the legend prints the severity
 * definition word for word, and a no_data district keeps a hatch over
 * its shade because the hatch marks an incomplete source row, never
 * missing accounts. A district whose counts did not arrive takes no
 * shade at all, so absent data can never read as a safe zero.
 *
 * Every path is focusable with a full sentence as its accessible name,
 * wired to the optional onSelectDistrict callback and inert without
 * one. Motion: the shade transition lives only inside
 * prefers-reduced-motion: no-preference in atlas.css, so the cascade
 * moment runs at 600ms ease-out for judges who welcome motion and
 * swaps instantly for judges who asked for reduced motion.
 */

export interface CartogramProps {
  /** The parsed atlas artifact; null while it loads or when refused. */
  doc?: AtlasDoc | null
  /** District id (as a string, the JSON key) to the live scenario's counts. */
  districtCounts?: Readonly<Record<string, BandCounts>> | null
  /** Scenario wording from the stormAtlas scenarioLabel contract. */
  scenarioLabel?: string | null
  /** Extra honesty note, for a twist with no precomputed district split. */
  note?: string | null
  /** Optional drill down; the paths and tiles stay inert without it. */
  onSelectDistrict?: (districtId: number) => void
}

/** One outline per normalized district name, built once per module. */
const GEOMETRY_BY_KEY: ReadonlyMap<string, DistrictGeometry> = new Map(
  CZECHIA_DISTRICTS.map((entry) => [entry.name, entry]),
)

/** Grouped digits for every count this map prints. */
function formatCount(count: number): string {
  return count.toLocaleString('en-CA')
}

/** The sentence a path or a tile says about itself. */
function tileAria(row: DistrictRow, counts: BandCounts | null): string {
  if (!counts) {
    return `${row.district_name}, account split not precomputed`
  }
  const total = bandTotal(counts)
  const risky = counts.critical + counts.storm_warning
  const suffix = `${formatCount(risky)} of ${formatCount(total)} accounts critical or storm warning`
  if (row.no_data) {
    return `${row.district_name}, source data incomplete, ${suffix}`
  }
  return `${row.district_name}, ${suffix}`
}

/** Everything a shade decision needs, read from the counts it is handed. */
interface Shade {
  bin: SeverityBin | null
  band: VerdictBandId | null
  total: number | null
  risky: number | null
  sharePercent: number | null
}

function shadeOf(counts: BandCounts | null): Shade {
  if (!counts) {
    return { bin: null, band: null, total: null, risky: null, sharePercent: null }
  }
  const severity = districtSeverity(counts)
  const bin = binFor(severity)
  const total = bandTotal(counts)
  const risky = counts.critical + counts.storm_warning
  return {
    bin,
    band: bandForBin(bin),
    total,
    risky,
    sharePercent: total > 0 ? roundHalfUp(risky * 100, total) : null,
  }
}

/** One district outline on the map, hatch on top when the source row is short. */
function CartogramPath({
  row,
  counts,
  onSelectDistrict,
}: {
  row: DistrictRow
  counts: BandCounts | null
  onSelectDistrict?: (districtId: number) => void
}) {
  const geometry = GEOMETRY_BY_KEY.get(districtKey(row.district_name))
  if (!geometry) {
    return null
  }
  const shade = shadeOf(counts)
  const label = tileAria(row, counts)
  const activate = (): void => onSelectDistrict?.(row.district_id)

  const handleKeyDown = (event: KeyboardEvent<SVGPathElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate()
    }
  }

  return (
    <>
      <path
        className="ax-map__path"
        data-district={row.district_id}
        data-bin={shade.bin}
        data-band={shade.band}
        data-no-data={row.no_data ? 'true' : undefined}
        d={geometry.path}
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={activate}
        onKeyDown={handleKeyDown}
      >
        <title>{label}</title>
      </path>
      {row.no_data ? (
        <path
          className="ax-map__hatch"
          d={geometry.path}
          data-no-data="true"
          aria-hidden="true"
        />
      ) : null}
    </>
  )
}

/** The tile body, shared by the shaded and the not precomputed cases. */
function CartogramTile({
  row,
  counts,
  onSelectDistrict,
}: {
  row: DistrictRow
  counts: BandCounts | null
  onSelectDistrict?: (districtId: number) => void
}) {
  const shade = shadeOf(counts)
  const className = row.no_data ? 'ax-tile ax-tile-no-data' : 'ax-tile'

  return (
    <li>
      <button
        type="button"
        className={className}
        data-district={row.district_id}
        data-bin={shade.bin}
        data-band={shade.band}
        data-no-data={row.no_data ? 'true' : undefined}
        aria-label={tileAria(row, counts)}
        onClick={() => onSelectDistrict?.(row.district_id)}
      >
        <span className="ax-tile__name">{row.district_name}</span>
        <span className="ax-tile__value">
          {shade.sharePercent !== null && shade.risky !== null && shade.total !== null ? (
            <>
              {shade.sharePercent}%
              <span className="ax-tile__raw">
                {`${formatCount(shade.risky)} of ${formatCount(shade.total)}`}
              </span>
            </>
          ) : (
            <span className="ax-tile__value-muted">n/a</span>
          )}
        </span>
        {row.no_data ? <span className="ax-tile__flag">no data</span> : null}
      </button>
    </li>
  )
}

/**
 * The detail panel for the district the judge picked: the name and the
 * account count in each of the five bands, straight from the
 * precomputed split the map was handed. Counts that never arrived read
 * as an honest note instead of five zeros, and the hatched no_data
 * districts keep their real counts beside the incomplete source note.
 */
function CartogramDetail({ row, counts }: { row: DistrictRow; counts: BandCounts | null }) {
  return (
    <div className="ax-detail" role="status">
      <p className="ax-detail__name">{row.district_name}</p>
      {counts ? (
        <ul className="ax-detail__bands" aria-label={`Band counts for ${row.district_name}`}>
          {ATLAS_BAND_IDS.map((bandId) => (
            <li key={bandId} className="ax-detail__band" data-band={bandId}>
              <span className="ax-detail__label">{verdictBandById(bandId).label}</span>
              <span className="ax-detail__count">{formatCount(counts[bandId])}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ax-detail__note">
          The band split for this district did not arrive, so no counts are shown here.
        </p>
      )}
      {row.no_data ? (
        <p className="ax-detail__note">
          Source data incomplete: these are the accounts really counted in this district.
        </p>
      ) : null}
    </div>
  )
}

export default function Cartogram({
  doc,
  districtCounts,
  scenarioLabel,
  note,
  onSelectDistrict,
}: CartogramProps) {
  const groups = regionsGrouped(doc)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  if (!doc || groups.length === 0) {
    return (
      <section className="ax-cartogram" aria-labelledby="ax-cartogram-title">
        <div className="ax-cartogram__head">
          <h3 className="ax-cartogram__title" id="ax-cartogram-title">
            District cartogram
          </h3>
        </div>
        <p className="ax-note">{note ?? 'The district tiles arrive with the atlas artifact.'}</p>
      </section>
    )
  }

  // Split the rows once: outlines the geometry knows become paths on
  // the map, and the rest keep their region tile instead of vanishing.
  const mapped: DistrictRow[] = []
  const fallback: DistrictRow[] = []
  for (const row of doc.districts) {
    if (GEOMETRY_BY_KEY.has(districtKey(row.district_name))) {
      mapped.push(row)
    } else {
      fallback.push(row)
    }
  }

  const countsFor = (row: DistrictRow): BandCounts | null =>
    districtCounts?.[String(row.district_id)] ?? null

  /** One activation: open the detail here and forward to the caller. */
  const activate = (districtId: number): void => {
    setSelectedId(districtId)
    onSelectDistrict?.(districtId)
  }

  const selectedRow =
    selectedId === null
      ? null
      : (doc.districts.find((row) => row.district_id === selectedId) ?? null)
  const selectedCounts = selectedRow ? countsFor(selectedRow) : null

  return (
    <section className="ax-cartogram" aria-labelledby="ax-cartogram-title">
      <div className="ax-cartogram__head">
        <h3 className="ax-cartogram__title" id="ax-cartogram-title">
          District cartogram
        </h3>
        {scenarioLabel ? (
          <p className="ax-cartogram__scenario">{`District counts ${scenarioLabel}`}</p>
        ) : null}
      </div>

      {mapped.length > 0 ? (
        <svg
          className="ax-map"
          viewBox={CZECHIA_VIEW_BOX}
          role="group"
          aria-label="District map of Czechia"
          data-mapped={mapped.length}
        >
          <defs>
            <pattern
              id="ax-no-data-hatch"
              width="10"
              height="10"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(22, 39, 63, 0.55)" strokeWidth="4" />
            </pattern>
          </defs>
          {mapped.map((row) => (
            <CartogramPath
              key={row.district_id}
              row={row}
              counts={countsFor(row)}
              onSelectDistrict={activate}
            />
          ))}
        </svg>
      ) : null}

      {fallback.length > 0 ? (
        <div className="ax-cartogram__regions">
          {groups
            .map((group) => ({
              ...group,
              districts: group.districts.filter((row) => fallback.includes(row)),
            }))
            .filter((group) => group.districts.length > 0)
            .map((group) => (
              <div className="ax-region" key={group.region}>
                <h4 className="ax-region__label">{group.region}</h4>
                <ul className="ax-region__grid">
                  {group.districts.map((row) => (
                    <CartogramTile
                      key={row.district_id}
                      row={row}
                      counts={countsFor(row)}
                      onSelectDistrict={activate}
                    />
                  ))}
                </ul>
              </div>
            ))}
        </div>
      ) : null}

      {selectedRow ? <CartogramDetail row={selectedRow} counts={selectedCounts} /> : null}

      <div className="ax-legend">
        <ul className="ax-legend__bins">
          {SEVERITY_BINS.map((entry) => (
            <li className="ax-legend__bin" key={entry.bin}>
              <span className="ax-legend__swatch" data-band={entry.band} aria-hidden="true" />
              <span className="ax-legend__range">{entry.range}</span>
            </li>
          ))}
        </ul>
        <p className="ax-legend__note">
          {fallback.length > 0
            ? 'Districts the map geometry does not know are listed as tiles below, arranged by region.'
            : 'One path is one district, drawn where it sits in Czechia.'}
        </p>
        <p className="ax-legend__note">{`Severity: ${SEVERITY_DEFINITION}.`}</p>
        <p className="ax-legend__note">
          Hatched districts mark an incomplete source row; their account counts are real.
        </p>
        {note ? <p className="ax-legend__note">{note}</p> : null}
      </div>
    </section>
  )
}
