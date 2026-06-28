export const TOOL_SESSION_OUTPUT_SCHEMA_KEY = 'calendar_event_drafts'

export const TOOL_SESSION_OUTPUT_SCHEMA_PREVIEW = {
  summary: 'string',
  events: [
    {
      title: 'string',
      description: 'optional string',
      displayDetails: 'optional string shown as expandable calendar details',
      startAt: 'ISO datetime',
      endAt: 'ISO datetime',
      allDay: false,
      eventTypeId: 'optional existing calendar type id',
      color: 'optional CSS color',
    },
  ],
  warnings: ['string'],
}
