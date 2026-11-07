import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseFindingsSummary } from './findings'

/**
 * Rejection matrix for the findings.json parser, complementing
 * FindingsView.test.ts: every guard (asRecord, asString, asNumber) must
 * throw a schema drift error instead of rendering a blank or wrong
 * headline. Each test starts from the shipped artifact and corrupts one
 * field, so a payload that parses here would be a pipeline regression.
 */

function readFindings(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(new URL('../../public/data/findings.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown>
}

function headline(base: Record<string, unknown>): Record<string, unknown> {
  return base.headline as Record<string, unknown>
}

describe('findings parser rejection matrix', () => {
  it('accepts the shipped artifact (premise of every corruption below)', () => {
    const summary = parseFindingsSummary(readFindings())
    expect(summary.lines).toHaveLength(5)
    expect(summary.syntheticNotice.length).toBeGreaterThan(0)
  })

  it('rejects a root that is not an object', () => {
    expect(() => parseFindingsSummary(null)).toThrow('findings must be an object')
    expect(() => parseFindingsSummary([])).toThrow('findings must be an object')
    expect(() => parseFindingsSummary('findings')).toThrow('findings must be an object')
    expect(() => parseFindingsSummary(42)).toThrow('findings must be an object')
  })

  it('rejects a missing or malformed meta block', () => {
    const missingMeta = readFindings()
    delete missingMeta.meta
    expect(() => parseFindingsSummary(missingMeta)).toThrow('findings.meta must be an object')

    const arrayMeta = readFindings()
    arrayMeta.meta = []
    expect(() => parseFindingsSummary(arrayMeta)).toThrow('findings.meta must be an object')

    const noticeNumber = readFindings()
    ;(noticeNumber.meta as Record<string, unknown>).syntheticNotice = 42
    expect(() => parseFindingsSummary(noticeNumber)).toThrow(
      'findings.meta.syntheticNotice must be a non-empty string',
    )

    const noticeEmpty = readFindings()
    ;(noticeEmpty.meta as Record<string, unknown>).syntheticNotice = ''
    expect(() => parseFindingsSummary(noticeEmpty)).toThrow(
      'findings.meta.syntheticNotice must be a non-empty string',
    )
  })

  it('rejects missing or mistyped sections', () => {
    const missingSection = readFindings()
    delete missingSection.f1StructuralVsDiscretionary
    expect(() => parseFindingsSummary(missingSection)).toThrow(
      'findings.f1StructuralVsDiscretionary must be an object',
    )

    const stringSection = readFindings()
    stringSection.f3DeficitRisk = 'drifted'
    expect(() => parseFindingsSummary(stringSection)).toThrow(
      'findings.f3DeficitRisk must be an object',
    )

    const arrayNumbers = readFindings()
    delete (arrayNumbers.f5Interventions as Record<string, unknown>).numbers
    expect(() => parseFindingsSummary(arrayNumbers)).toThrow(
      'f5Interventions.numbers must be an object',
    )
  })

  it('rejects missing, empty, or mistyped questions', () => {
    const missingQuestion = readFindings()
    delete (missingQuestion.f2Seasonality as Record<string, unknown>).question
    expect(() => parseFindingsSummary(missingQuestion)).toThrow(
      'f2Seasonality.question must be a non-empty string',
    )

    const numberQuestion = readFindings()
    ;(numberQuestion.f4PlaneChangeCost as Record<string, unknown>).question = 7
    expect(() => parseFindingsSummary(numberQuestion)).toThrow(
      'f4PlaneChangeCost.question must be a non-empty string',
    )
  })

  it('rejects a missing or array headline block', () => {
    const missingHeadline = readFindings()
    delete missingHeadline.headline
    expect(() => parseFindingsSummary(missingHeadline)).toThrow(
      'findings.headline must be an object',
    )

    const arrayHeadline = readFindings()
    arrayHeadline.headline = []
    expect(() => parseFindingsSummary(arrayHeadline)).toThrow(
      'findings.headline must be an object',
    )
  })

  it('rejects NaN, Infinity, and string numbers in headline fields', () => {
    const nanShare = readFindings()
    headline(nanShare).structuralSharePct = Number.NaN
    expect(() => parseFindingsSummary(nanShare)).toThrow(
      'headline.structuralSharePct must be a finite number',
    )

    const infiniteShare = readFindings()
    headline(infiniteShare).structuralSharePct = Number.POSITIVE_INFINITY
    expect(() => parseFindingsSummary(infiniteShare)).toThrow(
      'headline.structuralSharePct must be a finite number',
    )

    const stringShare = readFindings()
    headline(stringShare).structuralSharePct = '12.5'
    expect(() => parseFindingsSummary(stringShare)).toThrow(
      'headline.structuralSharePct must be a finite number',
    )

    const nanAuc = readFindings()
    headline(nanAuc).deficitModelTestAuc = Number.NaN
    expect(() => parseFindingsSummary(nanAuc)).toThrow(
      'headline.deficitModelTestAuc must be a finite number',
    )

    const nanGain = readFindings()
    headline(nanGain).bestAlignedDrawdownImprovementCents = null
    expect(() => parseFindingsSummary(nanGain)).toThrow(
      'headline.bestAlignedDrawdownImprovementCents must be a finite number',
    )

    const nanPct = readFindings()
    headline(nanPct).bestAlignedDrawdownPctOfBaseline = Number.NaN
    expect(() => parseFindingsSummary(nanPct)).toThrow(
      'headline.bestAlignedDrawdownPctOfBaseline must be a finite number',
    )

    const nanFloor = readFindings()
    headline(nanFloor).bestInterventionFloorGainCents = Number.NaN
    expect(() => parseFindingsSummary(nanFloor)).toThrow(
      'headline.bestInterventionFloorGainCents must be a finite number',
    )
  })

  it('rejects empty, missing, or mistyped headline strings', () => {
    const emptySplit = readFindings()
    headline(emptySplit).deficitModelSplitDate = ''
    expect(() => parseFindingsSummary(emptySplit)).toThrow(
      'headline.deficitModelSplitDate must be a non-empty string',
    )

    const emptyName = readFindings()
    headline(emptyName).bestInterventionName = ''
    expect(() => parseFindingsSummary(emptyName)).toThrow(
      'headline.bestInterventionName must be a non-empty string',
    )

    const numberCategory = readFindings()
    headline(numberCategory).bestAlignedCategory = 9
    expect(() => parseFindingsSummary(numberCategory)).toThrow(
      'headline.bestAlignedCategory must be a non-empty string',
    )
  })

  it('rejects an empty or mistyped structural category list', () => {
    const emptyList = readFindings()
    headline(emptyList).structuralCategories = []
    expect(() => parseFindingsSummary(emptyList)).toThrow(
      'headline.structuralCategories must be a non-empty array',
    )

    const mixedList = readFindings()
    headline(mixedList).structuralCategories = ['Subscriptions', 7]
    expect(() => parseFindingsSummary(mixedList)).toThrow(
      'headline.structuralCategories[] must be a non-empty string',
    )
  })

  it('rejects NaN inside section numbers', () => {
    const nanLift = readFindings()
    ;(nanLift.f2Seasonality as { numbers: Record<string, unknown> }).numbers.strongestCalendarLift =
      Number.NaN
    expect(() => parseFindingsSummary(nanLift)).toThrow(
      'f2Seasonality.numbers.strongestCalendarLift must be a finite number',
    )

    const missingCategory = readFindings()
    delete (missingCategory.f2Seasonality as { numbers: Record<string, unknown> }).numbers
      .strongestCalendarCategory
    expect(() => parseFindingsSummary(missingCategory)).toThrow(
      'f2Seasonality.numbers.strongestCalendarCategory must be a non-empty string',
    )
  })
})
