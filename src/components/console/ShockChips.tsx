import { useEffect, useRef } from 'react'
import type { AccountProfile } from '../../data/profiles'
import { formatCents } from '../../lib/format'
import { shockFormula, type SpecField } from '../../lib/shockParse'
import { useConsole, type PendingShock } from '../../state/consoleStore'

/**
 * Confirmation chips for a parsed typed shock: four parameters, each
 * with a one click stepper for correction, then the formula strip built
 * only from shockFormula so a judge can hand verify every dollar before
 * anything reaches state. Apply is focused on mount so Enter confirms,
 * Discard is a ghost button, and no arithmetic happens here. Cents come
 * straight from shockFormula; the only conversions on this file are the
 * display percent and month renderings of the parsed spec.
 */

interface Chip {
  field: SpecField
  name: string
  value: string
  unit: string
  decrease: number
  increase: number
  decreaseLabel: string
  increaseLabel: string
}

interface ShockChipsProps {
  profile: AccountProfile
  pending: PendingShock
}

export default function ShockChips({ profile, pending }: ShockChipsProps) {
  const adjustPendingShock = useConsole((state) => state.adjustPendingShock)
  const confirmTypedShock = useConsole((state) => state.confirmTypedShock)
  const cancelTypedShock = useConsole((state) => state.cancelTypedShock)
  const applyRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    applyRef.current?.focus()
  }, [])

  const spec = pending?.spec
  if (!pending || !spec) {
    return null
  }

  const result = shockFormula(profile, spec)
  const incomePercent = Math.round(spec.incomeFactor * 100)
  const billsPercent = Math.round(spec.billsPct * 100)
  const oneOffMonthsText = spec.oneOffMonths.toFixed(1)

  const incomeLine = `Income: ${incomePercent}% of ${formatCents(
    profile.income_cents,
  )} = ${formatCents(result.incomeAfterCents)}`
  const spendingLine = `Spending: ${formatCents(profile.spending_cents)} + ${billsPercent}% of bills ${formatCents(
    profile.household_bills_cents,
  )} = ${formatCents(result.spendingAfterCents)}`
  const oneOffLine = `One off: ${oneOffMonthsText} months of spending = ${formatCents(
    result.oneOffCents,
  )} from the buffer`
  const bufferLine = `Buffer left: ${formatCents(result.bufferLeftCents)}`

  const chips: Chip[] = [
    {
      field: 'incomeFactor',
      name: 'Income',
      value: `${incomePercent}%`,
      unit: 'of usual income',
      decrease: -0.05,
      increase: 0.05,
      decreaseLabel: 'Decrease income',
      increaseLabel: 'Increase income',
    },
    {
      field: 'billsPct',
      name: 'Household bills',
      value: `${billsPercent}%`,
      unit: 'increase',
      decrease: -0.01,
      increase: 0.01,
      decreaseLabel: 'Decrease household bills',
      increaseLabel: 'Increase household bills',
    },
    {
      field: 'oneOffMonths',
      name: 'One off cost',
      value: oneOffMonthsText,
      unit: 'months of spending',
      decrease: -0.1,
      increase: 0.1,
      decreaseLabel: 'Decrease one off cost',
      increaseLabel: 'Increase one off cost',
    },
    {
      field: 'durationMonths',
      name: 'Horizon',
      value: String(spec.durationMonths),
      unit: 'months',
      decrease: -1,
      increase: 1,
      decreaseLabel: 'Decrease horizon',
      increaseLabel: 'Increase horizon',
    },
  ]

  return (
    <>
      <div className="cp-chips">
        {chips.map((chip) => (
          <div className="cp-chip" key={chip.field} data-chip={chip.field}>
            <span className="cp-label">{chip.name}</span>
            <span className="cp-field__value">{chip.value}</span>
            <span className="cp-hint">{chip.unit}</span>
            <div className="cp-chip__stepper">
              <button
                type="button"
                aria-label={chip.decreaseLabel}
                onClick={() => adjustPendingShock(chip.field, chip.decrease)}
              >
                -
              </button>
              <button
                type="button"
                aria-label={chip.increaseLabel}
                onClick={() => adjustPendingShock(chip.field, chip.increase)}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="cp-formula">
        <p className="cp-formula__line">{incomeLine}</p>
        <p className="cp-formula__line">{spendingLine}</p>
        <p className="cp-formula__line">{oneOffLine}</p>
        <p className="cp-formula__line">{bufferLine}</p>
      </div>

      <div className="cp-actions">
        <button
          ref={applyRef}
          type="button"
          className="cp-button"
          onClick={confirmTypedShock}
        >
          Apply shock
        </button>
        <button
          type="button"
          className="cp-button cp-button-ghost"
          onClick={cancelTypedShock}
        >
          Discard
        </button>
      </div>
    </>
  )
}
