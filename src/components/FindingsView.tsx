import { useEffect, useState } from 'react'
import {
  loadFindingsReport,
  loadModelCard,
  type FindingId,
  type FindingsReport,
  type ModelCard,
} from '../data/findings'
import { loadTransactions, loadWorld } from '../data/loaders'
import {
  resolveFindingProvenance,
  type FindingProvenanceById,
} from '../lib/reportProvenance'
import ReportBody from './report/ReportBody'
import type { ProvenanceStatus } from './report/ProvenanceStamp'

/**
 * FINDINGS landing container (findings-first hybrid, docs/decisions.md):
 * boots in two phases so the report paints as soon as findings.json and
 * model_card.json land, then verifies provenance by loading world.json and
 * transactions.json and recomputing every checksum in the browser. The
 * stamps therefore read "verified against N rows, checksum ok" without a
 * click, which is the trust the first 60 seconds need.
 *
 * onExplore is the seam App.tsx passes: the shell switches to the
 * exploration slot and carries the finding the reader was on (report/
 * explore.ts recovers the finding id), which is how an "Explore in game"
 * click lands on the Balance River placeholder with its origin named.
 */

interface FindingsViewProps {
  /** Switch to the exploration slot for this finding (undefined: plain switch). */
  onExplore?: (findingId?: FindingId) => void
}

/**
 * The bundled report payload, fetched once for the whole shell: this view
 * renders it and any other consumer reads the same parsed object, so
 * findings.json stays one request instead of a second fetch. A failed load
 * clears the memo so the next consumer can retry instead of inheriting the
 * rejection forever.
 */
let reportLoad: Promise<FindingsReport> | null = null

export function loadSharedFindingsReport(): Promise<FindingsReport> {
  if (!reportLoad) {
    reportLoad = loadFindingsReport().catch((cause: unknown) => {
      reportLoad = null
      throw cause
    })
  }
  return reportLoad
}

export default function FindingsView({ onExplore }: FindingsViewProps) {
  const [report, setReport] = useState<FindingsReport | null>(null)
  const [modelCard, setModelCard] = useState<ModelCard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [provenance, setProvenance] = useState<FindingProvenanceById | null>(null)
  const [provenanceStatus, setProvenanceStatus] = useState<ProvenanceStatus>('loading')
  const [provenanceError, setProvenanceError] = useState<string | null>(null)

  // Phase 1: the report payload (offline booth friendly, bundled JSON).
  // Phase 2: source rows for the provenance stamps, resolved after paint.
  useEffect(() => {
    let cancelled = false

    async function boot(): Promise<void> {
      try {
        const [loadedReport, loadedModelCard] = await Promise.all([
          loadSharedFindingsReport(),
          loadModelCard(),
        ])
        if (cancelled) {
          return
        }
        setReport(loadedReport)
        setModelCard(loadedModelCard)
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
        return
      }

      try {
        const [world, transactions] = await Promise.all([loadWorld(), loadTransactions()])
        if (cancelled) {
          return
        }
        setProvenance(resolveFindingProvenance(world, transactions.rows))
        setProvenanceStatus('ready')
      } catch (cause) {
        if (!cancelled) {
          setProvenanceStatus('error')
          setProvenanceError(cause instanceof Error ? cause.message : String(cause))
        }
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <section
        aria-labelledby="findings-heading"
        className="rounded-lg border border-danger bg-void-2 p-6"
      >
        <h2 id="findings-heading" className="font-mono text-sm tracking-wider text-danger">
          Findings failed to load
        </h2>
        <p className="mt-2 font-mono text-sm text-ink-dim">{error}</p>
      </section>
    )
  }

  if (!report || !modelCard) {
    return (
      <section
        aria-labelledby="findings-heading"
        className="rounded-lg border border-grid bg-void-2 p-6"
      >
        <h2 id="findings-heading" className="font-mono text-lg tracking-wider text-signal">
          Findings
        </h2>
        <p className="mt-4 font-mono text-sm text-ink-dim" role="status">
          Loading findings from public/data ...
        </p>
      </section>
    )
  }

  return (
    <ReportBody
      report={report}
      modelCard={modelCard}
      provenance={provenance}
      provenanceStatus={provenanceStatus}
      provenanceError={provenanceError}
      onExplore={onExplore}
    />
  )
}
