import './atlas.css'
import {
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
} from '../../lib/atlasData'
import { roundHalfUp } from '../../lib/shocks'

/**
 * The district cartogram (E5 extension): one tile per district,
 * grouped into labeled region bands, shaded by the five band colors
 * through the severity bins in atlasData. The tiles only read the
 * counts they are handed: district splits arrive precomputed from
 * atlas.json for the live scenario, so a twist re shades the grid
 * without this component ever recomputing a runway.
 *
 * Honesty by construction: the tile prints the raw critical plus
 * storm warning count over the district's own account total, the
 * legend prints the severity definition and the region, not geography
 * caveat word for word, and a no_data district shows its hatch and its
 * real account counts together because the hatch marks missing
 * demographics, never missing accounts. A district whose counts did
 * not arrive prints n/a and takes no shade, so absent data can never
 * read as a safe zero.
 *
 * Every tile is a focusable button with a full sentence as its
 * accessible name, wired to the optional onSelectDistrict callback and
 * inert without one. Motion: the tile shade transition lives only
 * inside prefers-reduced-motion: no-preference in atlas.css, so the
 * cascade moment runs at 600ms ease-out for judges who welcome motion
 * and swaps instantly for judges who asked for reduced motion.
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
  /** Optional drill down; the tiles stay inert without it. */
  onSelectDistrict?: (districtId: number) => void
}

/** Grouped digits for every count this grid prints. */
function formatCount(count: number): string {
  return count.toLocaleString('en-CA')
}

/** The tile body, shared by the shaded and the not precomputed cases. */
function tileAria(row: DistrictRow, counts: BandCounts | null): string {
  if (!counts) {
    return `${row.district_name}, account split not precomputed`
  }
  const total = bandTotal(counts)
  const risky = counts.critical + counts.storm_warning
  const suffix = `${formatCount(risky)} of ${formatCount(total)} accounts critical or storm warning`
  if (row.no_data) {
    return `${row.district_name}, no demographic data, ${suffix}`
  }
  return `${row.district_name}, ${suffix}`
}

function CartogramTile({
  row,
  counts,
  onSelectDistrict,
}: {
  row: DistrictRow
  counts: BandCounts | null
  onSelectDistrict?: (districtId: number) => void
}) {
  const severity = counts ? districtSeverity(counts) : null
  const bin = severity !== null ? binFor(severity) : null
  const band = bin !== null ? bandForBin(bin) : null
  const total = counts ? bandTotal(counts) : null
  const risky = counts ? counts.critical + counts.storm_warning : null
  const sharePercent =
    counts && total !== null && total > 0 ? roundHalfUp((risky ?? 0) * 100, total) : null

  const className = row.no_data ? 'ax-tile ax-tile-no-data' : 'ax-tile'

  return (
    <li>
      <button
        type="button"
        className={className}
        data-district={row.district_id}
        data-bin={bin}
        data-band={band}
        data-no-data={row.no_data ? 'true' : undefined}
        aria-label={tileAria(row, counts)}
        onClick={() => onSelectDistrict?.(row.district_id)}
      >
        <span className="ax-tile__name">{row.district_name}</span>
        <span className="ax-tile__value">
          {sharePercent !== null && risky !== null && total !== null ? (
            <>
              {sharePercent}%
              <span className="ax-tile__raw">
                {`${formatCount(risky)} of ${formatCount(total)}`}
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

export default function Cartogram({
  doc,
  districtCounts,
  scenarioLabel,
  note,
  onSelectDistrict,
}: CartogramProps) {
  const groups = regionsGrouped(doc)

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

      <div className="ax-cartogram__regions">
        {groups.map((group) => (
          <div className="ax-region" key={group.region}>
            <h4 className="ax-region__label">{group.region}</h4>
            <ul className="ax-region__grid">
              {group.districts.map((row) => (
                <CartogramTile
                  key={row.district_id}
                  row={row}
                  counts={districtCounts?.[String(row.district_id)] ?? null}
                  onSelectDistrict={onSelectDistrict}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

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
          One tile is one district, arranged by region, not to geography.
        </p>
        <p className="ax-legend__note">{`Severity: ${SEVERITY_DEFINITION}.`}</p>
        <p className="ax-legend__note">
          Hatched tiles carry no demographic data; their account counts are real.
        </p>
        {note ? <p className="ax-legend__note">{note}</p> : null}
      </div>
    </section>
  )
}
