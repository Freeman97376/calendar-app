import { useDesktopUpdate } from '../../hooks/useDesktopUpdate'
import { useI18n } from '../../hooks/useI18n'
import Button from '../ui/Button'

function percentage(downloaded: number, total?: number): number | null {
  if (!total || total <= 0) return null
  return Math.min(100, Math.round((downloaded / total) * 100))
}

export default function DesktopUpdateSettings() {
  const update = useDesktopUpdate()
  const { t } = useI18n()

  if (update.status === 'unsupported' && !update.distribution) return null

  const progress = percentage(update.downloadedBytes, update.totalBytes)
  const busy = ['checking', 'downloading', 'installing'].includes(update.status)
  const portable = update.distribution === 'portable'
  const install = () => {
    if (portable) {
      void update.openReleasePage()
      return
    }
    if (window.confirm(t('update.confirmRestart'))) void update.install()
  }

  return (
    <section className="space-y-3 border-t border-slate-200 pt-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-950">{t('update.title')}</h3>
        <p className="mt-1 text-sm text-slate-600">
          {t('update.currentVersion', { version: update.currentVersion || 'unknown' })}
          {' · '}
          {portable ? t('update.portable') : t('update.installed')}
        </p>
        <p className="mt-1 text-sm text-slate-600">{t('update.localFirstDescription')}</p>
      </div>

      {update.status === 'upToDate' ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {t('update.upToDate')}
        </p>
      ) : null}

      {update.update ? (
        <div className="rounded-md border border-slate-200 bg-white px-3 py-3 text-sm">
          <p className="font-medium text-slate-900">
            {t('update.available', { version: update.update.version })}
          </p>
          {update.update.notes ? (
            <p className="mt-2 whitespace-pre-line text-slate-600">{update.update.notes}</p>
          ) : null}
        </div>
      ) : null}

      {update.status === 'downloading' ? (
        <p className="text-sm text-slate-600">
          {progress === null ? t('update.downloading') : t('update.downloadingPercent', { progress })}
        </p>
      ) : null}
      {update.status === 'installing' ? <p className="text-sm text-slate-600">{t('update.installing')}</p> : null}
      {update.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{update.error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void update.check(false)} type="button" variant="secondary">
          {update.status === 'checking' ? t('update.checking') : t('update.check')}
        </Button>
        {update.status === 'available' ? (
          <Button disabled={busy} onClick={install} type="button" variant="primary">
            {portable ? t('update.openRelease') : t('update.installAndRestart')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
