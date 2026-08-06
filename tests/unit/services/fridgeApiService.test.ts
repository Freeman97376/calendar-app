import { describe, expect, it, vi } from 'vitest'

import { FridgeApiService } from '../../../src/services/fridge/fridgeApiService'

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
    status: 200,
    ...init,
  })
}

const analysisPayload = {
  success: true,
  receipt_id: 'receipt_1',
  purchase_date: '2026-06-07',
  timezone: 'America/Los_Angeles',
  confidence: 0.8,
  source: 'local_ocr',
  ocr: { text: 'MILK 4.99', source: 'local_ocr', confidence: 0.8 },
  candidates: [],
  items: [],
  reminder_suggestions: [],
  trace: { receipt_id: 'receipt_1', steps: [] },
  warnings: [],
  recoverable_errors: [],
}

const inventoryItem = {
  item_id: 'item_1',
  item_name: 'Milk',
  normalized_name: 'milk',
  category: 'dairy',
  storage_type: 'fridge',
  purchase_date: '2026-06-07',
  estimated_expiration_date: '2026-06-14',
  estimated_shelf_life_days: 7,
  confidence: 0.86,
  source: 'local_cache',
  receipt_id: null,
  quantity: null,
  notes: '',
  created_at: '2026-06-07T00:00:00Z',
  updated_at: '2026-06-07T00:00:00Z',
}

describe('FridgeApiService', () => {
  it('posts receipt images as multipart form data', async () => {
    const fetcher = vi.fn(async () => jsonResponse(analysisPayload))
    const service = new FridgeApiService({ baseUrl: 'http://test.local', fetcher })
    const file = new File(['png'], 'receipt.png', { type: 'image/png' })

    const result = await service.analyzeReceipt({
      image: file,
      purchaseDate: '2026-06-07',
      timezone: 'America/Los_Angeles',
    })

    expect(result.receipt_id).toBe('receipt_1')
    expect(fetcher).toHaveBeenCalledWith(
      'http://test.local/api/fridge/receipt/analyze',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    )
  })

  it('parses inventory list responses', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ success: true, items: [inventoryItem] }))
    const service = new FridgeApiService({ baseUrl: 'http://test.local', fetcher })

    await expect(service.getInventoryItems()).resolves.toEqual([inventoryItem])
  })

  it('surfaces structured backend errors', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(
        {
          success: false,
          error: { code: 'invalid_image', message: 'Bad image', recoverable: true },
        },
        { status: 400 },
      ),
    )
    const service = new FridgeApiService({ baseUrl: 'http://test.local', fetcher })

    await expect(service.getInventoryItems()).rejects.toThrow('Bad image')
  })
})
