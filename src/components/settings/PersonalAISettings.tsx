import { useI18n } from '../../hooks/useI18n'
import { usePersonalAISettings } from '../../hooks/usePersonalAISettings'
import Button from '../ui/Button'

const inputClass =
  'mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100'

export default function PersonalAISettings({ userId }: { userId: string }) {
  const { t } = useI18n()
  const {
    saved,
    key,
    setKey,
    showKey,
    setShowKey,
    routineModel,
    setRoutineModel,
    planningModel,
    setPlanningModel,
    busy,
    error,
    setError,
    notice,
    setNotice,
    confirmRemove,
    setConfirmRemove,
    keyInput,
    validKey,
    submit,
    change,
  } = usePersonalAISettings(userId)

  return (
    <section
      aria-labelledby="personal-ai-heading"
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <h3 id="personal-ai-heading" className="font-semibold text-slate-950">
        {t('personalAI.title')}
      </h3>
      <p className="text-sm text-slate-600">{t('personalAI.description')}</p>
      <p className="text-sm text-slate-700" role="status">
        {!saved
          ? t('personalAI.loading')
          : saved.source === 'personal'
            ? t('personalAI.personal')
            : saved.source === 'server'
              ? t('personalAI.server')
              : t('personalAI.none')}
      </p>
      {saved && !saved.editable ? (
        <p role="alert" className="text-sm text-amber-800">
          {t('personalAI.unavailable')}
        </p>
      ) : null}
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy || !saved?.editable} className="space-y-4 disabled:opacity-60">
          <legend className="sr-only">DeepSeek</legend>
          <p className="break-all text-sm text-slate-600">DeepSeek · https://api.deepseek.com</p>
          <div>
            <label htmlFor="personal-ai-key" className="block text-sm font-medium text-slate-700">
              API Key
            </label>
            <div className="flex items-end gap-2">
              <input
                ref={keyInput}
                id="personal-ai-key"
                className={inputClass}
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                value={key}
                onChange={(event) => {
                  setKey(event.target.value)
                  setNotice(null)
                  if (error === 'key') setError(null)
                }}
                onBlur={() => {
                  if (key) validKey()
                }}
                aria-invalid={error === 'key'}
                aria-describedby="personal-ai-key-hint"
                placeholder={
                  saved?.personalKeyConfigured ? t('personalAI.keep') : t('personalAI.enter')
                }
              />
              <Button
                type="button"
                className="min-h-11 shrink-0"
                aria-pressed={showKey}
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? t('personalAI.hide') : t('personalAI.show')}
              </Button>
            </div>
            <p id="personal-ai-key-hint" className="mt-1 text-xs text-slate-600">
              {t('personalAI.keyHint')}
            </p>
            {error === 'key' ? (
              <p role="alert" className="mt-1 text-sm text-red-700">
                {t('personalAI.keyError')}
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="personal-ai-routine">
              {t('personalAI.routine')}
              <select
                id="personal-ai-routine"
                className={inputClass}
                value={routineModel}
                onChange={(event) => setRoutineModel(event.target.value as typeof routineModel)}
              >
                <option value="deepseek-chat">deepseek-chat</option>
                <option value="deepseek-reasoner">deepseek-reasoner</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700" htmlFor="personal-ai-planning">
              {t('personalAI.planning')}
              <select
                id="personal-ai-planning"
                className={inputClass}
                value={planningModel}
                onChange={(event) => setPlanningModel(event.target.value as typeof routineModel)}
              >
                <option value="deepseek-reasoner">deepseek-reasoner</option>
                <option value="deepseek-chat">deepseek-chat</option>
              </select>
            </label>
          </div>
          <Button type="submit" variant="primary" className="min-h-11">
            {busy ? t('personalAI.saving') : t('personalAI.save')}
          </Button>
        </fieldset>
      </form>
      {saved?.personalKeyConfigured ? (
        <div className="space-y-2">
          {confirmRemove ? (
            <>
              <p className="text-sm text-slate-700">{t('personalAI.removeHint')}</p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} className="min-h-11" onClick={() => void change('DELETE')}>
                  {t('personalAI.confirmRemove')}
                </Button>
                <Button
                  disabled={busy}
                  className="min-h-11"
                  onClick={() => setConfirmRemove(false)}
                >
                  {t('personalAI.cancel')}
                </Button>
              </div>
            </>
          ) : (
            <Button disabled={busy} className="min-h-11" onClick={() => setConfirmRemove(true)}>
              {t('personalAI.remove')}
            </Button>
          )}
        </div>
      ) : null}
      {error && error !== 'key' ? (
        <p role="alert" className="text-sm text-red-700">
          {t(
            error === 'unavailable'
              ? 'personalAI.unavailable'
              : error === 'load'
                ? 'personalAI.loadError'
                : 'personalAI.saveError',
          )}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-emerald-800">
          {t(notice === 'saved' ? 'personalAI.saved' : 'personalAI.removed')}
        </p>
      ) : null}
    </section>
  )
}
