import { z } from 'zod'

export const AIProviderSchema = z.preprocess((value) => {
  if (value === 'anthropic' || value === 'deepseek' || value === 'ollama') return 'api'
  return value
}, z.enum(['api', 'local']))

export const RuntimeConfigSchema = z.object({
  aiProvider: AIProviderSchema.default('api'),
  aiApiProfile: z.enum(['deepseek', 'custom']).default('deepseek'),
  aiApiKey: z.string().default(''),
  aiApiBaseUrl: z.string().trim().min(1).default('https://api.deepseek.com'),
  aiApiModel: z.string().trim().min(1).default('deepseek-chat'),
  // Legacy frontend AI fields are retained only so saved runtime config can migrate safely.
  anthropicApiKey: z.string().default(''),
  anthropicModel: z.string().trim().min(1).default('claude-sonnet-4-6'),
  defaultEventColor: z.string().trim().min(1).default('#047857'),
  defaultEventEndTime: z.string().regex(/^\d{2}:\d{2}$/).default('10:00'),
  defaultEventStartTime: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  defaultEventTypeId: z.string().trim().min(1).default('general'),
  defaultTodoEventTypeId: z.string().trim().min(1).default('general'),
  defaultTodoPriority: z.enum(['high', 'medium', 'low']).default('medium'),
  firebaseApiKey: z.string().default(''),
  firebaseAppId: z.string().default(''),
  firebaseAuthDomain: z.string().default(''),
  firebaseMessagingSenderId: z.string().default(''),
  firebaseProjectId: z.string().default(''),
  firebaseStorageBucket: z.string().default(''),
  fridgeApiBaseUrl: z.string().trim().min(1).default('http://127.0.0.1:8787'),
  timezoneOverride: z.string().trim().default(''),
  deepseekApiKey: z.string().default(''),
  deepseekModel: z.string().trim().min(1).default('deepseek-chat'),
  ollamaBaseUrl: z.string().trim().min(1).default('http://localhost:11434'),
  ollamaEnabled: z.boolean().default(true),
  ollamaModel: z.string().trim().min(1).default('llama3.1'),
})

export const BackendConfigStatusSchema = z.object({
  success: z.literal(true),
  deepseek: z.object({
    configured: z.boolean(),
    base_url: z.string(),
    model: z.string(),
  }),
  fridge: z.object({
    data_dir: z.string(),
  }),
})

export const BackendConfigUpdateSchema = z.object({
  deepseek_api_key: z.string().optional(),
  deepseek_base_url: z.string().trim().optional(),
  deepseek_model: z.string().trim().optional(),
  fridge_data_dir: z.string().trim().optional(),
})

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>
export type AIProvider = z.infer<typeof AIProviderSchema>
export type BackendConfigStatus = z.infer<typeof BackendConfigStatusSchema>
export type BackendConfigUpdate = z.infer<typeof BackendConfigUpdateSchema>
