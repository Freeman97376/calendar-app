import { useEffect } from 'react'

import { useSchedulingStore } from '../store/schedulingStore'

export function useGlobalScheduleProposal() {
  const proposal = useSchedulingStore((state) => state.proposal)
  const error = useSchedulingStore((state) => state.error)
  const isLoading = useSchedulingStore((state) => state.isLoading)
  const load = useSchedulingStore((state) => state.load)
  const recompute = useSchedulingStore((state) => state.recompute)
  const resolve = useSchedulingStore((state) => state.resolve)

  useEffect(() => {
    void load().catch(() => undefined)
  }, [load])

  return { error, isLoading, proposal, recompute, resolve }
}
