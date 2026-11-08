import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ChainReceipt } from '../../data/receipts'
import { loadBundledReceipts } from '../../data/receipts'
import ReceiptStamp from './ReceiptStamp'

/**
 * Phase E7 receipt stamp: the badge sits inside an anchor to the local
 * evidence file with the honest tooltip, the explorer anchor opens the
 * frozen transaction, one compact row per receipt carries the label
 * and the first 8 signature characters, and the note states exactly
 * what the stamp does. With no receipts the badge falls back to its
 * pinned placeholder with zero rows and no chain claims. Server
 * rendering keeps this file free of a DOM: the stamp makes no
 * network call either way.
 */

const ROOT: ChainReceipt = {
  role: 'root',
  sourceFile: 'public/data/findings.json',
  signature: '5YPxwK9dobRKeaVdrVsSGdCcXe4dQ7T8ffm7okDEUNhHb5SEL7g65efLrB17FcoqGJWbKqDrU2D2Ka1Ltnnnxstg',
  payloadSha256: '48bb57a409459812ae2bfead9ae688bf5d38b4c4786dabf15e1e05d52b8b3bc3',
  cluster: 'devnet',
  confirmedAt: '2026-11-07T02:47:12+00:00',
  explorerUrl:
    'https://explorer.solana.com/tx/5YPxwK9dobRKeaVdrVsSGdCcXe4dQ7T8ffm7okDEUNhHb5SEL7g65efLrB17FcoqGJWbKqDrU2D2Ka1Ltnnnxstg?cluster=devnet',
  evidenceHref: '/data/memo-devnet.json',
  label: 'findings.json root memo, devnet',
  matchesLocal: true,
}

const MODEL_CARD: ChainReceipt = {
  ...ROOT,
  role: 'modelcard',
  sourceFile: 'public/data/model_card.json',
  signature:
    '3BJiraS5t8nogZaKRBMLrnCgipSadp7cMN3HJpyK7dfMkjB73BAV8RrPnRLHtSRvkrcKMSk752wyT8ihtbJx5APX',
  payloadSha256: 'b3b32f0c0f284c3cac2e3df6e7d680fc53a5313b206750053f838853b9a0efe3',
  confirmedAt: '2026-11-08T06:43:55+00:00',
  explorerUrl:
    'https://explorer.solana.com/tx/3BJiraS5t8nogZaKRBMLrnCgipSadp7cMN3HJpyK7dfMkjB73BAV8RrPnRLHtSRvkrcKMSk752wyT8ihtbJx5APX?cluster=devnet',
  evidenceHref: '/data/memo-devnet-modelcard.json',
  label: 'model_card.json hash, devnet',
}

const FINGERPRINT: ChainReceipt = {
  ...ROOT,
  role: 'fingerprint',
  sourceFile: 'build/f1-aggregate-table.json',
  signature:
    'Q7evLcRboSd5xkgesg4PJKBixwono2WagquCp1ifMD5rNxKUVsd599P8pYw1VBP4o4dRnYeMni7rAhYoMA3Lrwn',
  payloadSha256: '84f5f24be8f1c74e3ca645fdebfd0f41e52f916c0cc84f6059ada2554138cccd',
  confirmedAt: '2026-11-08T06:44:11+00:00',
  explorerUrl:
    'https://explorer.solana.com/tx/Q7evLcRboSd5xkgesg4PJKBixwono2WagquCp1ifMD5rNxKUVsd599P8pYw1VBP4o4dRnYeMni7rAhYoMA3Lrwn?cluster=devnet',
  evidenceHref: '/data/memo-devnet-fingerprint.json',
  label: 'F1 aggregate fingerprint, aggregates only, no raw rows',
}

const ALL: ChainReceipt[] = [ROOT, MODEL_CARD, FINGERPRINT]

const NOTE =
  'Anchored at build time on Solana devnet when the analysis was frozen. ' +
  'This page reads the bundled evidence files only and never writes to chain.'

const EVIDENCE_TITLE = 'Bundled receipt, written at build time. Opens the local evidence file.'

function rowCount(html: string): number {
  return html.split('cp-receipt-row').length - 1
}

describe('ReceiptStamp markup', () => {
  it('anchors the badge to the local evidence file and the explorer', () => {
    const html = renderToString(createElement(ReceiptStamp, { receipts: ALL }))
    expect(html).toContain('Anchored on Solana devnet, verified')
    expect(html).toContain(`title="${EVIDENCE_TITLE}"`)
    expect(html).toContain(`href="${ROOT.evidenceHref}"`)
    expect(html).toContain(`href="${ROOT.explorerUrl}"`)
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer"')
    expect(html).toContain('data-state="verified"')
  })

  it('lists one compact row per receipt with labels and short signatures', () => {
    const html = renderToString(createElement(ReceiptStamp, { receipts: ALL }))
    expect(rowCount(html)).toBe(3)
    expect(html).toContain('findings.json root memo, devnet')
    expect(html).toContain('model_card.json hash, devnet')
    expect(html).toContain('F1 aggregate fingerprint, aggregates only, no raw rows')
    expect(html).toContain(ROOT.signature.slice(0, 8))
    expect(html).toContain(MODEL_CARD.signature.slice(0, 8))
    expect(html).toContain(FINGERPRINT.signature.slice(0, 8))
    expect(html).toContain(`href="${MODEL_CARD.evidenceHref}"`)
    expect(html).toContain(`href="${FINGERPRINT.explorerUrl}"`)
    expect(html).toContain(NOTE)
  })

  it('routes a matches_local false receipt through the unverified path', () => {
    const unverified: ChainReceipt = { ...ROOT, matchesLocal: false }
    const html = renderToString(createElement(ReceiptStamp, { receipts: [unverified] }))
    expect(html).toContain(`anchored at build time, signature: ${unverified.signature}`)
    expect(html).not.toContain('Anchored on Solana devnet, verified')
    expect(rowCount(html)).toBe(1)
  })

  it('renders the placeholder with zero rows when there are no receipts', () => {
    const html = renderToString(createElement(ReceiptStamp, { receipts: [] }))
    expect(html).toContain('no evidence yet')
    expect(html).toContain('data-state="empty"')
    expect(rowCount(html)).toBe(0)
    expect(html).not.toContain('cp-receipt-note')
    expect(html).not.toContain('target="_blank"')
    expect(html).not.toContain('explorer.solana.com')
    expect(html).not.toContain('Anchored on Solana devnet')
  })

  it('defaults to the bundled registry', () => {
    const html = renderToString(createElement(ReceiptStamp))
    const receipts = loadBundledReceipts()
    expect(receipts.length).toBeGreaterThan(0)
    expect(receipts[0]?.role).toBe('root')
    expect(rowCount(html)).toBe(receipts.length)
    expect(html).toContain('findings.json root memo, devnet')
    expect(html).toContain(NOTE)
  })
})
