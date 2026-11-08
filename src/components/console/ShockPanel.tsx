import type { AccountProfile } from '../../data/profiles'
import { formatCents } from '../../lib/format'
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
 * Take a shock: four preset cards carrying the judge's twist card
 * sentence, the size sliders, the before and after numbers, and the
 * hero verdict. Everything numeric arrives as props already computed in
 * ConsoleView (applyTwist, verdictBand); this component only formats and
 * forwards slider events to the store, so there is no money math in JSX.
 * Every button is type="button" and presets carry data-preset for the
 * E6 shortcut map.
 */

interface ShockPanelProps {
  profile: AccountProfile
  result: ShockResult
  twist: Twist
  band: VerdictBand
  activePresetId: PresetId | null
}

interface SliderProps {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
}

function Slider({ id, label, value, min, max, step, display, onChange }: SliderProps) {
  return (
    <div className="cp-field">
      <div className="cp-field__head">
        <label className="cp-label" htmlFor={id}>
          {label}
        </label>
        <output className="cp-field__value" htmlFor={id}>
          {display}
        </output>
      </div>
      <input
        className="cp-slider"
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
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
        <p className="cp-eyebrow">Take a shock</p>
        <h2 className="cp-title" id="shock-heading">
          Play a twist card
        </h2>
        <p className="cp-twist-card">
          {activePreset
            ? activePreset.card
            : 'No preset yet: move a slider to size a custom shock.'}
        </p>
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

      <VerdictBadge band={band} runway={result.runway} caption="After the shock" />

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
          onChange={(value) => setTwistField({ extraMonthlyCents: value })}
        />
      </fieldset>

      {twist.durationMonths > 0 && (
        <p className="cp-horizon">Horizon: {twist.durationMonths} months, set by the preset.</p>
      )}

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
