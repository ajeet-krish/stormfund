import type { F4Section, FindingsReport, ReportSection } from '../data/findings'
import type { WorldEntity } from '../data/types'

/**
 * Shared F4 counterfactual lookup: the bridge between the findings report
 * and the exploration surfaces (docs/architecture.md Analysis Layer: the
 * surface card and the report waterfall read from the SAME module). The
 * first surface, the game's transfer option card, left with the cancelled
 * galaxy game; the Balance River morph next phase consumes this same
 * module (pivot in docs/decisions.md).
 *
 * lookupFriction reads ONLY the parsed findings report: it finds the F4
 * plane change cost section, matches one category against its chart twin
 * bars, and returns the published figures verbatim. It never recomputes a
 * scenario and never fetches anything, so the dollar figure a judge reads
 * in F4 and the dollar figure an exploration surface prints are the same
 * number by construction. The lookup is pure and null safe: any key
 * without an F4 entry (unknown category, other finding ids such as "F1", a
 * report that has not loaded) returns null so the caller renders nothing
 * instead of inventing a figure.
 */

/**
 * What a lookup accepts: the whole parsed report, or the F4 section pulled
 * out of it (the report body holds sections).
 */
export type FrictionSource = FindingsReport | ReportSection

/** One category's F4 counterfactual, exactly as published in findings.json. */
export interface FrictionFigures {
  /** Category name as findings.json spells it. */
  name: string
  /** Aligned drawdown improvement, integer cents (baseline minus scenario, positive means tighter). */
  drawdownImprovementCents: number
  /** Aligned trough lift, integer cents (scenario minus baseline). */
  troughLiftCents: number
  /** Aligned month end floor delta, integer cents (scenario minus baseline). */
  floorDeltaCents: number
  /** First sentence of the F4 method, verbatim from findings.json. */
  methodOneLiner: string
  /** F4 limitations joined into one string; null when the list is empty. */
  caveats: string | null
}

/** Resolve the F4 section from a report or from the section itself. */
function f4SectionOf(source: FrictionSource | null | undefined): F4Section | null {
  if (!source || typeof source !== 'object') {
    return null
  }
  if ('sections' in source && Array.isArray(source.sections)) {
    const match = source.sections.find((section) => section.id === 'F4')
    if (match && match.id === 'F4') {
      return match
    }
    return null
  }
  if ('id' in source && source.id === 'F4') {
    return source
  }
  return null
}

/**
 * Candidate names for one lookup key, lowercased: the key as given (a
 * category name such as "Travel"), plus the tail after its last "-" or "_"
 * (so entity ids such as "cat-travel" or "spl-2025-12-22-travel" match the
 * category they belong to). Nothing else is guessed.
 */
function candidateKeys(key: string): string[] {
  const trimmed = key.trim().toLowerCase()
  if (!trimmed) {
    return []
  }
  const tail = trimmed.split(/[-_]/).pop()
  return tail && tail !== trimmed ? [trimmed, tail] : [trimmed]
}

/**
 * F4 counterfactual figures for one category, read from the parsed
 * findings report. Returns null when the source carries no F4 section or
 * the key (a category name or entity id) matches no F4 category, so the
 * caller shows nothing rather than a fabricated number.
 */
export function lookupFriction(
  source: FrictionSource | null | undefined,
  key: string | null | undefined,
): FrictionFigures | null {
  const f4 = f4SectionOf(source)
  if (!f4) {
    return null
  }
  if (typeof key !== 'string') {
    return null
  }
  const candidates = candidateKeys(key)
  if (candidates.length === 0) {
    return null
  }
  const bar = f4.bars.find(
    (entry) => candidates.includes(entry.name.trim().toLowerCase()),
  )
  if (!bar) {
    return null
  }
  return {
    name: bar.name,
    drawdownImprovementCents: bar.alignedDrawdownImprovementCents,
    troughLiftCents: bar.alignedTroughDeltaCents,
    floorDeltaCents: bar.alignedFloorDeltaCents,
    methodOneLiner: f4.methodOneLiner,
    caveats: f4.limitations.length > 0 ? f4.limitations.join(' ') : null,
  }
}

/**
 * Category key a world entity is looked up under: category entities by
 * their own name, subscription and splurge entities by the ledger category
 * they spend in (the F4 simulation moves whole category phases, so the
 * figure always speaks for the category), and income events with null
 * because deposits are what the shift aligns toward, never what moves.
 * The galaxy game's option card was the first caller; the keying stays
 * here, tested, for the exploration surfaces that follow it.
 */
export function frictionKeyForEntity(entity: WorldEntity | null | undefined): string | null {
  if (!entity) {
    return null
  }
  switch (entity.kind) {
    case 'category':
      return entity.name
    case 'subscription':
    case 'splurge':
      return entity.category
    case 'income':
      return null
  }
}
