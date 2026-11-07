import { formatCents } from '../lib/format'
import { dataBase } from './loaders'

/**
 * Typed contract for public/data/findings.json (and model_card.json): the
 * landing summary for the stopgap panel plus the full report body the
 * FINDINGS view renders (question, method, F1 to F5 with chart twin slices,
 * limitations, model card). Validation follows loaders.ts: schema drift
 * between the Python pipeline and this app throws here instead of
 * rendering a blank or wrong panel.
 *
 * parseFindingsSummary is the original stopgap contract (five titles and
 * headline numbers) and stays byte for byte compatible with its rejection
 * matrix in findings.edge.test.ts. parseFindingsReport extends the same
 * guards to every field the report UI draws.
 */

/** Finding ids in report order. */
export type FindingId = 'F1' | 'F2' | 'F3' | 'F4' | 'F5'

/** One row of the landing summary. */
export interface FindingLine {
  /** Finding id in report order (F1 to F5). */
  id: string
  /** The finding's question, verbatim from findings.json. */
  title: string
  /** One headline number, formatted for display. */
  headline: string
}

/** Everything the findings landing panel renders. */
export interface FindingsSummary {
  /** Full synthetic data notice from findings meta (badge tooltip). */
  syntheticNotice: string
  lines: FindingLine[]
}

/** Section keys of findings.json in report order. */
const SECTIONS: readonly { id: string; key: string }[] = [
  { id: 'F1', key: 'f1StructuralVsDiscretionary' },
  { id: 'F2', key: 'f2Seasonality' },
  { id: 'F3', key: 'f3DeficitRisk' },
  { id: 'F4', key: 'f4PlaneChangeCost' },
  { id: 'F5', key: 'f5Interventions' },
]

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value as Record<string, unknown>
}

function asNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`)
  }
  return value
}

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
  return value
}

function asArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`)
  }
  return value
}

function asInteger(value: unknown, name: string): number {
  const number = asNumber(value, name)
  if (!Number.isInteger(number)) {
    throw new Error(`${name} must be an integer`)
  }
  return number
}

function stringList(value: unknown, name: string): string[] {
  return asArray(value, name).map((entry, index) => asString(entry, `${name}[${index}]`))
}

function numberList(value: unknown, name: string): number[] {
  return asArray(value, name).map((entry, index) => asNumber(entry, `${name}[${index}]`))
}

function questionOf(section: Record<string, unknown>, name: string): string {
  return asString(section.question, `${name}.question`)
}

function numbersOf(section: Record<string, unknown>, name: string): Record<string, unknown> {
  return asRecord(section.numbers, `${name}.numbers`)
}

function limitationsOf(section: Record<string, unknown>, name: string): string[] {
  return stringList(section.limitations, `${name}.limitations`)
}

function methodOf(section: Record<string, unknown>, name: string): string {
  return asString(section.method, `${name}.method`)
}

/** First sentence of the pipeline method text, used as the method one liner. */
function firstSentence(text: string): string {
  const stop = text.indexOf('. ')
  return stop < 0 ? text : text.slice(0, stop + 1)
}

function chartTwinOf(section: Record<string, unknown>, name: string): Record<string, unknown> {
  return asRecord(section.chartTwin, `${name}.chartTwin`)
}

function asClassification(value: unknown, name: string): 'structural' | 'discretionary' {
  const text = asString(value, name)
  if (text !== 'structural' && text !== 'discretionary') {
    throw new Error(`${name} must be structural or discretionary`)
  }
  return text
}

function recordList(
  value: unknown,
  name: string,
): Record<string, unknown>[] {
  return asArray(value, name).map((entry, index) => asRecord(entry, `${name}[${index}]`))
}

/** Build the one headline number for one finding (no charts, no prose). */
function headlineFor(id: string, raw: Record<string, unknown>): string {
  const headline = asRecord(raw.headline, 'findings.headline')
  const sectionName = SECTIONS.find((entry) => entry.id === id)?.key ?? id
  const section = asRecord(raw[sectionName], `findings.${sectionName}`)
  const numbers = numbersOf(section, sectionName)
  switch (id) {
    case 'F1': {
      const share = asNumber(headline.structuralSharePct, 'headline.structuralSharePct')
      const categories = headline.structuralCategories
      if (!Array.isArray(categories) || categories.length === 0) {
        throw new Error('headline.structuralCategories must be a non-empty array')
      }
      return `${share.toFixed(2)}% of annual spend is structural (${categories
        .map((name) => asString(name, 'headline.structuralCategories[]'))
        .join(', ')})`
    }
    case 'F2': {
      const category = asString(
        numbers.strongestCalendarCategory,
        `${sectionName}.numbers.strongestCalendarCategory`,
      )
      const lift = asNumber(
        numbers.strongestCalendarLift,
        `${sectionName}.numbers.strongestCalendarLift`,
      )
      return `${category} holiday lift ${lift.toFixed(2)}x (strongest calendar category)`
    }
    case 'F3': {
      const auc = asNumber(headline.deficitModelTestAuc, 'headline.deficitModelTestAuc')
      const splitDate = asString(headline.deficitModelSplitDate, 'headline.deficitModelSplitDate')
      return `test AUC ${auc.toFixed(3)} (time ordered split ${splitDate})`
    }
    case 'F4': {
      const gain = asNumber(
        headline.bestAlignedDrawdownImprovementCents,
        'headline.bestAlignedDrawdownImprovementCents',
      )
      const category = asString(
        headline.bestAlignedCategory,
        'headline.bestAlignedCategory',
      )
      const pct = asNumber(
        headline.bestAlignedDrawdownPctOfBaseline,
        'headline.bestAlignedDrawdownPctOfBaseline',
      )
      return `${formatCents(gain)} tighter drawdown aligning ${category} (${pct.toFixed(1)}% of baseline)`
    }
    case 'F5': {
      const gain = asNumber(
        headline.bestInterventionFloorGainCents,
        'headline.bestInterventionFloorGainCents',
      )
      const name = asString(
        headline.bestInterventionName,
        'headline.bestInterventionName',
      )
      return `${formatCents(gain)} floor gain from ${name}`
    }
    default:
      throw new Error(`unknown finding id ${id}`)
  }
}

/**
 * Validate a parsed findings.json payload and reduce it to the landing
 * summary: five titles, one headline number each, and the synthetic notice.
 */
export function parseFindingsSummary(raw: unknown): FindingsSummary {
  const root = asRecord(raw, 'findings')
  const meta = asRecord(root.meta, 'findings.meta')
  const syntheticNotice = asString(meta.syntheticNotice, 'findings.meta.syntheticNotice')
  const lines = SECTIONS.map((entry) => {
    const section = asRecord(root[entry.key], `findings.${entry.key}`)
    return {
      id: entry.id,
      title: questionOf(section, entry.key),
      headline: headlineFor(entry.id, root),
    }
  })
  return { syntheticNotice, lines }
}

/** Fetch and validate the bundled findings summary (offline booth friendly). */
export async function loadFindingsSummary(): Promise<FindingsSummary> {
  const response = await fetch(`${dataBase()}data/findings.json`)
  if (!response.ok) {
    throw new Error(`findings.json fetch failed with status ${response.status}`)
  }
  return parseFindingsSummary(await response.json())
}

// ===========================================================================
// Full report contract (FINDINGS landing view)
// ===========================================================================

/** Big readout number for one finding: value, plain label, supporting note. */
export interface ReportMetric {
  /** Short value for the display readout (for example 5.08%). */
  value: string
  /** What the value measures, sentence case. */
  label: string
  /** Supporting context line, sentence case. */
  note: string
}

/** Fields every finding section carries into the report UI. */
export interface ReportSectionBase {
  id: FindingId
  /** findings.json section key, for error messages and test asserts. */
  key: string
  /** The finding's question, verbatim. */
  question: string
  /** Full pipeline method text, verbatim. */
  method: string
  /** First sentence of the method, rendered as the method one liner. */
  methodOneLiner: string
  /** The pipeline's declared limitations for this finding. */
  limitations: string[]
  /** Legacy headline string from the stopgap contract. */
  headline: string
  /** Display readout built from this section's own numbers. */
  metric: ReportMetric
}

/** One per category bar of the F1 chart twin. */
export interface F1CategoryBar {
  name: string
  annualSpendCents: number
  debitRows: number
  classification: 'structural' | 'discretionary'
  eligibleForLagTest: boolean
  peakAcf: number
  peakLag: number
  threshold: number
  reason: string
}

/** One autocorrelation series of the F1 chart twin. */
export interface F1AcfSeries {
  name: string
  classification: 'structural' | 'discretionary'
  acf: number[]
  threshold: number
}

export interface F1Section extends ReportSectionBase {
  id: 'F1'
  structuralShareOfAnnualSpend: number
  discretionaryShareOfAnnualSpend: number
  totalAnnualSpendCents: number
  structuralSpendCents: number
  discretionarySpendCents: number
  structuralCategories: string[]
  discretionaryCategories: string[]
  lagWindowDays: [number, number]
  minimumDebitRows: number
  lags: number[]
  categoryBars: F1CategoryBar[]
  acfSeries: F1AcfSeries[]
}

/** One month share series of the F2 chart twin. */
export interface F2MonthSeries {
  name: string
  shares: number[]
}

export interface F2Section extends ReportSectionBase {
  id: 'F2'
  overallVerdict: string
  verdictSummary: string
  strongestCalendarCategory: string
  strongestCalendarLift: number
  strongestBehavioralCategory: string
  strongestBehavioralDeviation: number
  holidayWindowDays: number
  /** Holiday window start date (ISO) from the strongest category. */
  holidayWindowStart: string
  /** Holiday window end date (ISO) from the strongest category. */
  holidayWindowEnd: string
  holidayLiftThreshold: number
  weeklyDeviationThreshold: number
  minimumWeeklyRows: number
  monthLabels: string[]
  monthShares: F2MonthSeries[]
  /** Per category calendar share per month (baseline ticks on the chart). */
  calendarMonthShares: number[]
  /** Holiday window share for the strongest calendar category. */
  strongestHolidayShare: number
  /** Verdict for every category, in ledger order. */
  categoryVerdicts: { name: string; verdict: string }[]
}

export interface F3Confusion {
  trueNegative: number
  falsePositive: number
  falseNegative: number
  truePositive: number
}

export interface F3Coefficient {
  feature: string
  coefficient: number
  direction: string
}

export interface F3Section extends ReportSectionBase {
  id: 'F3'
  testAuc: number
  trainAuc: number
  accuracyAtHalf: number
  majorityAccuracy: number
  precisionAtHalf: number
  recallAtHalf: number
  f1AtHalf: number
  confusion: F3Confusion
  splitDate: string
  trainDays: number
  testDays: number
  trainEvents: number
  testEvents: number
  targetDefinition: string
  decisionRule: string
  robustnessAlternativeTestAuc: number
  selectedC: number
  randomSeed: number
  continuousFeatures: string[]
  rocFpr: number[]
  rocTpr: number[]
  /** Chart twin coefficient order (top 10 by magnitude). */
  chartCoefficientFeatures: string[]
  coefficients: F3Coefficient[]
}

/** One per category bar of the F4 chart twin. */
export interface F4Bar {
  name: string
  alignedDrawdownImprovementCents: number
  alignedTroughDeltaCents: number
  alignedFloorDeltaCents: number
  antiAlignedFloorDeltaCents: number
}

export interface F4Section extends ReportSectionBase {
  id: 'F4'
  definition: string
  baselinePeakCents: number
  baselineTroughCents: number
  baselineDrawdownCents: number
  baselineMinMonthEndCents: number
  baselineTroughDate: string
  bestAlignedCategory: string
  bestAlignedDrawdownImprovementCents: number
  bestAlignedDrawdownPctOfBaseline: number
  sumOfAlignedDrawdownImprovementsCents: number
  antiAlignedFloorCategory: string
  antiAlignedFloorLiftCents: number
  bars: F4Bar[]
  monthlySeriesForCategory: string
}

/** One ranked bar of the F5 chart twin. */
export interface F5Bar {
  id: string
  name: string
  rank: number
  minMonthEndDeltaCents: number
  drawdownImprovementCents: number
  troughDeltaCents: number
}

/** One simulated intervention with its declared definition and caveat. */
export interface F5Intervention {
  id: string
  name: string
  label: string
  definition: string
  caveat: string
  rank: number
  rankByDrawdown: number
  minMonthEndDeltaCents: number
  drawdownImprovementCents: number
  minMonthEndAfterCents: number
}

/** Honest null accounting for the auto save intervention. */
export interface F5AutoSaveAuxiliary {
  deficitDaysBaseline: number
  deficitDaysSimulated: number
  deficitDaysLifted: number
  deficitDaysCreated: number
  savedTotalCents: number
  releasedTotalCents: number
  releasedDays: number
  reserveEndCents: number
}

export interface F5Section extends ReportSectionBase {
  id: 'F5'
  rankingRule: string
  bestInterventionId: string
  bestInterventionName: string
  bestMinMonthEndImprovementCents: number
  topSurgeCategory: string
  topSurgeExcessCents: number
  rankingOrder: string[]
  bars: F5Bar[]
  interventions: F5Intervention[]
  autoSaveAuxiliary: F5AutoSaveAuxiliary
}

/** A parsed finding section, discriminated by id. */
export type ReportSection = F1Section | F2Section | F3Section | F4Section | F5Section

/** Report header facts from findings.json meta (provenance for the page). */
export interface ReportMeta {
  syntheticNotice: string
  seed: number
  generatedBy: string
  moneyUnit: string
  dateRange: { start: string; end: string }
  categoryCount: number
  dayCount: number
  transactionRowCount: number
  transactionSha256: string
  sourceCsvPath: string
  verification: string
  baselineCrossCheckMatches: boolean
}

/** Everything the report body renders. */
export interface FindingsReport {
  meta: ReportMeta
  sections: ReportSection[]
}

function metricF1(section: Record<string, unknown>, key: string): ReportMetric {
  const numbers = numbersOf(section, key)
  const share = asNumber(numbers.structuralShareOfAnnualSpend, `${key}.numbers.structuralShareOfAnnualSpend`)
  const structural = stringList(numbers.structuralCategories, `${key}.numbers.structuralCategories`)
  const structuralSpend = asInteger(numbers.structuralSpendCents, `${key}.numbers.structuralSpendCents`)
  const totalSpend = asInteger(numbers.totalAnnualSpendCents, `${key}.numbers.totalAnnualSpendCents`)
  return {
    value: `${(share * 100).toFixed(2)}%`,
    label: 'of annual spend is structural',
    note: `${structural.join(' and ')} account for ${formatCents(structuralSpend)} of ${formatCents(totalSpend)}`,
  }
}

function metricF2(section: Record<string, unknown>, key: string): ReportMetric {
  const numbers = numbersOf(section, key)
  const category = asString(numbers.strongestCalendarCategory, `${key}.numbers.strongestCalendarCategory`)
  const lift = asNumber(numbers.strongestCalendarLift, `${key}.numbers.strongestCalendarLift`)
  const windowDays = asInteger(numbers.holidayWindowDays, `${key}.numbers.holidayWindowDays`)
  const categories = recordList(section.categories, `${key}.categories`)
  const match = categories.find((entry) => entry.name === category)
  const holidayShare = match
    ? asNumber(
        asRecord(match.holidayWindow, `${key}.categories[].holidayWindow`).share,
        `${key}.categories[].holidayWindow.share`,
      )
    : 0
  return {
    value: `${lift.toFixed(2)}x`,
    label: `holiday lift for ${category} (strongest calendar category)`,
    note: `${(holidayShare * 100).toFixed(1)}% of ${category} spend lands in the ${windowDays} day holiday window`,
  }
}

function metricF3(section: Record<string, unknown>, key: string): ReportMetric {
  const numbers = numbersOf(section, key)
  const testAuc = asNumber(numbers.testAuc, `${key}.numbers.testAuc`)
  const trainAuc = asNumber(numbers.trainAuc, `${key}.numbers.trainAuc`)
  const splitDate = asString(numbers.splitDate, `${key}.numbers.splitDate`)
  return {
    value: testAuc.toFixed(3),
    label: 'test AUC from night-before features',
    note: `time ordered split ${splitDate}, train AUC ${trainAuc.toFixed(3)}`,
  }
}

function metricF4(
  root: Record<string, unknown>,
  section: Record<string, unknown>,
  key: string,
): ReportMetric {
  const numbers = numbersOf(section, key)
  const headline = asRecord(root.headline, 'findings.headline')
  const gain = asNumber(
    numbers.bestAlignedDrawdownImprovementCents,
    `${key}.numbers.bestAlignedDrawdownImprovementCents`,
  )
  const category = asString(numbers.bestAlignedCategory, `${key}.numbers.bestAlignedCategory`)
  const pct = asNumber(
    headline.bestAlignedDrawdownPctOfBaseline,
    'headline.bestAlignedDrawdownPctOfBaseline',
  )
  const baseline = asRecord(numbers.baseline, `${key}.numbers.baseline`)
  const drawdown = asInteger(baseline.drawdownCents, `${key}.numbers.baseline.drawdownCents`)
  return {
    value: `+${formatCents(gain)}`,
    label: `drawdown bought by aligning ${category}`,
    note: `${pct.toFixed(1)}% of the ${formatCents(drawdown)} baseline drawdown`,
  }
}

function metricF5(section: Record<string, unknown>, key: string): ReportMetric {
  const numbers = numbersOf(section, key)
  const gain = asInteger(numbers.bestMinMonthEndImprovementCents, `${key}.numbers.bestMinMonthEndImprovementCents`)
  const name = asString(numbers.bestInterventionName, `${key}.numbers.bestInterventionName`)
  const interventions = recordList(section.interventions, `${key}.interventions`)
  const best = interventions.find((entry) => entry.id === numbers.bestInterventionId)
  const after = best
    ? asInteger(
        asRecord(best.metrics, `${key}.interventions[].metrics`).minMonthEndAfterCents,
        `${key}.interventions[].metrics.minMonthEndAfterCents`,
      )
    : null
  const before = after === null ? null : after - gain
  return {
    value: `+${formatCents(gain)}`,
    label: 'lift of the minimum month end balance, rank 1 of 4',
    note:
      before === null
        ? name
        : `${name}: ${formatCents(before)} to ${formatCents(after as number)}`,
  }
}

function parseF1(root: Record<string, unknown>): F1Section {
  const key = 'f1StructuralVsDiscretionary'
  const section = asRecord(root[key], `findings.${key}`)
  const numbers = numbersOf(section, key)
  const method = methodOf(section, key)
  const chartTwin = chartTwinOf(section, key)
  const lags = numberList(chartTwin.lags, `${key}.chartTwin.lags`)
  const lagWindow = asArray(chartTwin.lagWindow, `${key}.chartTwin.lagWindow`)
  if (lagWindow.length !== 2) {
    throw new Error(`${key}.chartTwin.lagWindow must have two entries`)
  }
  const categoryBars = recordList(section.categories, `${key}.categories`).map((entry, index) => {
    const name = asString(entry.name, `${key}.categories[${index}].name`)
    const classification = asClassification(
      entry.classification,
      `${key}.categories[${index}].classification`,
    )
    return {
      name,
      annualSpendCents: asInteger(entry.annualSpendCents, `${key}.categories[${index}].annualSpendCents`),
      debitRows: asInteger(entry.debitRows, `${key}.categories[${index}].debitRows`),
      classification,
      eligibleForLagTest: entry.eligibleForLagTest === true,
      peakAcf: asNumber(entry.peakAcf, `${key}.categories[${index}].peakAcf`),
      peakLag: asInteger(entry.peakLag, `${key}.categories[${index}].peakLag`),
      threshold: asNumber(entry.threshold, `${key}.categories[${index}].threshold`),
      reason: asString(entry.reason, `${key}.categories[${index}].reason`),
    }
  })
  const acfSeries = recordList(chartTwin.series, `${key}.chartTwin.series`).map((entry, index) => {
    const classification = asClassification(
      entry.classification,
      `${key}.chartTwin.series[${index}].classification`,
    )
    const acf = numberList(entry.acf, `${key}.chartTwin.series[${index}].acf`)
    if (acf.length !== lags.length) {
      throw new Error(`${key}.chartTwin.series[${index}].acf must match chartTwin.lags in length`)
    }
    return {
      name: asString(entry.name, `${key}.chartTwin.series[${index}].name`),
      classification,
      acf,
      threshold: asNumber(entry.threshold, `${key}.chartTwin.series[${index}].threshold`),
    }
  })
  return {
    id: 'F1',
    key,
    question: questionOf(section, key),
    method,
    methodOneLiner: firstSentence(method),
    limitations: limitationsOf(section, key),
    headline: headlineFor('F1', root),
    metric: metricF1(section, key),
    structuralShareOfAnnualSpend: asNumber(
      numbers.structuralShareOfAnnualSpend,
      `${key}.numbers.structuralShareOfAnnualSpend`,
    ),
    discretionaryShareOfAnnualSpend: asNumber(
      numbers.discretionaryShareOfAnnualSpend,
      `${key}.numbers.discretionaryShareOfAnnualSpend`,
    ),
    totalAnnualSpendCents: asInteger(numbers.totalAnnualSpendCents, `${key}.numbers.totalAnnualSpendCents`),
    structuralSpendCents: asInteger(numbers.structuralSpendCents, `${key}.numbers.structuralSpendCents`),
    discretionarySpendCents: asInteger(
      numbers.discretionarySpendCents,
      `${key}.numbers.discretionarySpendCents`,
    ),
    structuralCategories: stringList(numbers.structuralCategories, `${key}.numbers.structuralCategories`),
    discretionaryCategories: stringList(
      numbers.discretionaryCategories,
      `${key}.numbers.discretionaryCategories`,
    ),
    lagWindowDays: [
      asInteger(lagWindow[0], `${key}.chartTwin.lagWindow[0]`),
      asInteger(lagWindow[1], `${key}.chartTwin.lagWindow[1]`),
    ],
    minimumDebitRows: asInteger(numbers.minimumDebitRows, `${key}.numbers.minimumDebitRows`),
    lags,
    categoryBars,
    acfSeries,
  }
}

function parseF2(root: Record<string, unknown>): F2Section {
  const key = 'f2Seasonality'
  const section = asRecord(root[key], `findings.${key}`)
  const numbers = numbersOf(section, key)
  const chartTwin = chartTwinOf(section, key)
  const strongest = asString(numbers.strongestCalendarCategory, `${key}.numbers.strongestCalendarCategory`)
  const monthLabels = stringList(chartTwin.monthLabels, `${key}.chartTwin.monthLabels`)
  const monthShares = recordList(chartTwin.monthShares, `${key}.chartTwin.monthShares`).map(
    (entry, index) => ({
      name: asString(entry.name, `${key}.chartTwin.monthShares[${index}].name`),
      shares: numberList(entry.shares, `${key}.chartTwin.monthShares[${index}].shares`),
    }),
  )
  const strongestSeries = monthShares.find((entry) => entry.name === strongest)
  if (!strongestSeries) {
    throw new Error(`${key}.chartTwin.monthShares must carry the strongest calendar category`)
  }
  if (strongestSeries.shares.length !== monthLabels.length) {
    throw new Error(`${key}.chartTwin.monthShares must match chartTwin.monthLabels in length`)
  }
  const categories = recordList(section.categories, `${key}.categories`)
  const strongestCategory = categories.find((entry) => entry.name === strongest)
  if (!strongestCategory) {
    throw new Error(`${key}.categories must carry the strongest calendar category`)
  }
  const calendarMonthShares = numberList(
    strongestCategory.monthDayShares,
    `${key}.categories[].monthDayShares`,
  )
  if (calendarMonthShares.length !== monthLabels.length) {
    throw new Error(`${key}.categories[].monthDayShares must match chartTwin.monthLabels in length`)
  }
  const holidayWindow = asRecord(strongestCategory.holidayWindow, `${key}.categories[].holidayWindow`)
  return {
    id: 'F2',
    key,
    question: questionOf(section, key),
    method: methodOf(section, key),
    methodOneLiner: firstSentence(methodOf(section, key)),
    limitations: limitationsOf(section, key),
    headline: headlineFor('F2', root),
    metric: metricF2(section, key),
    overallVerdict: asString(numbers.overallVerdict, `${key}.numbers.overallVerdict`),
    verdictSummary: asString(numbers.verdictSummary, `${key}.numbers.verdictSummary`),
    strongestCalendarCategory: strongest,
    strongestCalendarLift: asNumber(numbers.strongestCalendarLift, `${key}.numbers.strongestCalendarLift`),
    strongestBehavioralCategory: asString(
      numbers.strongestBehavioralCategory,
      `${key}.numbers.strongestBehavioralCategory`,
    ),
    strongestBehavioralDeviation: asNumber(
      numbers.strongestBehavioralDeviation,
      `${key}.numbers.strongestBehavioralDeviation`,
    ),
    holidayWindowDays: asInteger(numbers.holidayWindowDays, `${key}.numbers.holidayWindowDays`),
    holidayWindowStart: asString(holidayWindow.start, `${key}.categories[].holidayWindow.start`),
    holidayWindowEnd: asString(holidayWindow.end, `${key}.categories[].holidayWindow.end`),
    holidayLiftThreshold: asNumber(numbers.holidayLiftThreshold, `${key}.numbers.holidayLiftThreshold`),
    weeklyDeviationThreshold: asNumber(
      numbers.weeklyDeviationThreshold,
      `${key}.numbers.weeklyDeviationThreshold`,
    ),
    minimumWeeklyRows: asInteger(numbers.minimumWeeklyRows, `${key}.numbers.minimumWeeklyRows`),
    monthLabels,
    monthShares,
    calendarMonthShares,
    strongestHolidayShare: asNumber(holidayWindow.share, `${key}.categories[].holidayWindow.share`),
    categoryVerdicts: categories.map((entry, index) => ({
      name: asString(entry.name, `${key}.categories[${index}].name`),
      verdict: asString(entry.verdict, `${key}.categories[${index}].verdict`),
    })),
  }
}

function parseF3(root: Record<string, unknown>): F3Section {
  const key = 'f3DeficitRisk'
  const section = asRecord(root[key], `findings.${key}`)
  const numbers = numbersOf(section, key)
  const chartTwin = chartTwinOf(section, key)
  const roc = asRecord(chartTwin.roc, `${key}.chartTwin.roc`)
  const confusion = asRecord(numbers.confusion, `${key}.numbers.confusion`)
  const chartCoefficients = recordList(chartTwin.coefficients, `${key}.chartTwin.coefficients`)
  const coefficients = recordList(section.coefficients, `${key}.coefficients`).map(
    (entry, index) => ({
      feature: asString(entry.feature, `${key}.coefficients[${index}].feature`),
      coefficient: asNumber(
        entry.standardizedCoefficient,
        `${key}.coefficients[${index}].standardizedCoefficient`,
      ),
      direction: asString(entry.direction, `${key}.coefficients[${index}].direction`),
    }),
  )
  const byFeature = new Map(coefficients.map((entry) => [entry.feature, entry.coefficient]))
  const chartCoefficientFeatures = chartCoefficients.map((entry, index) => {
    const feature = asString(entry.feature, `${key}.chartTwin.coefficients[${index}].feature`)
    if (!byFeature.has(feature)) {
      throw new Error(`${key}.chartTwin.coefficients[${index}].feature must exist in ${key}.coefficients`)
    }
    return feature
  })
  return {
    id: 'F3',
    key,
    question: questionOf(section, key),
    method: methodOf(section, key),
    methodOneLiner: firstSentence(methodOf(section, key)),
    limitations: limitationsOf(section, key),
    headline: headlineFor('F3', root),
    metric: metricF3(section, key),
    testAuc: asNumber(chartTwin.auc, `${key}.chartTwin.auc`),
    trainAuc: asNumber(numbers.trainAuc, `${key}.numbers.trainAuc`),
    accuracyAtHalf: asNumber(numbers.accuracyAtHalf, `${key}.numbers.accuracyAtHalf`),
    majorityAccuracy: asNumber(numbers.majorityAccuracy, `${key}.numbers.majorityAccuracy`),
    precisionAtHalf: asNumber(numbers.precisionAtHalf, `${key}.numbers.precisionAtHalf`),
    recallAtHalf: asNumber(numbers.recallAtHalf, `${key}.numbers.recallAtHalf`),
    f1AtHalf: asNumber(numbers.f1AtHalf, `${key}.numbers.f1AtHalf`),
    confusion: {
      trueNegative: asInteger(confusion.trueNegative, `${key}.numbers.confusion.trueNegative`),
      falsePositive: asInteger(confusion.falsePositive, `${key}.numbers.confusion.falsePositive`),
      falseNegative: asInteger(confusion.falseNegative, `${key}.numbers.confusion.falseNegative`),
      truePositive: asInteger(confusion.truePositive, `${key}.numbers.confusion.truePositive`),
    },
    splitDate: asString(numbers.splitDate, `${key}.numbers.splitDate`),
    trainDays: asInteger(numbers.trainDays, `${key}.numbers.trainDays`),
    testDays: asInteger(numbers.testDays, `${key}.numbers.testDays`),
    trainEvents: asInteger(numbers.trainEvents, `${key}.numbers.trainEvents`),
    testEvents: asInteger(numbers.testEvents, `${key}.numbers.testEvents`),
    targetDefinition: asString(numbers.targetDefinition, `${key}.numbers.targetDefinition`),
    decisionRule: asString(numbers.decisionRule, `${key}.numbers.decisionRule`),
    robustnessAlternativeTestAuc: asNumber(
      numbers.robustnessAlternativeTestAuc,
      `${key}.numbers.robustnessAlternativeTestAuc`,
    ),
    selectedC: asNumber(numbers.selectedC, `${key}.numbers.selectedC`),
    randomSeed: asInteger(numbers.randomSeed, `${key}.numbers.randomSeed`),
    continuousFeatures: stringList(numbers.continuousFeatures, `${key}.numbers.continuousFeatures`),
    rocFpr: numberList(roc.fpr, `${key}.chartTwin.roc.fpr`),
    rocTpr: numberList(roc.tpr, `${key}.chartTwin.roc.tpr`),
    chartCoefficientFeatures,
    coefficients,
  }
}

function parseF4(root: Record<string, unknown>): F4Section {
  const key = 'f4PlaneChangeCost'
  const section = asRecord(root[key], `findings.${key}`)
  const numbers = numbersOf(section, key)
  const chartTwin = chartTwinOf(section, key)
  const baseline = asRecord(numbers.baseline, `${key}.numbers.baseline`)
  const bars = recordList(chartTwin.bars, `${key}.chartTwin.bars`).map((entry, index) => ({
    name: asString(entry.name, `${key}.chartTwin.bars[${index}].name`),
    alignedDrawdownImprovementCents: asInteger(
      entry.alignedDrawdownImprovementCents,
      `${key}.chartTwin.bars[${index}].alignedDrawdownImprovementCents`,
    ),
    alignedTroughDeltaCents: asInteger(
      entry.alignedTroughDeltaCents,
      `${key}.chartTwin.bars[${index}].alignedTroughDeltaCents`,
    ),
    alignedFloorDeltaCents: asInteger(
      entry.alignedFloorDeltaCents,
      `${key}.chartTwin.bars[${index}].alignedFloorDeltaCents`,
    ),
    antiAlignedFloorDeltaCents: asInteger(
      entry.antiAlignedFloorDeltaCents,
      `${key}.chartTwin.bars[${index}].antiAlignedFloorDeltaCents`,
    ),
  }))
  return {
    id: 'F4',
    key,
    question: questionOf(section, key),
    method: methodOf(section, key),
    methodOneLiner: firstSentence(methodOf(section, key)),
    limitations: limitationsOf(section, key),
    headline: headlineFor('F4', root),
    metric: metricF4(root, section, key),
    definition: asString(section.definition, `${key}.definition`),
    baselinePeakCents: asInteger(baseline.peakCents, `${key}.numbers.baseline.peakCents`),
    baselineTroughCents: asInteger(baseline.troughCents, `${key}.numbers.baseline.troughCents`),
    baselineDrawdownCents: asInteger(baseline.drawdownCents, `${key}.numbers.baseline.drawdownCents`),
    baselineMinMonthEndCents: asInteger(
      baseline.minMonthEndCents,
      `${key}.numbers.baseline.minMonthEndCents`,
    ),
    baselineTroughDate: asString(numbers.baselineTroughDate, `${key}.numbers.baselineTroughDate`),
    bestAlignedCategory: asString(numbers.bestAlignedCategory, `${key}.numbers.bestAlignedCategory`),
    bestAlignedDrawdownImprovementCents: asInteger(
      numbers.bestAlignedDrawdownImprovementCents,
      `${key}.numbers.bestAlignedDrawdownImprovementCents`,
    ),
    bestAlignedDrawdownPctOfBaseline: asNumber(
      asRecord(root.headline, 'findings.headline').bestAlignedDrawdownPctOfBaseline,
      'headline.bestAlignedDrawdownPctOfBaseline',
    ),
    sumOfAlignedDrawdownImprovementsCents: asInteger(
      numbers.sumOfAlignedDrawdownImprovementsCents,
      `${key}.numbers.sumOfAlignedDrawdownImprovementsCents`,
    ),
    antiAlignedFloorCategory: asString(
      numbers.antiAlignedFloorCategory,
      `${key}.numbers.antiAlignedFloorCategory`,
    ),
    antiAlignedFloorLiftCents: asInteger(
      numbers.antiAlignedFloorLiftCents,
      `${key}.numbers.antiAlignedFloorLiftCents`,
    ),
    bars,
    monthlySeriesForCategory: asString(
      chartTwin.monthlySeriesForCategory,
      `${key}.chartTwin.monthlySeriesForCategory`,
    ),
  }
}

function parseF5(root: Record<string, unknown>): F5Section {
  const key = 'f5Interventions'
  const section = asRecord(root[key], `findings.${key}`)
  const numbers = numbersOf(section, key)
  const chartTwin = chartTwinOf(section, key)
  const bars = recordList(chartTwin.bars, `${key}.chartTwin.bars`).map((entry, index) => ({
    id: asString(entry.id, `${key}.chartTwin.bars[${index}].id`),
    name: asString(entry.name, `${key}.chartTwin.bars[${index}].name`),
    rank: asInteger(entry.rank, `${key}.chartTwin.bars[${index}].rank`),
    minMonthEndDeltaCents: asInteger(
      entry.minMonthEndDeltaCents,
      `${key}.chartTwin.bars[${index}].minMonthEndDeltaCents`,
    ),
    drawdownImprovementCents: asInteger(
      entry.drawdownImprovementCents,
      `${key}.chartTwin.bars[${index}].drawdownImprovementCents`,
    ),
    troughDeltaCents: asInteger(entry.troughDeltaCents, `${key}.chartTwin.bars[${index}].troughDeltaCents`),
  }))
  const interventions = recordList(section.interventions, `${key}.interventions`).map(
    (entry, index) => {
      const metrics = asRecord(entry.metrics, `${key}.interventions[${index}].metrics`)
      return {
        id: asString(entry.id, `${key}.interventions[${index}].id`),
        name: asString(entry.name, `${key}.interventions[${index}].name`),
        label: asString(entry.label, `${key}.interventions[${index}].label`),
        definition: asString(entry.definition, `${key}.interventions[${index}].definition`),
        caveat: asString(entry.caveat, `${key}.interventions[${index}].caveat`),
        rank: asInteger(entry.rank, `${key}.interventions[${index}].rank`),
        rankByDrawdown: asInteger(entry.rankByDrawdown, `${key}.interventions[${index}].rankByDrawdown`),
        minMonthEndDeltaCents: asInteger(
          metrics.minMonthEndDeltaCents,
          `${key}.interventions[${index}].metrics.minMonthEndDeltaCents`,
        ),
        drawdownImprovementCents: asInteger(
          metrics.drawdownImprovementCents,
          `${key}.interventions[${index}].metrics.drawdownImprovementCents`,
        ),
        minMonthEndAfterCents: asInteger(
          metrics.minMonthEndAfterCents,
          `${key}.interventions[${index}].metrics.minMonthEndAfterCents`,
        ),
      }
    },
  )
  const auxiliary = asRecord(chartTwin.autoSaveAuxiliary, `${key}.chartTwin.autoSaveAuxiliary`)
  return {
    id: 'F5',
    key,
    question: questionOf(section, key),
    method: methodOf(section, key),
    methodOneLiner: firstSentence(methodOf(section, key)),
    limitations: limitationsOf(section, key),
    headline: headlineFor('F5', root),
    metric: metricF5(section, key),
    rankingRule: asString(section.rankingRule, `${key}.rankingRule`),
    bestInterventionId: asString(numbers.bestInterventionId, `${key}.numbers.bestInterventionId`),
    bestInterventionName: asString(numbers.bestInterventionName, `${key}.numbers.bestInterventionName`),
    bestMinMonthEndImprovementCents: asInteger(
      numbers.bestMinMonthEndImprovementCents,
      `${key}.numbers.bestMinMonthEndImprovementCents`,
    ),
    topSurgeCategory: asString(numbers.topSurgeCategory, `${key}.numbers.topSurgeCategory`),
    topSurgeExcessCents: asInteger(numbers.topSurgeExcessCents, `${key}.numbers.topSurgeExcessCents`),
    rankingOrder: stringList(numbers.rankingOrder, `${key}.numbers.rankingOrder`),
    bars,
    interventions,
    autoSaveAuxiliary: {
      deficitDaysBaseline: asInteger(
        auxiliary.deficitDaysBaseline,
        `${key}.chartTwin.autoSaveAuxiliary.deficitDaysBaseline`,
      ),
      deficitDaysSimulated: asInteger(
        auxiliary.deficitDaysSimulated,
        `${key}.chartTwin.autoSaveAuxiliary.deficitDaysSimulated`,
      ),
      deficitDaysLifted: asInteger(
        auxiliary.deficitDaysLifted,
        `${key}.chartTwin.autoSaveAuxiliary.deficitDaysLifted`,
      ),
      deficitDaysCreated: asInteger(
        auxiliary.deficitDaysCreated,
        `${key}.chartTwin.autoSaveAuxiliary.deficitDaysCreated`,
      ),
      savedTotalCents: asInteger(
        auxiliary.savedTotalCents,
        `${key}.chartTwin.autoSaveAuxiliary.savedTotalCents`,
      ),
      releasedTotalCents: asInteger(
        auxiliary.releasedTotalCents,
        `${key}.chartTwin.autoSaveAuxiliary.releasedTotalCents`,
      ),
      releasedDays: asInteger(auxiliary.releasedDays, `${key}.chartTwin.autoSaveAuxiliary.releasedDays`),
      reserveEndCents: asInteger(
        auxiliary.reserveEndCents,
        `${key}.chartTwin.autoSaveAuxiliary.reserveEndCents`,
      ),
    },
  }
}

function parseReportMeta(raw: Record<string, unknown>): ReportMeta {
  const meta = asRecord(raw.meta, 'findings.meta')
  const dateRange = asRecord(meta.dateRange, 'findings.meta.dateRange')
  const sources = asRecord(meta.sources, 'findings.meta.sources')
  const transactions = asRecord(sources.transactions, 'findings.meta.sources.transactions')
  const world = asRecord(sources.world, 'findings.meta.sources.world')
  const crossCheck = asRecord(meta.baselineCrossCheck, 'findings.meta.baselineCrossCheck')
  return {
    syntheticNotice: asString(meta.syntheticNotice, 'findings.meta.syntheticNotice'),
    seed: asInteger(meta.seed, 'findings.meta.seed'),
    generatedBy: asString(meta.generatedBy, 'findings.meta.generatedBy'),
    moneyUnit: asString(meta.moneyUnit, 'findings.meta.moneyUnit'),
    dateRange: {
      start: asString(dateRange.start, 'findings.meta.dateRange.start'),
      end: asString(dateRange.end, 'findings.meta.dateRange.end'),
    },
    categoryCount: asInteger(meta.categoryCount, 'findings.meta.categoryCount'),
    dayCount: asInteger(meta.dayCount, 'findings.meta.dayCount'),
    transactionRowCount: asInteger(transactions.rowCount, 'findings.meta.sources.transactions.rowCount'),
    transactionSha256: asString(transactions.sha256, 'findings.meta.sources.transactions.sha256'),
    sourceCsvPath: asString(world.sourceCsvPath, 'findings.meta.sources.world.sourceCsvPath'),
    verification: asString(meta.verification, 'findings.meta.verification'),
    baselineCrossCheckMatches: crossCheck.matches === true,
  }
}

/**
 * Validate a parsed findings.json payload as the full report: meta facts,
 * then F1 to F5 with every field the report UI draws (question, method,
 * numbers, chart twin slices, limitations).
 */
export function parseFindingsReport(raw: unknown): FindingsReport {
  const root = asRecord(raw, 'findings')
  const meta = parseReportMeta(root)
  const sections: ReportSection[] = [
    parseF1(root),
    parseF2(root),
    parseF3(root),
    parseF4(root),
    parseF5(root),
  ]
  return { meta, sections }
}

/** Fetch and validate the bundled full report (offline booth friendly). */
export async function loadFindingsReport(): Promise<FindingsReport> {
  const response = await fetch(`${dataBase()}data/findings.json`)
  if (!response.ok) {
    throw new Error(`findings.json fetch failed with status ${response.status}`)
  }
  return parseFindingsReport(await response.json())
}

// ===========================================================================
// Model card contract (public/data/model_card.json, emitted with F3)
// ===========================================================================

/** One standardized coefficient of the deficit model. */
export interface ModelCoefficient {
  feature: string
  standardizedCoefficient: number
  direction: string
}

/** The model card the report renders under F3. */
export interface ModelCard {
  modelName: string
  modelType: string
  modelVersion: string
  framework: string
  randomSeed: number
  data: {
    source: string
    syntheticNotice: string
    rowCount: number
    dateRange: { start: string; end: string }
    rowsModeled: number
    target: string
    nightBeforeRule: string
    excludedByDesign: string
    continuousFeatures: string[]
  }
  split: {
    type: string
    splitDate: string
    trainDays: number
    testDays: number
    trainEvents: number
    testEvents: number
    selectedC: number
  }
  metrics: {
    trainAuc: number
    testAuc: number
    accuracyAtHalf: number
    majorityAccuracy: number
    precisionAtHalf: number
    recallAtHalf: number
    f1AtHalf: number
    confusion: F3Confusion
    robustnessAlternativeTestAuc: number
  }
  intendedUse: string
  notIntendedUse: string[]
  limitations: string[]
  fairnessCaveats: string[]
  correlationNotCausation: string
  topCoefficients: ModelCoefficient[]
}

/** Validate a parsed model card payload (schema drift fails loudly). */
export function parseModelCard(raw: unknown): ModelCard {
  const root = asRecord(raw, 'modelCard')
  const modelName = asString(root.modelName, 'modelCard.modelName')
  const data = asRecord(root.data, 'modelCard.data')
  const dateRange = asRecord(data.dateRange, 'modelCard.data.dateRange')
  const features = asRecord(data.features, 'modelCard.data.features')
  const split = asRecord(root.split, 'modelCard.split')
  const metrics = asRecord(root.metrics, 'modelCard.metrics')
  const confusion = asRecord(metrics.confusion, 'modelCard.metrics.confusion')
  return {
    modelName,
    modelType: asString(root.modelType, 'modelCard.modelType'),
    modelVersion: asString(root.modelVersion, 'modelCard.modelVersion'),
    framework: asString(root.framework, 'modelCard.framework'),
    randomSeed: asInteger(root.randomSeed, 'modelCard.randomSeed'),
    data: {
      source: asString(data.source, 'modelCard.data.source'),
      syntheticNotice: asString(data.syntheticNotice, 'modelCard.data.syntheticNotice'),
      rowCount: asInteger(data.rowCount, 'modelCard.data.rowCount'),
      dateRange: {
        start: asString(dateRange.start, 'modelCard.data.dateRange.start'),
        end: asString(dateRange.end, 'modelCard.data.dateRange.end'),
      },
      rowsModeled: asInteger(data.rowsModeled, 'modelCard.data.rowsModeled'),
      target: asString(data.target, 'modelCard.data.target'),
      nightBeforeRule: asString(
        features.nightBeforeRule,
        'modelCard.data.features.nightBeforeRule',
      ),
      excludedByDesign: asString(
        features.excludedByDesign,
        'modelCard.data.features.excludedByDesign',
      ),
      continuousFeatures: stringList(
        features.continuous,
        'modelCard.data.features.continuous',
      ),
    },
    split: {
      type: asString(split.type, 'modelCard.split.type'),
      splitDate: asString(split.splitDate, 'modelCard.split.splitDate'),
      trainDays: asInteger(split.trainDays, 'modelCard.split.trainDays'),
      testDays: asInteger(split.testDays, 'modelCard.split.testDays'),
      trainEvents: asInteger(split.trainEvents, 'modelCard.split.trainEvents'),
      testEvents: asInteger(split.testEvents, 'modelCard.split.testEvents'),
      selectedC: asNumber(split.selectedC, 'modelCard.split.selectedC'),
    },
    metrics: {
      trainAuc: asNumber(metrics.trainAuc, 'modelCard.metrics.trainAuc'),
      testAuc: asNumber(metrics.testAuc, 'modelCard.metrics.testAuc'),
      accuracyAtHalf: asNumber(metrics.accuracyAtHalf, 'modelCard.metrics.accuracyAtHalf'),
      majorityAccuracy: asNumber(metrics.majorityAccuracy, 'modelCard.metrics.majorityAccuracy'),
      precisionAtHalf: asNumber(metrics.precisionAtHalf, 'modelCard.metrics.precisionAtHalf'),
      recallAtHalf: asNumber(metrics.recallAtHalf, 'modelCard.metrics.recallAtHalf'),
      f1AtHalf: asNumber(metrics.f1AtHalf, 'modelCard.metrics.f1AtHalf'),
      confusion: {
        trueNegative: asInteger(confusion.trueNegative, 'modelCard.metrics.confusion.trueNegative'),
        falsePositive: asInteger(confusion.falsePositive, 'modelCard.metrics.confusion.falsePositive'),
        falseNegative: asInteger(confusion.falseNegative, 'modelCard.metrics.confusion.falseNegative'),
        truePositive: asInteger(confusion.truePositive, 'modelCard.metrics.confusion.truePositive'),
      },
      robustnessAlternativeTestAuc: asNumber(
        metrics.robustnessAlternativeTestAuc,
        'modelCard.metrics.robustnessAlternativeTestAuc',
      ),
    },
    intendedUse: asString(root.intendedUse, 'modelCard.intendedUse'),
    notIntendedUse: stringList(root.notIntendedUse, 'modelCard.notIntendedUse'),
    limitations: stringList(root.limitations, 'modelCard.limitations'),
    fairnessCaveats: stringList(root.fairnessCaveats, 'modelCard.fairnessCaveats'),
    correlationNotCausation: asString(
      root.correlationNotCausation,
      'modelCard.correlationNotCausation',
    ),
    topCoefficients: recordList(root.topCoefficients, 'modelCard.topCoefficients').map(
      (entry, index) => ({
        feature: asString(entry.feature, `modelCard.topCoefficients[${index}].feature`),
        standardizedCoefficient: asNumber(
          entry.standardizedCoefficient,
          `modelCard.topCoefficients[${index}].standardizedCoefficient`,
        ),
        direction: asString(entry.direction, `modelCard.topCoefficients[${index}].direction`),
      }),
    ),
  }
}

/** Fetch and validate the bundled model card (offline booth friendly). */
export async function loadModelCard(): Promise<ModelCard> {
  const response = await fetch(`${dataBase()}data/model_card.json`)
  if (!response.ok) {
    throw new Error(`model_card.json fetch failed with status ${response.status}`)
  }
  return parseModelCard(await response.json())
}
