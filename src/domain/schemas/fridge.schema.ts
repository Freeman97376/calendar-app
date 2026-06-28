import { z } from 'zod'

export const FridgeStorageTypeSchema = z.enum(['fridge', 'freezer', 'room_temp', 'unknown'])

export const FridgeRecoverableErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  stage: z.string().min(1),
  recoverable: z.boolean(),
})

export const FridgeOCRResultSchema = z.object({
  text: z.string(),
  source: z.string().min(1),
  confidence: z.number().min(0).max(1),
})

export const FridgeItemCandidateSchema = z.object({
  item_name: z.string().min(1),
  normalized_name: z.string().min(1),
  is_fridge_item: z.boolean(),
  category: z.string().min(1),
  storage_type: FridgeStorageTypeSchema,
  confidence: z.number().min(0).max(1),
  source: z.string().min(1),
  reason: z.string(),
})

export const ShelfLifePredictionMetadataSchema = z.object({
  cache_hit: z.boolean(),
  cache_match_type: z.string().nullable(),
  cache_layer: z.string().nullable(),
  source: z.string().min(1),
  confidence: z.number().min(0).max(1),
})

export const FridgeShelfLifePredictionSchema = z.object({
  item_name: z.string().min(1),
  normalized_name: z.string().min(1),
  category: z.string().min(1),
  storage_type: FridgeStorageTypeSchema,
  estimated_shelf_life_days: z.number().int().nonnegative().nullable(),
  purchase_date: z.string().date(),
  estimated_expiration_date: z.string().date().nullable(),
  confidence: z.number().min(0).max(1),
  source: z.string().min(1),
  notes: z.string(),
  cache_hit: z.boolean(),
  cache_match_type: z.string().nullable(),
  cache_layer: z.string().nullable(),
  metadata: ShelfLifePredictionMetadataSchema,
})

export const FridgeReminderSuggestionSchema = z.object({
  title: z.string().min(1),
  date: z.string().date(),
  description: z.string(),
  item_id: z.string().nullable().optional(),
})

export const FridgePipelineStepSchema = z.object({
  stage: z.string().min(1),
  status: z.string().min(1),
  source: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  message: z.string().optional(),
  cache_hit: z.boolean().optional(),
})

export const FridgePipelineTraceSchema = z.object({
  receipt_id: z.string().min(1),
  steps: z.array(FridgePipelineStepSchema),
})

export const FridgeReceiptAnalysisResponseSchema = z.object({
  success: z.literal(true),
  receipt_id: z.string().min(1),
  purchase_date: z.string().date(),
  timezone: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  source: z.string().min(1),
  ocr: FridgeOCRResultSchema,
  candidates: z.array(FridgeItemCandidateSchema),
  items: z.array(FridgeShelfLifePredictionSchema),
  reminder_suggestions: z.array(FridgeReminderSuggestionSchema),
  trace: FridgePipelineTraceSchema,
  warnings: z.array(z.string()),
  recoverable_errors: z.array(FridgeRecoverableErrorSchema),
})

export const FridgeInventoryItemSchema = z.object({
  item_id: z.string().min(1),
  item_name: z.string().min(1),
  normalized_name: z.string().min(1),
  category: z.string().min(1),
  storage_type: FridgeStorageTypeSchema,
  purchase_date: z.string(),
  estimated_expiration_date: z.string().nullable(),
  estimated_shelf_life_days: z.number().int().nonnegative().nullable(),
  confidence: z.number().min(0).max(1),
  source: z.string().min(1),
  receipt_id: z.string().nullable(),
  quantity: z.string().nullable(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const FridgeInventoryListResponseSchema = z.object({
  success: z.literal(true),
  items: z.array(FridgeInventoryItemSchema),
})

export const FridgeInventoryItemResponseSchema = z.object({
  success: z.literal(true),
  item: FridgeInventoryItemSchema,
})

export type FridgeReceiptAnalysisResponse = z.infer<typeof FridgeReceiptAnalysisResponseSchema>
export type FridgeInventoryItem = z.infer<typeof FridgeInventoryItemSchema>
export type FridgeItemCandidate = z.infer<typeof FridgeItemCandidateSchema>
export type FridgeReminderSuggestion = z.infer<typeof FridgeReminderSuggestionSchema>
export type FridgeShelfLifePrediction = z.infer<typeof FridgeShelfLifePredictionSchema>
