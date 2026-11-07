import type { Twist } from './shocks'

/**
 * The four twist cards a judge reads aloud at the booth
 * (docs/tangerine-challenge.md, example twists), each as one typed
 * preset. The card sentence is the judge's wording, the twist is the
 * field set the console applies, and durationMonths is the display only
 * horizon the plan text judges the shocked runway against.
 *
 * Preset order is the order the console renders and the order the E6
 * keyboard shortcuts 1 to 4 will fire (reserved in consoleStore).
 */

export type PresetId = 'layoff' | 'cost_spike' | 'emergency_repair' | 'combo'

export interface ShockPreset {
  id: PresetId
  /** Short button label, sentence case. */
  label: string
  /** The twist card sentence as a judge reads it. */
  card: string
  /** Partial twist: missing fields fall back to IDLE_TWIST. */
  twist: Partial<Twist>
}

export const SHOCK_PRESETS: readonly ShockPreset[] = [
  {
    id: 'layoff',
    label: 'Laid off',
    card: 'This customer was laid off. EI pays 55% of their usual income for 6 months. Do they make it?',
    twist: { jobLoss: true, incomeFactor: 0.55, durationMonths: 6 },
  },
  {
    id: 'cost_spike',
    label: 'Bills up 15%',
    card: 'Household bills go up 15% this month. Does the savings buffer still hold?',
    twist: { billsDeltaPct: 15 },
  },
  {
    id: 'emergency_repair',
    label: 'Furnace repair',
    card: 'The furnace dies, and the repair costs a full month of their typical spending.',
    twist: { oneOffMonthsTenths: 10 },
  },
  {
    id: 'combo',
    label: 'Laid off and bills up',
    card: 'They lose their job (EI at 55%) and their household bills go up 15% in the same month.',
    twist: { jobLoss: true, incomeFactor: 0.55, billsDeltaPct: 15, durationMonths: 6 },
  },
]

/** Look one preset up by id (undefined for an unknown id). */
export function presetById(id: string): ShockPreset | undefined {
  return SHOCK_PRESETS.find((preset) => preset.id === id)
}
