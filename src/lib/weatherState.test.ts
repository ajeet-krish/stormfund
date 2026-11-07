import { describe, expect, it } from 'vitest'
import {
  isWeatherState,
  SEVERITY_ORDER,
  weatherSeverity,
  weatherState,
  WEATHER_META,
  WEATHER_STATES,
  type WeatherMetrics,
  type WeatherState,
} from './weatherState'

/**
 * The judge parity contract for the E3 weather vocabulary: every one of
 * the seven states, each boundary in tenths of a month (exactly 3.0,
 * exactly 12.0, exactly 24.0, exactly 0.0), the no shortfall string
 * state, the flag modifiers, and the 0 to 1 severity helper. Inputs are
 * hand built metrics objects so the ladder is tested on its own, without
 * depending on the shipped artifact or on the E2 shock math.
 */

function metrics(overrides: Partial<WeatherMetrics>): WeatherMetrics {
  return {
    income_cents: 400_000,
    spending_cents: 300_000,
    buffer_cents: 500_000,
    gap_cents: -100_000,
    runway_state: 'no_shortfall',
    runway_deci_months: 1200,
    ...overrides,
  }
}

/** A spending driven account with a healthy income ratio, tuned by deci. */
function spendingDriven(deciMonths: number): WeatherMetrics {
  return metrics({
    income_cents: 400_000,
    spending_cents: 300_000,
    gap_cents: -100_000,
    runway_state: 'finite',
    runway_deci_months: deciMonths,
    // gap must read positive for the spending driven bands, so the
    // object carries a spending above income gap next to a finite deci.
    ...(deciMonths > 0 ? { gap_cents: 100_000 } : {}),
  })
}

describe('weatherState: the seven states', () => {
  it('maps the calm end: no shortfall reads clear', () => {
    expect(weatherState(metrics({}))).toBe('clear')
    expect(weatherState(metrics({ runway_state: 'no_shortfall', runway_deci_months: 1200 }))).toBe(
      'clear',
    )
  })

  it('reads buffer_depleted as flood before any threshold', () => {
    expect(
      weatherState(
        metrics({
          runway_state: 'buffer_depleted',
          runway_deci_months: 0,
          buffer_cents: -50_000,
          gap_cents: 100_000,
        }),
      ),
    ).toBe('flood')
  })

  it('reads the no shortfall string state as clear even with odd tenths', () => {
    // Branch discipline: the special state wins over the number, the
    // same way verdict.ts reads clear for no_shortfall.
    expect(
      weatherState(metrics({ runway_state: 'no_shortfall', runway_deci_months: 45 })),
    ).toBe('clear')
    expect(
      weatherState(metrics({ runway_state: 'no_shortfall', runway_deci_months: 0 })),
    ).toBe('clear')
  })

  it('maps the spending driven bands: rain, overcast, cloudy', () => {
    expect(weatherState(spendingDriven(30))).toBe('rain')
    expect(weatherState(spendingDriven(119))).toBe('rain')
    expect(weatherState(spendingDriven(120))).toBe('overcast')
    expect(weatherState(spendingDriven(239))).toBe('overcast')
    expect(weatherState(spendingDriven(240))).toBe('cloudy')
    expect(weatherState(spendingDriven(1200))).toBe('cloudy')
  })

  it('maps the income collapse to drought at runway 3.0 and up', () => {
    const drought = metrics({
      income_cents: 200_000,
      spending_cents: 400_000,
      gap_cents: 200_000,
      runway_state: 'finite',
      runway_deci_months: 96,
    })
    expect(weatherState(drought)).toBe('drought')
    // The same ratio at a long runway still reads drought, because the
    // income ratio outranks the cloud bands in the ladder.
    expect(weatherState({ ...drought, runway_deci_months: 400 })).toBe('drought')
  })

  it('maps the empty runway to storm between 0.1 and 2.9 months', () => {
    expect(weatherState(spendingDriven(1))).toBe('storm')
    expect(weatherState(spendingDriven(29))).toBe('storm')
  })
})

describe('weatherState: boundaries', () => {
  it('handles runway exactly 3.0 months (30 tenths)', () => {
    // Just under: storm. Exactly 3.0: out of storm, into rain.
    expect(weatherState(spendingDriven(29))).toBe('storm')
    expect(weatherState(spendingDriven(30))).toBe('rain')
    // Exactly 3.0 with a low income ratio reads drought instead.
    expect(
      weatherState(
        metrics({
          income_cents: 65_000,
          spending_cents: 100_000,
          gap_cents: 35_000,
          runway_state: 'finite',
          runway_deci_months: 30,
        }),
      ),
    ).toBe('drought')
  })

  it('handles runway exactly 12.0 months (120 tenths)', () => {
    expect(weatherState(spendingDriven(119))).toBe('rain')
    // Exactly 12.0 with a gap reads overcast, not clear: clear keeps
    // only the no shortfall and unclaimed windows.
    expect(weatherState(spendingDriven(120))).toBe('overcast')
    // Exactly 12.0 with no gap reads clear (runway 12 and up, calm).
    expect(
      weatherState(
        metrics({
          runway_state: 'finite',
          runway_deci_months: 120,
          gap_cents: 0,
        }),
      ),
    ).toBe('clear')
  })

  it('handles runway exactly 24.0 months (240 tenths)', () => {
    expect(weatherState(spendingDriven(239))).toBe('overcast')
    expect(weatherState(spendingDriven(240))).toBe('cloudy')
  })

  it('handles flood at runway 0 in every spelling', () => {
    expect(
      weatherState(
        metrics({
          runway_state: 'finite',
          runway_deci_months: 0,
          gap_cents: 100_000,
        }),
      ),
    ).toBe('flood')
    expect(
      weatherState(
        metrics({
          runway_state: 'buffer_depleted',
          runway_deci_months: 0,
          buffer_cents: 0,
        }),
      ),
    ).toBe('flood')
    expect(
      weatherState(
        metrics({
          runway_state: 'finite',
          runway_deci_months: 60,
          buffer_cents: -1,
        }),
      ),
    ).toBe('flood')
  })

  it('treats a non finite runway as flood, never as clear', () => {
    expect(
      weatherState(
        metrics({
          runway_state: 'finite',
          runway_deci_months: Number.NaN,
          gap_cents: 100_000,
        }),
      ),
    ).toBe('flood')
  })

  it('reads a no monthly shortfall account as clear at every runway', () => {
    expect(
      weatherState(
        metrics({
          runway_state: 'finite',
          runway_deci_months: 600,
          gap_cents: -50_000,
        }),
      ),
    ).toBe('clear')
    expect(
      weatherState(
        metrics({
          runway_state: 'finite',
          runway_deci_months: 60,
          gap_cents: -50_000,
        }),
      ),
    ).toBe('clear')
  })
})

describe('weatherState: flags as honesty modifiers', () => {
  it('raises a finite account with a negative buffer flag to flood', () => {
    expect(
      weatherState(
        metrics({
          runway_state: 'finite',
          runway_deci_months: 600,
          gap_cents: 100_000,
          flags: { negative_buffer: true },
        }),
      ),
    ).toBe('flood')
  })

  it('lets a zero income flag with spending read drought through the ratio', () => {
    expect(
      weatherState(
        metrics({
          income_cents: 0,
          spending_cents: 300_000,
          gap_cents: 300_000,
          runway_state: 'finite',
          runway_deci_months: 48,
          flags: { zero_income: true },
        }),
      ),
    ).toBe('drought')
  })

  it('does not change state for descriptive flags', () => {
    const base = spendingDriven(60)
    expect(
      weatherState({
        ...base,
        flags: { thin_history: true, pensioner: true, defaulted_loan: true },
      }),
    ).toBe('rain')
    expect(
      weatherState({
        ...base,
        flags: { thin_history: true, pensioner: true, defaulted_loan: true },
      }),
    ).toBe(weatherState(base))
  })

  it('keeps a zero income account with no spending out of drought', () => {
    // Income ratio against zero spending is undefined, and the gap is
    // zero, so this is a no shortfall account rather than a drought.
    expect(
      weatherState(
        metrics({
          income_cents: 0,
          spending_cents: 0,
          gap_cents: 0,
          runway_state: 'finite',
          runway_deci_months: 90,
          flags: { zero_income: true },
        }),
      ),
    ).toBe('clear')
  })
})

describe('weatherSeverity: 0 to 1 over the same tenths', () => {
  it('reads 1 for a depleted buffer and 0 for no shortfall', () => {
    expect(
      weatherSeverity(
        metrics({ runway_state: 'buffer_depleted', runway_deci_months: 0, buffer_cents: -1 }),
      ),
    ).toBe(1)
    expect(weatherSeverity(metrics({ runway_state: 'no_shortfall', runway_deci_months: 1200 }))).toBe(
      0,
    )
  })

  it('clamps the researched formula at both ends', () => {
    expect(weatherSeverity(spendingDriven(0))).toBe(1)
    expect(weatherSeverity(spendingDriven(30))).toBeCloseTo(0.75, 10)
    expect(weatherSeverity(spendingDriven(60))).toBeCloseTo(0.5, 10)
    expect(weatherSeverity(spendingDriven(120))).toBe(0)
    expect(weatherSeverity(spendingDriven(1200))).toBe(0)
    expect(weatherSeverity(spendingDriven(-5))).toBe(1)
  })

  it('never leaves the 0 to 1 range for any ladder input', () => {
    for (const state of WEATHER_STATES) {
      const sample = metrics({
        runway_state: state === 'flood' ? 'buffer_depleted' : 'finite',
        runway_deci_months: state === 'clear' ? 1200 : 40,
      })
      const severity = weatherSeverity(sample)
      expect(severity).toBeGreaterThanOrEqual(0)
      expect(severity).toBeLessThanOrEqual(1)
    }
  })
})

describe('the exported vocabulary tables', () => {
  it('declares all seven states in canonical order with unique labels', () => {
    expect([...WEATHER_STATES]).toEqual([
      'clear',
      'cloudy',
      'overcast',
      'rain',
      'drought',
      'storm',
      'flood',
    ])
    const labels = WEATHER_STATES.map((state) => WEATHER_META[state].label)
    expect(new Set(labels).size).toBe(WEATHER_STATES.length)
    for (const state of WEATHER_STATES) {
      expect(WEATHER_META[state].threshold.length).toBeGreaterThan(8)
      expect(WEATHER_META[state].glyph.length).toBeGreaterThan(0)
    }
  })

  it('orders severity from flood down to clear with no duplicates', () => {
    expect([...SEVERITY_ORDER].sort()).toEqual([...WEATHER_STATES].sort())
    expect(new Set(SEVERITY_ORDER).size).toBe(WEATHER_STATES.length)
    expect(SEVERITY_ORDER[0]).toBe('flood')
    expect(SEVERITY_ORDER[SEVERITY_ORDER.length - 1]).toBe('clear')
  })

  it('type guards unknown values', () => {
    expect(isWeatherState('storm')).toBe(true)
    expect(isWeatherState('hail')).toBe(false)
    expect(isWeatherState(undefined)).toBe(false)
    expect(isWeatherState(7)).toBe(false)
    for (const state of WEATHER_STATES) {
      expect(isWeatherState(state)).toBe(true)
    }
  })

  it('returns a WeatherState from the ladder for a plain object', () => {
    const state: WeatherState = weatherState(spendingDriven(90))
    expect(state).toBe('rain')
  })
})
