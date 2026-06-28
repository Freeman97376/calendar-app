import { useEffect, useState } from 'react'

import type { EventDraft } from '../domain/logic/eventUtils'
import type { FridgeReminderSuggestion, FridgeShelfLifePrediction } from '../domain/types'
import { useEventStore } from '../store/eventStore'
import { useFridgeStore } from '../store/fridgeStore'

function toAllDayEventDraft(suggestion: FridgeReminderSuggestion): EventDraft {
  return {
    title: suggestion.title,
    description: suggestion.description,
    startAt: new Date(`${suggestion.date}T00:00:00`).toISOString(),
    endAt: new Date(`${suggestion.date}T23:59:00`).toISOString(),
    allDay: true,
    color: '#dc2626',
  }
}

export function useFridge() {
  const analysis = useFridgeStore((state) => state.analysis)
  const error = useFridgeStore((state) => state.error)
  const inventory = useFridgeStore((state) => state.inventory)
  const isAnalyzing = useFridgeStore((state) => state.isAnalyzing)
  const isInventoryLoading = useFridgeStore((state) => state.isInventoryLoading)
  const analyzeReceipt = useFridgeStore((state) => state.analyzeReceipt)
  const addAnalysisItemToInventory = useFridgeStore((state) => state.addAnalysisItemToInventory)
  const deleteInventoryItem = useFridgeStore((state) => state.deleteInventoryItem)
  const loadInventory = useFridgeStore((state) => state.loadInventory)
  const createEvent = useEventStore((state) => state.createEvent)
  const [scheduledCount, setScheduledCount] = useState(0)

  useEffect(() => {
    loadInventory().catch(() => undefined)
  }, [loadInventory])

  async function addItem(item: FridgeShelfLifePrediction) {
    await addAnalysisItemToInventory(item)
  }

  async function addAllItems() {
    for (const item of analysis?.items ?? []) {
      await addAnalysisItemToInventory(item)
    }
  }

  async function scheduleReminder(suggestion: FridgeReminderSuggestion) {
    await createEvent(toAllDayEventDraft(suggestion))
    setScheduledCount((count) => count + 1)
  }

  async function scheduleAllReminders() {
    for (const suggestion of analysis?.reminder_suggestions ?? []) {
      await scheduleReminder(suggestion)
    }
  }

  return {
    addAllItems,
    addItem,
    analysis,
    analyzeReceipt,
    deleteInventoryItem,
    error,
    inventory,
    isAnalyzing,
    isInventoryLoading,
    scheduleAllReminders,
    scheduleReminder,
    scheduledCount,
  }
}

