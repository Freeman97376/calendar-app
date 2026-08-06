import { useEffect, useState, type FormEvent } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { useI18n } from '../../hooks/useI18n'
import Button from '../ui/Button'

export default function LoginPage({ overlay = false }: { overlay?: boolean }) {
  const auth = useAuth()
  const { language, setLanguage, t } = useI18n()
  const [username, setUsername] = useState(overlay ? (auth.user?.username ?? '') : '')
  const [password, setPassword] = useState('')

  const [remainingSeconds, setRemainingSeconds] = useState(auth.retryAfterSeconds ?? 0)

  useEffect(() => {
    setRemainingSeconds(auth.retryAfterSeconds ?? 0)
    if (!auth.retryAfterSeconds) return
    const timer = window.setInterval(() => {
      setRemainingSeconds((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [auth.retryAfterSeconds])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await auth.login(username, password)
    } catch {
      // The auth boundary presents the safe error state.
    } finally {
      setPassword('')
    }
  }

  return (
    <div
      aria-modal={overlay || undefined}
      className={
        overlay
          ? 'fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm'
          : 'flex min-h-screen items-center justify-center bg-slate-100 px-4'
      }
      role={overlay ? 'dialog' : undefined}
    >
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
          {t('auth.appName')}
        </p>
        {overlay ? (
          <p className="mt-2 text-lg font-semibold text-amber-800">{t('auth.reauthTitle')}</p>
        ) : null}
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">{t('auth.title')}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {overlay ? t('auth.reauthDescription') : t('auth.accountDescription')}
        </p>
        <label className="mt-4 block text-xs font-medium text-slate-600">
          {t('auth.switchLanguage')}
          <select
            aria-label={t('auth.switchLanguage')}
            className="ml-2 h-9 rounded-lg border border-slate-300 bg-white px-2"
            onChange={(event) => setLanguage(event.target.value === 'zh' ? 'zh' : 'en')}
            value={language}
          >
            <option value="en">English</option>
            <option value="zh">{t('auth.languageChinese')}</option>
          </select>
        </label>
        <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="block text-sm font-medium text-slate-700" htmlFor="login-username">
            {t('auth.username')}
            <input
              autoComplete="username"
              className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              id="login-username"
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700" htmlFor="login-password">
            {t('auth.password')}
            <input
              autoComplete="current-password"
              className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              autoFocus={overlay}
              id="login-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {auth.error ? (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{auth.error}</p>
          ) : null}
          {remainingSeconds > 0 ? (
            <p aria-live="polite" className="text-sm text-amber-800">
              {t('auth.retryIn', { seconds: remainingSeconds })}
            </p>
          ) : null}
          <Button
            className="w-full"
            disabled={auth.isSubmitting || remainingSeconds > 0}
            type="submit"
          >
            {auth.isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
          </Button>
        </form>
      </section>
    </div>
  )
}
