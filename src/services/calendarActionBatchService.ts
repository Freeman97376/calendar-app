import {
  CalendarActionBatchRequestSchema,
  CalendarActionBatchResponseSchema,
} from '../domain/schemas/calendarActionBatch.schema'
import type {
  CalendarActionBatchRequest,
  CalendarActionBatchResponse,
} from '../domain/schemas/calendarActionBatch.schema'
import { apiBaseUrl, authenticatedFetch } from './appApiClient'
import { CalendarApiClient } from './calendarApiClient'

export class CalendarActionBatchService {
  constructor(
    private readonly client = new CalendarApiClient(() => apiBaseUrl(), authenticatedFetch),
  ) {}

  async apply(input: CalendarActionBatchRequest): Promise<CalendarActionBatchResponse> {
    const request = CalendarActionBatchRequestSchema.parse(input)
    const response = await this.client.post<unknown>('/api/calendar/action-batches', request)
    return CalendarActionBatchResponseSchema.parse(response)
  }
}

let service = new CalendarActionBatchService()

export function configureCalendarActionBatchService(next: CalendarActionBatchService | null) {
  service = next ?? new CalendarActionBatchService()
}

export function applyCalendarActionBatch(input: CalendarActionBatchRequest) {
  return service.apply(input)
}
