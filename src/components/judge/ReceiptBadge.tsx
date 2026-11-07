import './judge.css'

/**
 * The E7 Solana receipt badge: an honest stamp over the verdict card
 * that shows what the bundled memo evidence says, and nothing more.
 *
 * The wording rules come straight from docs/solana.md (Report footer
 * wording section): the verified case reads "Anchored on Solana
 * devnet, verified", the offline fallback reads "anchored at build
 * time, signature: <sig>", and the default state is an explicit "no
 * evidence yet" placeholder so the badge never implies an anchor that
 * does not exist. This component takes evidence through props only: it
 * never fetches, never reads an RPC endpoint, and never runs a network
 * call at runtime, which is the hard rule for the bundled evidence file
 * (zero runtime RPC, one read-back per build at most).
 *
 * The evidence shape mirrors the committable memo evidence JSON: a
 * signature, whether the build time read-back verified it, and a label.
 * The wiring view imports public/data/memo-devnet.json once and passes
 * it down; this component does not know where the file came from.
 */

/** Bundled memo evidence, the shape the wiring view parses once. */
export interface MemoEvidence {
  /** Transaction signature from the bundled evidence file. */
  signature: string
  /** True when the build time read back matched the local digest. */
  verified: boolean
  /** Human label, for example the cluster or the memo purpose. */
  label: string
}

/** The three badge states, also the data-state attribute the CSS keys on. */
export type ReceiptState = 'empty' | 'verified' | 'unverified'

export interface ReceiptText {
  state: ReceiptState
  text: string
}

/**
 * The exact sentence for one evidence value. Pure and exported so the
 * wording rules in docs/solana.md are unit tested without rendering:
 * missing evidence reads the placeholder, verified evidence reads the
 * verified sentence verbatim, and anything else falls back to the
 * signature line (with "unavailable" standing in for a missing
 * signature rather than printing an empty value).
 */
export function receiptText(evidence: MemoEvidence | null | undefined): ReceiptText {
  if (!evidence || typeof evidence !== 'object') {
    return { state: 'empty', text: 'no evidence yet' }
  }
  if (evidence.verified === true) {
    return { state: 'verified', text: 'Anchored on Solana devnet, verified' }
  }
  const signature =
    typeof evidence.signature === 'string' && evidence.signature.length > 0
      ? evidence.signature
      : 'unavailable'
  return { state: 'unverified', text: `anchored at build time, signature: ${signature}` }
}

export interface ReceiptBadgeProps {
  /** Bundled evidence, null or missing renders the placeholder. */
  evidence?: MemoEvidence | null
}

export default function ReceiptBadge(props: ReceiptBadgeProps) {
  const { state, text } = receiptText(props.evidence)
  const label = typeof props.evidence?.label === 'string' ? props.evidence.label : ''
  const mark = state === 'verified' ? '✓' : state === 'unverified' ? '◆' : '·'

  return (
    <span
      className={`jg-receipt jg-receipt-${state}`}
      data-state={state}
      title={label.length > 0 ? label : undefined}
    >
      <span className="jg-receipt__mark" aria-hidden="true">
        {mark}
      </span>
      <span className="jg-receipt__text">{text}</span>
      {label.length > 0 ? <span className="jg-receipt__label">{label}</span> : null}
    </span>
  )
}
