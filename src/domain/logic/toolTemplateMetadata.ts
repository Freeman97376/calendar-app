import type { AIToolActivationField } from '../types'
import {
  TOOL_TEMPLATE_METADATA,
  type ToolTemplateIntentMatch,
  type ToolTemplateMetadata,
} from '../types/toolTemplateMetadata'

export {
  TOOL_TEMPLATE_METADATA,
  agentLearningToolMetadata,
  fitnessActivationFields,
  fitnessAIToolMetadata,
  fridgeToolMetadata,
  goalPlannerToolMetadata,
  seoLearningToolMetadata,
  toolSessionsToolMetadata,
  type ToolTemplateCategory,
  type ToolTemplateIntentMatch,
  type ToolTemplateMetadata,
} from '../types/toolTemplateMetadata'

export function instantiableToolTemplates(): ToolTemplateMetadata[] {
  return TOOL_TEMPLATE_METADATA.filter(
    (template) => template.category !== 'system' && template.instantiable !== false,
  )
}

export function templateToolName(template: ToolTemplateMetadata): string {
  return template.toolName ?? template.label
}

function lower(value: string): string {
  return value.trim().toLowerCase()
}

function words(value: string): string[] {
  return lower(value)
    .split(/[^a-z0-9]+/)
    .filter((entry) => entry.length > 2)
}

function scoreTemplate(message: string, template: ToolTemplateMetadata) {
  const normalized = lower(message)
  const matchedTerms = new Set<string>()
  let score = 0

  const weightedFields: Array<[string, number]> = [
    [template.id, 4],
    [template.label, 4],
    [template.toolName ?? '', 4],
    [template.description ?? '', 1],
    ...(template.routeTags ?? []).map((tag): [string, number] => [tag, 3]),
    ...(template.capabilityTags ?? []).map((tag): [string, number] => [tag, 1]),
  ]

  for (const [field, weight] of weightedFields) {
    const term = lower(field)
    if (!term) continue
    if (normalized.includes(term)) {
      score += weight
      matchedTerms.add(field)
      continue
    }

    for (const token of words(term)) {
      if (normalized.includes(token)) {
        score += Math.max(1, weight - 1)
        matchedTerms.add(token)
      }
    }
  }

  return { matchedTerms: [...matchedTerms], score }
}

export function findToolTemplateIntent(
  message: string,
  templates: ToolTemplateMetadata[] = instantiableToolTemplates(),
): ToolTemplateIntentMatch | null {
  const trimmed = message.trim()
  if (!trimmed) return null

  const ranked = templates
    .map((template) => ({ template, ...scoreTemplate(trimmed, template) }))
    .sort((left, right) => right.score - left.score)
  const best = ranked[0]

  if (!best || best.score < 3 || !best.matchedTerms.length) return null

  return {
    confidence: Math.min(0.95, 0.45 + best.score / 20),
    matchedTerms: best.matchedTerms.slice(0, 6),
    reason: `Matched ${best.template.label} by ${best.matchedTerms.slice(0, 3).join(', ')}.`,
    template: best.template,
  }
}

function firstMatch(message: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = message.match(pattern)
    const value = match?.[1]?.trim()
    if (value) return value.replace(/[\u3002\uff1b;,.?!\uff0c\uff01\uff1f].*$/, '').trim()
  }

  return ''
}

function extractActivationFieldValue(
  fieldId: string,
  message: string,
  template: ToolTemplateMetadata,
): string {
  const lowerMessage = lower(message)

  if (fieldId === 'heightCm') {
    return firstMatch(message, [/\u8eab\u9ad8\s*[:\uff1a]?\s*(\d{2,3})/, /(\d{2,3})\s*(?:cm|\u5398\u7c73)/i])
  }

  if (fieldId === 'weightKg') {
    return firstMatch(message, [/\u4f53\u91cd\s*[:\uff1a]?\s*(\d{2,3})/, /(\d{2,3})\s*(?:kg|\u516c\u65a4|\u5343\u514b)/i])
  }

  if (fieldId === 'preferences') {
    return firstMatch(message, [/(?:\u504f\u597d|\u559c\u6b22|prefer(?:ence)?s?)\s*[:\uff1a]?\s*([^\uff0c,\u3002\uff1b;.!\uff01\uff1f]+)/i])
  }

  if (fieldId === 'constraints') {
    const explicit = firstMatch(message, [/(?:\u9650\u5236|\u7ea6\u675f|constraints?|injur(?:y|ies))\s*[:\uff1a]?\s*([^\uff0c,\u3002\uff1b;.!\uff01\uff1f]+)/i])
    if (explicit) return explicit
    if (/\u4f24|\u75db|knee|injur|pain|\u819d\u76d6|\u8170|\u4f4e\u51b2\u51fb|low impact/i.test(message)) return message
  }

  if (fieldId === 'frequency') {
    const weekly = firstMatch(message, [/\u6bcf\u5468\s*(\d+)\s*\u6b21/, /(\d+)\s*(?:times|sessions)\s*(?:per|a)\s*week/i])
    if (weekly) return `${weekly} times per week`
  }

  if (fieldId === 'sessionLength') {
    return firstMatch(message, [/(\d{2,3})\s*(?:\u5206\u949f|minutes|min)/i])
  }

  if (fieldId === 'preferredTime') {
    const explicit = firstMatch(message, [/\b(\d{1,2}:\d{2})\b/])
    if (explicit) return explicit
    if (/\u65e9\u4e0a|\u4e0a\u5348|morning/i.test(message)) return '07:00'
  }

  if (fieldId === 'learningTrack') {
    if (template.id === 'seo-learning' || /seo|\u641c\u7d22\u4f18\u5316|\u5173\u952e\u8bcd|\u6392\u540d/i.test(message)) return 'SEO skills'
    if (/agent|\u667a\u80fd\u4f53|prompt|\u63d0\u793a\u8bcd|retrieval|\u68c0\u7d22/i.test(message)) return 'AI agent skills'
  }

  if (fieldId === 'weeklyTime') {
    const hours = firstMatch(message, [/\u6bcf\u5468\s*(\d+)\s*(?:\u5c0f\u65f6|\u949f\u5934)/, /(\d+)\s*hours?\s*(?:per|a)\s*week/i])
    if (hours) return `${hours} hours per week`
  }

  if (fieldId === 'goal' || fieldId === 'requirement' || fieldId === 'outcome') {
    return lowerMessage ? message : ''
  }

  return ''
}

export function activationFormDraftForTemplate(
  template: ToolTemplateMetadata,
  message: string,
): Record<string, string> {
  const fields = template.activationFields ?? []
  if (!fields.length) return {}

  return Object.fromEntries(
    fields.map((field) => [
      field.id,
      extractActivationFieldValue(field.id, message, template) || field.defaultValue || '',
    ]),
  )
}

export function missingRecommendedActivationFields(
  template: ToolTemplateMetadata,
  form: Record<string, string>,
): AIToolActivationField[] {
  return (template.activationFields ?? []).filter(
    (field) => field.recommended && !form[field.id]?.trim(),
  )
}

export function activationAccuracyWarnings(
  template: ToolTemplateMetadata,
  form: Record<string, string>,
): string[] {
  return missingRecommendedActivationFields(template, form).map(
    (field) =>
      `Missing recommended ${field.label}; plan accuracy may be lower${
        field.accuracyImpact ? ` because ${field.accuracyImpact}` : '.'
      }`,
  )
}
