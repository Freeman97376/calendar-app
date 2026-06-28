# 🧪 Test Plan — Calendar App

> Maintained by: Claude Code | Last updated: 2026-06-07  
> All tests in `tests/` are written and maintained by the Supervisor (Claude Code).

---

## Testing Stack

| Tool | Role |
|------|------|
| **Vitest** | Test runner (replaces Jest, native Vite integration) |
| **React Testing Library** | Component + hook tests (user-centric queries) |
| **@testing-library/user-event** | Simulates real user interactions (type, click, drag) |
| **MSW (Mock Service Worker)** | Mocks backend config and Firebase-style network calls in tests |
| **@testing-library/jest-dom** | DOM assertion matchers (`toBeInTheDocument`, etc.) |
| **Playwright** | E2E tests against the running dev server (Phase 7) |

---

## Coverage Targets by Layer

| Layer | Test Type | Target | Rationale |
|-------|-----------|--------|-----------|
| `domain/logic/` | Unit | **100%** | Pure functions — no excuses |
| `domain/schemas/` | Unit (Zod parse) | **100%** | Every schema has valid + invalid test cases |
| `store/` | Unit | **90%+** | Actions, selectors, edge cases |
| `services/storage/` | Unit + Integration | **85%+** | Adapter unit with mock; integration with Firebase emulator |
| `services/ai/` | Unit (MSW) | **85%+** | Mock API responses; verify Zod validation |
| `hooks/` | Integration (RTL) | **80%+** | Hook behaviour with mocked store/services |
| `components/` | Integration (RTL) | **70%+** | User interactions, not implementation details |
| E2E | Critical flows only | Key paths | Create event, AI breakdown, drag & drop |

---

## Test Files Map

### Phase 0 (Bootstrap)
| Test File | Tests |
|-----------|-------|
| `tests/unit/app.smoke.test.tsx` | App renders without crashing |

### Phase 1 (Calendar Views)
| Test File | Tests |
|-----------|-------|
| `tests/unit/domain/dateHelpers.test.ts` | Date formatting, range generation, edge cases (leap year, DST) |
| `tests/unit/store/calendarStore.test.ts` | View switching, date navigation, today shortcut |
| `tests/integration/calendarViews.test.tsx` | MonthView renders correct days, WeekView shows correct hours, navigation works |

### Phase 2 (Event CRUD)
| Test File | Tests |
|-----------|-------|
| `tests/unit/domain/event.schema.test.ts` | Zod schema: valid event passes, invalid shapes throw |
| `tests/unit/store/eventStore.test.ts` | Create/update/delete actions, store state transitions |
| `tests/integration/eventCRUD.test.tsx` | Click date → modal opens, fill form → event appears on calendar, delete → event gone |

### Phase 3 (Recurring Events)
| Test File | Tests |
|-----------|-------|
| `tests/unit/domain/recurrence.test.ts` | **100% coverage required** — daily/weekly/monthly rules, end conditions, edge cases (month boundaries, leap Feb 29) |
| `tests/unit/domain/recurrence.schema.test.ts` | Zod schema for recurrence rule |
| `tests/integration/recurringEvents.test.tsx` | Create recurring event, instances appear, edit/delete this/following/all |

### Phase 4 (Drag & Drop)
| Test File | Tests |
|-----------|-------|
| `tests/integration/dragDrop.test.tsx` | Drag event to new date → event date updated, drag to time slot → time updated |

### Phase 5 (Persistence)
| Test File | Tests |
|-----------|-------|
| `tests/unit/services/localStorageAdapter.test.ts` | CRUD round-trip, serialization, empty state |
| `tests/unit/services/firestoreAdapter.test.ts` | CRUD with MSW mocking Firebase REST API |
| `tests/integration/syncManager.test.ts` | Write local → verify synced to remote, offline queue → sync on reconnect |

### Phase 6 (AI Assistant)
| Test File | Tests |
|-----------|-------|
| `tests/unit/domain/ai.schema.test.ts` | Valid/invalid AI response shapes, Zod validation errors |
| `tests/unit/services/apiAIService.test.ts` | OpenAI-compatible request shape, endpoint normalization, local time context prompt payload, missing key, invalid JSON, schema validation |
| `tests/unit/services/aiServiceFactory.test.ts` | API/local routing and legacy DeepSeek fallback config |
| `tests/unit/services/localAIService.test.ts` | Local provider currentDateTime handling for near-term relative time phrases |
| `tests/integration/aiAssistant.test.tsx` | Type goal → AI panel shows steps, accept → events added to calendar; AI action plans create/update/delete events and create/update/delete/schedule todos; near-term event times require confirmation; current date is separated from focused calendar date; local provider works without API key |

### Phase 7 (E2E)
| Test File | Tests |
|-----------|-------|
| `tests/e2e/createEvent.test.ts` | Full flow: open app → navigate to date → create event → verify on calendar |
| `tests/e2e/aiBreakdown.test.ts` | Open AI panel → type goal → accept suggestion → events on calendar |
| `tests/e2e/dragAndDrop.test.ts` | Drag event → verify new date/time |
| `tests/e2e/offlineSync.test.ts` | Create event offline → go online → verify synced |

### Backend Extension (Fridge Receipt Analysis)
| Test File | Tests |
|-----------|-------|
| `tests/backend/test_fridge_pipeline.py` | Image upload validation, multipart parsing, OCR fallback decision, receipt parser, fridge filtering, cache/default/runtime behavior, atomic writes, inventory CRUD, DeepSeek fallback caching, malformed DeepSeek JSON, timezone-sensitive reminder dates |
| `tests/unit/services/fridgeApiService.test.ts` | Frontend fridge API multipart upload, inventory parsing, structured backend errors |
| `tests/integration/fridgePanel.test.tsx` | Receipt analysis UI, add analyzed item to inventory, schedule expiration reminder into calendar |

### To-Do and Event Type Extension
| Test File | Tests |
|-----------|-------|
| `tests/unit/store/eventTypeStore.test.ts` | Seeded editable event types, create, update, and archive actions |
| `tests/unit/store/todoStore.test.ts` | Create, complete, reopen, and delete to-do actions |
| `tests/integration/todoPanel.test.tsx` | To-do panel creation, editable type creation, and typed to-do scheduling into calendar events |

### Settings and Tools Extension
| Test File | Tests |
|-----------|-------|
| `tests/integration/settingsPanel.test.tsx` | Frontend runtime config save including AI API profile/model, local provider option visibility, Firebase startup fields, input defaults, and backend DeepSeek/fridge config save |
| `tests/integration/fridgePanel.test.tsx` | Fridge is opened through the Tools layer before receipt workflows |
| `tests/unit/components/toolsRegistry.test.ts` | Tools registry includes Settings, Tool Sessions, and Fridge module entries |
| `tests/unit/domain/toolSessionPresets.test.ts` | Built-in Tool Session presets load from individual preset folders |
| `tests/unit/services/runtimeConfigService.test.ts` | Legacy frontend DeepSeek provider config migrates to unified API config and API profile defaults are inferred |

---

## MSW Setup (AI & Firebase Mocking)

All tests that call external services use **MSW handlers** defined in `tests/mocks/`:

```
tests/
└── mocks/
    ├── handlers.ts          ← all MSW request handlers
    └── server.ts            ← MSW server setup for Node (Vitest)
```

**Key rule:** Tests must never make real network calls. CI should have no API keys.

---

## Running Tests

```powershell
& "C:\Program Files\nodejs\npm.cmd" run test:run
$env:PYTHONPATH="C:\Users\Zheng\Desktop\calendar app"; python -m unittest discover tests\backend
```

For receipt OCR manual QA, verify Tesseract is visible before starting the backend:

```powershell
tesseract --version
python -m backend.server
```

If Tesseract is installed but not detected in the current PowerShell session:

```powershell
$env:Path = "C:\Program Files\Tesseract-OCR;$env:Path"
tesseract --version
```

---

## Test Result History

| Date | Phase | Pass | Fail | Coverage |
|------|-------|------|------|----------|
| 2026-05-26 | Phase 3 | 68 | 0 | Not measured |
| 2026-05-26 | Phase 4 | 74 | 0 | Not measured |
| 2026-05-26 | Phase 5 | 100 | 0 | Not measured |
| 2026-05-26 | Phase 6 | 121 | 0 | Not measured |
| 2026-06-06 | Fridge backend | 15 Python + 121 Vitest | 0 | Not measured |
| 2026-06-07 | Fridge frontend | 15 Python + 6 targeted Vitest | 0 | Not measured |
| 2026-06-07 | To-do and event types | 15 Python + 136 Vitest | 0 | Not measured |
| 2026-06-07 | AI frontend actions | 138 Vitest + AI smoke | 0 | Not measured |
| 2026-06-08 | Settings and Tools | 15 Python + 140 Vitest | 0 | Not measured |
| 2026-06-08 | Expanded Settings | 140 Vitest | 0 | Not measured |
| 2026-06-18 | AI API/local + tool registry refactor | Pending final run | Pending | Not measured |

*(append after each test run)*
