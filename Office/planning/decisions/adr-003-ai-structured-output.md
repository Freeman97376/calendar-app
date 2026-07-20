# ADR-003: AI Structured Output — Zod Schema via Claude Tool Use

| Field        | Value                            |
| ------------ | -------------------------------- |
| **Date**     | 2026-05-24                       |
| **Status**   | Accepted                         |
| **Deciders** | Project Supervisor (Claude Code) |

---

## Context

The AI assistant takes a user's goal (e.g. "prepare for my job interview next week") and returns a structured list of steps that can be scheduled as calendar events.

We need the AI to return data in a predictable, typed format — not free-form prose. The question is how to enforce this.

Options considered:

1. Ask Claude nicely to "respond with JSON" in the system prompt
2. Use Claude's **tool use** (function calling) to force a structured response
3. Parse free-form text with a regex/heuristic

## Decision

**Use Claude tool use with a Zod-derived JSON schema.**

```typescript
// src/domain/schemas/ai.schema.ts
import { z } from 'zod'

export const AIStepSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().optional(),
  durationMinutes: z.number().int().min(5).max(480),
  suggestedDayOffset: z.number().int().min(0).max(30), // days from today
  priority: z.enum(['high', 'medium', 'low']),
})

export const AIBreakdownResultSchema = z.object({
  goal: z.string(),
  steps: z.array(AIStepSchema).min(1).max(20),
  totalEstimatedHours: z.number().optional(),
})

export type AIBreakdownResult = z.infer<typeof AIBreakdownResultSchema>
```

The Anthropic SDK receives this schema (converted to JSON Schema via `zodToJsonSchema`) as a tool definition. Claude is forced to call the tool — it cannot respond with prose. The response is then parsed with `AIBreakdownResultSchema.parse()` before any downstream use.

## Rationale

### Option 1 rejected: "respond with JSON" prompt

- Claude follows instructions but there is no API-level enforcement
- Occasional hallucinated fields or missing required fields break the parser
- The parsing code must handle malformed JSON

### Option 3 rejected: regex/heuristic parsing

- Brittle, hard to maintain, no type safety

### Option 2 chosen: tool use + Zod

- **API-level guarantee:** Claude must call the tool; it cannot skip it
- **Type safety:** `AIBreakdownResult` is a TypeScript type derived from the schema — the compiler catches usage errors
- **Validation:** Zod parses and validates the response at runtime — bad data is caught before it reaches the UI
- **Testability:** Tests can mock the tool call response with any JSON and verify Zod catches invalid shapes

### Legacy Ollama fallback

Current implementation note: frontend AI is now routed through one OpenAI-compatible API provider plus `LocalAIService`. The API provider requests JSON output and all returned data is still validated with the same Zod schemas before use.

## Consequences

- ✅ Typed, validated AI output — no runtime surprises
- ✅ Schema is the single source of truth for what the AI returns
- ✅ Changing the schema automatically updates the tool definition
- ⚠️ Requires `zod-to-json-schema` package (small, stable)
- Legacy note: Ollama fallback has weaker guarantees (no tool use). Current frontend AI uses the API/local provider split described in `Office/docs/feature-specs/ai-assistant.md`.
