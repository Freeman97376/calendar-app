import {
  FridgeInventoryItemResponseSchema,
  FridgeInventoryListResponseSchema,
  FridgeReceiptAnalysisResponseSchema,
} from '../../domain/schemas/fridge.schema'
import type { FridgeInventoryItem, FridgeReceiptAnalysisResponse } from '../../domain/types'
import type {
  AnalyzeReceiptInput,
  FridgeInventoryDraft,
  FridgeInventoryUpdate,
  IFridgeService,
} from './IFridgeService'

type FridgeApiServiceOptions = {
  baseUrl?: string
  fetcher?: typeof fetch
}

const defaultFetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)

function defaultBaseUrl(): string {
  return import.meta.env.VITE_FRIDGE_API_BASE_URL ?? 'http://127.0.0.1:8787'
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const payload = (await response.json()) as unknown

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'object' &&
      payload.error !== null &&
      'message' in payload.error
        ? String(payload.error.message)
        : `Fridge API request failed with status ${response.status}`
    throw new Error(message)
  }

  return payload
}

export class FridgeApiService implements IFridgeService {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch

  constructor(options: FridgeApiServiceOptions = {}) {
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl()).replace(/\/$/, '')
    this.fetcher = options.fetcher ?? defaultFetcher
  }

  async analyzeReceipt(input: AnalyzeReceiptInput): Promise<FridgeReceiptAnalysisResponse> {
    const formData = new FormData()
    formData.append('image', input.image)
    if (input.purchaseDate) formData.append('purchase_date', input.purchaseDate)
    if (input.timezone) formData.append('timezone', input.timezone)

    const response = await this.fetcher(`${this.baseUrl}/api/fridge/receipt/analyze`, {
      method: 'POST',
      body: formData,
    })
    return FridgeReceiptAnalysisResponseSchema.parse(await parseJsonResponse(response))
  }

  async createInventoryItem(draft: FridgeInventoryDraft): Promise<FridgeInventoryItem> {
    const response = await this.fetcher(`${this.baseUrl}/api/fridge/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    })
    return FridgeInventoryItemResponseSchema.parse(await parseJsonResponse(response)).item
  }

  async deleteInventoryItem(itemId: string): Promise<void> {
    const response = await this.fetcher(`${this.baseUrl}/api/fridge/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
    })
    await parseJsonResponse(response)
  }

  async getInventoryItems(): Promise<FridgeInventoryItem[]> {
    const response = await this.fetcher(`${this.baseUrl}/api/fridge/items`)
    return FridgeInventoryListResponseSchema.parse(await parseJsonResponse(response)).items
  }

  async updateInventoryItem(
    itemId: string,
    changes: FridgeInventoryUpdate,
  ): Promise<FridgeInventoryItem> {
    const response = await this.fetcher(`${this.baseUrl}/api/fridge/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(changes),
    })
    return FridgeInventoryItemResponseSchema.parse(await parseJsonResponse(response)).item
  }
}

