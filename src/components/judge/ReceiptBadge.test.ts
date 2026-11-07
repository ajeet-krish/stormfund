import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ReceiptBadge, { receiptText, type MemoEvidence } from './ReceiptBadge'

/**
 * The E7 receipt badge: the exact wording rules from docs/solana.md
 * (Report footer wording section) as unit tests on the pure
 * receiptText helper, plus the markup for all three states. No fetch,
 * no RPC, no network: the badge only ever renders what it is given.
 */

const VERIFIED: MemoEvidence = {
  signature: '5KqEXAMPLEsignaturevalue111111111111111111111111111111111',
  verified: true,
  label: 'devnet memo anchor',
}

const UNVERIFIED: MemoEvidence = {
  signature: '3TnEXAMPLEsignaturevalue222222222222222222222222222222222',
  verified: false,
  label: 'devnet memo anchor',
}

describe('receiptText: the docs/solana.md wording rules', () => {
  it('reads the verified case verbatim', () => {
    expect(receiptText(VERIFIED)).toEqual({
      state: 'verified',
      text: 'Anchored on Solana devnet, verified',
    })
  })

  it('reads the offline fallback verbatim with the signature', () => {
    expect(receiptText(UNVERIFIED)).toEqual({
      state: 'unverified',
      text: `anchored at build time, signature: ${UNVERIFIED.signature}`,
    })
  })

  it('reads missing evidence as the typed placeholder', () => {
    expect(receiptText(null)).toEqual({ state: 'empty', text: 'no evidence yet' })
    expect(receiptText(undefined)).toEqual({ state: 'empty', text: 'no evidence yet' })
  })

  it('never prints an empty signature', () => {
    expect(receiptText({ signature: '', verified: false, label: 'x' })).toEqual({
      state: 'unverified',
      text: 'anchored at build time, signature: unavailable',
    })
    expect(
      receiptText({ signature: undefined as unknown as string, verified: false, label: 'x' }),
    ).toEqual({ state: 'unverified', text: 'anchored at build time, signature: unavailable' })
  })

  it('treats a non object value as missing evidence', () => {
    expect(receiptText('5abc' as unknown as MemoEvidence).state).toBe('empty')
  })

  it('uses no dash characters in any sentence', () => {
    // Dash code points checked by value (em dash U+2014, en dash U+2013,
    // minus sign U+2212) so this file itself carries no dash glyph.
    const dashCodePoints = new Set([0x2014, 0x2013, 0x2212])
    const hasDash = (text: string): boolean =>
      [...text].some((char) => dashCodePoints.has(char.codePointAt(0) ?? 0))
    for (const evidence of [VERIFIED, UNVERIFIED, null, undefined]) {
      const text = receiptText(evidence).text
      expect(hasDash(text)).toBe(false)
      // Assembled from code points so this test file holds no dash glyph.
      expect(text.includes('-'.repeat(2))).toBe(false)
    }
  })
})

describe('ReceiptBadge markup', () => {
  it('renders the placeholder with no evidence', () => {
    const html = renderToString(createElement(ReceiptBadge))
    expect(html).toContain('no evidence yet')
    expect(html).toContain('data-state="empty"')
    expect(html).toContain('jg-receipt-empty')
    expect(html).not.toContain('Solana')
  })

  it('renders the verified sentence with the label', () => {
    const html = renderToString(createElement(ReceiptBadge, { evidence: VERIFIED }))
    expect(html).toContain('Anchored on Solana devnet, verified')
    expect(html).toContain('data-state="verified"')
    expect(html).toContain('jg-receipt-verified')
    expect(html).toContain('devnet memo anchor')
    expect(html).toContain('title=')
  })

  it('renders the fallback sentence with the signature', () => {
    const html = renderToString(createElement(ReceiptBadge, { evidence: UNVERIFIED }))
    expect(html).toContain(`anchored at build time, signature: ${UNVERIFIED.signature}`)
    expect(html).toContain('data-state="unverified"')
    expect(html).not.toContain('Anchored on Solana')
  })

  it('renders the placeholder for an explicit null evidence prop', () => {
    const html = renderToString(createElement(ReceiptBadge, { evidence: null }))
    expect(html).toContain('data-state="empty"')
    expect(html).toContain('no evidence yet')
  })
})
