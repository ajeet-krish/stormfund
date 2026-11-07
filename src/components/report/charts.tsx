import type { CSSProperties } from 'react'
import { formatCents } from '../../lib/format'
import type { F1Section, F2Section, F3Section, F4Section, F5Section } from '../../data/findings'

/**
 * Hand rolled SVG chart twins for the findings report: no chart library,
 * no canvas, no network. Every series comes from findings.json through the
 * typed parser, so a chart can only draw numbers the pipeline published.
 *
 * Each chart returns a bare <svg> that FindingSection wraps in a figure
 * with a title, a legend, and a caption. viewBox plus width 100 percent
 * keeps them responsive; the figure scrolls horizontally on small screens
 * so the labels never shrink below readable size.
 */

/** Safe indexed read for the strict noUncheckedIndexedAccess compiler. */
function at(values: readonly number[], index: number): number {
  return values[index] ?? 0
}

function signedMoney(cents: number): string {
  return cents > 0 ? `+${formatCents(cents)}` : formatCents(cents)
}

/** Axis tick label in whole dollars (for example -$400, $1,000). */
function axisDollars(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${Math.abs(Math.round(cents / 100)).toLocaleString('en-CA')}`
}

/** Stagger delay for one chart element (the CSS reads the custom property). */
function delayStyle(ms: number): CSSProperties {
  return { '--rp-delay': `${ms}ms` } as CSSProperties
}

// ===========================================================================
// Axis derivation: every scale in this file is a function of the data it
// draws, so a future dataset can never be silently clipped by a domain
// pinned to the shipped fixture. The domain helpers are exported for the
// contract tests in charts.test.ts.
// ===========================================================================

interface Axis {
  min: number
  max: number
  ticks: number[]
}

/** Step from the 1, 2, 5, 10 family whose tick count is nearest target. */
function niceStep(span: number, targetTicks: number): number {
  const rough = Math.max(span / targetTicks, Number.MIN_VALUE)
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  let best = 10 * magnitude
  let bestDiff = Number.POSITIVE_INFINITY
  for (const factor of [1, 2, 5, 10]) {
    const step = factor * magnitude
    const count = Math.max(1, Math.round(span / step))
    const diff = Math.abs(count - targetTicks)
    if (diff < bestDiff || (diff === bestDiff && step > best)) {
      best = step
      bestDiff = diff
    }
  }
  return best
}

/**
 * Padded axis over plotted values: 5 percent headroom per side, bounds
 * snapped outward to a round step sized for about five ticks.
 * Exported for the domain contract tests.
 */
export function derivedAxis(values: readonly number[], targetTicks = 5): Axis {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) {
    return { min: -1, max: 1, ticks: [0] }
  }
  let min = Math.min(...finite)
  let max = Math.max(...finite)
  if (max - min < 1e-9) {
    // Every plotted value is identical: open a one unit window so the
    // scale has somewhere to divide.
    min -= 1
    max += 1
  }
  const pad = (max - min) * 0.05
  const paddedMin = min - pad
  const paddedMax = max + pad
  const step = niceStep(paddedMax - paddedMin, targetTicks)
  const axisMin = Math.floor(paddedMin / step) * step
  const axisMax = Math.ceil(paddedMax / step) * step
  const ticks: number[] = []
  for (let k = Math.ceil(axisMin / step); k <= Math.floor(axisMax / step); k += 1) {
    const tick = k * step
    ticks.push(tick === 0 ? 0 : tick)
  }
  return { min: axisMin, max: axisMax, ticks }
}

/**
 * Sparkline window over every plotted acf value and threshold line, with
 * 8 percent padding per side and zero always inside so the baseline and
 * threshold rules stay in frame. Exported for the domain contract tests.
 */
export function f1AcfDomain(section: F1Section): { min: number; max: number } {
  const values = section.acfSeries.flatMap((series) => [...series.acf, series.threshold])
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const pad = Math.max(max - min, 1e-6) * 0.08
  return { min: min - pad, max: max + pad }
}

/**
 * Gridline ticks for the drawdown waterfall: a round step counted up from
 * the baseline the bars grow from, never above it. Exported for the
 * domain contract tests.
 */
export function f4GridTicks(baselineCents: number): number[] {
  if (!Number.isFinite(baselineCents) || baselineCents <= 0) {
    return []
  }
  const step = niceStep(baselineCents, 5)
  const ticks: number[] = []
  for (let k = 1; k * step <= baselineCents; k += 1) {
    ticks.push(k * step)
  }
  return ticks
}

/**
 * Dollar axis for the ranked intervention bars: derived from every plotted
 * floor lift and drawdown value, so no bar can be clamped off the scale.
 * Exported for the domain contract tests.
 */
export function f5Axis(section: F5Section): Axis {
  const values = section.bars.flatMap((bar) => [
    bar.minMonthEndDeltaCents,
    bar.drawdownImprovementCents,
  ])
  // Zero rides along so the baseline always stays inside the frame and
  // every bar keeps growing from it.
  return derivedAxis([0, ...values])
}

const DISPLAY =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

const CHART_FONT = { fontFamily: DISPLAY }

// ===========================================================================
// F1: structural share strip, per category spend bars, lag autocorrelation
// ===========================================================================

const F1_W = 640
const F1_ROW_H = 42
const F1_TOP = 64
const F1_NAME_X = 0
const F1_BAR_X = 100
const F1_BAR_W = 176
const F1_SPARK_X = 300
const F1_SPARK_W = 206
const F1_TAG_X = 516

export function F1Chart({ section }: { section: F1Section }) {
  const rows = section.categoryBars
  const seriesByName = new Map(section.acfSeries.map((entry) => [entry.name, entry]))
  const maxSpend = Math.max(...rows.map((row) => row.annualSpendCents), 1)
  const height = F1_TOP + rows.length * F1_ROW_H + 26
  const structuralShare = section.structuralShareOfAnnualSpend
  const stripWidth = Math.max(4, structuralShare * F1_W)
  const [lagStart, lagEnd] = section.lagWindowDays
  const lagCount = section.lags.length
  // Domain derives from every plotted acf value and threshold: no clamp,
  // so a data change rescales the sparkline instead of truncating it.
  const acfDomain = f1AcfDomain(section)
  const sparkY = (value: number, top: number): number =>
    top + ((acfDomain.max - value) / (acfDomain.max - acfDomain.min)) * 22
  const windowX = (lag: number): number =>
    F1_SPARK_X + ((lag - 1) / Math.max(1, lagCount - 1)) * F1_SPARK_W

  return (
    <svg
      className="rp-chart"
      viewBox={`0 0 ${F1_W} ${height}`}
      role="img"
      style={CHART_FONT}
      aria-label={`Structural share ${(structuralShare * 100).toFixed(
        2,
      )} percent. Annual spend and lag autocorrelation for ${rows.length} categories.`}
    >
      <rect x={0} y={8} width={F1_W} height={24} className="rp-bar-amber" opacity={0.3} />
      <rect x={0} y={8} width={stripWidth} height={24} className="rp-bar-teal" />
      <text x={0} y={48} fontSize={9.5} className="rp-label-teal">
        {`${(structuralShare * 100).toFixed(2)}% structural (${section.structuralCategories.join(', ')})`}
      </text>
      <text x={F1_W} y={48} fontSize={9.5} textAnchor="end" className="rp-label-amber">
        {`${(section.discretionaryShareOfAnnualSpend * 100).toFixed(2)}% discretionary`}
      </text>

      {rows.map((row, index) => {
        const y = F1_TOP + index * F1_ROW_H
        const centerY = y + 14
        const barWidth = Math.max(2, (row.annualSpendCents / maxSpend) * F1_BAR_W)
        const series = seriesByName.get(row.name)
        const sparkTop = centerY - 11
        const structural = row.classification === 'structural'
        const tag = row.eligibleForLagTest
          ? `${row.peakAcf.toFixed(3)} ${structural ? '>' : '<'} ${row.threshold.toFixed(3)}`
          : `${row.debitRows} rows, not tested`
        return (
          <g key={row.name}>
            <title>{`${row.name}: ${row.reason}`}</title>
            <text
              x={F1_NAME_X}
              y={centerY + 4}
              fontSize={10.5}
              className={structural ? 'rp-label-strong' : undefined}
            >
              {row.name}
            </text>
            <rect
              x={F1_BAR_X}
              y={centerY - 6}
              width={barWidth}
              height={12}
              rx={1}
              className={structural ? 'rp-bar-teal rp-grow' : 'rp-bar-amber rp-grow'}
              style={delayStyle(index * 55)}
            />
            <text
              x={barWidth >= 70 ? F1_BAR_X + barWidth - 4 : F1_BAR_X + barWidth + 4}
              y={centerY + 3.5}
              fontSize={9}
              textAnchor={barWidth >= 70 ? 'end' : 'start'}
              className={barWidth >= 70 ? 'rp-label-void' : undefined}
            >
              {formatCents(row.annualSpendCents)}
            </text>

            {series ? (
              <g>
                <rect
                  x={windowX(lagStart)}
                  y={sparkTop}
                  width={windowX(lagEnd) - windowX(lagStart)}
                  height={22}
                  className="rp-window"
                />
                <line
                  x1={F1_SPARK_X}
                  x2={F1_SPARK_X + F1_SPARK_W}
                  y1={sparkY(0, sparkTop)}
                  y2={sparkY(0, sparkTop)}
                  className="rp-axis"
                />
                <line
                  x1={F1_SPARK_X}
                  x2={F1_SPARK_X + F1_SPARK_W}
                  y1={sparkY(series.threshold, sparkTop)}
                  y2={sparkY(series.threshold, sparkTop)}
                  className="rp-threshold"
                />
                <path
                  d={series.acf
                    .map((value, lagIndex) => {
                      const x = windowX(lagIndex + 1)
                      const yPoint = sparkY(value, sparkTop)
                      return `${lagIndex === 0 ? 'M' : 'L'}${x.toFixed(1)} ${yPoint.toFixed(1)}`
                    })
                    .join(' ')}
                  fill="none"
                  strokeWidth={1.4}
                  className={structural ? 'rp-path-teal' : 'rp-path-amber'}
                />
              </g>
            ) : null}

            <text
              x={F1_TAG_X}
              y={centerY + 3.5}
              fontSize={9}
              className={
                !row.eligibleForLagTest
                  ? undefined
                  : structural
                    ? 'rp-label-teal'
                    : 'rp-label-amber'
              }
            >
              {tag}
            </text>
          </g>
        )
      })}

      <text x={F1_SPARK_X} y={height - 8} fontSize={8.5} className="rp-label-faint">
        {`lag 1 to ${lagCount}, shaded band = ${lagStart} to ${lagEnd} day window, dashed = threshold`}
      </text>
    </svg>
  )
}

// ===========================================================================
// F2: month share bars for the strongest calendar category against the
// calendar share of each month
// ===========================================================================

const F2_W = 640
const F2_H = 250
const F2_LEFT = 46
const F2_RIGHT = 630
const F2_TOP = 30
const F2_BOTTOM = 202

/**
 * Fractional month slot of an ISO date against the chart's month labels:
 * the integer part is the label index ("2025-11" is slot 0) and the
 * fraction places the day inside that month. "start" lands on the day's
 * first instant (2025-11-15 is 14/30 into slot 0) and "end" on the day's
 * last (2025-12-31 closes slot 1 at 31/31), so a band drawn between the
 * two covers every day the window claims. Null when the date does not
 * parse or its month is not on the axis.
 */
function isoDateToSlot(
  isoDate: string,
  monthLabels: readonly string[],
  edge: 'start' | 'end',
): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match || !match[1] || !match[2] || !match[3]) {
    return null
  }
  const index = monthLabels.indexOf(`${match[1]}-${match[2]}`)
  if (index < 0) {
    return null
  }
  const day = Number(match[3])
  const daysInMonth = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate()
  if (day < 1 || day > daysInMonth) {
    return null
  }
  return index + (edge === 'end' ? day / daysInMonth : (day - 1) / daysInMonth)
}

/**
 * Pixel span of the F2 holiday band, derived from the parsed window
 * dates against the month labels so the shading can never drift from the
 * caption that quotes the same window. Null when either date misses the
 * axis, in which case there is nothing honest to shade. Exported for the
 * contract test in charts.test.ts.
 */
export function f2HolidayBand(section: F2Section): { from: number; to: number } | null {
  const slots = Math.max(1, section.monthLabels.length)
  const slot = (F2_RIGHT - F2_LEFT) / slots
  const fromSlot = isoDateToSlot(section.holidayWindowStart, section.monthLabels, 'start')
  const toSlot = isoDateToSlot(section.holidayWindowEnd, section.monthLabels, 'end')
  if (fromSlot === null || toSlot === null || toSlot <= fromSlot) {
    return null
  }
  return { from: F2_LEFT + fromSlot * slot, to: F2_LEFT + toSlot * slot }
}

export function F2Chart({ section }: { section: F2Section }) {
  const series = section.monthShares.find(
    (entry) => entry.name === section.strongestCalendarCategory,
  )
  const shares = series?.shares ?? []
  const peakShare = Math.max(...shares, ...section.calendarMonthShares, 0.16)
  const domainMax = Math.ceil(peakShare * 100) / 100 + 0.01
  const slot = (F2_RIGHT - F2_LEFT) / Math.max(1, shares.length)
  const barWidth = Math.min(30, slot - 16)
  const yFor = (value: number): number =>
    F2_BOTTOM - (value / domainMax) * (F2_BOTTOM - F2_TOP)
  // The band derives from the parsed window against the month labels:
  // 2025-11-15 opens slot 0 at 14/30 and 2025-12-31 closes slot 1, so the
  // shading matches the "47 days" label and the caption dates exactly.
  const band = f2HolidayBand(section)
  const bandCenter = band ? (band.from + band.to) / 2 : (F2_LEFT + F2_RIGHT) / 2
  const peakIndex = shares.indexOf(Math.max(...shares))

  return (
    <svg
      className="rp-chart"
      viewBox={`0 0 ${F2_W} ${F2_H}`}
      role="img"
      style={CHART_FONT}
      aria-label={`${section.strongestCalendarCategory} month shares against calendar shares, peak ${(
        (Math.max(...shares) || 0) * 100
      ).toFixed(1)} percent.`}
    >
      {band ? (
        <rect
          x={band.from}
          y={F2_TOP}
          width={band.to - band.from}
          height={F2_BOTTOM - F2_TOP}
          className="rp-window"
        />
      ) : null}
      <text
        x={bandCenter}
        y={F2_TOP - 8}
        fontSize={9}
        textAnchor="middle"
        className="rp-label-teal"
      >
        {`holiday window, ${section.holidayWindowDays} days`}
      </text>

      {[0.05, 0.1, 0.15, 0.2].filter((tick) => tick <= domainMax).map((tick) => (
        <g key={tick}>
          <line x1={F2_LEFT} x2={F2_RIGHT} y1={yFor(tick)} y2={yFor(tick)} className="rp-grid" />
          <text x={F2_LEFT - 6} y={yFor(tick) + 3} fontSize={8.5} textAnchor="end">
            {`${Math.round(tick * 100)}%`}
          </text>
        </g>
      ))}
      <line x1={F2_LEFT} x2={F2_RIGHT} y1={F2_BOTTOM} y2={F2_BOTTOM} className="rp-axis" />

      {shares.map((share, index) => {
        const x = F2_LEFT + index * slot + (slot - barWidth) / 2
        const y = yFor(share)
        const calendar = at(section.calendarMonthShares, index)
        return (
          <g key={section.monthLabels[index] ?? String(index)}>
            <title>{`${section.monthLabels[index] ?? ''}: share ${(share * 100).toFixed(1)}%, calendar ${(calendar * 100).toFixed(1)}%`}</title>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(1, F2_BOTTOM - y)}
              rx={1}
              className={index === peakIndex ? 'rp-bar-teal rp-rise' : 'rp-bar-amber rp-rise'}
              style={delayStyle(index * 40)}
            />
            <line
              x1={x - 3}
              x2={x + barWidth + 3}
              y1={yFor(calendar)}
              y2={yFor(calendar)}
              className="rp-tick"
            />
            <text x={x + barWidth / 2} y={F2_BOTTOM + 13} fontSize={8.5} textAnchor="middle">
              {(section.monthLabels[index] ?? '').slice(5)}
            </text>
            {index === peakIndex ? (
              <text x={x + barWidth / 2} y={y - 5} fontSize={9} textAnchor="middle" className="rp-label-teal">
                {`${(share * 100).toFixed(1)}%`}
              </text>
            ) : null}
          </g>
        )
      })}

      <text x={F2_LEFT} y={F2_BOTTOM + 30} fontSize={8.5} className="rp-label-faint">
        ledger months 2025-11 to 2026-10
      </text>
      <text x={F2_RIGHT} y={F2_BOTTOM + 30} fontSize={8.5} textAnchor="end" className="rp-label-faint">
        ticks = calendar share of each month
      </text>
    </svg>
  )
}

// ===========================================================================
// F3: ROC curve, confusion matrix, readout, diverging coefficients
// ===========================================================================

const F3_W = 640
const F3_H = 500
const ROC_X = 46
const ROC_Y = 30
const ROC_SIZE = 250

export function F3Chart({ section }: { section: F3Section }) {
  const rocPoints = section.rocFpr.map((fpr, index) => {
    const x = ROC_X + fpr * ROC_SIZE
    const y = ROC_Y + ROC_SIZE - at(section.rocTpr, index) * ROC_SIZE
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
  })
  const coefficientRows = section.chartCoefficientFeatures.map((feature) => {
    const match = section.coefficients.find((entry) => entry.feature === feature)
    return { feature, coefficient: match?.coefficient ?? 0 }
  })
  const maxAbs = Math.max(...coefficientRows.map((row) => Math.abs(row.coefficient)), 0.1)
  const coefCenter = 262
  const coefScale = 300 / maxAbs
  const coefTop = 330
  const coefStep = 16
  const confusion = section.confusion
  const cells = [
    { key: 'TN', label: 'true negative', value: confusion.trueNegative, ok: true },
    { key: 'FP', label: 'false positive', value: confusion.falsePositive, ok: false },
    { key: 'FN', label: 'false negative', value: confusion.falseNegative, ok: false },
    { key: 'TP', label: 'true positive', value: confusion.truePositive, ok: true },
  ]

  return (
    <svg
      className="rp-chart"
      viewBox={`0 0 ${F3_W} ${F3_H}`}
      role="img"
      style={CHART_FONT}
      aria-label={`ROC curve with test AUC ${section.testAuc.toFixed(
        3,
      )}, confusion matrix, and the ten strongest standardized coefficients.`}
    >
      {/* ROC */}
      <rect x={ROC_X} y={ROC_Y} width={ROC_SIZE} height={ROC_SIZE} className="rp-plot-bg" />
      {[0.5, 1].map((tick) => (
        <g key={tick}>
          <line
            x1={ROC_X + tick * ROC_SIZE}
            x2={ROC_X + tick * ROC_SIZE}
            y1={ROC_Y}
            y2={ROC_Y + ROC_SIZE}
            className="rp-grid"
          />
          <line
            x1={ROC_X}
            x2={ROC_X + ROC_SIZE}
            y1={ROC_Y + tick * ROC_SIZE}
            y2={ROC_Y + tick * ROC_SIZE}
            className="rp-grid"
          />
          <text x={ROC_X + tick * ROC_SIZE} y={ROC_Y + ROC_SIZE + 12} fontSize={8.5} textAnchor="middle">
            {tick.toFixed(1)}
          </text>
          <text x={ROC_X - 6} y={ROC_Y + ROC_SIZE - tick * ROC_SIZE + 3} fontSize={8.5} textAnchor="end">
            {tick.toFixed(1)}
          </text>
        </g>
      ))}
      <line
        x1={ROC_X}
        y1={ROC_Y + ROC_SIZE}
        x2={ROC_X + ROC_SIZE}
        y2={ROC_Y}
        className="rp-diagonal"
      />
      <path d={rocPoints.join(' ')} fill="none" className="rp-path-teal rp-line-thick rp-draw" />
      <rect x={ROC_X} y={ROC_Y} width={ROC_SIZE} height={ROC_SIZE} className="rp-frame" />
      <text x={ROC_X + 8} y={ROC_Y + 20} fontSize={14} className="rp-label-teal">
        {`AUC ${section.testAuc.toFixed(3)}`}
      </text>
      <text x={ROC_X + ROC_SIZE / 2} y={ROC_Y + ROC_SIZE + 26} fontSize={9} textAnchor="middle">
        false positive rate
      </text>
      <text
        x={18}
        y={ROC_Y + ROC_SIZE / 2}
        fontSize={9}
        textAnchor="middle"
        transform={`rotate(-90 18 ${ROC_Y + ROC_SIZE / 2})`}
      >
        true positive rate
      </text>

      {/* Confusion matrix */}
      <text x={350} y={24} fontSize={9} className="rp-label-faint">
        confusion at 0.5, held out segment
      </text>
      {cells.map((cell, index) => {
        const col = index % 2
        const row = Math.floor(index / 2)
        const x = 350 + col * 118
        const y = 34 + row * 74
        return (
          <g key={cell.key}>
            <rect x={x} y={y} width={110} height={66} rx={3} className="rp-cell" />
            <text x={x + 8} y={y + 16} fontSize={8.5} className="rp-label-faint">
              {cell.label}
            </text>
            <text
              x={x + 8}
              y={y + 48}
              fontSize={22}
              className={cell.ok ? 'rp-label-teal' : 'rp-label-red'}
            >
              {cell.value}
            </text>
            <text x={x + 66} y={y + 48} fontSize={9}>
              {cell.key}
            </text>
          </g>
        )
      })}
      <text x={350} y={196} fontSize={8.5} className="rp-label-faint">
        columns: no deficit, deficit
      </text>

      {/* Readout */}
      {[
        [`train AUC ${section.trainAuc.toFixed(3)}`, `test AUC ${section.testAuc.toFixed(3)}`],
        [
          `accuracy ${(section.accuracyAtHalf * 100).toFixed(1)}%`,
          `majority ${(section.majorityAccuracy * 100).toFixed(1)}%`,
        ],
        [`precision ${(section.precisionAtHalf * 100).toFixed(1)}%`, `recall ${(section.recallAtHalf * 100).toFixed(1)}%`],
        [
          `alt target AUC ${section.robustnessAlternativeTestAuc.toFixed(3)}`,
          `split ${section.splitDate}, C ${section.selectedC}`,
        ],
      ].map((line, index) => (
        <text key={line[0] ?? String(index)} x={350} y={222 + index * 16} fontSize={10}>
          <tspan className="rp-label-strong">{line[0]}</tspan>
          <tspan dx={14} className="rp-label-faint">{line[1]}</tspan>
        </text>
      ))}
      <text x={350} y={290} fontSize={9} className="rp-label-faint">
        {`${section.trainDays} train days / ${section.testDays} test days, ${section.trainEvents} / ${section.testEvents} events`}
      </text>

      {/* Coefficients */}
      <text x={0} y={coefTop - 14} fontSize={9} className="rp-label-faint">
        standardized coefficients, top 10 by magnitude
      </text>
      <line x1={coefCenter} x2={coefCenter} y1={coefTop - 8} y2={coefTop + coefficientRows.length * coefStep} className="rp-axis" />
      {coefficientRows.map((row, index) => {
        const y = coefTop + index * coefStep
        const width = Math.abs(row.coefficient) * coefScale
        const positive = row.coefficient >= 0
        const x = positive ? coefCenter : coefCenter - width
        return (
          <g key={row.feature}>
            <text x={0} y={y + 8} fontSize={9}>
              {row.feature}
            </text>
            <rect
              x={x}
              y={y}
              width={Math.max(1, width)}
              height={10}
              rx={1}
              className={positive ? 'rp-bar-red rp-grow' : 'rp-bar-teal rp-grow'}
              style={delayStyle(index * 45)}
            />
            <text x={638} y={y + 8} fontSize={9} textAnchor="end" className={positive ? 'rp-label-red' : 'rp-label-teal'}>
              {`${positive ? '+' : ''}${row.coefficient.toFixed(4)}`}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ===========================================================================
// F4: the signature chart, a drawdown waterfall from baseline to aligned
// ===========================================================================

const F4_W = 640
const F4_H = 340
const F4_LEFT = 56
const F4_RIGHT = 632
const F4_TOP = 26
const F4_BOTTOM = 288

export function F4Chart({ section }: { section: F4Section }) {
  const steps = [...section.bars].sort(
    (left, right) => right.alignedDrawdownImprovementCents - left.alignedDrawdownImprovementCents,
  )
  const baseline = section.baselineDrawdownCents
  const finalTotal = baseline - section.sumOfAlignedDrawdownImprovementsCents
  const columnCount = steps.length + 2
  const slot = (F4_RIGHT - F4_LEFT) / columnCount
  const barWidth = Math.min(44, slot - 16)
  // The bars live in [0, baseline]; gridlines derive from that ceiling
  // instead of a pinned tick list.
  const domainMax = baseline > 0 ? baseline : 1
  const yFor = (value: number): number =>
    F4_BOTTOM - (value / domainMax) * (F4_BOTTOM - F4_TOP)
  const centerX = (index: number): number => F4_LEFT + slot * index + slot / 2

  let running = baseline
  const stepGeometry = steps.map((step, index) => {
    const before = running
    const after = before - step.alignedDrawdownImprovementCents
    running = after
    return { step, index: index + 1, before, after }
  })

  return (
    <svg
      className="rp-chart"
      viewBox={`0 0 ${F4_W} ${F4_H}`}
      role="img"
      style={CHART_FONT}
      aria-label={`Drawdown waterfall: baseline ${formatCents(baseline)} stepping down through ${steps.length} aligned category scenarios to ${formatCents(finalTotal)}.`}
    >
      {f4GridTicks(baseline).map((tick) => (
        <g key={tick}>
          <line x1={F4_LEFT} x2={F4_RIGHT} y1={yFor(tick)} y2={yFor(tick)} className="rp-grid" />
          <text x={F4_LEFT - 6} y={yFor(tick) + 3} fontSize={8.5} textAnchor="end">
            {axisDollars(tick)}
          </text>
        </g>
      ))}
      <line x1={F4_LEFT} x2={F4_RIGHT} y1={F4_BOTTOM} y2={F4_BOTTOM} className="rp-axis" />
      <text x={F4_LEFT - 6} y={F4_BOTTOM + 3} fontSize={8.5} textAnchor="end">
        {axisDollars(0)}
      </text>

      {/* Reference line: the summed upper bound across the whole plot */}
      <line
        x1={F4_LEFT}
        x2={F4_RIGHT}
        y1={yFor(finalTotal)}
        y2={yFor(finalTotal)}
        className="rp-connector"
      />

      {/* Baseline column */}
      <rect
        x={centerX(0) - barWidth / 2}
        y={yFor(baseline)}
        width={barWidth}
        height={F4_BOTTOM - yFor(baseline)}
        rx={1}
        className="rp-bar-amber-soft rp-rise"
      />
      <text x={centerX(0)} y={yFor(baseline) - 6} fontSize={9} textAnchor="middle" className="rp-label-amber">
        {formatCents(baseline)}
      </text>
      <text x={centerX(0)} y={F4_BOTTOM + 14} fontSize={8} textAnchor="middle">
        baseline
      </text>

      {/* Steps */}
      {stepGeometry.map(({ step, index, before, after }) => {
        const x = centerX(index)
        const yTop = yFor(before)
        const rawHeight = yFor(after) - yFor(before)
        const height = Math.max(2, rawHeight)
        const best = step.name === section.bestAlignedCategory
        return (
          <g key={step.name}>
            <title>{`${step.name}: aligned drawdown improvement ${formatCents(step.alignedDrawdownImprovementCents)}, trough lift ${formatCents(step.alignedTroughDeltaCents)}`}</title>
            <line
              x1={x - slot + barWidth / 2}
              x2={x - barWidth / 2}
              y1={yTop}
              y2={yTop}
              className="rp-connector"
            />
            <rect
              x={x - barWidth / 2}
              y={yTop}
              width={barWidth}
              height={height}
              rx={1}
              className="rp-bar-teal rp-rise"
              style={delayStyle(index * 70)}
            />
            <text
              x={x}
              y={yTop - 5}
              fontSize={8.5}
              textAnchor="middle"
              className={best ? 'rp-label-teal' : undefined}
            >
              {signedMoney(step.alignedDrawdownImprovementCents)}
            </text>
            <text x={x} y={F4_BOTTOM + 14} fontSize={8} textAnchor="middle">
              {step.name}
            </text>
          </g>
        )
      })}

      {/* Summed upper bound column */}
      <line
        x1={centerX(steps.length) + barWidth / 2}
        x2={centerX(steps.length + 1) - barWidth / 2}
        y1={yFor(finalTotal)}
        y2={yFor(finalTotal)}
        className="rp-connector"
      />
      <rect
        x={centerX(steps.length + 1) - barWidth / 2}
        y={yFor(finalTotal)}
        width={barWidth}
        height={F4_BOTTOM - yFor(finalTotal)}
        rx={1}
        className="rp-bar-teal-soft rp-rise"
        style={delayStyle((steps.length + 1) * 70)}
      />
      <text x={centerX(steps.length + 1)} y={yFor(finalTotal) - 6} fontSize={9} textAnchor="middle" className="rp-label-teal">
        {formatCents(finalTotal)}
      </text>
      <text x={centerX(steps.length + 1)} y={F4_BOTTOM + 14} fontSize={8} textAnchor="middle">
        all aligned
      </text>
      <text x={centerX(steps.length + 1)} y={F4_BOTTOM + 25} fontSize={8} textAnchor="middle" className="rp-label-faint">
        upper bound
      </text>

      {/* Headline callout on the best aligned category */}
      <text x={F4_LEFT} y={F4_H - 8} fontSize={8.5} className="rp-label-faint">
        {`best: ${section.bestAlignedCategory} ${signedMoney(section.bestAlignedDrawdownImprovementCents)} (${section.bestAlignedDrawdownPctOfBaseline.toFixed(1)}% of baseline), trough date ${section.baselineTroughDate}`}
      </text>
    </svg>
  )
}

// ===========================================================================
// F5: ranked intervention bars, floor lift and drawdown on one dollar axis
// ===========================================================================

const F5_W = 640
const F5_H = 268
const F5_LEFT = 150
const F5_RIGHT = 626

export function F5Chart({ section }: { section: F5Section }) {
  const rows = [...section.bars].sort((left, right) => left.rank - right.rank)
  // The axis derives from the plotted values, so no bar can be clamped
  // into a misleading scale while its label shows the true number.
  const axis = f5Axis(section)
  const xFor = (value: number): number =>
    F5_LEFT + ((value - axis.min) / (axis.max - axis.min)) * (F5_RIGHT - F5_LEFT)
  const zeroX = xFor(0)
  const rowTop = 44
  const rowStep = 52

  return (
    <svg
      className="rp-chart"
      viewBox={`0 0 ${F5_W} ${F5_H}`}
      role="img"
      style={CHART_FONT}
      aria-label={`Ranked interventions. Best floor lift ${formatCents(
        section.bestMinMonthEndImprovementCents,
      )} from ${section.bestInterventionName}.`}
    >
      <text x={0} y={20} fontSize={9} className="rp-label-faint">
        primary: minimum month end balance, then drawdown improvement
      </text>

      <line x1={zeroX} x2={zeroX} y1={30} y2={rowTop + rows.length * rowStep - 14} className="rp-axis" />

      {rows.map((row, index) => {
        const y = rowTop + index * rowStep
        const floorX = xFor(row.minMonthEndDeltaCents)
        const drawX = xFor(row.drawdownImprovementCents)
        const floorPositive = row.minMonthEndDeltaCents >= 0
        const drawPositive = row.drawdownImprovementCents >= 0
        const floorStart = floorPositive ? zeroX : floorX
        const floorWidth = Math.abs(floorX - zeroX)
        const drawStart = drawPositive ? zeroX : drawX
        const drawWidth = Math.abs(drawX - zeroX)
        const floorText = signedMoney(row.minMonthEndDeltaCents)
        const drawText = signedMoney(row.drawdownImprovementCents)
        // A long bar labels itself inside; a short one labels outside.
        const floorFitsOutside = floorX + 6 + floorText.length * 5.4 <= F5_W - 2
        const drawFitsOutside = drawX + 6 + drawText.length * 5.4 <= F5_W - 2
        const floorInside = floorWidth > 1 && floorPositive && !floorFitsOutside
        const drawInside = drawWidth > 1 && drawPositive && !drawFitsOutside
        const floorOutside = floorWidth <= 1 || (floorPositive && floorFitsOutside)
        const drawOutside = drawWidth <= 1 || (drawPositive && drawFitsOutside)
        const floorLabel: { x: number; anchor: 'start' | 'end'; className: string } = {
          x: floorOutside ? (floorWidth <= 1 ? zeroX + 5 : floorX + 5) : floorX - 5,
          anchor: floorOutside ? 'start' : 'end',
          className: floorInside ? 'rp-label-void' : 'rp-label-teal',
        }
        const drawLabel: { x: number; anchor: 'start' | 'end'; className: string } = {
          x: drawOutside ? (drawWidth <= 1 ? zeroX + 5 : drawX + 5) : drawX - 5,
          anchor: drawOutside ? 'start' : 'end',
          className: drawInside
            ? 'rp-label-void'
            : drawPositive
              ? 'rp-label-amber'
              : 'rp-label-red',
        }
        return (
          <g key={row.id}>
            <title>{`${row.rank}. ${row.name}: floor ${formatCents(row.minMonthEndDeltaCents)}, drawdown ${formatCents(row.drawdownImprovementCents)}, trough ${formatCents(row.troughDeltaCents)}`}</title>
            <text x={0} y={y + 4} fontSize={10} className="rp-label-strong">
              {`${row.rank}. ${row.name}`}
            </text>

            {floorWidth > 1 ? (
              <rect
                x={floorStart}
                y={y + 12}
                width={floorWidth}
                height={11}
                rx={1}
                className="rp-bar-teal rp-grow"
                style={delayStyle(index * 70)}
              />
            ) : null}
            <text x={floorLabel.x} y={y + 21} fontSize={9} textAnchor={floorLabel.anchor} className={floorLabel.className}>
              {floorText}
            </text>

            {drawWidth > 1 ? (
              <rect
                x={drawStart}
                y={y + 28}
                width={drawWidth}
                height={11}
                rx={1}
                className={drawPositive ? 'rp-bar-outline rp-grow' : 'rp-bar-red rp-grow'}
                style={delayStyle(index * 70 + 35)}
              />
            ) : null}
            <text x={drawLabel.x} y={y + 37} fontSize={9} textAnchor={drawLabel.anchor} className={drawLabel.className}>
              {drawText}
            </text>
          </g>
        )
      })}

      {axis.ticks.map((tick) => (
        <text key={tick} x={xFor(tick)} y={F5_H - 6} fontSize={8.5} textAnchor="middle" className="rp-label-faint">
          {axisDollars(tick)}
        </text>
      ))}
    </svg>
  )
}
