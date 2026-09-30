import { z } from 'zod'

export const PersonalAIStatusSchema = z.object({
  success: z.literal(true),
  editable: z.boolean(),
  personalKeyConfigured: z.boolean(),
  keyConfigured: z.boolean(),
  source: z.enum(['personal', 'server', 'none']),
  baseUrl: z.string(),
  routineModel: z.string(),
  planningModel: z.string(),
})

export type PersonalAIStatus = z.infer<typeof PersonalAIStatusSchema>
export type PersonalAIUpdate = {
  apiKey?: string
  routineModel?: 'deepseek-chat' | 'deepseek-reasoner'
  planningModel?: 'deepseek-chat' | 'deepseek-reasoner'
}
