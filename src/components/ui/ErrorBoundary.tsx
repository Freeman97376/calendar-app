import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
  fallbackTitle?: string
}

type ErrorBoundaryState = {
  error: Error | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application section failed', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <section
          aria-live="assertive"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          <h2 className="font-semibold">{this.props.fallbackTitle ?? 'Something went wrong'}</h2>
          <p className="mt-1">Refresh the page or try the action again.</p>
        </section>
      )
    }

    return this.props.children
  }
}
