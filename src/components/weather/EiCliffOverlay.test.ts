import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import EiCliffOverlay, { EI_CLIFF_INDEX, EI_CLIFF_LABEL } from './EiCliffOverlay'

/**
 * The EI cliff marker is presentational: visibility is a wired prop
 * that defaults to hidden (only a job loss twist may draw it), the
 * line lands at the shared slot percent the strip's stripLayout
 * describes, the label defaults to the one honest answer key sentence,
 * and a dotted second line marks the worst case pin when it sits on
 * the axis. Out of range or missing indices render nothing, so a mount
 * can never draw a stray marker over a forecast without the twist.
 */

describe('EiCliffOverlay', () => {
  it('renders nothing without a wired visible prop', () => {
    expect(renderToString(createElement(EiCliffOverlay))).not.toContain('wx-cliff')
    expect(renderToString(createElement(EiCliffOverlay, { visible: false }))).not.toContain(
      'wx-cliff',
    )
    // A caller that says visible but hides the index still draws nothing.
    expect(
      renderToString(createElement(EiCliffOverlay, { visible: true, cliffIndex: null })),
    ).not.toContain('wx-cliff')
  })

  it('draws the marker at month 6 with the answer key label', () => {
    const html = renderToString(createElement(EiCliffOverlay, { visible: true, monthCount: 12 }))
    expect(html).toContain('wx-cliff-set')
    expect(html).toContain('wx-cliff')
    expect(html).toContain('Beyond the answer key: EI income stops after month 6')
    // 6 of 12 slots is the halfway line, 50 percent from the left.
    expect(html).toMatch(/left:\s*50%/)
    expect(html).toContain('role="img"')
    expect(html).toContain('Marker after 6 months.')
  })

  it('offsets past the history gutter using the shared slot grid', () => {
    const html = renderToString(
      createElement(EiCliffOverlay, { visible: true, monthCount: 25, startIndex: 12 }),
    )
    // (12 plus 6) of 25 slots is 72 percent.
    expect(html).toMatch(/left:\s*72%/)
    expect(html).toContain('Marker after 6 months.')
  })

  it('draws the dotted second line when the worst case pin sits on the axis', () => {
    const html = renderToString(
      createElement(EiCliffOverlay, {
        visible: true,
        monthCount: 25,
        startIndex: 12,
        afterIndex: 7,
      }),
    )
    expect(html).toContain('wx-cliff wx-cliff-after')
    // (12 plus 7) of 25 slots is 76 percent.
    expect(html).toMatch(/left:\s*76%/)
    expect(html).toContain('worst case pin after 7 months')
    expect(html).toContain(EI_CLIFF_LABEL)
  })

  it('hides the second line outside the axis or on the marker itself', () => {
    expect(
      renderToString(
        createElement(EiCliffOverlay, { visible: true, monthCount: 12, afterIndex: 99 }),
      ),
    ).not.toContain('wx-cliff-after')
    expect(
      renderToString(
        createElement(EiCliffOverlay, { visible: true, monthCount: 12, afterIndex: 6 }),
      ),
    ).not.toContain('wx-cliff-after')
    expect(
      renderToString(
        createElement(EiCliffOverlay, { visible: true, monthCount: 12, afterIndex: null }),
      ),
    ).not.toContain('wx-cliff-after')
  })

  it('renders nothing for out of range or invalid indices', () => {
    expect(
      renderToString(createElement(EiCliffOverlay, { visible: true, cliffIndex: -1 })),
    ).not.toContain('wx-cliff')
    expect(
      renderToString(createElement(EiCliffOverlay, { visible: true, cliffIndex: 12 })),
    ).not.toContain('wx-cliff')
    expect(
      renderToString(
        createElement(EiCliffOverlay, { visible: true, cliffIndex: Number.NaN }),
      ),
    ).not.toContain('wx-cliff')
    expect(
      renderToString(
        createElement(EiCliffOverlay, {
          visible: true,
          cliffIndex: Number.POSITIVE_INFINITY,
        }),
      ),
    ).not.toContain('wx-cliff')
  })

  it('keeps the label inside the strip at the edges and honours a caller label', () => {
    const left = renderToString(
      createElement(EiCliffOverlay, { visible: true, cliffIndex: 0, monthCount: 12 }),
    )
    expect(left).toContain('translateX(0)')
    expect(left).toMatch(/left:\s*0%/)

    const right = renderToString(
      createElement(EiCliffOverlay, { visible: true, cliffIndex: 11, monthCount: 12 }),
    )
    expect(right).toContain('translateX(-100%)')

    const custom = renderToString(
      createElement(EiCliffOverlay, {
        visible: true,
        cliffIndex: 3,
        monthCount: 12,
        label: 'EI ends',
      }),
    )
    expect(custom).toContain('EI ends')
    expect(custom).toContain('Marker after 3 months.')
  })

  it('defaults the index to month 6 and re exports the shared constants', () => {
    expect(EI_CLIFF_INDEX).toBe(6)
    expect(EI_CLIFF_LABEL).toBe('Beyond the answer key: EI income stops after month 6')
    const html = renderToString(
      createElement(EiCliffOverlay, { visible: true, monthCount: 24 }),
    )
    expect(html).toMatch(/left:\s*25%/)
  })
})
