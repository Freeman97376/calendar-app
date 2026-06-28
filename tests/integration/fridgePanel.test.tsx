import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import App from '../../src/App'
import type {
  FridgeInventoryItem,
  FridgeReceiptAnalysisResponse,
} from '../../src/domain/types'
import type {
  AnalyzeReceiptInput,
  FridgeInventoryDraft,
  FridgeInventoryUpdate,
  IFridgeService,
} from '../../src/services/fridge/IFridgeService'
import { useCalendarStore } from '../../src/store/calendarStore'
import { configureEventSync, useEventStore } from '../../src/store/eventStore'
import { configureFridgeService, useFridgeStore } from '../../src/store/fridgeStore'
import { useUIStore } from '../../src/store/uiStore'

const milkPrediction = {
  item_name: 'Organic Milk',
  normalized_name: 'milk',
  category: 'dairy',
  storage_type: 'fridge' as const,
  estimated_shelf_life_days: 7,
  purchase_date: '2026-06-07',
  estimated_expiration_date: '2026-06-14',
  confidence: 0.86,
  source: 'local_cache',
  notes: 'Cache match.',
  cache_hit: true,
  cache_match_type: 'exact',
  cache_layer: 'defaults',
  metadata: {
    cache_hit: true,
    cache_match_type: 'exact',
    cache_layer: 'defaults',
    source: 'local_cache',
    confidence: 0.86,
  },
}

const analysis: FridgeReceiptAnalysisResponse = {
  success: true,
  receipt_id: 'receipt_1',
  purchase_date: '2026-06-07',
  timezone: 'America/Los_Angeles',
  confidence: 0.82,
  source: 'local_ocr',
  ocr: { text: 'ORGANIC MILK 4.99', source: 'local_ocr', confidence: 0.8 },
  candidates: [],
  items: [milkPrediction],
  reminder_suggestions: [
    {
      title: 'Use before: Organic Milk',
      date: '2026-06-14',
      description: 'Receipt item: Organic Milk.',
    },
  ],
  trace: { receipt_id: 'receipt_1', steps: [] },
  warnings: [],
  recoverable_errors: [],
}

const inventoryItem: FridgeInventoryItem = {
  item_id: 'item_1',
  item_name: 'Organic Milk',
  normalized_name: 'milk',
  category: 'dairy',
  storage_type: 'fridge',
  purchase_date: '2026-06-07',
  estimated_expiration_date: '2026-06-14',
  estimated_shelf_life_days: 7,
  confidence: 0.86,
  source: 'local_cache',
  receipt_id: 'receipt_1',
  quantity: null,
  notes: '',
  created_at: '2026-06-07T00:00:00Z',
  updated_at: '2026-06-07T00:00:00Z',
}

class MockFridgeService implements IFridgeService {
  inventory: FridgeInventoryItem[] = []

  async analyzeReceipt(_input: AnalyzeReceiptInput): Promise<FridgeReceiptAnalysisResponse> {
    return analysis
  }

  async createInventoryItem(_draft: FridgeInventoryDraft): Promise<FridgeInventoryItem> {
    this.inventory = [inventoryItem]
    return inventoryItem
  }

  async deleteInventoryItem(itemId: string): Promise<void> {
    this.inventory = this.inventory.filter((item) => item.item_id !== itemId)
  }

  async getInventoryItems(): Promise<FridgeInventoryItem[]> {
    return this.inventory
  }

  async updateInventoryItem(
    _itemId: string,
    _changes: FridgeInventoryUpdate,
  ): Promise<FridgeInventoryItem> {
    return inventoryItem
  }
}

async function openFridgePanel(service = new MockFridgeService()) {
  configureFridgeService(service)
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Tools' }))
  await user.click(screen.getByRole('button', { name: 'Fridge' }))
  return { service, user }
}

describe('Fridge panel', () => {
  beforeEach(() => {
    configureEventSync(null)
    configureFridgeService(null)
    useCalendarStore.getState().reset({ focusedDate: '2026-06-07', view: 'month' })
    useEventStore.getState().reset()
    useFridgeStore.getState().reset()
    useUIStore.getState().reset()
  })

  it('analyzes a receipt image and renders fridge items', async () => {
    const { user } = await openFridgePanel()
    const file = new File(['png'], 'receipt.png', { type: 'image/png' })

    await user.upload(screen.getByLabelText('Receipt image'), file)
    await user.type(screen.getByLabelText('Purchase date'), '2026-06-07')
    await user.click(screen.getByRole('button', { name: 'Analyze receipt' }))

    expect(await screen.findByText('Organic Milk')).toBeInTheDocument()
    expect(screen.getByText(/confidence 82%/i)).toBeInTheDocument()
  })

  it('adds analyzed items to inventory', async () => {
    const { user } = await openFridgePanel()
    const file = new File(['png'], 'receipt.png', { type: 'image/png' })

    await user.upload(screen.getByLabelText('Receipt image'), file)
    await user.click(screen.getByRole('button', { name: 'Analyze receipt' }))
    await user.click(await screen.findByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(useFridgeStore.getState().inventory).toHaveLength(1)
    })
    expect(screen.getByText('Added Organic Milk')).toBeInTheDocument()
  })

  it('schedules expiration reminders as calendar events', async () => {
    const { user } = await openFridgePanel()
    const file = new File(['png'], 'receipt.png', { type: 'image/png' })

    await user.upload(screen.getByLabelText('Receipt image'), file)
    await user.click(screen.getByRole('button', { name: 'Analyze receipt' }))
    await user.click(await screen.findByRole('button', { name: 'Schedule all' }))

    await waitFor(() => {
      expect(useEventStore.getState().events).toHaveLength(1)
    })
    expect(useEventStore.getState().events[0].title).toBe('Use before: Organic Milk')
  })
})
