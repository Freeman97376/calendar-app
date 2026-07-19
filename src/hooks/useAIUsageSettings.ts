import { useEffect, useState } from 'react'

import type { AIUsageMode, AIUsageSummary } from '../domain/types/goalControl'
import { goalControlGateway } from '../store/goalControlStore'
import { useAuth } from './useAuth'

export function useAIUsageSettings() {
  const auth = useAuth()
  const capabilities = auth.capabilities
  const [mode, setMode] = useState<AIUsageMode>((auth.preferences.aiUsageMode as AIUsageMode) || capabilities?.aiDefaultUsageMode || 'balanced')
  const [usage, setUsage] = useState<AIUsageSummary | null>(null)
  const [softLimit, setSoftLimit] = useState(Number(auth.preferences.aiMonthlySoftLimit || capabilities?.aiUsage?.softLimit || 1_500_000))
  const [hardLimit, setHardLimit] = useState(Number(auth.preferences.aiMonthlyHardLimit || capabilities?.aiUsage?.hardLimit || 2_000_000))
  const [status, setStatus] = useState('')

  useEffect(() => { goalControlGateway.usage().then(setUsage).catch((error: unknown) => setStatus(error instanceof Error ? error.message : String(error))) }, [])

  async function save(successMessage: string) {
    setStatus('')
    try {
      await goalControlGateway.savePreferences({ aiUsageMode: mode, ...(capabilities?.aiBudgetEditable ? { aiMonthlySoftLimit: softLimit, aiMonthlyHardLimit: hardLimit } : {}) })
      await auth.bootstrap(); setUsage(await goalControlGateway.usage()); setStatus(successMessage)
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)) }
  }

  return { capabilities, hardLimit, mode, save, setHardLimit, setMode, setSoftLimit, softLimit, status, usage }
}
