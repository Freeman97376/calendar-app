import { z } from 'zod'

export const AppUserSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['admin', 'user']),
  username: z.string().min(1),
})

export const AppCapabilitiesSchema = z.object({
  aiBudgetEditable: z.boolean().optional(),
  aiDefaultUsageMode: z.enum(['economy', 'balanced', 'quality']).optional(),
  aiMaximumUsageMode: z.enum(['economy', 'balanced', 'quality']).optional(),
  aiUsageModes: z.array(z.enum(['economy', 'balanced', 'quality'])).optional(),
  aiUsage: z
    .object({
      allowedModes: z.array(z.enum(['economy', 'balanced', 'quality'])),
      defaultMode: z.enum(['economy', 'balanced', 'quality']),
      maximumMode: z.enum(['economy', 'balanced', 'quality']),
      budgetEditable: z.boolean(),
      softLimit: z.number(),
      hardLimit: z.number(),
      modes: z.record(z.unknown()),
    })
    .optional(),
  backendConfigEditable: z.boolean(),
  calendarActionBatches: z.boolean().default(false),
  globalScheduling: z.boolean().default(false),
  dataPortability: z.boolean(),
  aiConversationHistory: z.boolean().default(false),
  registration: z.boolean(),
  serverManagedAI: z.boolean(),
  personalAIConfig: z.boolean().default(false),
  specializedToolHandoff: z.boolean().default(false),
})

export const AIRuntimeSchema = z.object({
  editable: z.literal(false),
  keyConfigured: z.boolean(),
  mode: z.literal('backend-managed'),
  planningModel: z.string().trim().min(1),
  provider: z.literal('deepseek-compatible'),
  routineModel: z.string().trim().min(1),
  ruleBasedFallback: z.boolean(),
})

const DEFAULT_AI_RUNTIME = {
  editable: false as const,
  keyConfigured: false,
  mode: 'backend-managed' as const,
  planningModel: 'deepseek-reasoner',
  provider: 'deepseek-compatible' as const,
  routineModel: 'deepseek-chat',
  ruleBasedFallback: false,
}

export const BootstrapResponseSchema = z.object({
  authRequired: z.boolean(),
  aiRuntime: AIRuntimeSchema.default(DEFAULT_AI_RUNTIME),
  capabilities: AppCapabilitiesSchema,
  csrfToken: z.string().default(''),
  mode: z.enum(['server', 'desktop']),
  preferences: z.record(z.unknown()).default({}),
  success: z.literal(true),
  user: AppUserSchema.nullable(),
})

export const RegistrationResponseSchema = z.object({
  success: z.literal(true),
  user: AppUserSchema,
})

export const LoginResponseSchema = z.object({
  csrfToken: z.string().min(1),
  expiresAt: z.string(),
  success: z.literal(true),
  user: AppUserSchema,
})

export type AppUser = z.infer<typeof AppUserSchema>
export type AppCapabilities = z.infer<typeof AppCapabilitiesSchema>
export type AIRuntime = z.infer<typeof AIRuntimeSchema>
export type BootstrapResponse = z.infer<typeof BootstrapResponseSchema>
