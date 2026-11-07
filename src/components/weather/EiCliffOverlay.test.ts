import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import EiCliffOverlay, { EI_CLIFF_INDEX, EI_CLIFF_LABEL } from './EiCliffOverlay'

/**
 * The EI cliff marker is presentational: it draws at cliffIndex /
 * monthCount, defaults to the standard 6 month EI twist, and renders
 * nothing for missing or out of range indices so a mount can never draw
 * a stray marker over a forecast that has no EI twist applied.
 */

describe('EiCliffOverlay', () => {
  it('defaults to the standard EI twist marker at month 7 of 12', () => {
    expect(EI_CLIFF_INDEX).toBe(6)
    const html = renderToString(createElement(EiCliffOverlay))
    expect(html).toContain('wx-cliff')
    expect(html).toContain(EI_CLIFF_LABEL)
    // 6 of 12 tiles is the halfway line, 50 percent from the left.
    expect(html).toMatch(/left:\s*50%/)
    expect(html).toContain('month 7 of 12')
  })

  it('renders nothing when the cliff is hidden', () => {
    expect(renderToString(createElement(EiCliffOverlay, { cliffIndex: null }))).not.toContain(
      'wx-cliff',
    )
    expect(renderToString(createElement(EiCliffOverlay, { cliffIndex: undefined }))).toContain(
      'wx-cliff',
    )
  })

  it('renders nothing for out of range or invalid indices', () => {
    expect(renderToString(createElement(EiCliffOverlay, { cliffIndex: -1 }))).not.toContain(
      'wx-cliff',
    )
    expect(renderToString(createElement(EiCliffOverlay, { cliffIndex: 12 }))).not.toContain(
      'wx-cliff',
    )
    expect(
      renderToString(createElement(EiCliffOverlay, { cliffIndex: Number.NaN })),
    ).not.toContain('wx-cliff')
    expect(
      renderToString(createElement(EiCliffOverlay, { cliffIndex: Number.POSITIVE_INFINITY })),
    ).not.toContain('wx-cliff')
  })

  it('positions against the caller month count and keeps the label inside', () => {
    const html = renderToString(
      createElement(EiCliffOverlay, { cliffIndex: 2, monthCount: 6 }),
    )
    // 2 of 6 tiles is a third across.
    expect(html).toMatch(/left:\s*33\.3/)
    expect(html).toContain('month 3 of 6')
    expect(html).toContain('translateX(-50%)')

    const edge = renderToString(createElement(EiCliffOverlay, { cliffIndex: 0, monthCount: 12 }))
    expect(edge).toContain('translateX(0)')
    expect(edge).toMatch(/left:\s*0%/)
  })

  it('accepts a caller label and an invalid month count fallback', () => {
    const html = renderToString(
      createElement(EiCliffOverlay, { cliffIndex: 3, monthCount: Number.NaN, label: 'EI ends' }),
    )
    expect(html).toContain('EI ends')
    expect(html).toContain('month 4 of 12')
  })
})
