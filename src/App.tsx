import { useEffect } from 'react'

import CalendarShell from './components/calendar/CalendarShell'
import AccountBar from './components/auth/AccountBar'
import LoginPage from './components/auth/LoginPage'
import DesktopUpdateBanner from './components/desktop/DesktopUpdateBanner'
import StartupRecoveryPage from './components/auth/StartupRecoveryPage'
import ErrorBoundary from './components/ui/ErrorBoundary'
import { useAuth } from './hooks/useAuth'
import { useDesktopUpdate } from './hooks/useDesktopUpdate'
import { desktopRuntimeInfo } from './services/desktopRuntime'
import { initializeRuntimeConfig } from './store/configStore'

export default function App() {
  const auth = useAuth()
  const { check: checkForDesktopUpdate } = useDesktopUpdate()

  useEffect(() => {
    if (auth.status === 'authenticated' && auth.capabilities?.serverManagedAI) {
      initializeRuntimeConfig(auth.preferences)
    }
  }, [auth.capabilities?.serverManagedAI, auth.preferences, auth.status])

  useEffect(() => {
    if (auth.status === 'authenticated' && desktopRuntimeInfo()) void checkForDesktopUpdate(true)
  }, [auth.status, checkForDesktopUpdate])

  if (auth.status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700">
        Loading Calendar App…
      </main>
    )
  }

  if (auth.status === 'startup-error') {
    return <StartupRecoveryPage />
  }

  if (auth.authRequired && !auth.user) return <LoginPage />

  const reauthRequired = auth.status === 'reauth-required'

  return (
    <>
      <div
        aria-hidden={reauthRequired || undefined}
        className="min-h-screen bg-slate-50 text-slate-950"
        ref={(element) => {
          if (element) element.toggleAttribute('inert', reauthRequired)
        }}
      >
        <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6">
          <h1 className="sr-only">Calendar App</h1>
          <AccountBar />
          <DesktopUpdateBanner />
          <ErrorBoundary fallbackTitle="Calendar failed">
            <CalendarShell />
          </ErrorBoundary>
        </main>
      </div>
      {reauthRequired ? <LoginPage overlay /> : null}
    </>
  )
}
