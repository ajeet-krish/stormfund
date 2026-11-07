import type { FindingsReport, F1Section, F2Section, F4Section, F5Section } from '../data/findings'
import { loadTransactions, loadWorld } from '../data/loaders'
import type { TransactionsFile, World } from '../data/types'
import { formatCents } from './format'

/**
 * Money River scene model: shapes the shipped public/data artifacts into the
 * single structure BalanceRiver paints. Pure and deterministic: no clock, no
 * Math.random, no network inside the builder. Every field names the artifact
 * it came from, and the two approximations say so in their own notes, so the
 * painting can never claim a number the pipeline did not publish.
 *
 * Sources: transactions.json for the 365 daily closes and the deficit days,
 * world.json for payroll dates and month end closes, findings.json through
 * the typed report parser for the F1 classification, the F2 holiday window,
 * the F4 trough counterfactual, the F5 floor lift, and the headline caption.
 */

// ===========================================================================
// Scene model
// ===========================================================================

/** One day's closing balance: the last balanceCents posted on that date. */
export interface RiverPoint {
  date: string
  balanceCents: number
}

/** One day whose close fell below zero (the F3 target definition). */
export interface DeficitDay {
  date: string
  balanceCents: number
}

/** One month's end close, the height of its horizon ridge. */
export interface MonthRidge {
  month: string
  date: string
  balanceCents: number
}

/** The F2 holiday window, warm light in the sky. */
export interface HolidayWindow {
  start: string
  end: string
  days: number
}

/** One category feeding the river, width by annual spend. */
export interface Tributary {
  category: string
  annualSpendCents: number
  structural: boolean
}

/**
 * The F4 counterfactual as a second, faint water line. Approximate by
 * construction: the shipped artifacts publish month end aligned closes
 * (identical to baseline, because F4 never moves a month end floor) and per
 * category trough deltas, but no daily counterfactual path. The line adds the
 * best aligned trough lift as a triangular bump around the baseline trough
 * date and returns to baseline at that month's end, which keeps the shipped
 * floor delta of zero true by construction.
 */
export interface GhostLine {
  points: RiverPoint[]
  approximate: true
  troughDate: string
  liftCents: number
  halfWidthBeforeDays: number
  halfWidthAfterDays: number
  note: string
  /** Pipeline export that would replace the approximation with real rows. */
  pipelineExportNeeded: string
}

export interface F4Annotation {
  troughDate: string
  troughCents: number
  category: string
  troughLiftCents: number
  drawdownImprovementCents: number
}

export interface F5Annotation {
  interventionName: string
  baselineFloorCents: number
  floorLiftCents: number
  /** The painted flood line: floor plus lift (minMonthEndAfterCents). */
  markCents: number
}

export interface RiverCaption {
  f1Value: string
  f1Label: string
  f5Value: string
  f5Label: string
  dayCount: number
  deficitDayCount: number
  dateRange: { start: string; end: string }
  structuralCategories: string[]
}

/** One printed line of the almanac legend: element, data rule, source. */
export interface LegendLine {
  element: string
  rule: string
  source: string
}

export interface RiverScene {
  /** Hash seed for every texture jitter, derived from the data, never random. */
  seed: string
  points: RiverPoint[]
  deficitDays: DeficitDay[]
  paydayDates: string[]
  /** Income events in window that are not on the 25th phase (shown as excluded). */
  nonPaydayIncomeDates: string[]
  incomeEventsTotal: number
  monthRidges: MonthRidge[]
  holidayWindow: HolidayWindow
  tributaries: Tributary[]
  ghost: GhostLine
  annotations: { f4: F4Annotation; f5: F5Annotation }
  caption: RiverCaption
  legend: LegendLine[]
}

// ===========================================================================
// Date helpers (UTC only: the ledger dates are calendar dates, not moments)
// ===========================================================================

const DAY_MS = 86_400_000

function parseDay(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`river scene: "${iso}" is not a yyyy-mm-dd date`)
  }
  return Date.UTC(year, month - 1, day)
}

function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Day index of a date inside a range, clamped to the range bounds. */
export function dayIndexOf(date: string, start: string, end: string): number {
  const span = Math.round((parseDay(end) - parseDay(start)) / DAY_MS)
  if (span <= 0) {
    return 0
  }
  const offset = Math.round((parseDay(date) - parseDay(start)) / DAY_MS)
  return Math.min(span, Math.max(0, offset))
}

// ===========================================================================
// Deterministic texture jitter (FNV-1a, never Math.random)
// ===========================================================================

/** Stable [0, 1) from a string: every paint jitter in the scene comes from here. */
export function hash01(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
}

// ===========================================================================
// Shaping steps (each exported for the contract tests)
// ===========================================================================

/**
 * Daily closing balance for every calendar day in range: the row with the
 * highest hour on that date (file order breaks ties), carried forward when a
 * date has no rows at all. Same rule the pipeline uses for month end closes,
 * applied one grain finer.
 */
export function dailyClosingBalances(
  transactions: TransactionsFile,
  range: { start: string; end: string },
): RiverPoint[] {
  const lastRowOfDay = new Map<string, { balanceCents: number; hour: number; order: number }>()
  transactions.rows.forEach((row, order) => {
    const previous = lastRowOfDay.get(row.date)
    if (
      !previous ||
      row.hour > previous.hour ||
      (row.hour === previous.hour && order > previous.order)
    ) {
      lastRowOfDay.set(row.date, { balanceCents: row.balanceCents, hour: row.hour, order })
    }
  })

  const points: RiverPoint[] = []
  let carried = 0
  let seen = false
  for (
    let ms = parseDay(range.start);
    ms <= parseDay(range.end);
    ms += DAY_MS
  ) {
    const date = formatDay(ms)
    const row = lastRowOfDay.get(date)
    if (row) {
      carried = row.balanceCents
      seen = true
    }
    if (seen) {
      points.push({ date, balanceCents: carried })
    }
  }
  return points
}

/**
 * The declared payday phase: findings F4 anchors the pay cycle to one
 * monthly deposit on the 25th, so a deposit is a payday only when it lands
 * on day 25. The shipped fixture carries one non payday income event (a CRA
 * tax refund on 2026-04-15); it is income but not a bridge, and the scene
 * keeps it in nonPaydayIncomeDates so the exclusion is visible rather than
 * silent.
 */
export function isPaydayPhase(date: string): boolean {
  return Number(date.slice(8, 10)) === 25
}

/** Income events inside the ledger window, payroll phase first. */
export function incomeDatesInRange(
  world: World,
  range: { start: string; end: string },
): { paydays: string[]; nonPaydays: string[] } {
  const inWindow = world.income_events
    .filter((event) => event.date >= range.start && event.date <= range.end)
    .map((event) => event.date)
    .sort()
  return {
    paydays: inWindow.filter(isPaydayPhase),
    nonPaydays: inWindow.filter((date) => !isPaydayPhase(date)),
  }
}

/** Payroll deposit dates that fall inside the ledger window (the bridges). */
export function paydayDates(world: World, range: { start: string; end: string }): string[] {
  return incomeDatesInRange(world, range).paydays
}

/**
 * The F4 ghost line, documented as approximate. The lift is the aligned
 * trough delta of the best aligned category, applied as a triangle around the
 * baseline trough date: zero before halfWidthBeforeDays, apex on the trough
 * date, back to zero at the trough month's end so the shipped month end floor
 * delta of zero stays exactly true, and zero for every later day.
 */
export function buildGhostLine(points: RiverPoint[], f4: F4Section): GhostLine {
  const troughIndex = points.findIndex((point) => point.date === f4.baselineTroughDate)
  const bestBar = f4.bars.find((bar) => bar.name === f4.bestAlignedCategory)
  const liftCents = bestBar ? bestBar.alignedTroughDeltaCents : 0
  const halfWidthBeforeDays = 14

  // Right edge: the trough month's last day, so the ghost meets baseline at
  // the very sample F4 declares unmoved (floor delta zero), with a 7 day
  // floor so a trough on the first of a month still gets a visible arc.
  let halfWidthAfterDays = 7
  if (troughIndex >= 0) {
    const troughDate = points[troughIndex]?.date ?? f4.baselineTroughDate
    const monthPrefix = troughDate.slice(0, 7)
    let monthEndIndex = troughIndex
    for (let index = troughIndex; index < points.length; index += 1) {
      if ((points[index]?.date ?? '').startsWith(monthPrefix)) {
        monthEndIndex = index
      }
    }
    halfWidthAfterDays = Math.max(7, monthEndIndex - troughIndex)
  }

  const ghostPoints = points.map((point, index) => {
    if (troughIndex < 0 || liftCents === 0) {
      return { ...point }
    }
    const offset = index - troughIndex
    const halfWidth = offset < 0 ? halfWidthBeforeDays : halfWidthAfterDays
    const distance = Math.abs(offset)
    if (distance >= halfWidth) {
      return { ...point }
    }
    const factor = 1 - distance / halfWidth
    return { date: point.date, balanceCents: point.balanceCents + Math.round(liftCents * factor) }
  })

  const troughDate = points[troughIndex]?.date ?? f4.baselineTroughDate
  return {
    points: ghostPoints,
    approximate: true,
    troughDate,
    liftCents,
    halfWidthBeforeDays,
    halfWidthAfterDays,
    note:
      `Approximate, not exported: findings.json publishes month end aligned closes ` +
      `(identical to baseline, F4 floor delta zero) and per category trough deltas, ` +
      `not a daily counterfactual path. This line adds the ${f4.bestAlignedCategory} ` +
      `aligned trough lift of ${formatCents(liftCents)} as a triangle around ` +
      `${troughDate} and returns to baseline at that month end.`,
    pipelineExportNeeded:
      'scripts.analysis.build_findings exporting f4.chartTwin.dailyAlignedSeries ' +
      '(per day aligned closing balance for the best aligned category)',
  }
}

function f1Of(report: FindingsReport): F1Section {
  const section = report.sections.find((entry) => entry.id === 'F1')
  if (!section || section.id !== 'F1') {
    throw new Error('findings report is missing F1')
  }
  return section
}

function f2Of(report: FindingsReport): F2Section {
  const section = report.sections.find((entry) => entry.id === 'F2')
  if (!section || section.id !== 'F2') {
    throw new Error('findings report is missing F2')
  }
  return section
}

function f4Of(report: FindingsReport): F4Section {
  const section = report.sections.find((entry) => entry.id === 'F4')
  if (!section || section.id !== 'F4') {
    throw new Error('findings report is missing F4')
  }
  return section
}

function f5Of(report: FindingsReport): F5Section {
  const section = report.sections.find((entry) => entry.id === 'F5')
  if (!section || section.id !== 'F5') {
    throw new Error('findings report is missing F5')
  }
  return section
}

// ===========================================================================
// Scene builder
// ===========================================================================

/** Shape the three shipped artifacts into the painting's data model. */
export function buildRiverScene(input: {
  world: World
  transactions: TransactionsFile
  report: FindingsReport
}): RiverScene {
  const { world, transactions, report } = input
  const range = report.meta.dateRange
  const f1 = f1Of(report)
  const f2 = f2Of(report)
  const f4 = f4Of(report)
  const f5 = f5Of(report)

  const points = dailyClosingBalances(transactions, range)
  const deficitDays: DeficitDay[] = points
    .filter((point) => point.balanceCents < 0)
    .map((point) => ({ date: point.date, balanceCents: point.balanceCents }))
  const { paydays: bridges, nonPaydays } = incomeDatesInRange(world, range)

  const monthRidges: MonthRidge[] = world.monthly_balance_series.map((point) => ({
    month: point.month,
    date: point.date,
    balanceCents: point.balanceCents,
  }))

  const holidayWindow: HolidayWindow = {
    start: f2.holidayWindowStart,
    end: f2.holidayWindowEnd,
    days: f2.holidayWindowDays,
  }

  const tributaries: Tributary[] = f1.categoryBars
    .map((bar) => ({
      category: bar.name,
      annualSpendCents: bar.annualSpendCents,
      structural: bar.classification === 'structural',
    }))
    .sort((left, right) => right.annualSpendCents - left.annualSpendCents)

  const f5Best = f5.interventions.find((entry) => entry.id === f5.bestInterventionId)
  const floorLiftCents = f5.bestMinMonthEndImprovementCents
  const baselineFloorCents = f5Best ? f5Best.minMonthEndAfterCents - floorLiftCents : 0
  const markCents = baselineFloorCents + floorLiftCents

  const troughBar = f4.bars.find((bar) => bar.name === f4.bestAlignedCategory)
  const ghost = buildGhostLine(points, f4)

  const annotations: { f4: F4Annotation; f5: F5Annotation } = {
    f4: {
      troughDate: f4.baselineTroughDate,
      troughCents: f4.baselineTroughCents,
      category: f4.bestAlignedCategory,
      troughLiftCents: troughBar ? troughBar.alignedTroughDeltaCents : 0,
      drawdownImprovementCents: f4.bestAlignedDrawdownImprovementCents,
    },
    f5: {
      interventionName: f5.bestInterventionName,
      baselineFloorCents,
      floorLiftCents,
      markCents,
    },
  }

  const caption: RiverCaption = {
    f1Value: f1.metric.value,
    f1Label: f1.metric.label,
    f5Value: f5.metric.value,
    f5Label: f5.metric.label,
    dayCount: report.meta.dayCount,
    deficitDayCount: deficitDays.length,
    dateRange: { start: range.start, end: range.end },
    structuralCategories: f1.structuralCategories,
  }

  const structuralNames = tributaries
    .filter((tributary) => tributary.structural)
    .map((tributary) => tributary.category)

  const legend: LegendLine[] = [
    {
      element: 'Water surface',
      rule: `daily closing balance, ${points.length} days from ${range.start} to ${range.end}`,
      source: 'transactions.json rows, balanceCents per date',
    },
    {
      element: 'Riverbed stones',
      rule: `one stone for each day closing below zero (${deficitDays.length} days)`,
      source: 'transactions.json closes, F3 same day deficit rule',
    },
    {
      element: 'Payday bridges',
      rule: `one bridge per payroll deposit on the 25th phase (${bridges.length} inside the window; ${nonPaydays.length} non payday income event excluded${nonPaydays.length > 0 ? `: ${nonPaydays.join(', ')}` : ''})`,
      source: 'world.json income_events, findings F4 phase rule',
    },
    {
      element: 'Ghost water line',
      rule: `${f4.bestAlignedCategory} aligned trough lift ${formatCents(ghost.liftCents)}, approximate, back to baseline at the month end`,
      source: 'findings.json F4, daily path not exported',
    },
    {
      element: 'High water mark',
      rule: `December floor ${formatCents(baselineFloorCents)} plus the F5 cap lift +${formatCents(floorLiftCents)} lands at ${formatCents(markCents)}`,
      source: 'findings.json F5 best intervention',
    },
    {
      element: 'Tributaries',
      rule: `width by annual spend across ${tributaries.length} categories; straight channels are structural (${structuralNames.join(', ')})`,
      source: 'findings.json F1 classification',
    },
    {
      element: 'Month ridges',
      rule: `height by month end close (12 months); warm light marks the ${holidayWindow.days} day window ${holidayWindow.start} to ${holidayWindow.end}`,
      source: 'world.json monthly_balance_series, findings.json F2',
    },
    {
      element: 'Accent color',
      rule: 'one accent marks deficit and drought only, everything else is muted river light',
      source: 'almanac key',
    },
  ]

  const seed = `${range.start}:${range.end}:${report.meta.transactionRowCount}:${report.meta.seed}`

  return {
    seed,
    points,
    deficitDays,
    paydayDates: bridges,
    nonPaydayIncomeDates: nonPaydays,
    incomeEventsTotal: world.income_events.length,
    monthRidges,
    holidayWindow,
    tributaries,
    ghost,
    annotations,
    caption,
    legend,
  }
}

// ===========================================================================
// Offline loader: memoized like loadSharedFindingsReport, one fetch per shell
// ===========================================================================

interface RiverParts {
  world: World
  transactions: TransactionsFile
}

let partsLoad: Promise<RiverParts> | null = null

/**
 * world.json and transactions.json for the painting, fetched once for the
 * whole shell (the browser HTTP cache serves the second consumer anyway).
 * A failed load clears the memo so the next mount can retry instead of
 * inheriting the rejection forever.
 */
export function loadRiverParts(): Promise<RiverParts> {
  if (!partsLoad) {
    partsLoad = Promise.all([loadWorld(), loadTransactions()])
      .then(([world, transactions]) => ({ world, transactions }))
      .catch((cause: unknown) => {
        partsLoad = null
        throw cause
      })
  }
  return partsLoad
}

/** Load the parts and shape them against the report already in memory. */
export async function loadRiverScene(report: FindingsReport): Promise<RiverScene> {
  const { world, transactions } = await loadRiverParts()
  return buildRiverScene({ world, transactions, report })
}
