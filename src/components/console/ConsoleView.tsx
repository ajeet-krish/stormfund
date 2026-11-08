import { useEffect, useMemo } from 'react'
import type { AccountProfile } from '../../data/profiles'
import { projectForecast, type ForecastProjection } from '../../lib/forecast'
import { buildPlanText, type PlanText } from '../../lib/planText'
import { applyTwist, type ShockResult, type Twist } from '../../lib/shocks'
import { verdictBand, type VerdictBand } from '../../lib/verdict'
import { useConsole } from '../../state/consoleStore'
import WeatherPanel from '../weather/WeatherPanel'
import AccountLookup from './AccountLookup'
import BaselineCard from './BaselineCard'
import PlanCard from './PlanCard'
import ShockPanel from './ShockPanel'

/**
 * The engine console shell: boots the profile bundle once, then derives
 * everything the cards show from pure functions in a single useMemo
 * (applyTwist, verdictBand, projectForecast, buildPlanText). Views
 * receive finished numbers and finished sentences, so no component
 * does money math and no two cards can disagree. Three states: loading,
 * an error that says what to do, and the ready layout (lookup,
 * baseline, shock, forecast, plan).
 */

/** One derivation pass over the selected account and the live twist. */
interface Derivation {
  profile: AccountProfile
  result: ShockResult
  band: VerdictBand
  baselineBand: VerdictBand
  plan: PlanText
  twist: Twist
  projection: ForecastProjection
}

export default function ConsoleView() {
  const status = useConsole((state) => state.status)
  const error = useConsole((state) => state.error)
  const bundle = useConsole((state) => state.bundle)
  const selectedId = useConsole((state) => state.selectedId)
  const twist = useConsole((state) => state.twist)
  const activePresetId = useConsole((state) => state.activePresetId)
  const boot = useConsole((state) => state.boot)

  useEffect(() => {
    void boot()
  }, [boot])

  const derivation = useMemo<Derivation | null>(() => {
    if (!bundle || !selectedId) {
      return null
    }
    const profile = bundle.byId.get(selectedId)
    if (!profile) {
      return null
    }
    const result = applyTwist(profile, twist)
    const band = verdictBand(result.runway)
    const baselineBand = verdictBand({
      state: profile.runway_state,
      deciMonths: profile.runway_deci_months,
    })
    const plan = buildPlanText(profile, result, twist, band)
    const projection = projectForecast(profile, result, twist)
    return { profile, result, band, baselineBand, plan, twist, projection }
  }, [bundle, selectedId, twist])

  if (status === 'error') {
    return (
      <section className="cp-panel cp-panel-error" role="alert">
        <p className="cp-eyebrow cp-eyebrow-alert">Profiles failed to load</p>
        <p className="cp-status">{error}</p>
        <p className="cp-hint">
          Check that public/data/engine/profiles.json ships with the build, then try again.
        </p>
        <button type="button" className="cp-button" onClick={() => void boot()}>
          Try again
        </button>
      </section>
    )
  }

  if (!bundle) {
    return (
      <section className="cp-panel" aria-busy="true">
        <p className="cp-eyebrow">Resilience Weather Station</p>
        <p className="cp-status" role="status">
          Loading account profiles...
        </p>
      </section>
    )
  }

  return (
    <div className="cp-shell">
      <AccountLookup ids={bundle.ids} />

      {derivation ? (
        <>
          <div className="cp-grid">
            <BaselineCard profile={derivation.profile} band={derivation.baselineBand} />
            <ShockPanel
              profile={derivation.profile}
              result={derivation.result}
              twist={derivation.twist}
              band={derivation.band}
              activePresetId={activePresetId}
            />
          </div>
          <WeatherPanel projection={derivation.projection} />
          <PlanCard plan={derivation.plan} />
        </>
      ) : (
        <section className="cp-panel cp-empty" aria-labelledby="empty-heading">
          <p className="cp-eyebrow" id="empty-heading">
            Pick an account
          </p>
          <p className="cp-empty__text">
            Choose an account id to see current conditions, then play a shock. Type an account id,
            for example 68257.
          </p>
        </section>
      )}
    </div>
  )
}
