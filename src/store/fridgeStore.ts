import { create } from 'zustand'

import type {
  AnalyzeReceiptInput,
  FridgeInventoryDraft,
  FridgeInventoryUpdate,
  IFridgeService,
} from '../services/fridge/IFridgeService'
import type {
  FridgeInventoryItem,
  FridgeReceiptAnalysisResponse,
  FridgeShelfLifePrediction,
} from '../domain/types'

export type FridgeStore = {
  analysis: FridgeReceiptAnalysisResponse | null
  error: string | null
  inventory: FridgeInventoryItem[]
  isAnalyzing: boolean
  isInventoryLoading: boolean
  analyzeReceipt: (input: AnalyzeReceiptInput) => Promise<FridgeReceiptAnalysisResponse>
  addAnalysisItemToInventory: (item: FridgeShelfLifePrediction) => Promise<FridgeInventoryItem>
  createInventoryItem: (draft: FridgeInventoryDraft) => Promise<FridgeInventoryItem>
  deleteInventoryItem: (itemId: string) => Promise<void>
  loadInventory: () => Promise<FridgeInventoryItem[]>
  reset: () => void
  updateInventoryItem: (
    itemId: string,
    changes: FridgeInventoryUpdate,
  ) => Promise<FridgeInventoryItem>
}

let fridgeService: IFridgeService | null = null

export function configureFridgeService(service: IFridgeService | null) {
  fridgeService = service
}

function requireFridgeService(): IFridgeService {
  if (!fridgeService) {
    throw new Error('Fridge backend service is not configured')
  }

  return fridgeService
}

function toInventoryDraft(
  item: FridgeShelfLifePrediction,
  receiptId?: string,
): FridgeInventoryDraft {
  return {
    ...item,
    receipt_id: receiptId,
  }
}

export const useFridgeStore = create<FridgeStore>((set, get) => ({
  analysis: null,
  error: null,
  inventory: [],
  isAnalyzing: false,
  isInventoryLoading: false,
  analyzeReceipt: async (input) => {
    set({ isAnalyzing: true, error: null })
    try {
      const analysis = await requireFridgeService().analyzeReceipt(input)
      set({ analysis, isAnalyzing: false })
      return analysis
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to analyze receipt'
      set({ error: message, isAnalyzing: false })
      throw error
    }
  },
  addAnalysisItemToInventory: async (item) => {
    const draft = toInventoryDraft(item, get().analysis?.receipt_id)
    return get().createInventoryItem(draft)
  },
  createInventoryItem: async (draft) => {
    try {
      const created = await requireFridgeService().createInventoryItem(draft)
      set((state) => ({ inventory: [...state.inventory, created], error: null }))
      return created
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to add fridge item'
      set({ error: message })
      throw error
    }
  },
  deleteInventoryItem: async (itemId) => {
    try {
      await requireFridgeService().deleteInventoryItem(itemId)
      set((state) => ({
        inventory: state.inventory.filter((item) => item.item_id !== itemId),
        error: null,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove fridge item'
      set({ error: message })
      throw error
    }
  },
  loadInventory: async () => {
    set({ isInventoryLoading: true, error: null })
    try {
      const inventory = await requireFridgeService().getInventoryItems()
      set({ inventory, isInventoryLoading: false })
      return inventory
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load fridge inventory'
      set({ error: message, isInventoryLoading: false })
      throw error
    }
  },
  reset: () =>
    set({
      analysis: null,
      error: null,
      inventory: [],
      isAnalyzing: false,
      isInventoryLoading: false,
    }),
  updateInventoryItem: async (itemId, changes) => {
    try {
      const updated = await requireFridgeService().updateInventoryItem(itemId, changes)
      set((state) => ({
        inventory: state.inventory.map((item) => (item.item_id === itemId ? updated : item)),
        error: null,
      }))
      return updated
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update fridge item'
      set({ error: message })
      throw error
    }
  },
}))
