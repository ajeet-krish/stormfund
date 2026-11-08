import { useMemo } from 'react'
import { applyTwist, type Twist } from '../../lib/shocks'
import { verdictBand, type VerdictBandId } from '../../lib/verdict'
import { useConsole } from '../../state/consoleStore'
import type { ProfilesArtifact } from '../../data/profiles'
import { blocks, type Px } from './pixelGrid'
import './sky.css'

/**
 * The pixel sky header band, the station's one piece of scenery. It is
 * drawn as a rect grid on a 320 by 32 unit canvas where one unit is one
 * pixel of the artwork, so every edge lands on the grid and nothing is
 * smoothed: flat sky bands, a stepped sun, block clouds with a shaded
 * underside, staircase hills, and in the storm scene indigo clouds,
 * stepped rain, and a bolt. The whole scene is decorative, so it is
 * aria hidden and carries no text.
 *
 * The swap rule is the console's own ladder (src/lib/verdict.ts): the
 * two bands that mean trouble, critical and storm warning, turn the sky
 * storm, and watch, fair skies, clear, and the no account case stay day.
 * The band is derived with the same two pure functions ConsoleView
 * runs (applyTwist then verdictBand) over the same store fields, so the
 * header can never disagree with the badge under it.
 *
 * Motion lives only inside prefers-reduced-motion: no-preference: the
 * rain falls in whole pixel steps and the bolt flickers, and both go
 * still for a judge who asked for reduced motion (the global reduce
 * block in src/index.css zeroes the durations a second time).
 */

/** Which of the two scenes the header paints. */
export type SkyVariant = 'day' | 'storm'

/** The storm rule, exported so a test can pin it without a DOM. */
export function skyVariantFor(band: VerdictBandId | null): SkyVariant {
  if (band === 'critical' || band === 'storm_warning') {
    return 'storm'
  }
  return 'day'
}

/** A block cloud: three steps up, one shaded underside row. */
function cloud(x: number, y: number, body: string, shade: string): Px[] {
  return [
    [x + 8, y, 8, 3, body],
    [x + 3, y + 3, 18, 3, body],
    [x, y + 6, 24, 3, body],
    [x, y + 9, 24, 2, shade],
  ]
}

/** A stepped rain drop: two units of fall, one unit across. */
function drop(x: number, y: number, fill: string): Px[] {
  return [
    [x, y, 1, 4, fill],
    [x + 1, y + 4, 1, 4, fill],
  ]
}

const CLOUD_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [14, 6],
  [74, 9],
  [132, 6],
  [238, 8],
  [292, 6],
]

const RAIN_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [10, 2],
  [38, 9],
  [64, 1],
  [92, 11],
  [120, 3],
  [148, 9],
  [174, 2],
  [224, 6],
  [252, 12],
  [278, 3],
  [306, 9],
  [24, 17],
  [108, 18],
  [166, 17],
  [244, 18],
  [296, 16],
]

const DAY_SKY: Px[] = [
  [0, 0, 320, 8, '#c7e6ff'],
  [0, 8, 320, 8, '#b0d9ff'],
  [0, 16, 320, 8, '#99cdfb'],
  [0, 24, 320, 8, '#83c0f6'],
]

const DAY_SUN: Px[] = [
  [200, 8, 12, 12, '#ffcf2e'],
  [200, 8, 12, 4, '#ffe27a'],
  [204, 4, 4, 4, '#ffd23f'],
  [204, 20, 4, 4, '#ffd23f'],
  [196, 12, 4, 4, '#ffd23f'],
  [212, 12, 4, 4, '#ffd23f'],
]

const STORM_SKY: Px[] = [
  [0, 0, 320, 8, '#5b62a8'],
  [0, 8, 320, 8, '#666db6'],
  [0, 16, 320, 8, '#7178c4'],
  [0, 24, 320, 8, '#7c83d2'],
]

/** Staircase hills: a far ridge and a near ridge, both flat to the base. */
const HILLS_BACK: Px[] = [
  [0, 25, 32, 7, '#a7dfae'],
  [32, 24, 28, 8, '#a7dfae'],
  [60, 26, 40, 6, '#a7dfae'],
  [100, 23, 36, 9, '#a7dfae'],
  [136, 26, 44, 6, '#a7dfae'],
  [180, 24, 32, 8, '#a7dfae'],
  [212, 26, 48, 6, '#a7dfae'],
  [260, 23, 36, 9, '#a7dfae'],
  [296, 26, 24, 6, '#a7dfae'],
]

const HILLS_FRONT: Px[] = [
  [0, 28, 48, 4, '#77c98a'],
  [48, 29, 56, 3, '#77c98a'],
  [104, 27, 44, 5, '#77c98a'],
  [148, 29, 60, 3, '#77c98a'],
  [208, 28, 52, 4, '#77c98a'],
  [260, 29, 60, 3, '#77c98a'],
]

/** The storm keeps the ridge silhouette and darkens it. */
const STORM_HILLS_BACK: Px[] = HILLS_BACK.map(
  ([x, y, w, h]): Px => [x, y, w, h, '#5d8a72'],
)

const STORM_HILLS_FRONT: Px[] = HILLS_FRONT.map(
  ([x, y, w, h]): Px => [x, y, w, h, '#47705a'],
)

/** Four offset blocks read as a bolt on the grid. */
const BOLT: Px[] = [
  [204, 4, 10, 8, '#ffe27a'],
  [198, 12, 12, 6, '#ffe27a'],
  [204, 18, 8, 7, '#ffd23f'],
  [198, 25, 8, 6, '#ffd23f'],
]

/** Flat fills, in draw order: sky, sun, both ridges, then the clouds. */
const DAY_SCENE: Px[] = [
  ...DAY_SKY,
  ...DAY_SUN,
  ...HILLS_BACK,
  ...HILLS_FRONT,
  ...CLOUD_SPOTS.flatMap(([x, y]) => cloud(x, y, '#ffffff', '#d8ecff')),
]

const STORM_SCENE: Px[] = [
  ...STORM_SKY,
  ...STORM_HILLS_BACK,
  ...STORM_HILLS_FRONT,
  ...CLOUD_SPOTS.flatMap(([x, y]) => cloud(x, y, '#42468a', '#31346b')),
]

const RAIN_SCENE: Px[] = RAIN_SPOTS.flatMap(([x, y]) => drop(x, y, '#a8d8ff'))

/** The band the console would show, from the same pure functions. */
function liveBand(
  bundle: ProfilesArtifact | null,
  selectedId: string | null,
  twist: Twist,
): VerdictBandId | null {
  if (!bundle || !selectedId) {
    return null
  }
  const profile = bundle.byId.get(selectedId)
  if (!profile) {
    return null
  }
  return verdictBand(applyTwist(profile, twist).runway).id
}

export default function PixelSky() {
  const bundle = useConsole((state) => state.bundle)
  const selectedId = useConsole((state) => state.selectedId)
  const twist = useConsole((state) => state.twist)

  const variant = useMemo<SkyVariant>(
    () => skyVariantFor(liveBand(bundle, selectedId, twist)),
    [bundle, selectedId, twist],
  )

  const storm = variant === 'storm'

  return (
    <svg
      className="px-sky"
      data-variant={variant}
      viewBox="0 0 320 32"
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <g>{blocks(storm ? STORM_SCENE : DAY_SCENE, 'scene')}</g>
      {storm ? <g className="px-sky__rain">{blocks(RAIN_SCENE, 'rain')}</g> : null}
      {storm ? <g className="px-sky__bolt">{blocks(BOLT, 'bolt')}</g> : null}
    </svg>
  )
}
