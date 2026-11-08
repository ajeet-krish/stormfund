import { blocks, type Px } from './pixelGrid'

/**
 * The station mascot: a smiling rain cloud over a coin jar, drawn on the
 * same 32 by 32 unit grid as the sky band so the two share one pixel
 * size. Every shape is outlined in one unit of slate ink, which is what
 * lets the mascot read on the pale day sky and on the indigo storm sky
 * alike. It is decorative company for the title, so it is aria hidden.
 */

/** Cloud silhouette: three steps up plus one shaded underside row. */
const CLOUD: Px[] = [
  [9, 2, 10, 3, '#ffffff'],
  [6, 5, 16, 4, '#ffffff'],
  [4, 9, 20, 4, '#ffffff'],
  [4, 13, 20, 1, '#d8ecff'],
]

/** The same silhouette grown by one unit, drawn first as the outline. */
const CLOUD_INK: Px[] = [
  [8, 1, 12, 5, '#16273f'],
  [5, 4, 18, 6, '#16273f'],
  [3, 8, 22, 6, '#16273f'],
  [3, 12, 22, 3, '#16273f'],
]

/** Two eyes and a three block smile. */
const FACE: Px[] = [
  [9, 6, 2, 2, '#16273f'],
  [17, 6, 2, 2, '#16273f'],
  [10, 10, 1, 1, '#16273f'],
  [19, 10, 1, 1, '#16273f'],
  [11, 11, 7, 1, '#16273f'],
]

/** Three drips, each an outlined pixel column. */
const DRIPS: Px[] = [
  [8, 14, 3, 6, '#16273f'],
  [14, 14, 3, 6, '#16273f'],
  [20, 14, 3, 6, '#16273f'],
  [9, 15, 1, 4, '#7fc3ff'],
  [15, 15, 1, 4, '#7fc3ff'],
  [21, 15, 1, 4, '#7fc3ff'],
]

/** Jar: ink shell, pale glass, gold lid, three square coins. */
const JAR: Px[] = [
  [6, 20, 20, 12, '#16273f'],
  [7, 21, 18, 11, '#e8f1fc'],
  [7, 21, 18, 3, '#ffd23f'],
  [9, 26, 5, 3, '#ffb42e'],
  [16, 25, 5, 3, '#ffb42e'],
  [12, 29, 6, 3, '#ffb42e'],
]

/** Draw order: outline under fill, cloud over drips over jar. */
const MASCOT: Px[] = [...CLOUD_INK, ...CLOUD, ...FACE, ...DRIPS, ...JAR]

export default function PixelMascot() {
  return (
    <svg
      className="px-mascot"
      viewBox="0 0 32 32"
      width="64"
      height="64"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {blocks(MASCOT, 'mascot')}
    </svg>
  )
}
