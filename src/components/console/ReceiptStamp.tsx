import ReceiptBadge from '../judge/ReceiptBadge'
import { loadBundledReceipts, toMemoEvidence, type ChainReceipt } from '../../data/receipts'

/**
 * The Phase E7 receipt stamp: the single mount point for the untouched
 * judge/ReceiptBadge inside the console (docs/decisions.md, Phase E7,
 * the one seam). It reads only the bundled registry from src/data, so
 * the page makes zero network calls at runtime: the badge anchor opens
 * the local evidence file, the explorer anchor opens the frozen
 * transaction, one compact row lists each receipt, and the note says
 * exactly what the chain did and did not attest. With no receipts it
 * degrades to the badge's own placeholder with zero rows, which is the
 * honest ship state when a gate fails.
 */

/** Tooltip on the badge anchor: what the local link opens. */
const EVIDENCE_TITLE = 'Bundled receipt, written at build time. Opens the local evidence file.'

/** Tooltip on the explorer anchor: where the transaction link goes. */
const EXPLORER_TITLE = 'Opens the transaction on the Solana explorer'

/** The frozen analysis note, printed once under the receipt rows. */
const STAMP_NOTE =
  'Anchored at build time on Solana devnet when the analysis was frozen. ' +
  'This page reads the bundled evidence files only and never writes to chain.'

export interface ReceiptStampProps {
  /** Override for tests; defaults to the bundled registry. */
  receipts?: ChainReceipt[]
}

export default function ReceiptStamp({ receipts }: ReceiptStampProps) {
  const list = receipts ?? loadBundledReceipts()
  const root = list.find((receipt) => receipt.role === 'root') ?? null

  return (
    <div className="cp-receipt-stamp">
      {root === null ? (
        <ReceiptBadge evidence={null} />
      ) : (
        <>
          <a
            className="cp-receipt-link"
            href={root.evidenceHref}
            target="_blank"
            rel="noreferrer"
            title={EVIDENCE_TITLE}
          >
            <ReceiptBadge evidence={toMemoEvidence(root)} />
          </a>
          <a
            className="cp-receipt-link"
            href={root.explorerUrl}
            target="_blank"
            rel="noreferrer"
            title={EXPLORER_TITLE}
          >
            explorer
          </a>
        </>
      )}
      {list.length > 0 ? (
        <ul aria-label="Chain receipts">
          {list.map((receipt) => (
            <li className="cp-receipt-row" key={receipt.role}>
              <span>{receipt.label}</span>
              <code>{receipt.signature.slice(0, 8)}</code>
              <a
                className="cp-receipt-link"
                href={receipt.evidenceHref}
                target="_blank"
                rel="noreferrer"
              >
                evidence
              </a>
              <a
                className="cp-receipt-link"
                href={receipt.explorerUrl}
                target="_blank"
                rel="noreferrer"
              >
                explorer
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {root === null ? null : <p className="cp-receipt-note">{STAMP_NOTE}</p>}
    </div>
  )
}
