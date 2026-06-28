import { useEffect, useMemo, useState, type FormEvent } from 'react'

import type { ToolPreset, ToolSessionLlmOptions } from '../../../domain/types'
import {
  defaultInputsForPreset,
  parseToolSessionFieldsJson,
  useToolSessions,
} from '../../../hooks/useToolSessions'
import Button from '../../ui/Button'

const inputClass =
  'mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100'
const textAreaClass =
  'mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100'

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function fieldInputType(type: ToolPreset['fields'][number]['type']): string {
  if (type === 'number') return 'number'
  if (type === 'date') return 'date'
  if (type === 'time') return 'time'
  return 'text'
}

export default function ToolSessionsPanel() {
  const toolSessions = useToolSessions()
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const selectedPreset = useMemo(
    () => toolSessions.presets.find((preset) => preset.id === selectedPresetId) ?? toolSessions.presets[0],
    [selectedPresetId, toolSessions.presets],
  )
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [llmOptions, setLlmOptions] = useState<ToolSessionLlmOptions>({ provider: 'global' })
  const [editDraft, setEditDraft] = useState({
    description: '',
    fieldsJson: '[]',
    label: '',
    prompt: '',
  })
  const [localError, setLocalError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (selectedPresetId || !toolSessions.presets.length) return
    setSelectedPresetId(toolSessions.presets[0].id)
  }, [selectedPresetId, toolSessions.presets])

  useEffect(() => {
    if (!selectedPreset) return

    setInputs(defaultInputsForPreset(selectedPreset))
    setLlmOptions(selectedPreset.defaultLlmOptions)
    setEditDraft({
      description: selectedPreset.description,
      fieldsJson: prettyJson(selectedPreset.fields),
      label: selectedPreset.label,
      prompt: selectedPreset.prompt,
    })
    setLocalError(null)
    setStatus(null)
  }, [selectedPreset])

  const canRun = Boolean(
    selectedPreset &&
      !toolSessions.isRunning &&
      selectedPreset.fields.every((field) => !field.required || inputs[field.id]?.trim()),
  )

  async function runSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPreset) return

    setLocalError(null)
    setStatus(null)
    await toolSessions.runToolSession(selectedPreset, inputs, {
      ...llmOptions,
      model: llmOptions.model?.trim() || undefined,
    })
  }

  async function duplicatePreset() {
    if (!selectedPreset) return

    const preset = await toolSessions.duplicatePreset(selectedPreset.id)
    setSelectedPresetId(preset.id)
    setStatus(`Created ${preset.label}`)
  }

  async function savePresetCopy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPreset || selectedPreset.isBuiltIn) return

    try {
      setLocalError(null)
      const fields = parseToolSessionFieldsJson(editDraft.fieldsJson)
      const updated = await toolSessions.updatePreset(selectedPreset.id, {
        description: editDraft.description,
        fields,
        label: editDraft.label,
        prompt: editDraft.prompt,
      })
      setSelectedPresetId(updated.id)
      setStatus(`Saved ${updated.label}`)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Unable to save preset')
    }
  }

  async function deletePresetCopy() {
    if (!selectedPreset || selectedPreset.isBuiltIn) return

    await toolSessions.deletePreset(selectedPreset.id)
    setSelectedPresetId(toolSessions.presets[0]?.id ?? '')
    setStatus('Deleted preset copy.')
  }

  async function applyResult() {
    const created = await toolSessions.applyResult()
    setStatus(`Applied ${created.length} event${created.length === 1 ? '' : 's'} to the calendar.`)
  }

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-950">Tool Sessions</h3>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="tool-preset">
            Prompt preset
          </label>
          <select
            className={inputClass}
            id="tool-preset"
            onChange={(event) => setSelectedPresetId(event.target.value)}
            value={selectedPreset?.id ?? ''}
          >
            {toolSessions.presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        {selectedPreset ? (
          <div className="rounded-md border border-slate-200 p-3 text-sm text-slate-700">
            <p className="font-medium text-slate-950">{selectedPreset.description}</p>
            <p className="mt-1 text-xs uppercase text-slate-500">
              {selectedPreset.isBuiltIn ? 'Built-in preset' : 'Custom preset'}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void duplicatePreset()} variant="secondary">
            Duplicate preset
          </Button>
        </div>
      </section>

      {selectedPreset && !selectedPreset.isBuiltIn ? (
        <section className="space-y-3 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-950">Preset Copy</h3>
          <form className="space-y-3" onSubmit={(event) => void savePresetCopy(event)}>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="tool-copy-label">
                Preset label
              </label>
              <input
                className={inputClass}
                id="tool-copy-label"
                onChange={(event) => setEditDraft((current) => ({ ...current, label: event.target.value }))}
                value={editDraft.label}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="tool-copy-description">
                Preset description
              </label>
              <textarea
                className={textAreaClass}
                id="tool-copy-description"
                onChange={(event) =>
                  setEditDraft((current) => ({ ...current, description: event.target.value }))
                }
                value={editDraft.description}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="tool-copy-prompt">
                Prompt
              </label>
              <textarea
                className={textAreaClass}
                id="tool-copy-prompt"
                onChange={(event) => setEditDraft((current) => ({ ...current, prompt: event.target.value }))}
                value={editDraft.prompt}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="tool-copy-fields">
                Input fields JSON
              </label>
              <textarea
                className="mt-1 min-h-40 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                id="tool-copy-fields"
                onChange={(event) =>
                  setEditDraft((current) => ({ ...current, fieldsJson: event.target.value }))
                }
                value={editDraft.fieldsJson}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary">
                Save preset copy
              </Button>
              <Button onClick={() => void deletePresetCopy()} variant="ghost">
                Delete copy
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {selectedPreset ? (
        <form className="space-y-5 border-t border-slate-200 pt-4" onSubmit={(event) => void runSession(event)}>
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-950">Inputs</legend>
            {selectedPreset.fields.map((field) => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-slate-700" htmlFor={`tool-input-${field.id}`}>
                  {field.label}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    className={textAreaClass}
                    id={`tool-input-${field.id}`}
                    onChange={(event) =>
                      setInputs((current) => ({ ...current, [field.id]: event.target.value }))
                    }
                    placeholder={field.placeholder}
                    value={inputs[field.id] ?? ''}
                  />
                ) : field.type === 'select' ? (
                  <select
                    className={inputClass}
                    id={`tool-input-${field.id}`}
                    onChange={(event) =>
                      setInputs((current) => ({ ...current, [field.id]: event.target.value }))
                    }
                    value={inputs[field.id] ?? ''}
                  >
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={inputClass}
                    id={`tool-input-${field.id}`}
                    onChange={(event) =>
                      setInputs((current) => ({ ...current, [field.id]: event.target.value }))
                    }
                    placeholder={field.placeholder}
                    type={fieldInputType(field.type)}
                    value={inputs[field.id] ?? ''}
                  />
                )}
              </div>
            ))}
          </fieldset>

          <fieldset className="space-y-3 border-t border-slate-200 pt-4">
            <legend className="text-sm font-semibold text-slate-950">LLM settings</legend>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="tool-provider">
                Provider
              </label>
              <select
                className={inputClass}
                id="tool-provider"
                onChange={(event) =>
                  setLlmOptions((current) => ({
                    ...current,
                    provider: event.target.value as ToolSessionLlmOptions['provider'],
                  }))
                }
                value={llmOptions.provider}
              >
                <option value="global">Use global settings</option>
                <option value="api">API</option>
                <option value="local">Local</option>
              </select>
            </div>

            {llmOptions.provider !== 'local' ? (
              <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="tool-model">
                Model override
              </label>
              <input
                className={inputClass}
                id="tool-model"
                onChange={(event) =>
                  setLlmOptions((current) => ({ ...current, model: event.target.value }))
                }
                value={llmOptions.model ?? ''}
              />
              </div>
            ) : null}
          </fieldset>

          <section className="space-y-2 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-950">Output schema</h3>
            <pre className="overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">
              {prettyJson(toolSessions.outputSchemaPreview)}
            </pre>
          </section>

          <Button disabled={!canRun} type="submit" variant="primary">
            {toolSessions.isRunning ? 'Running...' : 'Run tool session'}
          </Button>
        </form>
      ) : null}

      {toolSessions.result ? (
        <section className="space-y-3 border-t border-slate-200 pt-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Result</h3>
            <p className="mt-1 text-sm text-slate-600">{toolSessions.result.summary}</p>
          </div>

          <div className="space-y-2">
            {toolSessions.result.events.map((event, index) => (
              <div className="rounded-md border border-slate-200 p-3" key={`${event.title}-${index}`}>
                <p className="text-sm font-semibold text-slate-950">{event.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(event.startAt).toLocaleString()} - {new Date(event.endAt).toLocaleTimeString()}
                </p>
                {event.displayDetails ? (
                  <p className="mt-2 whitespace-pre-line text-xs text-slate-700">{event.displayDetails}</p>
                ) : null}
              </div>
            ))}
          </div>

          {toolSessions.result.warnings.length ? (
            <div className="space-y-1 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
              {toolSessions.result.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void applyResult()} variant="primary">
              Apply events
            </Button>
            <Button onClick={toolSessions.clearResult}>Dismiss</Button>
          </div>
        </section>
      ) : null}

      {toolSessions.error || localError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {toolSessions.error ?? localError}
        </p>
      ) : null}
      {status ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</p>
      ) : null}
    </div>
  )
}
