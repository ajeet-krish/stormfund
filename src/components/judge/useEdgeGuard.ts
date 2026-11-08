import { useMemo } from 'react'
import { edgeGuard, type GuardReport } from '../../lib/judgeMode'
import { useConsole } from '../../state/consoleStore'

/**
 * The guard view model: one memo over the boot bundle, the selected
 * id, and the live twist, handed straight to edgeGuard. Null before
 * boot and null with nothing selected, so the bar and the chip row can
 * mount early and print their unwired line instead of a false alarm.
 */
export function useEdgeGuard(): GuardReport | null {
  const bundle = useConsole((state) => state.bundle)
  const selectedId = useConsole((state) => state.selectedId)
  const twist = useConsole((state) => state.twist)

  return useMemo(() => {
    if (!bundle || !selectedId) {
      return null
    }
    return edgeGuard({
      accountId: selectedId,
      knownAccountIds: bundle.ids,
      profile: bundle.byId.get(selectedId) ?? null,
      jobLossActive: twist.jobLoss === true,
    })
  }, [bundle, selectedId, twist])
}
