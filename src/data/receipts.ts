import type { MemoEvidence } from '../components/judge/ReceiptBadge'
import { dataBase } from './loaders'

/**
 * Phase E7 chain receipts: a typed, hand guarded view over the bundled
 * memo evidence files in public/data (docs/decisions.md, Phase E7; the
 * wording contract lives in docs/solana.md). The registry reads the
 * files through import.meta.glob eager, so every byte is inlined at
 * build time: no fetch, no RPC, no network call at runtime, which is
 * the hard rule for the bundled evidence. parseChainReceipt is a
 * hand written guard that returns null on any shape violation, so a
 * damaged file drops out of the registry and the badge falls back to
 * its placeholder instead of rendering a claim it cannot back up.
 */

/** One of the three approved receipts (docs/ideas-tangerine-solana.md). */
export type ReceiptRole = 'root' | 'modelcard' | 'fingerprint'

export interface ChainReceipt {
  role: ReceiptRole
  /** File whose bytes the on chain memo digest was computed over. */
  sourceFile: string
  signature: string
  payloadSha256: string
  cluster: string
  confirmedAt: string
  explorerUrl: string
  evidenceHref: string
  label: string
  matchesLocal: boolean
}

/** The evidence filename each receipt role ships under, root first. */
const ROLE_BY_FILENAME: Readonly<Record<string, ReceiptRole>> = {
  'memo-devnet.json': 'root',
  'memo-devnet-modelcard.json': 'modelcard',
  'memo-devnet-fingerprint.json': 'fingerprint',
}

/** The approved labels, one per receipt (docs/ideas-tangerine-solana.md). */
const LABEL_BY_ROLE: Record<ReceiptRole, string> = {
  root: 'findings.json root memo, devnet',
  modelcard: 'model_card.json hash, devnet',
  fingerprint: 'F1 aggregate fingerprint, aggregates only, no raw rows',
}

/** Registry order: root first, then the model card, then the fingerprint. */
const ROLE_ORDER: Record<ReceiptRole, number> = { root: 0, modelcard: 1, fingerprint: 2 }

/** Bundled evidence link for one filename, base path aware. */
export function evidenceHref(filename: string): string {
  return `${dataBase()}data/${filename}`
}

/**
 * Parse one raw evidence object under a known filename. Returns null
 * when the filename is not a receipt, when the object is not an
 * object, or when any required field is missing or the wrong type:
 * a non empty signature, a 64 character lowercase hex digest, the
 * devnet cluster the labels promise, a non empty confirmation time,
 * an explorer link on the Solana explorer, a boolean matches_local,
 * and a payload source of the form file:<path>.
 */
export function parseChainReceipt(raw: unknown, filename: string): ChainReceipt | null {
  const role = ROLE_BY_FILENAME[filename]
  if (role === undefined) return null
  if (raw === null || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>

  const signature = record.signature
  if (typeof signature !== 'string' || signature.length === 0) return null

  const payloadSha256 = record.payload_sha256
  if (typeof payloadSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(payloadSha256)) return null

  if (record.cluster !== 'devnet') return null

  const confirmedAt = record.confirmed_at
  if (typeof confirmedAt !== 'string' || confirmedAt.length === 0) return null

  const explorerUrl = record.explorer_url
  if (typeof explorerUrl !== 'string') return null
  if (!explorerUrl.startsWith('https://explorer.solana.com/tx/')) return null

  const matchesLocal = record.matches_local
  if (typeof matchesLocal !== 'boolean') return null

  const payload = record.payload
  if (payload === null || typeof payload !== 'object') return null
  const source = (payload as Record<string, unknown>).source
  if (typeof source !== 'string' || !source.startsWith('file:')) return null
  const sourceFile = source.slice('file:'.length)
  if (sourceFile.length === 0) return null

  return {
    role,
    sourceFile,
    signature,
    payloadSha256,
    cluster: 'devnet',
    confirmedAt,
    explorerUrl,
    evidenceHref: evidenceHref(filename),
    label: LABEL_BY_ROLE[role],
    matchesLocal,
  }
}

/** The bundled evidence modules Vite inlines at build time. */
const BUNDLED_EVIDENCE = import.meta.glob<{ default: unknown }>(
  '../../public/data/memo-devnet*.json',
  { eager: true },
)

/**
 * Every bundled receipt that parses, root first. A file missing from
 * public/data is simply absent from the glob, and a file that fails
 * the guard drops out, so a gate failure ships the honest placeholder
 * rather than a broken build.
 */
export function loadBundledReceipts(): ChainReceipt[] {
  const receipts: ChainReceipt[] = []
  for (const [path, module] of Object.entries(BUNDLED_EVIDENCE)) {
    const filename = path.split('/').pop() ?? ''
    const receipt = parseChainReceipt(module.default, filename)
    if (receipt !== null) receipts.push(receipt)
  }
  receipts.sort((left, right) => ROLE_ORDER[left.role] - ROLE_ORDER[right.role])
  return receipts
}

/**
 * Map one receipt onto the badge evidence props: verified comes from
 * the build time read back recorded in matches_local, plus the
 * signature and the approved label. Null in, null out, so an absent
 * receipt renders the pinned placeholder.
 */
export function toMemoEvidence(receipt: ChainReceipt | null | undefined): MemoEvidence | null {
  if (!receipt) return null
  return {
    signature: receipt.signature,
    verified: receipt.matchesLocal,
    label: receipt.label,
  }
}
