import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { evidenceHref, loadBundledReceipts, parseChainReceipt, toMemoEvidence } from './receipts'

/**
 * Phase E7 receipt registry: the hand written guard rejects any shape
 * violation, the labels match the approved package, and two honesty
 * properties hold over the real bundled files. Digest honesty runs
 * node:crypto SHA256 over the shipped findings.json and model_card.json
 * and pins the receipts to those bytes, so a receipt that drifts from
 * the artifact fails here instead of at the booth. The registry test
 * compares the glob against the files actually on disk, root first.
 */

/** A well formed evidence object, overridden per violation case. */
function validRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    signature: '5abcEXAMPLEsignature',
    payload_sha256: 'a'.repeat(64),
    cluster: 'devnet',
    confirmed_at: '2026-11-08T00:00:00+00:00',
    explorer_url: 'https://explorer.solana.com/tx/5abcEXAMPLEsignature?cluster=devnet',
    matches_local: true,
    payload: { source: 'file:public/data/findings.json' },
    ...overrides,
  }
}

/** SHA256 hex digest of one file, read relative to this test module. */
function sha256Of(relativePath: string): string {
  const bytes = readFileSync(new NodeURL(relativePath, import.meta.url))
  return createHash('sha256').update(bytes).digest('hex')
}

describe('parseChainReceipt: the hand written guard', () => {
  const cases = [
    ['memo-devnet.json', 'root', 'findings.json root memo, devnet'],
    ['memo-devnet-modelcard.json', 'modelcard', 'model_card.json hash, devnet'],
    [
      'memo-devnet-fingerprint.json',
      'fingerprint',
      'F1 aggregate fingerprint, aggregates only, no raw rows',
    ],
  ] as const

  it('parses a valid receipt with the approved role, label, and href', () => {
    for (const [filename, role, label] of cases) {
      const receipt = parseChainReceipt(validRaw(), filename)
      expect(receipt).not.toBeNull()
      expect(receipt?.role).toBe(role)
      expect(receipt?.label).toBe(label)
      expect(receipt?.sourceFile).toBe('public/data/findings.json')
      expect(receipt?.cluster).toBe('devnet')
      expect(receipt?.matchesLocal).toBe(true)
      expect(receipt?.evidenceHref.endsWith(`data/${filename}`)).toBe(true)
    }
  })

  it('keeps a matches_local false receipt and maps it to the unverified path', () => {
    const receipt = parseChainReceipt(validRaw({ matches_local: false }), 'memo-devnet.json')
    expect(receipt?.matchesLocal).toBe(false)
    expect(toMemoEvidence(receipt)).toEqual({
      signature: '5abcEXAMPLEsignature',
      verified: false,
      label: 'findings.json root memo, devnet',
    })
  })

  it('maps a verified receipt onto the badge evidence props', () => {
    const receipt = parseChainReceipt(validRaw(), 'memo-devnet.json')
    expect(toMemoEvidence(receipt)).toEqual({
      signature: '5abcEXAMPLEsignature',
      verified: true,
      label: 'findings.json root memo, devnet',
    })
    expect(toMemoEvidence(null)).toBeNull()
    expect(toMemoEvidence(undefined)).toBeNull()
  })

  it('returns null on every shape violation', () => {
    expect(parseChainReceipt(null, 'memo-devnet.json')).toBeNull()
    expect(parseChainReceipt('not an object', 'memo-devnet.json')).toBeNull()
    expect(parseChainReceipt([validRaw()], 'memo-devnet.json')).toBeNull()
    expect(parseChainReceipt(validRaw({ signature: undefined }), 'memo-devnet.json')).toBeNull()
    expect(parseChainReceipt(validRaw({ signature: '' }), 'memo-devnet.json')).toBeNull()
    expect(parseChainReceipt(validRaw({ payload_sha256: 'xyz' }), 'memo-devnet.json')).toBeNull()
    expect(
      parseChainReceipt(validRaw({ payload_sha256: 'A'.repeat(64) }), 'memo-devnet.json'),
    ).toBeNull()
    expect(parseChainReceipt(validRaw({ cluster: 'mainnet-beta' }), 'memo-devnet.json')).toBeNull()
    expect(parseChainReceipt(validRaw({ confirmed_at: 1794019631 }), 'memo-devnet.json')).toBeNull()
    expect(parseChainReceipt(validRaw({ confirmed_at: '' }), 'memo-devnet.json')).toBeNull()
    expect(
      parseChainReceipt(validRaw({ explorer_url: 'https://example.com/tx/1' }), 'memo-devnet.json'),
    ).toBeNull()
    expect(parseChainReceipt(validRaw({ matches_local: 'true' }), 'memo-devnet.json')).toBeNull()
    expect(parseChainReceipt(validRaw({ payload: {} }), 'memo-devnet.json')).toBeNull()
    expect(parseChainReceipt(validRaw({ payload: 'file:public/data/x' }), 'memo-devnet.json')).toBeNull()
    expect(parseChainReceipt(validRaw(), 'memo-devnet-unknown.json')).toBeNull()
    expect(parseChainReceipt(validRaw(), 'findings.json')).toBeNull()
  })

  it('builds the evidence href from the data base', () => {
    const base = import.meta.env.BASE_URL ?? '/'
    expect(evidenceHref('memo-devnet.json')).toBe(`${base}data/memo-devnet.json`)
    expect(evidenceHref('memo-devnet-fingerprint.json')).toBe(
      `${base}data/memo-devnet-fingerprint.json`,
    )
  })
})

describe('digest honesty: the receipts pin the shipped artifact bytes', () => {
  it('roots the root receipt to public/data/findings.json', () => {
    const root = loadBundledReceipts().find((receipt) => receipt.role === 'root')
    expect(root).toBeDefined()
    expect(sha256Of('../../public/data/findings.json')).toBe(root?.payloadSha256)
  })

  it('pins the model card receipt to public/data/model_card.json when present', () => {
    const modelcard = loadBundledReceipts().find((receipt) => receipt.role === 'modelcard')
    if (modelcard === undefined) {
      // The gate cut receipt 2 in this checkout, nothing to pin.
      return
    }
    expect(sha256Of('../../public/data/model_card.json')).toBe(modelcard.payloadSha256)
  })

  it('matches the root evidence sibling byte for byte', () => {
    const bundled = JSON.parse(
      readFileSync(new NodeURL('../../public/data/memo-devnet.json', import.meta.url), 'utf8'),
    ) as Record<string, unknown>
    const root = loadBundledReceipts().find((receipt) => receipt.role === 'root')
    expect(root?.signature).toBe(bundled.signature)
    expect(root?.payloadSha256).toBe(bundled.payload_sha256)
    expect(root?.matchesLocal).toBe(bundled.matches_local)
  })
})

describe('bundled registry: files on disk, root first', () => {
  it('returns exactly the memo evidence files that exist, root first', () => {
    const onDisk = readdirSync(new NodeURL('../../public/data/', import.meta.url)).filter(
      (name) => name.startsWith('memo-devnet') && name.endsWith('.json'),
    )
    const receipts = loadBundledReceipts()
    expect(receipts.length).toBeGreaterThan(0)
    expect(receipts[0]?.role).toBe('root')
    const loaded = receipts.map((receipt) => receipt.evidenceHref.split('/').pop() ?? '')
    expect([...loaded].sort()).toEqual([...onDisk].sort())
    const order = { root: 0, modelcard: 1, fingerprint: 2 }
    const ranks = receipts.map((receipt) => order[receipt.role])
    expect(ranks).toEqual([...ranks].slice().sort((left, right) => left - right))
  })

  it('keeps dash code points and dash copy out of every receipt value', () => {
    // Assembled from code points so this test file holds no dash glyph.
    const dashCodePoints = new Set([0x2014, 0x2013, 0x2212])
    const spacedHyphen = [' ', '-', ' '].join('')
    const hasDashCopy = (value: string): boolean =>
      [...value].some((char) => dashCodePoints.has(char.codePointAt(0) ?? 0)) ||
      value.includes('-'.repeat(2)) ||
      value.includes(spacedHyphen)
    const receipts = loadBundledReceipts()
    expect(receipts.length).toBeGreaterThan(0)
    for (const receipt of receipts) {
      for (const value of [
        receipt.role,
        receipt.sourceFile,
        receipt.label,
        receipt.evidenceHref,
        receipt.explorerUrl,
        receipt.confirmedAt,
        receipt.payloadSha256,
      ]) {
        expect(hasDashCopy(value)).toBe(false)
      }
    }
  })
})
