<!-- goose:generated:start -->
# Tests

Automated verification and regression coverage

## Responsibilities
- Automated verification and regression coverage

## Non-responsibilities
- None

## Entrypoints
- None

## Public API
| Symbol | Kind | Signature |
| --- | --- | --- |
| None | - | - |

## Inputs, outputs and errors
| Symbol | Inputs | Output | Errors |
| --- | --- | --- | --- |
| None | - | - | - |

## External I/O and side effects
- http_api register-POST /api/calendar/events -> external:http-api:local-service
- filesystem read -> external:filesystem
- database query -> external:database
- http_api register-POST /api/auth/login -> external:http-api:local-service
- http_api request -> external:http-api
- filesystem read -> external:filesystem
- filesystem read -> external:filesystem
- message_system emit -> external:message-system
- message_system emit -> external:message-system
- http_api register-POST /api/calendar/todos -> external:http-api:local-service
- environment read -> external:environment
- filesystem read -> external:filesystem
- database query -> external:database:sqlite
- filesystem read -> external:filesystem
- database query -> external:database
- database query -> external:database:sqlite
- environment read -> external:environment
- http_api register-POST /api/data/import -> external:http-api:local-service
- database query -> external:database
- http_api register-POST /api/auth/login -> external:http-api:local-service

## Key flows
- `flow:static:026324dd8ad1b554c4cc26a2`: http_api register-POST /api/calendar/todos (resolved / complete)
- `flow:static:02e25c533fd6aa5e6f9d1cc8`: filesystem read (resolved / complete)
- `flow:static:02ecc53bd42294d1239a1555`: http_api request (resolved / complete)
- `flow:static:052fa75a703941cbaf03f463`: http_api register-PATCH /api/me/preferences (resolved / complete)
- `flow:static:05518f1860bb0f0e04afee09`: database query (resolved / complete)
- `flow:static:056e780bb2b80c1383aeb3b5`: database query (resolved / complete)
- `flow:static:0591e2c3622cdc294fe5f64e`: filesystem read (resolved / complete)
- `flow:static:0686f47e004fe0d75d665b6f`: http_api register-POST /api/data/import (resolved / complete)
- `flow:static:06abba8d66c62585e7e83bcc`: http_api register-GET /api/memory/projects/private-project/dashboard (resolved / complete)
- `flow:static:06aea9758c806118827c46bd`: database query (resolved / complete)
- `flow:static:0887bd8697162cf1fc176a44`: http_api register-GET /api/goal-conversations/private-thread (resolved / complete)
- `flow:static:09335f77135aacec610fce8e`: filesystem read (resolved / complete)
- `flow:static:09489013ced4cc3d023382d4`: database query (resolved / complete)
- `flow:static:094ddb022ce59e9d09605586`: http_api register-POST /api/calendar/todos (resolved / complete)
- `flow:static:0bb110dcd2a262245e5596bd`: database query (resolved / complete)
- `flow:static:0f0fbe2ea8ca6f0df5c6e1da`: database query (resolved / complete)
- `flow:static:113d29d23badbf10b887d7e7`: http_api register-GET /api/calendar/events?start=2026-07-13T00:00:00.000Z&end=2026-07-13T23:59:59.999Z (resolved / complete)
- `flow:static:11ad00016ebfd240462d91b5`: database query (resolved / complete)
- `flow:static:12b06e0d54a09dfd6c033f1e`: filesystem read (resolved / complete)
- `flow:static:12ddbd353525103b7eb090d0`: database query (resolved / complete)

## Tests
- `tests/backend/__init__.py`
- `tests/backend/test_auth_api.py`
- `tests/backend/test_calendar_repository.py`
- `tests/backend/test_desktop_auth.py`
- `tests/backend/test_desktop_migration.py`
- `tests/backend/test_fridge_pipeline.py`
- `tests/backend/test_goal_control.py`
- `tests/backend/test_integrity_audit.py`
- `tests/backend/test_legacy_migration.py`
- `tests/backend/test_memory_service.py`
- `tests/backend/test_mysql_contract.py`
- `tests/backend/test_openapi_snapshot.py`
- `tests/backend/test_request_limits.py`
- `tests/backend/test_update_backup.py`
- `tests/backend/test_windowed_server.py`
- `tests/e2e/aiBreakdown.test.ts`
- `tests/e2e/createEvent.test.ts`
- `tests/e2e/desktopStability.test.ts`
- `tests/e2e/dragAndDrop.test.ts`
- `tests/e2e/helpers.ts`
- `tests/e2e/serverAuth.test.ts`
- `tests/integration/aiAssistant.test.tsx`
- `tests/integration/aiDemoTools.test.tsx`
- `tests/integration/authGate.test.tsx`
- `tests/integration/calendarViews.test.tsx`
- `tests/integration/debugPanel.test.tsx`
- `tests/integration/dragDrop.test.tsx`
- `tests/integration/eventCRUD.test.tsx`
- `tests/integration/fridgePanel.test.tsx`
- `tests/integration/goalConversationAnchoring.test.tsx`
- `tests/integration/goalPlanner.test.tsx`
- `tests/integration/recurringEvents.test.tsx`
- `tests/integration/settingsPanel.test.tsx`
- `tests/integration/syncManager.test.ts`
- `tests/integration/todoPanel.test.tsx`
- `tests/integration/toolsPanel.test.tsx`
- `tests/integration/workspaceLayout.test.tsx`
- `tests/mocks/handlers.ts`
- `tests/mocks/server.ts`
- `tests/setupTests.ts`
- `tests/unit/app.smoke.test.tsx`
- `tests/unit/components/toolsRegistry.test.ts`
- `tests/unit/domain/activeToolPrompt.test.ts`
- `tests/unit/domain/ai.schema.test.ts`
- `tests/unit/domain/dateHelpers.test.ts`
- `tests/unit/domain/event.schema.test.ts`
- `tests/unit/domain/eventDeduplication.test.ts`
- `tests/unit/domain/goalPlanningPrompt.test.ts`
- `tests/unit/domain/i18n.test.ts`
- `tests/unit/domain/progress.test.ts`
- `tests/unit/domain/recurrence.schema.test.ts`
- `tests/unit/domain/recurrence.test.ts`
- `tests/unit/domain/taskPlanner.test.ts`
- `tests/unit/domain/timeContext.test.ts`
- `tests/unit/domain/todo.schema.test.ts`
- `tests/unit/domain/toolRoadmap.test.ts`
- `tests/unit/domain/toolSessionPresets.test.ts`
- `tests/unit/hooks/useCalendar.test.ts`
- `tests/unit/services/aiServiceFactory.test.ts`
- `tests/unit/services/apiAIService.test.ts`
- `tests/unit/services/appApiClient.test.ts`
- `tests/unit/services/firestoreAdapter.test.ts`
- `tests/unit/services/fridgeApiService.test.ts`
- `tests/unit/services/localAIService.test.ts`
- `tests/unit/services/localStorageAdapter.test.ts`
- `tests/unit/services/runtimeConfigService.test.ts`
- `tests/unit/store/authStore.test.ts`
- `tests/unit/store/calendarStore.test.ts`
- `tests/unit/store/configStore.test.ts`
- `tests/unit/store/desktopUpdateStore.test.ts`
- `tests/unit/store/eventStore.test.ts`
- `tests/unit/store/eventTypeStore.test.ts`
- `tests/unit/store/resetUserSession.test.ts`
- `tests/unit/store/todoStore.test.ts`
- `tests/unit/store/toolSessionStore.test.ts`
- `tests/unit/store/uiStore.test.ts`

## Evidence
| Evidence | File | Lines | Analyzer |
| --- | --- | --- | --- |
| `ev:000704d3e66d8ddc47e1cb9a` | `tests/e2e/createEvent.test.ts` | 28-28 | `tree-sitter-typescript` |
| `ev:001367f0e48eb3152c527cb5` | `tests/unit/store/eventStore.test.ts` | 61-61 | `tree-sitter-typescript` |
| `ev:001a8875373cee4b59338646` | `tests/integration/dragDrop.test.tsx` | 142-142 | `tree-sitter-typescript` |
| `ev:001d8f1c5f850feb9e18dc17` | `tests/unit/services/appApiClient.test.ts` | 82-82 | `tree-sitter-typescript` |
| `ev:001da3b12118bd35dcd35096` | `tests/backend/test_auth_api.py` | 241-255 | `tree-sitter-python` |
| `ev:001e506490a2da11a4f9b149` | `tests/integration/aiAssistant.test.tsx` | 497-497 | `tree-sitter-typescript` |
| `ev:001f5d0f6f24a2025bf3ec38` | `tests/backend/test_auth_api.py` | 213-213 | `tree-sitter-python` |
| `ev:00278c0a45092f7916d9a914` | `tests/backend/test_auth_api.py` | 409-409 | `tree-sitter-python` |
| `ev:0028f18a8110c506178c6b25` | `tests/unit/store/toolSessionStore.test.ts` | 41-54 | `tree-sitter-typescript` |
| `ev:00335202fa7531fda90590dd` | `tests/unit/services/aiServiceFactory.test.ts` | 165-165 | `tree-sitter-typescript` |
| `ev:00349936b4ed819f7acd6144` | `tests/integration/aiAssistant.test.tsx` | 931-931 | `tree-sitter-typescript` |
| `ev:003b17491f2c1636ed628e87` | `tests/integration/goalPlanner.test.tsx` | 324-324 | `tree-sitter-typescript` |
| `ev:004941edddcfe231ccd76bb1` | `tests/integration/authGate.test.tsx` | 22-22 | `tree-sitter-typescript` |
| `ev:0054195599d69fd720bdce21` | `tests/unit/services/appApiClient.test.ts` | 90-93 | `tree-sitter-typescript` |
| `ev:005bf5e6736122486fc8b9c2` | `tests/integration/dragDrop.test.tsx` | 188-190 | `tree-sitter-typescript` |
| `ev:005feea1eee92eed41de0295` | `tests/integration/todoPanel.test.tsx` | 177-177 | `tree-sitter-typescript` |
| `ev:0065169aef2d566421cdc503` | `tests/unit/store/eventStore.test.ts` | 96-96 | `tree-sitter-typescript` |
| `ev:00683df24eb9591d125e9516` | `tests/integration/goalPlanner.test.tsx` | 352-352 | `tree-sitter-typescript` |
| `ev:006df217d61a0e4db440f735` | `tests/unit/domain/i18n.test.ts` | 16-16 | `tree-sitter-typescript` |
| `ev:007e688452bf20f966ba55ec` | `tests/integration/aiAssistant.test.tsx` | 361-361 | `tree-sitter-typescript` |
| `ev:007fb23b5b1bcb12f64cf449` | `tests/unit/services/localAIService.test.ts` | 153-153 | `tree-sitter-typescript` |
| `ev:0087dcc1e1bb455632347a50` | `tests/e2e/serverAuth.test.ts` | 52-52 | `tree-sitter-typescript` |
| `ev:00933f321dfed437a401d8ab` | `tests/integration/recurringEvents.test.tsx` | 99-99 | `tree-sitter-typescript` |
| `ev:0096bc3f0ccd936ca3783351` | `tests/integration/syncManager.test.ts` | 80-80 | `tree-sitter-typescript` |
| `ev:00b66d7d87598e48257a9e80` | `tests/integration/syncManager.test.ts` | 3-3 | `tree-sitter-typescript` |
| `ev:00c294fa1cdd254b6125f878` | `tests/backend/test_goal_control.py` | 67-67 | `tree-sitter-python` |
| `ev:00cbc5da51f5fd2e234dab90` | `tests/e2e/serverAuth.test.ts` | 24-25 | `tree-sitter-typescript` |
| `ev:00eff5c32e7b6bdef8695802` | `tests/integration/syncManager.test.ts` | 124-124 | `tree-sitter-typescript` |
| `ev:00f3a8f1af509df5a5bcfbd5` | `tests/backend/test_fridge_pipeline.py` | 200-200 | `tree-sitter-python` |
| `ev:00f4ac6ef1cd3e3ec8c822ce` | `tests/integration/todoPanel.test.tsx` | 388-388 | `tree-sitter-typescript` |
| `ev:0115274a0622295292cfcf9f` | `tests/integration/aiAssistant.test.tsx` | 982-982 | `tree-sitter-typescript` |
| `ev:011d291db34c98b454dc125e` | `tests/backend/test_fridge_pipeline.py` | 271-271 | `tree-sitter-python` |
| `ev:0135fc64dc444cefa8de09db` | `tests/integration/fridgePanel.test.tsx` | 334-340 | `tree-sitter-typescript` |
| `ev:0139925362cf29c4f9cf435b` | `tests/mocks/handlers.ts` | 1-1 | `tree-sitter-typescript` |
| `ev:014160830a3b9bb761a2eb66` | `tests/backend/test_goal_control.py` | 454-454 | `tree-sitter-python` |
| `ev:0157b361240c662f3b0aab10` | `tests/unit/store/calendarStore.test.ts` | 36-41 | `tree-sitter-typescript` |
| `ev:015c8c0f4ce643e4c1ff15f8` | `tests/backend/test_windowed_server.py` | 23-23 | `tree-sitter-python` |
| `ev:01686a82d902b403f90563dd` | `tests/unit/store/desktopUpdateStore.test.ts` | 110-110 | `tree-sitter-typescript` |
| `ev:016e0d59fe2531e4f5876c5a` | `tests/backend/test_fridge_pipeline.py` | 256-256 | `tree-sitter-python` |
| `ev:016fa2c2748ddde7267022aa` | `tests/backend/test_legacy_migration.py` | 58-58 | `tree-sitter-python` |
| `ev:01adab919a679195b15d90f8` | `tests/integration/aiAssistant.test.tsx` | 873-875 | `tree-sitter-typescript` |
| `ev:01b50ef12ab80ae7956ff31b` | `tests/integration/todoPanel.test.tsx` | 65-65 | `tree-sitter-typescript` |
| `ev:01b7d0f42ac2c4daa970449f` | `tests/unit/app.smoke.test.tsx` | 10-10 | `tree-sitter-typescript` |
| `ev:01ccc76db7183266ff9afc3e` | `tests/integration/todoPanel.test.tsx` | 77-77 | `tree-sitter-typescript` |
| `ev:01e2a536ee1ab7facc2e3c4c` | `tests/e2e/serverAuth.test.ts` | 51-51 | `tree-sitter-typescript` |
| `ev:01e9fa5348c9f67b53375c06` | `tests/unit/store/configStore.test.ts` | 20-20 | `tree-sitter-typescript` |
| `ev:02005692b65f089f9286c17a` | `tests/backend/test_update_backup.py` | 43-43 | `tree-sitter-python` |
| `ev:0201df81f89f225ccfc3b990` | `tests/unit/domain/recurrence.test.ts` | 160-176 | `tree-sitter-typescript` |
| `ev:0202381ae063d2ed73a92d91` | `tests/unit/store/todoStore.test.ts` | 54-69 | `tree-sitter-typescript` |
| `ev:020521f4cacba86970a17f21` | `tests/integration/settingsPanel.test.tsx` | 76-76 | `tree-sitter-typescript` |
<!-- goose:generated:end -->

## User notes

