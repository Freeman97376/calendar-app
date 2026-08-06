import { useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { useI18n } from '../../hooks/useI18n'
import Button from '../ui/Button'

export default function StartupRecoveryPage() {
  const auth = useAuth()
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  async function retry() {
    await auth.bootstrap().catch(() => undefined)
  }

  async function copyDiagnostic() {
    await navigator.clipboard.writeText(auth.startupDiagnostic())
    setCopied(true)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <section className="w-full max-w-xl rounded-2xl border border-red-200 bg-white p-7 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700">
          {t('auth.appName')}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">{t('startup.title')}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{t('startup.description')}</p>
        {auth.error ? (
          <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-xs text-red-900">
            {auth.error}
          </pre>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button disabled={auth.status === 'loading'} onClick={() => void retry()}>
            {auth.status === 'loading' ? t('startup.retrying') : t('startup.retry')}
          </Button>
          <Button onClick={() => void copyDiagnostic()} variant="secondary">
            {t('startup.copyDiagnostic')}
          </Button>
        </div>
        {copied ? <p className="mt-3 text-sm text-emerald-700">{t('startup.copied')}</p> : null}
      </section>
    </main>
  )
}
