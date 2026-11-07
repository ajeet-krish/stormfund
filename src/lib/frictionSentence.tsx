import type { ReactNode } from 'react'
import type { FrictionFigures } from './friction'
import { formatCents } from './format'

/**
 * How one surface prints the dollar magnitude inside frictionSentence: the
 * report's reverse bridge note wraps it in a strong, and a future surface
 * can pass its own span. The default prints plain dollars.
 */
export type FrictionMoneyRenderer = (cents: number) => ReactNode

/**
 * The F4 counterfactual as one sign aware sentence, shared by every bridge
 * surface so their wording rules cannot drift apart: a positive figure
 * reads as a tighter drawdown, zero as unchanged with no dollar claim at
 * all, and a negative one as a wider drawdown, so the words never claim a
 * sign the data does not carry. renderMoney receives a magnitude (always
 * a non negative amount) and is never called for the unchanged branch.
 */
export function frictionSentence(
  friction: FrictionFigures,
  renderMoney: FrictionMoneyRenderer = formatCents,
): ReactNode {
  const cents = friction.drawdownImprovementCents
  if (cents > 0) {
    return (
      <>
        aligning {friction.name} tightens drawdown by {renderMoney(cents)}
      </>
    )
  }
  if (cents === 0) {
    return <>aligning {friction.name} leaves the drawdown unchanged</>
  }
  return (
    <>
      aligning {friction.name} widens drawdown by {renderMoney(-cents)}
    </>
  )
}
