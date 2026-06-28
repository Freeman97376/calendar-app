import CalendarShell from './components/calendar/CalendarShell'
import ErrorBoundary from './components/ui/ErrorBoundary'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6">
        <h1 className="sr-only">Calendar App</h1>
        <ErrorBoundary fallbackTitle="Calendar failed">
          <CalendarShell />
        </ErrorBoundary>
      </main>
    </div>
  )
}
