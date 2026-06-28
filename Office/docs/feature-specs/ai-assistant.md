# Feature Spec: AI Assistant

> Status: Implemented | Last updated: 2026-06-18

## User Story

As a user, I can describe a calendar or task goal in plain language, review the proposed plan, and apply the result to the calendar only after I approve it.

The assistant supports two user flows:

- **Break down goal**: user enters a broad goal, receives schedulable steps, then clicks **Schedule All** to create calendar events.
- **Plan actions**: user enters a calendar or task command, receives explicit create/update/delete/schedule actions, reviews them, confirms near-term event times when required, then clicks **Apply Actions**.

## AI Providers

Frontend AI has two active providers:

- `api`: OpenAI-compatible chat completions endpoint. Defaults to DeepSeek with `https://api.deepseek.com` and `deepseek-chat`.
- `local`: deterministic local planner implemented in `LocalAIService`; requires no API key and supports both assistant flows.

Runtime config fields:

- `aiProvider`: `api` or `local`
- `aiApiProfile`: `deepseek` or `custom`
- `aiApiKey`
- `aiApiBaseUrl`
- `aiApiModel`

Legacy frontend values such as `deepseek`, `anthropic`, and `ollama` are normalized to `api`. Legacy `VITE_DEEPSEEK_API_KEY` and `VITE_DEEPSEEK_MODEL` remain fallback inputs for the frontend API provider.

Backend fridge receipt analysis keeps its own `DEEPSEEK_*` settings and is not part of this frontend provider switch.

## Service Layer

```text
IAIService.ts        interface used by stores/hooks
apiAIService.ts     OpenAI-compatible API provider
localAIService.ts   local deterministic planner
fallbackAIService.ts routes global/api/local requests
aiServiceFactory.ts builds the configured router
```

All provider outputs are parsed through Zod schemas before the UI can apply them.
Action planning context reads the browser's local machine time and timezone through `new Date()` and `Intl.DateTimeFormat().resolvedOptions()`, unless Settings provides a `timezoneOverride` such as `America/Los_Angeles`. It sends `today`, `currentDate`, `currentDateTime`, `currentLocalDateTime`, `timezone`, `timezoneName`, `timezoneOffsetLabel`, `timezoneOffsetMinutes`, `locale`, and `focusedDate` so relative phrases such as "today", "tomorrow", "tonight", and "in 2 hours" are not based on a month the user happens to be viewing. AI action plans add confirmation warnings for near-term times and blocking warnings for duplicate or overlapping event time blocks.

## Output Contracts

- `AIBreakdownResultSchema`: validates goal breakdown results used by **Schedule All**.
- `AICalendarActionPlanSchema`: validates action plans for event and todo create/update/delete/schedule operations.
- `ToolSessionResultSchema`: validates Tool Session calendar event drafts.

## UI Components

- `AIAssistantPanel`: provider selector, API model input, command form, goal form, action review, apply/dismiss controls.
- `AIMessageBubble`: conversation history display.
- `AIScheduleSuggestion`: breakdown result card and **Schedule All** action.

## Error Handling

| Case | UI behavior |
|------|-------------|
| API selected without key | Show setup instructions and disable API-backed forms. |
| Local selected | Enable planning without network or API key. |
| API non-2xx response | Show provider request error. |
| Invalid JSON | Show invalid JSON error. |
| Schema validation failure | Show schema validation error and do not apply actions. |
| Event action starts within 48 hours | Show a confirm-time warning and require the user to confirm near-term times before **Apply Actions** is enabled. |

## Testing Strategy

- `apiAIService.test.ts`: request shape, endpoint normalization, missing key, invalid JSON, schema validation.
- `aiServiceFactory.test.ts`: `api/local` routing and legacy DeepSeek fallback values.
- `aiAssistant.test.tsx`: goal breakdown, action planning, near-term time confirmation, current/focused date context separation, apply flows, local provider with no API key.
- `settingsPanel.test.tsx`: runtime API config save, API profile switching, local provider hiding API fields, and backend DeepSeek/fridge config save.
