import type { ReactNode } from 'react'

/**
 * Shared rect grid for the pixel art in this folder. One unit of a Px
 * tuple is one pixel of the artwork: whole numbers only, so every edge
 * lands on the grid and the browser never has to smooth a corner.
 */

/** One pixel block: x, y, width, height, fill. */
export type Px = readonly [x: number, y: number, w: number, h: number, fill: string]

/** Render a list of blocks with a stable key per block. */
export function blocks(list: readonly Px[], key: string): ReactNode {
  return list.map(([x, y, w, h, fill], index) => (
    <rect key={`${key}-${index}`} x={x} y={y} width={w} height={h} fill={fill} />
  ))
}
