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
  dataPortability: z.boolean(),
  registration: z.literal(false),
  serverManagedAI: z.boolean(),
})

export const BootstrapResponseSchema = z.object({
  authRequired: z.boolean(),
  capabilities: AppCapabilitiesSchema,
  csrfToken: z.string().default(''),
  mode: z.enum(['server', 'desktop']),
  preferences: z.record(z.unknown()).default({}),
  success: z.literal(true),
  user: AppUserSchema.nullable(),
})

export const LoginResponseSchema = z.object({
  csrfToken: z.string().min(1),
  expiresAt: z.string(),
  success: z.literal(true),
  user: AppUserSchema,
})

export type AppUser = z.infer<typeof AppUserSchema>
export type AppCapabilities = z.infer<typeof AppCapabilitiesSchema>
export type BootstrapResponse = z.infer<typeof BootstrapResponseSchema>
