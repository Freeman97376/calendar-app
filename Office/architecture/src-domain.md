<!-- goose:generated:start -->
# Domain

Module responsibility inferred from code location (confirm in draft)

## Responsibilities
- Module responsibility inferred from code location (confirm in draft)

## Non-responsibilities
- None

## Entrypoints
- src/domain/logic/toolSessionPresets/diningPlanner/index.ts
- src/domain/logic/toolSessionPresets/workoutPlanner/index.ts
- src/domain/types/index.ts

## Public API
| Symbol | Kind | Signature |
| --- | --- | --- |
| None | - | - |

## Inputs, outputs and errors
| Symbol | Inputs | Output | Errors |
| --- | --- | --- | --- |
| `src/domain/logic/toolSessionPresets/diningPlanner/index.ts` | `` | `-` | `-` |
| `src/domain/logic/toolSessionPresets/workoutPlanner/index.ts` | `` | `-` | `-` |
| `index::CalendarView` | `` | `-` | `-` |
| `index::DateRange` | `` | `-` | `-` |
| `src/domain/types/index.ts` | `` | `-` | `-` |

## External I/O and side effects
- None

## Key flows
- None

## Tests
- None

## Evidence
| Evidence | File | Lines | Analyzer |
| --- | --- | --- | --- |
| `ev:000aa59b83b6c3275957dbd9` | `src/domain/logic/dateHelpers.ts` | 42-42 | `tree-sitter-typescript` |
| `ev:000f83bfda052263e261ce1b` | `src/domain/schemas/ai.schema.ts` | 25-25 | `tree-sitter-typescript` |
| `ev:00203669a0eed72cb5b8d592` | `src/domain/logic/eventDeduplication.ts` | 13-16 | `tree-sitter-typescript` |
| `ev:00225bbd179b810e669a309f` | `src/domain/logic/dateHelpers.ts` | 119-119 | `tree-sitter-typescript` |
| `ev:0040ff21e3de91238e0d3199` | `src/domain/schemas/ai.schema.ts` | 80-80 | `tree-sitter-typescript` |
| `ev:0045f431ad905e58cbe1e34e` | `src/domain/schemas/ai.schema.ts` | 352-352 | `tree-sitter-typescript` |
| `ev:0061af66e4489141673e57f2` | `src/domain/logic/enabledTools.ts` | 73-73 | `tree-sitter-typescript` |
| `ev:0097838235cb044b2099f1ff` | `src/domain/logic/toolRoadmap.ts` | 94-106 | `tree-sitter-typescript` |
| `ev:009b8a6b23b0abf824e74f05` | `src/domain/logic/recurrence.ts` | 95-95 | `tree-sitter-typescript` |
| `ev:00a7730191d16a6d16defaab` | `src/domain/schemas/ai.schema.ts` | 189-189 | `tree-sitter-typescript` |
| `ev:00b1aec700d9a9b18e8be9b7` | `src/domain/schemas/toolSession.schema.ts` | 4-4 | `tree-sitter-typescript` |
| `ev:01062d62869ae2bf86ae4858` | `src/domain/logic/toolTemplateMetadata.ts` | 32-34 | `tree-sitter-typescript` |
| `ev:0107413eeb3c25885d3f8a81` | `src/domain/schemas/ai.schema.ts` | 33-33 | `tree-sitter-typescript` |
| `ev:01467ca3df7a4631b9a7ed28` | `src/domain/logic/toolRoadmap.ts` | 17-17 | `tree-sitter-typescript` |
| `ev:014c7bf5f8fc94ae43d01dcc` | `src/domain/logic/toolSessionPresets/diningPlanner/index.ts` | 1-1 | `tree-sitter-typescript` |
| `ev:01b7cb852f0121aa44a2f3ef` | `src/domain/schemas/ai.schema.ts` | 188-188 | `tree-sitter-typescript` |
| `ev:01c6f36cc8e2e5be1b66a244` | `src/domain/schemas/config.schema.ts` | 40-40 | `tree-sitter-typescript` |
| `ev:01ec55b6d0bc10793e944d62` | `src/domain/schemas/toolSession.schema.ts` | 14-14 | `tree-sitter-typescript` |
| `ev:01fa7c81bd241f5418bd8917` | `src/domain/schemas/config.schema.ts` | 39-39 | `tree-sitter-typescript` |
| `ev:0206cfc8a92062e88e0dffc8` | `src/domain/logic/eventDeduplication.ts` | 15-15 | `tree-sitter-typescript` |
| `ev:0207ff38bda0bb71e99daa45` | `src/domain/schemas/ai.schema.ts` | 57-57 | `tree-sitter-typescript` |
| `ev:02096b0b495defeecb152616` | `src/domain/logic/goalPlanningPrompt.ts` | 147-147 | `tree-sitter-typescript` |
| `ev:0214ee52aeba5d38b200154b` | `src/domain/schemas/ai.schema.ts` | 421-421 | `tree-sitter-typescript` |
| `ev:0268bde1bb8bb77151b42247` | `src/domain/logic/activeToolPrompt.ts` | 6-6 | `tree-sitter-typescript` |
| `ev:02a0dea39879f537dd097bf4` | `src/domain/logic/eventDeduplication.ts` | 4-9 | `tree-sitter-typescript` |
| `ev:02c36b0af4d333c7e6a325f6` | `src/domain/schemas/ai.schema.ts` | 466-466 | `tree-sitter-typescript` |
| `ev:02d421c236ad76bf7c864501` | `src/domain/logic/taskPlanner.ts` | 100-100 | `tree-sitter-typescript` |
| `ev:02eb036b5536bc50d78c3b1a` | `src/domain/schemas/todo.schema.ts` | 13-13 | `tree-sitter-typescript` |
| `ev:030f0b9e1c9ce93751bb329a` | `src/domain/schemas/ai.schema.ts` | 251-251 | `tree-sitter-typescript` |
| `ev:0310626d5897e9dd2db52bdd` | `src/domain/schemas/ai.schema.ts` | 465-465 | `tree-sitter-typescript` |
| `ev:0311613e2740a0d4f8fe68cc` | `src/domain/schemas/ai.schema.ts` | 68-68 | `tree-sitter-typescript` |
| `ev:03261c40952153781be5fb53` | `src/domain/schemas/todo.schema.ts` | 16-16 | `tree-sitter-typescript` |
| `ev:0330471dc5991f3816e057ef` | `src/domain/schemas/ai.schema.ts` | 383-383 | `tree-sitter-typescript` |
| `ev:0334907584718086beb1a139` | `src/domain/logic/activeToolPrompt.ts` | 16-16 | `tree-sitter-typescript` |
| `ev:0359ff2d98341fc5e068050e` | `src/domain/schemas/config.schema.ts` | 33-33 | `tree-sitter-typescript` |
| `ev:0372735af0401c2556045fef` | `src/domain/schemas/ai.schema.ts` | 449-449 | `tree-sitter-typescript` |
| `ev:037e6e5fe9a900d0da353da8` | `src/domain/logic/enabledTools.ts` | 70-70 | `tree-sitter-typescript` |
| `ev:039f6e13a036f0b9e67115b2` | `src/domain/schemas/ai.schema.ts` | 430-430 | `tree-sitter-typescript` |
| `ev:03a3a49413151894948898c3` | `src/domain/logic/goalPlanningPrompt.ts` | 38-38 | `tree-sitter-typescript` |
| `ev:03b321f690da279e9beeefd6` | `src/domain/schemas/ai.schema.ts` | 449-449 | `tree-sitter-typescript` |
| `ev:03b53f0769ce20da53e1126b` | `src/domain/logic/recurrence.ts` | 170-170 | `tree-sitter-typescript` |
| `ev:03beb8b7084b7a0be539a293` | `src/domain/schemas/todo.schema.ts` | 11-11 | `tree-sitter-typescript` |
| `ev:03c444ced6df71389e53d781` | `src/domain/logic/enabledTools.ts` | 253-258 | `tree-sitter-typescript` |
| `ev:03fec5481a997d890143a439` | `src/domain/schemas/config.schema.ts` | 33-33 | `tree-sitter-typescript` |
| `ev:0405ba6d2f74d8a85590e836` | `src/domain/schemas/event.schema.ts` | 23-23 | `tree-sitter-typescript` |
| `ev:0441e2b88f5a2a54be651555` | `src/domain/schemas/ai.schema.ts` | 314-314 | `tree-sitter-typescript` |
| `ev:046066219e242a8275baef84` | `src/domain/logic/toolRoadmap.ts` | 76-76 | `tree-sitter-typescript` |
| `ev:0482a6d8092e61cf72dbadac` | `src/domain/schemas/eventType.schema.ts` | 10-10 | `tree-sitter-typescript` |
| `ev:0489f66a75e81701a274e535` | `src/domain/schemas/ai.schema.ts` | 485-485 | `tree-sitter-typescript` |
| `ev:04a1c817fcca8737db71d566` | `src/domain/logic/dateHelpers.ts` | 132-135 | `tree-sitter-typescript` |
<!-- goose:generated:end -->

## User notes

