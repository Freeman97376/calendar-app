import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'

import { server } from './mocks/server'
import { configureApiRuntime } from '../../../src/services/appApiClient'
import { useAuthStore } from '../../../src/store/authStore'
import { configureRuntimeEnvironment } from '../../../src/store/configStore'

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

beforeEach(() => {
  // Node's fetch implementation requires an absolute URL. Keep API integration
  // tests deterministic instead of relying on another test to configure the
  // desktop sidecar origin first.
  configureApiRuntime({ baseUrl: 'http://localhost', csrfToken: '', desktopToken: '' })
  // The shared test bootstrap models the legacy/offline desktop capability.
  // Individual proxy tests opt back into server-managed AI explicitly.
  configureRuntimeEnvironment({ serverManagedAI: false })
  useAuthStore.setState({
    authRequired: false,
    capabilities: {
      backendConfigEditable: true,
      dataPortability: true,
      registration: false,
      serverManagedAI: false,
    },
    error: null,
    isSubmitting: false,
    mode: 'desktop',
    preferences: {},
    retryAfterSeconds: null,
    status: 'authenticated',
    user: { id: 'local', role: 'admin', username: 'local' },
  })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
