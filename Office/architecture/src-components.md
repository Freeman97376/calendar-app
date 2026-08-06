<!-- goose:generated:start -->
# Components

Module responsibility inferred from code location (confirm in draft)

## Responsibilities
- Module responsibility inferred from code location (confirm in draft)

## Non-responsibilities
- None

## Entrypoints
- src/components/tools/ai-demo/index.tsx
- src/components/tools/fridge/index.tsx
- src/components/tools/goal-planner/index.tsx
- src/components/tools/settings/index.tsx
- src/components/tools/toolSessions/index.tsx

## Public API
| Symbol | Kind | Signature |
| --- | --- | --- |
| None | - | - |

## Inputs, outputs and errors
| Symbol | Inputs | Output | Errors |
| --- | --- | --- | --- |
| `src/components/tools/ai-demo/index.tsx` | `` | `-` | `-` |
| `src/components/tools/fridge/index.tsx` | `` | `-` | `-` |
| `src/components/tools/goal-planner/index.tsx` | `` | `-` | `-` |
| `src/components/tools/settings/index.tsx` | `` | `-` | `-` |
| `src/components/tools/toolSessions/index.tsx` | `` | `-` | `-` |

## External I/O and side effects
- filesystem read -> external:filesystem
- filesystem read -> external:filesystem
- message_system emit -> external:message-system
- filesystem read -> external:filesystem
- filesystem read -> external:filesystem
- filesystem read -> external:filesystem
- database query -> external:database
- filesystem read -> external:filesystem
- filesystem read -> external:filesystem
- filesystem read -> external:filesystem
- filesystem read -> external:filesystem
- filesystem read -> external:filesystem
- message_system emit -> external:message-system
- message_system emit -> external:message-system
- cli_subprocess execute -> external:cli-subprocess
- message_system emit -> external:message-system
- message_system emit -> external:message-system
- filesystem write -> external:filesystem
- message_system emit -> external:message-system
- filesystem read -> external:filesystem

## Key flows
- `flow:static:006c53a610af724f6b6b7aa5`: filesystem read (resolved / complete)
- `flow:static:0dda20e2e8d0a2658c3d0875`: message_system emit (resolved / complete)
- `flow:static:0f6b2a8603af7b151c628ca6`: message_system emit (resolved / complete)
- `flow:static:1a5f95583df4e52f53a004d3`: message_system emit (resolved / complete)
- `flow:static:2149baa2384f01f8c9fbfb8c`: filesystem read (resolved / complete)
- `flow:static:2947154c5d36c140b7235694`: filesystem read (resolved / complete)
- `flow:static:2cc025befb38d450cae1b5cc`: message_system emit (resolved / complete)
- `flow:static:2e842c63b41f7669477c7d95`: filesystem read (resolved / complete)
- `flow:static:37c9a9ab117e0c5c1df7d292`: filesystem read (resolved / complete)
- `flow:static:3a37d6b8d224d965a9a365be`: filesystem read (resolved / complete)
- `flow:static:3fe0fec2fe2be74d9e098211`: filesystem read (resolved / complete)
- `flow:static:4040f413ab44a3bfa243ae96`: filesystem read (resolved / complete)
- `flow:static:4793c4b8259dcea83affd88e`: filesystem read (resolved / complete)
- `flow:static:55a4e19002f976889ef70389`: message_system emit (resolved / complete)
- `flow:static:611d64dad76f3194ea745d44`: filesystem read (resolved / complete)
- `flow:static:647cb33335a098a6508ff645`: database query (resolved / complete)
- `flow:static:698cbe1b4c6d695bcfa20a0f`: filesystem read (resolved / complete)
- `flow:static:6e439cba7447a8a3b92fd67f`: filesystem read (resolved / complete)
- `flow:static:7fc98bfafe4c4cb5ad889dc8`: message_system emit (resolved / complete)
- `flow:static:870bb62026c05106b1e0fd17`: filesystem read (resolved / complete)

## Tests
- None

## Evidence
| Evidence | File | Lines | Analyzer |
| --- | --- | --- | --- |
| `ev:000b69115ff1a186b3b2ccdc` | `src/components/settings/DataPortabilityPanel.tsx` | 1-1 | `tree-sitter-typescript` |
| `ev:000edae13246dd7fc9e0ff25` | `src/components/ai/GoalConversationPanel.tsx` | 294-294 | `tree-sitter-typescript` |
| `ev:005d34fe0cf09a8b4d5ad7eb` | `src/components/tools/goal-planner/GoalPlannerPanel.tsx` | 45-45 | `tree-sitter-typescript` |
| `ev:007604c6a71654684e06735d` | `src/components/tools/ai-demo/MemoryBackedAIDemoTool.tsx` | 127-127 | `tree-sitter-typescript` |
| `ev:00869b8270b8375d6eee6286` | `src/components/ai/AIAssistantPanel.tsx` | 556-556 | `tree-sitter-typescript` |
| `ev:00b124ba1eefa761d01597bf` | `src/components/tools/ToolsPanel.tsx` | 68-68 | `tree-sitter-typescript` |
| `ev:00ee3e7f755def3fa71a24e1` | `src/components/todo/TodoPanel.tsx` | 1078-1175 | `tree-sitter-typescript` |
| `ev:00fdc39e7cb840f5e832749b` | `src/components/event/EventDragOverlay.tsx` | 10-13 | `tree-sitter-typescript` |
| `ev:011a9cd9609428725fd820dc` | `src/components/tools/ai-demo/MemoryBackedAIDemoTool.tsx` | 106-106 | `tree-sitter-typescript` |
| `ev:0128a07aeb1a2270753d0dce` | `src/components/calendar/MonthView.tsx` | 67-67 | `tree-sitter-typescript` |
| `ev:0155abf905c6b555a978971d` | `src/components/fridge/FridgePanel.tsx` | 21-21 | `tree-sitter-typescript` |
| `ev:019f8531e91e2c6e85eb79d3` | `src/components/settings/AIUsageSettings.tsx` | 72-72 | `tree-sitter-typescript` |
| `ev:01ad6695bb757d2952c09219` | `src/components/settings/SettingsPanel.tsx` | 230-230 | `tree-sitter-typescript` |
| `ev:01b3d2dd46d36359d0691831` | `src/components/settings/SettingsPanel.tsx` | 636-639 | `tree-sitter-typescript` |
| `ev:023ccb095021836ae36be4c9` | `src/components/event/RecurrenceSelector.tsx` | 257-262 | `tree-sitter-typescript` |
| `ev:0245f3fc7cd98cfd391a0136` | `src/components/settings/DataPortabilityPanel.tsx` | 158-158 | `tree-sitter-typescript` |
| `ev:02a265ea780d83d66afc605d` | `src/components/event/EventCard.tsx` | 3-3 | `tree-sitter-typescript` |
| `ev:02ca1b52a5562f22d5558237` | `src/components/ai/AIAssistantPanel.tsx` | 66-66 | `tree-sitter-typescript` |
| `ev:02ecd5e9d4d78a149fbecb36` | `src/components/tools/ToolPlanEditorDialog.tsx` | 44-44 | `tree-sitter-typescript` |
| `ev:031fe814f482f8ec9d11bc0c` | `src/components/ai/QuestionBatch.tsx` | 53-61 | `tree-sitter-typescript` |
| `ev:032444f13ffb7b972c22fd21` | `src/components/todo/TodoPanel.tsx` | 785-797 | `tree-sitter-typescript` |
| `ev:0324f6e4623ac5f901830915` | `src/components/tools/ToolsPanel.tsx` | 36-36 | `tree-sitter-typescript` |
| `ev:032603fc9d8ac61aa56a5549` | `src/components/eventTypes/EventTypeSettings.tsx` | 48-54 | `tree-sitter-typescript` |
| `ev:034ad831d23c656a88b56b11` | `src/components/tools/goal-planner/GoalPlannerPanel.tsx` | 537-537 | `tree-sitter-typescript` |
| `ev:035a2670b59a5ab4ac5bf4b5` | `src/components/tools/GoalControlDashboard.tsx` | 258-258 | `tree-sitter-typescript` |
| `ev:036a1c291e09e696429c31e5` | `src/components/event/RecurrenceSelector.tsx` | 251-251 | `tree-sitter-typescript` |
| `ev:03938f88be5d30287b44d973` | `src/components/ai/AIAssistantPanel.tsx` | 539-539 | `tree-sitter-typescript` |
| `ev:03a49d0567be406ca772ff7b` | `src/components/desktop/DesktopUpdateBanner.tsx` | 17-17 | `tree-sitter-typescript` |
| `ev:03bf4f1083fcd735be664a2e` | `src/components/ai/AIAssistantPanel.tsx` | 509-509 | `tree-sitter-typescript` |
| `ev:03c88a683944586264e3f346` | `src/components/settings/DataPortabilityPanel.tsx` | 91-91 | `tree-sitter-typescript` |
| `ev:03c8e070310c0530ebf9ae5d` | `src/components/settings/DataPortabilityPanel.tsx` | 93-93 | `tree-sitter-typescript` |
| `ev:03ef466ff9917def6b0a4f71` | `src/components/tools/toolSessions/ToolSessionsPanel.tsx` | 300-300 | `tree-sitter-typescript` |
| `ev:040bccee255358e7f02e98e8` | `src/components/tools/EnabledToolsPanel.tsx` | 363-367 | `tree-sitter-typescript` |
| `ev:041d6130c5c59f4142ad8d01` | `src/components/ai/AIAssistantPanel.tsx` | 499-499 | `tree-sitter-typescript` |
| `ev:0435d1874594a7ce8d34c1cb` | `src/components/calendar/CalendarDropTarget.tsx` | 18-18 | `tree-sitter-typescript` |
| `ev:0469c5fd5898e344b883ebab` | `src/components/settings/SettingsPanel.tsx` | 132-132 | `tree-sitter-typescript` |
| `ev:04770c624bda4721cec70072` | `src/components/tools/goal-planner/GoalPlannerPanel.tsx` | 54-58 | `tree-sitter-typescript` |
| `ev:047b2ce5b36b74b5c54303da` | `src/components/tools/ToolsPanel.tsx` | 278-278 | `tree-sitter-typescript` |
| `ev:048f3aaf351de3beccfddad7` | `src/components/tools/goal-planner/GoalPlannerPanel.tsx` | 641-651 | `tree-sitter-typescript` |
| `ev:0493f59d75cfaff3aa34c51f` | `src/components/tools/EnabledToolsPanel.tsx` | 3-7 | `tree-sitter-typescript` |
| `ev:04a103715f1b6cff5fa7ddeb` | `src/components/tools/EnabledToolsPanel.tsx` | 411-415 | `tree-sitter-typescript` |
| `ev:04a61431ae42e53790eb9ee4` | `src/components/ai/QuestionBatch.tsx` | 35-35 | `tree-sitter-typescript` |
| `ev:04c0d1d85845f4d3a4596148` | `src/components/todo/TodoPanel.tsx` | 718-718 | `tree-sitter-typescript` |
| `ev:04c63ebb61edff2656da801a` | `src/components/ai/QuestionBatch.tsx` | 26-26 | `tree-sitter-typescript` |
| `ev:05407e1b23539cbe64d36dec` | `src/components/workspace/ApprovalDrawer.tsx` | 156-168 | `tree-sitter-typescript` |
| `ev:054ca2728445e3c27ed2a539` | `src/components/calendar/TimeGrid.tsx` | 72-99 | `tree-sitter-typescript` |
| `ev:054f488f519b4e22930fc787` | `src/components/tools/goal-planner/GoalPlannerPanel.tsx` | 144-144 | `tree-sitter-typescript` |
| `ev:057385bc60ea213f5ec161b4` | `src/components/tools/goal-planner/GoalPlannerPanel.tsx` | 72-75 | `tree-sitter-typescript` |
| `ev:05ccb510fc0cbd44c5d79e85` | `src/components/ai/GoalConversationPanel.tsx` | 333-333 | `tree-sitter-typescript` |
| `ev:05e0e19365f531f2467a2606` | `src/components/todo/TodoPanel.tsx` | 313-313 | `tree-sitter-typescript` |
<!-- goose:generated:end -->

## User notes

