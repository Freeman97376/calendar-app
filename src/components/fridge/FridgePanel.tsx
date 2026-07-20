import { useState, type FormEvent } from 'react'

import { useFridge } from '../../hooks/useFridge'
import Button from '../ui/Button'

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`
}

type FridgePanelProps = {
  embedded?: boolean
}

function FridgeContent() {
  const fridge = useFridge()
  const [file, setFile] = useState<File | null>(null)
  const [purchaseDate, setPurchaseDate] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) return

    setStatus(null)
    await fridge.analyzeReceipt({
      image: file,
      purchaseDate: purchaseDate || undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
  }

  async function addItem(index: number) {
    const item = fridge.analysis?.items[index]
    if (!item) return

    await fridge.addItem(item)
    setStatus(`Added ${item.item_name}`)
  }

  async function addAllItems() {
    await fridge.addAllItems()
    setStatus('Added analyzed items')
  }

  async function scheduleAll() {
    await fridge.scheduleAllReminders()
    setStatus('Scheduled expiration reminders')
  }

  return (
    <>
      <div className="border-b border-slate-200 px-4 py-4">
        <h2 className="text-base font-semibold text-slate-950">Fridge</h2>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-700" htmlFor="receipt-image">
            Receipt image
          </label>
          <input
            accept="image/jpeg,image/png,image/webp"
            className="block w-full text-sm text-slate-700 file:mr-3 file:h-9 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:text-sm file:font-medium file:text-white"
            id="receipt-image"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            type="file"
          />

          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="receipt-purchase-date"
          >
            Purchase date
          </label>
          <input
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
            id="receipt-purchase-date"
            onChange={(event) => setPurchaseDate(event.target.value)}
            type="date"
            value={purchaseDate}
          />

          <Button disabled={!file || fridge.isAnalyzing} type="submit" variant="primary">
            {fridge.isAnalyzing ? 'Analyzing...' : 'Analyze receipt'}
          </Button>
        </form>

        {fridge.error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{fridge.error}</p>
        ) : null}
        {status ? (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</p>
        ) : null}

        {fridge.analysis ? (
          <section className="space-y-3" aria-label="Receipt analysis">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-950">Receipt Items</h3>
              <div className="flex gap-2">
                <Button
                  disabled={!fridge.analysis.items.length}
                  onClick={addAllItems}
                  variant="secondary"
                >
                  Add all
                </Button>
                <Button
                  disabled={!fridge.analysis.reminder_suggestions.length}
                  onClick={scheduleAll}
                  variant="secondary"
                >
                  Schedule all
                </Button>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              {fridge.analysis.items.length} items, confidence{' '}
              {formatConfidence(fridge.analysis.confidence)}
            </p>

            {fridge.analysis.warnings.length ? (
              <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {fridge.analysis.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}

            <div className="space-y-2">
              {fridge.analysis.items.map((item, index) => (
                <div
                  className="rounded-md border border-slate-200 p-3"
                  key={`${item.normalized_name}-${index}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{item.item_name}</p>
                      <p className="text-xs text-slate-500">
                        {item.category} - {item.storage_type} - {formatConfidence(item.confidence)}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Expires {item.estimated_expiration_date ?? 'unknown'} - {item.source}
                      </p>
                    </div>
                    <Button onClick={() => addItem(index)} variant="secondary">
                      Add
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-3" aria-label="Fridge inventory">
          <h3 className="text-sm font-semibold text-slate-950">Inventory</h3>
          {fridge.isInventoryLoading ? <p className="text-sm text-slate-500">Loading...</p> : null}
          {!fridge.inventory.length && !fridge.isInventoryLoading ? (
            <p className="text-sm text-slate-500">No fridge items yet.</p>
          ) : null}
          <div className="space-y-2">
            {fridge.inventory.map((item) => (
              <div className="rounded-md border border-slate-200 p-3" key={item.item_id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{item.item_name}</p>
                    <p className="text-xs text-slate-500">
                      {item.category} - {item.storage_type}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Expires {item.estimated_expiration_date ?? 'unknown'}
                    </p>
                  </div>
                  <Button onClick={() => fridge.deleteInventoryItem(item.item_id)} variant="ghost">
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}

export default function FridgePanel({ embedded = false }: FridgePanelProps) {
  if (embedded) {
    return (
      <div aria-label="Fridge manager" className="flex min-h-0 flex-1 flex-col bg-white">
        <FridgeContent />
      </div>
    )
  }

  return (
    <aside
      aria-label="Fridge manager"
      className="flex w-full flex-col border-t border-slate-200 bg-white xl:max-w-md xl:border-l xl:border-t-0"
    >
      <FridgeContent />
    </aside>
  )
}
