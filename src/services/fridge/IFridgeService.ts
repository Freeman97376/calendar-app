import type {
  FridgeInventoryItem,
  FridgeReceiptAnalysisResponse,
  FridgeShelfLifePrediction,
} from '../../domain/types'

export type AnalyzeReceiptInput = {
  image: File
  purchaseDate?: string
  timezone?: string
}

export type FridgeInventoryDraft = Partial<FridgeShelfLifePrediction> & {
  item_name: string
  receipt_id?: string
  quantity?: string
}

export type FridgeInventoryUpdate = Partial<FridgeInventoryDraft>

export interface IFridgeService {
  analyzeReceipt(input: AnalyzeReceiptInput): Promise<FridgeReceiptAnalysisResponse>
  createInventoryItem(draft: FridgeInventoryDraft): Promise<FridgeInventoryItem>
  deleteInventoryItem(itemId: string): Promise<void>
  getInventoryItems(): Promise<FridgeInventoryItem[]>
  updateInventoryItem(itemId: string, changes: FridgeInventoryUpdate): Promise<FridgeInventoryItem>
}
