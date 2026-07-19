import { useDesktopUpdate } from '../../hooks/useDesktopUpdate'
import { useI18n } from '../../hooks/useI18n'
import Button from '../ui/Button'

export default function DesktopUpdateBanner() {
  const update = useDesktopUpdate()
  const { t } = useI18n()

  if (update.status !== 'available' || !update.update) return null

  const portable = update.distribution === 'portable'
  const apply = () => {
    if (portable) {
      void update.openReleasePage()
      return
    }
    if (window.confirm(t('update.confirmRestart'))) void update.install()
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold">
          {t('update.available', { version: update.update.version })}
        </p>
        <p className="mt-1 text-emerald-800">
          {portable ? t('update.portableNotice') : t('update.installedNotice')}
        </p>
      </div>
      <Button onClick={apply} type="button" variant="primary">
        {portable ? t('update.openRelease') : t('update.installAndRestart')}
      </Button>
    </section>
  )
}
