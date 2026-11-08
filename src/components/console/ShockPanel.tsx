import { useEffect, useState } from 'react'
import type { AccountProfile } from '../../data/profiles'
import { centsToDollars, dollarsToCents, formatCents } from '../../lib/format'
import { SHOCK_PRESETS, type PresetId } from '../../lib/shockPresets'
import {
  factorToPercent,
  IDLE_TWIST,
  MAX_EXTRA_MONTHLY_CENTS,
  monthsToTenths,
  percentToFactor,
  sameTwist,
  tenthsToMonths,
  type ShockResult,
  type Twist,
} from '../../lib/shocks'
import type { VerdictBand } from '../../lib/verdict'
import { useConsole } from '../../state/consoleStore'
import TypedShock from './TypedShock'
import VerdictBadge from './VerdictBadge'

/**
 * Simulate a shock: the typed sentence, four preset cards carrying the
 * judge's twist card sentence, the size sliders with their synced whole
 * number text fields, the twist card line, the before and after numbers,
 * and the hero verdict. Everything numeric arrives as props already
 * computed in ConsoleView (applyTwist, verdictBand); this component only
 * formats and forwards slider and typed field events to the store, so
 * there is no money math in JSX. The typed fields are local: they parse
 * whole numbers, clamp them to the same ranges the sliders hold, and
 * push them through setTwistField, so no external service is ever in
 * their path. Every button is type="button" and presets carry
 * data-preset for the E6 shortcut map.
 */

interface ShockPanelProps {
  profile: AccountProfile
  result: ShockResult
  twist: Twist
  band: VerdictBand
  activePresetId: PresetId | null
}

/**
 * How one slider row's synced text field reads and writes: the unit
 * words for its accessible name, the whole number range it accepts
 * (identical to the slider's own range in the row's unit), and the two
 * conversions between that unit and the value the slider holds.
 */
interface TypedScale {
  unit: string
  min: number
  max: number
  toSlider: (typed: number) => number
  fromSlider: (value: number) => string
}

interface SliderProps {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  typed: TypedScale
  onChange: (value: number) => void
}

/**
 * One slider with its local synced text field. Both controls read the
 * same value in two units: typing pushes the clamped whole number into
 * the twist, dragging repaints the text, and a value that arrives from
 * outside (a preset, a reset) clears any half typed draft so the two
 * can never disagree. The digits are taken up to the first decimal
 * point, so "2.5" reads as 2 and an empty field simply holds still
 * instead of writing a zero into the twist.
 */
function Slider({ id, label, value, min, max, step, display, typed, onChange }: SliderProps) {
  const textId = `${id}-typed`
  const [draft, setDraft] = useState<string | null>(null)

  useEffect(() => {
    setDraft(null)
  }, [value])

  const shown = draft ?? typed.fromSlider(value)

  const handleText = (raw: string): void => {
    const head = raw.split('.')[0] ?? ''
    const digits = head.replace(/[^0-9]/g, '')
    if (digits.length === 0) {
      setDraft('')
      return
    }
    const clamped = Math.min(typed.max, Math.max(typed.min, Number.parseInt(digits, 10)))
    setDraft(String(clamped))
    onChange(typed.toSlider(clamped))
  }

  const handleSlider = (next: number): void => {
    setDraft(null)
    onChange(next)
  }

  return (
    <div className="cp-field">
      <div className="cp-field__head">
        <label className="cp-label" htmlFor={id}>
          {label}
        </label>
        <output className="cp-field__value" htmlFor={id} id={`${id}-out`}>
          {display}
        </output>
      </div>
      <div className="cp-field__row">
        <input
          className="cp-slider"
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => handleSlider(Number(event.target.value))}
        />
        <label className="rp-sr-only" htmlFor={textId}>{`${label} in ${typed.unit}`}</label>
        <input
          className="cp-field__num"
          id={textId}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={shown}
          aria-describedby={`${id}-out`}
          onChange={(event) => handleText(event.target.value)}
          onBlur={() => setDraft(null)}
        />
      </div>
    </div>
  )
}

export default function ShockPanel({
  profile,
  result,
  twist,
  band,
  activePresetId,
}: ShockPanelProps) {
  const applyPreset = useConsole((state) => state.applyPreset)
  const setTwistField = useConsole((state) => state.setTwistField)
  const resetTwist = useConsole((state) => state.resetTwist)

  const activePreset = SHOCK_PRESETS.find((preset) => preset.id === activePresetId) ?? null
  const idle = sameTwist(twist, IDLE_TWIST)

  const rows: readonly { label: string; now: string; after: string }[] = [
    {
      label: 'Income after shock',
      now: formatCents(profile.income_cents),
      after: formatCents(result.incomeAfterCents),
    },
    {
      label: 'Spending after shock',
      now: formatCents(profile.spending_cents),
      after: formatCents(result.spendingAfterCents),
    },
    {
      label: 'One off cost',
      now: formatCents(0),
      after: formatCents(result.oneOffCents),
    },
    {
      label: 'Buffer left',
      now: formatCents(profile.buffer_cents),
      after: formatCents(result.bufferLeftCents),
    },
    {
      label: 'Monthly gap',
      now: formatCents(profile.gap_cents),
      after: formatCents(result.gapAfterCents),
    },
  ]

  return (
    <section className="cp-panel" aria-labelledby="shock-heading">
      <header className="cp-panel__head">
        <h2 className="cp-title" id="shock-heading">
          Simulate a Shock Event
        </h2>
      </header>

      <TypedShock profile={profile} />

      <div className="cp-presets" role="group" aria-label="Shock presets">
        {SHOCK_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="cp-preset"
            data-preset={preset.id}
            aria-pressed={activePresetId === preset.id}
            onClick={() => applyPreset(preset.id)}
          >
            <span className="cp-preset__label">{preset.label}</span>
            <span className="cp-preset__card">{preset.card}</span>
          </button>
        ))}
      </div>

      <fieldset className="cp-sliders">
        <legend className="cp-eyebrow">Size of the shock</legend>

        <Slider
          id="shock-income"
          label="Income after shock"
          value={factorToPercent(twist.incomeFactor)}
          min={0}
          max={100}
          step={5}
          display={`${factorToPercent(twist.incomeFactor)}% of usual income`}
          typed={{
            unit: 'percent',
            min: 0,
            max: 100,
            toSlider: (typed) => typed,
            fromSlider: (slider) => String(slider),
          }}
          onChange={(value) =>
            setTwistField({ incomeFactor: percentToFactor(value), jobLoss: value < 100 })
          }
        />

        <Slider
          id="shock-bills"
          label="Household bills change"
          value={twist.billsDeltaPct}
          min={0}
          max={100}
          step={1}
          display={`+${twist.billsDeltaPct}%`}
          typed={{
            unit: 'percent',
            min: 0,
            max: 100,
            toSlider: (typed) => typed,
            fromSlider: (slider) => String(slider),
          }}
          onChange={(value) => setTwistField({ billsDeltaPct: value })}
        />

        <Slider
          id="shock-oneoff"
          label="One off cost"
          value={tenthsToMonths(twist.oneOffMonthsTenths)}
          min={0}
          max={3}
          step={0.1}
          display={`${tenthsToMonths(twist.oneOffMonthsTenths).toFixed(1)} months of spending`}
          typed={{
            unit: 'months of spending',
            min: 0,
            max: 3,
            toSlider: (typed) => typed,
            fromSlider: (slider) => String(Math.round(slider)),
          }}
          onChange={(value) => setTwistField({ oneOffMonthsTenths: monthsToTenths(value) })}
        />

        <Slider
          id="shock-extra"
          label="Extra monthly cost"
          value={twist.extraMonthlyCents}
          min={0}
          max={MAX_EXTRA_MONTHLY_CENTS}
          step={500}
          display={`${formatCents(twist.extraMonthlyCents)} a month`}
          typed={{
            unit: 'dollars a month',
            min: 0,
            max: centsToDollars(MAX_EXTRA_MONTHLY_CENTS),
            toSlider: (typed) => dollarsToCents(typed),
            fromSlider: (slider) => String(centsToDollars(slider)),
          }}
          onChange={(value) => setTwistField({ extraMonthlyCents: value })}
        />
      </fieldset>

      {twist.durationMonths > 0 && (
        <p className="cp-horizon">Horizon: {twist.durationMonths} months, set by the preset.</p>
      )}

      <p className="cp-twist-card">
        {activePreset
          ? activePreset.card
          : 'No preset yet: move a slider to size a custom shock.'}
      </p>

      <VerdictBadge band={band} runway={result.runway} caption="After the shock" />

      <div className="cp-table-wrap">
        <table className="cp-table">
          <caption>Before and after, in dollars</caption>
          <thead>
            <tr>
              <th scope="col">Line</th>
              <th scope="col">Now</th>
              <th scope="col">After shock</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td className="cp-num">{row.now}</td>
                <td className="cp-num cp-num-after">{row.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cp-actions">
        <button
          type="button"
          className="cp-button cp-button-ghost"
          onClick={resetTwist}
          disabled={idle}
        >
          Reset shock
        </button>
        <p className="cp-hint">
          {idle
            ? 'The account is shown as it stands, with no shock applied.'
            : 'Reset returns the shock sliders to no change and keeps the account.'}
        </p>
      </div>
    </section>
  )
}
