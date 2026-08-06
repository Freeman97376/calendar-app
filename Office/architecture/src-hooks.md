<!-- goose:generated:start -->
# Hooks

Module responsibility inferred from code location (confirm in draft)

## Responsibilities
- Module responsibility inferred from code location (confirm in draft)

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
- filesystem read -> external:filesystem
- filesystem read -> external:filesystem
- message_system emit -> external:message-system
- cli_subprocess execute -> external:cli-subprocess
- http_api request -> external:http-api
- filesystem read -> external:filesystem
- filesystem read -> external:filesystem

## Key flows
- `flow:static:08769496ef9ece0b551a6e0a`: filesystem read (resolved / complete)
- `flow:static:45123188a9358e339ce031ae`: filesystem read (resolved / complete)
- `flow:static:7676be26c88e4e47b4cfbe77`: cli_subprocess execute (resolved / complete)
- `flow:static:8d9f72689fe403df9e62cead`: http_api request (resolved / complete)
- `flow:static:cd907c15689275037eaf4c31`: filesystem read (resolved / complete)
- `flow:static:d048862c501d5c7f136cf65b`: message_system emit (resolved / complete)
- `flow:static:d84f221533ded1d4044ca1c7`: filesystem read (resolved / complete)

## Tests
- None

## Evidence
| Evidence | File | Lines | Analyzer |
| --- | --- | --- | --- |
| `ev:0021c058f957176e29b63ec4` | `src/hooks/useMemoryBackedAIDemoTool.ts` | 284-284 | `tree-sitter-typescript` |
| `ev:0059040e99ff1685756eda9a` | `src/hooks/useEnabledTools.ts` | 166-184 | `tree-sitter-typescript` |
| `ev:00965ed1e9cb85a28833056b` | `src/hooks/useEnabledTools.ts` | 100-100 | `tree-sitter-typescript` |
| `ev:00b5d5afb650ceeb070337f7` | `src/hooks/useTodoPanel.ts` | 3-9 | `tree-sitter-typescript` |
| `ev:0112046d7d98a4d912d84cf7` | `src/hooks/useToolTemplateActivation.ts` | 65-65 | `tree-sitter-typescript` |
| `ev:01507354597cb37ad32fd7a4` | `src/hooks/useEnabledTools.ts` | 110-117 | `tree-sitter-typescript` |
| `ev:0193bb3f65ab1a5406d1d7bb` | `src/hooks/useGoalConversation.ts` | 16-16 | `tree-sitter-typescript` |
| `ev:01c7287a610ba365587c4f22` | `src/hooks/useToolTemplateActivation.ts` | 127-127 | `tree-sitter-typescript` |
| `ev:01dda4d41a6760c9b5214982` | `src/hooks/useAI.ts` | 5-5 | `tree-sitter-typescript` |
| `ev:01f482600454fba3c7e910fb` | `src/hooks/useMemoryBackedAIDemoTool.ts` | 188-188 | `tree-sitter-typescript` |
| `ev:01f50bfffc45668411a8c281` | `src/hooks/useAuth.ts` | 7-7 | `tree-sitter-typescript` |
| `ev:0212a97818840418b40c077b` | `src/hooks/useAI.ts` | 324-324 | `tree-sitter-typescript` |
| `ev:022f10dba56a7fe61e3a0d45` | `src/hooks/useTaskStepAIRefinement.ts` | 7-17 | `tree-sitter-typescript` |
| `ev:023d6a6ba92159395bae4752` | `src/hooks/useMemoryBackedAIDemoTool.ts` | 430-430 | `tree-sitter-typescript` |
| `ev:025721019c8c5ecd8ff1541b` | `src/hooks/useToolTemplateActivation.ts` | 134-139 | `tree-sitter-typescript` |
| `ev:0259c800ea9024da958888fa` | `src/hooks/useDataPortability.ts` | 41-41 | `tree-sitter-typescript` |
| `ev:028e49e3ff7f47534559aca9` | `src/hooks/useEnabledTools.ts` | 220-244 | `tree-sitter-typescript` |
| `ev:02ad9800d7040492e89f3d38` | `src/hooks/useGoalControlDashboard.ts` | 114-114 | `tree-sitter-typescript` |
| `ev:02cb26fcb0f0af5937ef2213` | `src/hooks/useMemoryBackedAIDemoTool.ts` | 4-4 | `tree-sitter-typescript` |
| `ev:02d89ffea7022fa07ab08252` | `src/hooks/useAI.ts` | 448-448 | `tree-sitter-typescript` |
| `ev:03132a46816cd6ce8a84fee4` | `src/hooks/useMemoryBackedAIDemoTool.ts` | 373-375 | `tree-sitter-typescript` |
| `ev:038b3bed2a57955df48fd19b` | `src/hooks/useDragDrop.ts` | 27-30 | `tree-sitter-typescript` |
| `ev:0390c728fafa242673cc6fe7` | `src/hooks/useEnabledTools.ts` | 221-239 | `tree-sitter-typescript` |
| `ev:03c905e7b34eb27e48154631` | `src/hooks/useMemoryBackedAIDemoTool.ts` | 213-213 | `tree-sitter-typescript` |
| `ev:03eee27d2bc7a6dc13d386a7` | `src/hooks/useEnabledTools.ts` | 77-78 | `tree-sitter-typescript` |
| `ev:042a0ecdde10648e43e90af7` | `src/hooks/useGoalControlDashboard.ts` | 14-14 | `tree-sitter-typescript` |
| `ev:042db3b282c7447e9e424605` | `src/hooks/useEnabledTools.ts` | 142-142 | `tree-sitter-typescript` |
| `ev:043f1d967e3a340e84b9f2a9` | `src/hooks/useAI.ts` | 414-414 | `tree-sitter-typescript` |
| `ev:047aafffceff65c0355ef69e` | `src/hooks/useMemoryBackedAIDemoTool.ts` | 293-293 | `tree-sitter-typescript` |
| `ev:048b35839628c24305e618cf` | `src/hooks/useDragDrop.ts` | 1-10 | `tree-sitter-typescript` |
| `ev:04df0909a9c60536aa9bcc39` | `src/hooks/useTodoLongProjects.ts` | 78-78 | `tree-sitter-typescript` |
| `ev:04f9e93e0f370abe00c6cfeb` | `src/hooks/useEvents.ts` | 68-72 | `tree-sitter-typescript` |
| `ev:05021f9e4ff9e18a1c3fa92e` | `src/hooks/useGoalConversation.ts` | 46-46 | `tree-sitter-typescript` |
| `ev:0516c3f6712221c3dc777599` | `src/hooks/useEventTypes.ts` | 10-12 | `tree-sitter-typescript` |
| `ev:05522843e4e0ad9fb8c18741` | `src/hooks/useCalendar.ts` | 33-33 | `tree-sitter-typescript` |
| `ev:0586a24249fefd401574975d` | `src/hooks/useDataPortability.ts` | 25-25 | `tree-sitter-typescript` |
| `ev:05d2d517d62ee1439e0e6d14` | `src/hooks/useTodoLongProjects.ts` | 12-12 | `tree-sitter-typescript` |
| `ev:05e1ee08385ad788f1ef17c8` | `src/hooks/useGoalControlDashboard.ts` | 116-120 | `tree-sitter-typescript` |
| `ev:05f97f60b766f25c47da37e4` | `src/hooks/useAI.ts` | 331-331 | `tree-sitter-typescript` |
| `ev:0657ab5b3242407f2977ca59` | `src/hooks/useCalendar.ts` | 42-42 | `tree-sitter-typescript` |
| `ev:06f37b9032a888bca6787949` | `src/hooks/useAI.ts` | 54-54 | `tree-sitter-typescript` |
| `ev:06f51f173878b06e91a5578a` | `src/hooks/useGoalPlannerMemory.ts` | 16-16 | `tree-sitter-typescript` |
| `ev:0710db6b5a9d9b1351006f72` | `src/hooks/useDebugPanel.ts` | 30-30 | `tree-sitter-typescript` |
| `ev:074aa73c864572069de5a382` | `src/hooks/useAI.ts` | 160-160 | `tree-sitter-typescript` |
| `ev:0775c4dbf015ab70f1f412bc` | `src/hooks/useWorkspacePanel.ts` | 10-10 | `tree-sitter-typescript` |
| `ev:0778caaefba0f7b846fe88b6` | `src/hooks/useEnabledTools.ts` | 58-58 | `tree-sitter-typescript` |
| `ev:0778f5f0e9967ae2629380c9` | `src/hooks/useAIUsageSettings.ts` | 13-13 | `tree-sitter-typescript` |
| `ev:079f9379399bc40b339e3d6d` | `src/hooks/useGoalPlannerMemory.ts` | 35-35 | `tree-sitter-typescript` |
| `ev:07a97fa9df2025f46379818c` | `src/hooks/useGoalControlDashboard.ts` | 17-17 | `tree-sitter-typescript` |
| `ev:07bb4f60a04a0dbf87e3d2eb` | `src/hooks/useEvents.ts` | 25-25 | `tree-sitter-typescript` |
<!-- goose:generated:end -->

## User notes

