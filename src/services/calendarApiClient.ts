import { authenticatedFetch } from './appApiClient'

export type CalendarApiResponse<T> = T & {
  success: true
}

export class CalendarApiClient {
  constructor(
    private readonly getBaseUrl: () => string,
    private readonly fetcher: typeof fetch = authenticatedFetch,
  ) {}

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' })
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl()}${path}`, init)
    const payload = (await response.json()) as unknown

    if (!response.ok) {
      const message =
        typeof payload === 'object' &&
        payload !== null &&
        'error' in payload &&
        typeof payload.error === 'object' &&
        payload.error !== null &&
        'message' in payload.error
          ? String(payload.error.message)
          : `Calendar API request failed with status ${response.status}`
      throw new Error(message)
    }

    return payload as T
  }

  private baseUrl(): string {
    return this.getBaseUrl().replace(/\/$/, '')
  }
}
