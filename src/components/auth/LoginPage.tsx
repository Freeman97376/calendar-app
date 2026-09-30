import { useEffect, useRef, useState, type FormEvent } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { useI18n, type TranslationKey } from '../../hooks/useI18n'
import Button from '../ui/Button'

export default function LoginPage({ overlay = false }: { overlay?: boolean }) {
  const auth = useAuth()
  const { language, setLanguage, t } = useI18n()
  const [username, setUsername] = useState(overlay ? (auth.user?.username ?? '') : '')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [registerMode, setRegisterMode] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [registrationError, setRegistrationError] = useState<TranslationKey | null>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const canRegister = !overlay && auth.mode === 'server' && auth.capabilities?.registration === true
  const registering = registerMode && canRegister

  useEffect(() => {
    if (registrationError) errorRef.current?.focus()
  }, [registrationError])

  useEffect(() => {
    if (registered) passwordRef.current?.focus()
  }, [registered])

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
    if (auth.isSubmitting || remainingSeconds > 0) return
    setRegistrationError(null)
    setRegistered(false)
    if (registering && password !== confirmation) {
      setRegistrationError('auth.passwordMismatch')
      return
    }
    try {
      if (registering) {
        await auth.register(username, password, inviteCode)
        setRegisterMode(false)
        setRegistered(true)
      } else {
        await auth.login(username, password)
      }
    } catch (error) {
      if (registering) {
        setRegistrationError(auth.registrationErrorKey(error))
      }
    } finally {
      setPassword('')
      setConfirmation('')
      setInviteCode('')
    }
  }

  function switchMode() {
    setRegisterMode((current) => !current)
    setRegistrationError(null)
    setRegistered(false)
    setPassword('')
    setConfirmation('')
    setInviteCode('')
  }

  return (
    <div
      aria-modal={overlay || undefined}
      className={
        overlay
          ? 'fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm'
          : 'flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8'
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
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">
          {t(registering ? 'auth.register' : 'auth.title')}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {overlay
            ? t('auth.reauthDescription')
            : t(
                registering
                  ? 'auth.registerDescription'
                  : canRegister
                    ? 'auth.inviteDescription'
                    : 'auth.accountDescription',
              )}
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
        {registered ? (
          <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
            {t('auth.registrationSuccess')}
          </p>
        ) : null}
        <form
          aria-busy={auth.isSubmitting}
          className="mt-6 space-y-4"
          onSubmit={(event) => void submit(event)}
        >
          {registrationError ? (
            <p
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
            >
              {t(registrationError)}
            </p>
          ) : null}
          <label className="block text-sm font-medium text-slate-700" htmlFor="login-username">
            {t('auth.username')}
            <input
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              disabled={auth.isSubmitting}
              minLength={registering ? 3 : undefined}
              maxLength={registering ? 50 : 256}
              pattern={registering ? '[A-Za-z0-9._\\-]{3,50}' : undefined}
              aria-describedby={registering ? 'register-username-hint' : undefined}
              className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              id="login-username"
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
            {registering ? (
              <span
                id="register-username-hint"
                className="mt-1 block text-xs font-normal text-slate-600"
              >
                {t('auth.usernameHint')}
              </span>
            ) : null}
          </label>
          <label className="block text-sm font-medium text-slate-700" htmlFor="login-password">
            {t('auth.password')}
            <input
              autoComplete={registering ? 'new-password' : 'current-password'}
              ref={passwordRef}
              disabled={auth.isSubmitting}
              minLength={registering ? 12 : undefined}
              maxLength={256}
              aria-describedby={registering ? 'register-password-hint' : undefined}
              className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              autoFocus={overlay}
              id="login-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            {registering ? (
              <span
                id="register-password-hint"
                className="mt-1 block text-xs font-normal text-slate-600"
              >
                {t('auth.passwordHint')}
              </span>
            ) : null}
          </label>
          {registering ? (
            <>
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="register-confirm"
              >
                {t('auth.confirmPassword')}
                <input
                  id="register-confirm"
                  autoComplete="new-password"
                  type="password"
                  required
                  disabled={auth.isSubmitting}
                  minLength={12}
                  maxLength={256}
                  aria-invalid={registrationError === 'auth.passwordMismatch' || undefined}
                  aria-describedby={
                    registrationError === 'auth.passwordMismatch'
                      ? 'register-confirm-error'
                      : undefined
                  }
                  className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
                {registrationError === 'auth.passwordMismatch' ? (
                  <span id="register-confirm-error" className="mt-1 block text-sm text-red-800">
                    {t('auth.passwordMismatch')}
                  </span>
                ) : null}
              </label>
              <label className="block text-sm font-medium text-slate-700" htmlFor="register-invite">
                {t('auth.inviteCode')}
                <input
                  id="register-invite"
                  autoComplete="off"
                  type="password"
                  required
                  disabled={auth.isSubmitting}
                  maxLength={256}
                  aria-invalid={registrationError === 'auth.invalidInvite' || undefined}
                  aria-describedby={
                    registrationError === 'auth.invalidInvite' ? 'register-invite-error' : undefined
                  }
                  className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                />
                {registrationError === 'auth.invalidInvite' ? (
                  <span id="register-invite-error" className="mt-1 block text-sm text-red-800">
                    {t('auth.invalidInvite')}
                  </span>
                ) : null}
              </label>
            </>
          ) : null}
          {!registering && auth.error ? (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{auth.error}</p>
          ) : null}
          {remainingSeconds > 0 ? (
            <p aria-live="polite" className="text-sm text-amber-800">
              {t('auth.retryIn', { seconds: remainingSeconds })}
            </p>
          ) : null}
          <Button
            className="h-11 w-full"
            disabled={auth.isSubmitting || remainingSeconds > 0}
            type="submit"
          >
            {auth.isSubmitting
              ? t(registering ? 'auth.registering' : 'auth.signingIn')
              : t(registering ? 'auth.register' : 'auth.signIn')}
          </Button>
        </form>
        {canRegister ? (
          <Button
            className="mt-3 h-11 w-full"
            variant="ghost"
            disabled={auth.isSubmitting}
            onClick={switchMode}
          >
            {t(registering ? 'auth.backToLogin' : 'auth.register')}
          </Button>
        ) : null}
      </section>
    </div>
  )
}
