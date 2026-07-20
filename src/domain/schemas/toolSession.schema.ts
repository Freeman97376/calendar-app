import { z } from 'zod'

const ISODateTimeSchema = z.string().datetime()
const ISODateSchema = z.string().date()

export const ToolSessionProviderSchema = z.enum(['global', 'api', 'local'])

export const ToolSessionLlmOptionsSchema = z.object({
  model: z.string().trim().optional(),
  provider: ToolSessionProviderSchema.default('global'),
})

export const ToolSessionFieldOptionSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(120),
})

export const ToolSessionFieldSchema = z.object({
  defaultValue: z.string().optional(),
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(80),
  options: z.array(ToolSessionFieldOptionSchema).optional(),
  placeholder: z.string().trim().max(160).optional(),
  required: z.boolean().default(false),
  type: z.enum(['text', 'textarea', 'date', 'time', 'number', 'select']).default('text'),
})

export const ToolSessionOutputSchemaKeySchema = z.literal('calendar_event_drafts')

export const ToolPresetSchema = z.object({
  createdAt: z.string().datetime().optional(),
  defaultLlmOptions: ToolSessionLlmOptionsSchema.default({ provider: 'global' }),
  description: z.string().trim().min(1).max(500),
  fields: z.array(ToolSessionFieldSchema).min(1).max(20),
  id: z.string().trim().min(1).max(80),
  isBuiltIn: z.boolean().default(false),
  label: z.string().trim().min(1).max(80),
  outputSchemaKey: ToolSessionOutputSchemaKeySchema.default('calendar_event_drafts'),
  prompt: z.string().trim().min(1).max(4000),
  updatedAt: z.string().datetime().optional(),
})

export const ToolSessionRequestSchema = z.object({
  currentDate: ISODateSchema.optional(),
  currentDateTime: ISODateTimeSchema.optional(),
  currentLocalDateTime: z.string().trim().optional(),
  focusedDate: ISODateSchema.optional(),
  inputs: z.record(z.string()),
  locale: z.string().trim().optional(),
  localDateTimeLabel: z.string().trim().optional(),
  llmOptions: ToolSessionLlmOptionsSchema.default({ provider: 'global' }),
  outputSchemaKey: ToolSessionOutputSchemaKeySchema.default('calendar_event_drafts'),
  presetId: z.string().trim().min(1),
  presetLabel: z.string().trim().min(1),
  prompt: z.string().trim().min(1).max(4000),
  timezone: z.string().trim().optional(),
  timezoneName: z.string().trim().optional(),
  timezoneOffsetLabel: z.string().trim().optional(),
  timezoneOffsetMinutes: z.number().int().optional(),
  today: ISODateSchema,
})

export const ToolSessionEventDraftSchema = z
  .object({
    allDay: z.boolean().default(false),
    color: z.string().trim().optional(),
    description: z.string().trim().optional(),
    displayDetails: z.string().trim().optional(),
    endAt: ISODateTimeSchema,
    eventTypeId: z.string().trim().min(1).optional(),
    startAt: ISODateTimeSchema,
    title: z.string().trim().min(1).max(200),
  })
  .refine((event) => new Date(event.endAt).getTime() > new Date(event.startAt).getTime(), {
    message: 'Event end time must be after start time',
    path: ['endAt'],
  })

export const ToolSessionResultSchema = z.object({
  events: z.array(ToolSessionEventDraftSchema).min(1).max(30),
  summary: z.string().trim().min(1).max(500),
  warnings: z.array(z.string().trim()).default([]),
})

export type ToolPreset = z.infer<typeof ToolPresetSchema>
export type ToolSessionEventDraft = z.infer<typeof ToolSessionEventDraftSchema>
export type ToolSessionField = z.infer<typeof ToolSessionFieldSchema>
export type ToolSessionLlmOptions = z.infer<typeof ToolSessionLlmOptionsSchema>
export type ToolSessionProvider = z.infer<typeof ToolSessionProviderSchema>
export type ToolSessionRequest = z.infer<typeof ToolSessionRequestSchema>
export type ToolSessionResult = z.infer<typeof ToolSessionResultSchema>
