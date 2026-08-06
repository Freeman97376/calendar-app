<!-- goose:generated:start -->
# Services

Business service and integration boundary (confirm in draft)

## Responsibilities
- Business service and integration boundary (confirm in draft)

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
- http_api register-POST /api/memory/progress -> external:http-api:local-service
- filesystem write -> external:filesystem
- http_api register-POST /api/memory/projects -> external:http-api:local-service
- cli_subprocess execute -> external:cli-subprocess
- database query -> external:database
- http_api register-POST /api/memory/actions -> external:http-api:local-service
- filesystem write -> external:filesystem
- http_api register-GET /api/memory/projects -> external:http-api:local-service
- cli_subprocess execute -> external:cli-subprocess
- cli_subprocess execute -> external:cli-subprocess
- cli_subprocess execute -> external:cli-subprocess
- cli_subprocess execute -> external:cli-subprocess
- http_api request -> external:http-api:local-service
- cli_subprocess execute -> external:cli-subprocess
- cli_subprocess execute -> external:cli-subprocess
- http_api register-GET /api/memory/tool-runs -> external:http-api:local-service
- cli_subprocess execute -> external:cli-subprocess
- http_api request -> external:http-api
- cli_subprocess execute -> external:cli-subprocess
- cli_subprocess execute -> external:cli-subprocess

## Key flows
- `flow:static:01b09d3fb7901dbedafe3187`: http_api register-GET /api/calendar/event-types (resolved / complete)
- `flow:static:097c3552d3a582276d49b393`: cli_subprocess execute (resolved / complete)
- `flow:static:099847f519b30588d510dd70`: http_api request (resolved / complete)
- `flow:static:1638a730cdc176c3dc10f511`: http_api request (resolved / complete)
- `flow:static:16479268b3d2346d930b11af`: cli_subprocess execute (resolved / complete)
- `flow:static:16b5713385342b6634ff702a`: http_api request (resolved / complete)
- `flow:static:177c80769e70aa2701b6c4f0`: http_api register-POST /api/calendar/event-types (resolved / complete)
- `flow:static:1c0170a5e854cbe57ab788ee`: cli_subprocess execute (resolved / complete)
- `flow:static:1c9085316bb394f9bbf5e08c`: cli_subprocess execute (resolved / complete)
- `flow:static:1cd51ddf39c48749dbe7cc7d`: cli_subprocess execute (resolved / complete)
- `flow:static:1fab48688af1fc17746f3906`: cli_subprocess execute (resolved / complete)
- `flow:static:2072db53b54aa742eae4b95d`: filesystem read (resolved / complete)
- `flow:static:210f97565f2f6e8416e697b8`: filesystem write (resolved / complete)
- `flow:static:214a06179877ee9862cf02d4`: environment read (resolved / complete)
- `flow:static:2432ddac78110786326c7ea4`: cli_subprocess execute (resolved / complete)
- `flow:static:3607e836fdd3b20a9e8a0d5c`: filesystem write (resolved / complete)
- `flow:static:3719bf0480ebd31813751289`: cli_subprocess execute (resolved / complete)
- `flow:static:3aaadc56c49774534d8eb00b`: cli_subprocess execute (resolved / complete)
- `flow:static:3ae3f9d797d9efa31854fe09`: cli_subprocess execute (resolved / complete)
- `flow:static:3dc57ff07129fa86b0c9e0ec`: http_api request (resolved / complete)

## Tests
- None

## Evidence
| Evidence | File | Lines | Analyzer |
| --- | --- | --- | --- |
| `ev:00038e5bd1c38e17f6e6a273` | `src/services/ai/apiAIService.ts` | 1037-1040 | `tree-sitter-typescript` |
| `ev:003c1d67ab54ecd874afbbbf` | `src/services/ai/apiAIService.ts` | 731-731 | `tree-sitter-typescript` |
| `ev:00487f30f28f6af73607560e` | `src/services/dataPortabilityClient.ts` | 25-25 | `tree-sitter-typescript` |
| `ev:004a602df65117b213b17403` | `src/services/ai/localAIService.ts` | 579-579 | `tree-sitter-typescript` |
| `ev:00596d456e6016b560539342` | `src/services/ai/localAIService.ts` | 486-486 | `tree-sitter-typescript` |
| `ev:005cf6409aec478c0585c852` | `src/services/storage/firestoreAdapter.ts` | 166-166 | `tree-sitter-typescript` |
| `ev:00a6c4c1cbd4c4053640cdff` | `src/services/dataPortabilityClient.ts` | 57-57 | `tree-sitter-typescript` |
| `ev:00cb78ea010c7e60df2df9f7` | `src/services/storage/firestoreAdapter.ts` | 81-81 | `tree-sitter-typescript` |
| `ev:00d74537bbe17aa7df8962af` | `src/services/ai/fallbackAIService.ts` | 78-86 | `tree-sitter-typescript` |
| `ev:00eb37e5eb9c3698c9fa617c` | `src/services/ai/apiAIService.ts` | 1088-1088 | `tree-sitter-typescript` |
| `ev:00ebfaa1274f58010ef5f9dc` | `src/services/fridge/defaultFridgeService.ts` | 3-3 | `tree-sitter-typescript` |
| `ev:0152b9b65466e2b67e494739` | `src/services/goalControlClient.ts` | 27-27 | `tree-sitter-typescript` |
| `ev:0170ddb735288ccc671f41aa` | `src/services/sync/syncManager.ts` | 166-177 | `tree-sitter-typescript` |
| `ev:01744fe0e994d85199dbdfa8` | `src/services/ai/localAIService.ts` | 615-617 | `tree-sitter-typescript` |
| `ev:024169d6d5ae509b835d8245` | `src/services/longTermMemoryClient.ts` | 221-221 | `tree-sitter-typescript` |
| `ev:0249120e1e2ba512e18d5b0f` | `src/services/ai/localAIService.ts` | 514-514 | `tree-sitter-typescript` |
| `ev:02c402fc87dde779d4c10fda` | `src/services/ai/localAIService.ts` | 1327-1327 | `tree-sitter-typescript` |
| `ev:02c6c71732d25dba8a42bb33` | `src/services/dataPortabilityClient.ts` | 80-80 | `tree-sitter-typescript` |
| `ev:02d195dcfcf28b1b1415f390` | `src/services/ai/localAIService.ts` | 574-581 | `tree-sitter-typescript` |
| `ev:02f79d54846060eeb73a5aae` | `src/services/ai/localAIService.ts` | 631-631 | `tree-sitter-typescript` |
| `ev:03556fd8793314f5e63eae6c` | `src/services/ai/apiAIService.ts` | 932-932 | `tree-sitter-typescript` |
| `ev:03798f309d1be8d5283ef27e` | `src/services/storage/localStorageAdapter.ts` | 70-70 | `tree-sitter-typescript` |
| `ev:037d343a6e385a3d78d0ccc7` | `src/services/ai/localAIService.ts` | 510-520 | `tree-sitter-typescript` |
| `ev:038aa52a8288223c93c205ba` | `src/services/eventTypes/apiEventTypeService.ts` | 7-10 | `tree-sitter-typescript` |
| `ev:03cbd390cb4132ad3611e33f` | `src/services/storage/firestoreAdapter.ts` | 165-167 | `tree-sitter-typescript` |
| `ev:044a48ea50144d9854bf6a76` | `src/services/eventTypes/IEventTypeService.ts` | 1-1 | `tree-sitter-typescript` |
| `ev:0451babd08290df7f157412f` | `src/services/ai/localAIService.ts` | 641-644 | `tree-sitter-typescript` |
| `ev:04701001e494973e41d67966` | `src/services/toolSessions/apiToolPresetService.ts` | 21-26 | `tree-sitter-typescript` |
| `ev:04992d343e8735a622990a85` | `src/services/storage/localStorageAdapter.ts` | 76-78 | `tree-sitter-typescript` |
| `ev:04d24cc43b5c896c16e0b249` | `src/services/ai/localAIService.ts` | 1354-1354 | `tree-sitter-typescript` |
| `ev:04ec564498593536389588fb` | `src/services/appApiClient.ts` | 56-56 | `tree-sitter-typescript` |
| `ev:04f79aaba2fd889c6aa3af43` | `src/services/ai/localAIService.ts` | 35-35 | `tree-sitter-typescript` |
| `ev:0502cb615885fa6db212744d` | `src/services/config/runtimeConfigService.ts` | 148-152 | `tree-sitter-typescript` |
| `ev:05033b8b1b0af47ce17be541` | `src/services/dataPortabilityClient.ts` | 69-69 | `tree-sitter-typescript` |
| `ev:051c5f6251750290f7141d4e` | `src/services/ai/localAIService.ts` | 150-156 | `tree-sitter-typescript` |
| `ev:052b9263db23a4788a36e69a` | `src/services/ai/apiAIService.ts` | 822-822 | `tree-sitter-typescript` |
| `ev:05409fc05fe7da390d4f8e66` | `src/services/legacyBrowserExport.ts` | 46-46 | `tree-sitter-typescript` |
| `ev:0562164529805eb4205c97e4` | `src/services/storage/firestoreAdapter.ts` | 87-87 | `tree-sitter-typescript` |
| `ev:05780a6976d5f6acf1e3ef66` | `src/services/ai/apiAIService.ts` | 826-826 | `tree-sitter-typescript` |
| `ev:05c0fe54353a2eaa07e27d23` | `src/services/ai/localAIService.ts` | 384-384 | `tree-sitter-typescript` |
| `ev:05ca0cdb8569ae42d743160d` | `src/services/ai/apiAIService.ts` | 705-754 | `tree-sitter-typescript` |
| `ev:05dfe5ed0c04d51039a75477` | `src/services/ai/localAIService.ts` | 1180-1180 | `tree-sitter-typescript` |
| `ev:062edb07414b3b6f6abe7542` | `src/services/ai/localAIService.ts` | 65-65 | `tree-sitter-typescript` |
| `ev:063427add55212bdcf355f53` | `src/services/fridge/fridgeApiService.ts` | 87-87 | `tree-sitter-typescript` |
| `ev:06571e95e6b22a37d9b8b47a` | `src/services/sync/syncManager.ts` | 126-126 | `tree-sitter-typescript` |
| `ev:06b6a55c597e205b248208dc` | `src/services/ai/localAIService.ts` | 424-424 | `tree-sitter-typescript` |
| `ev:06bc0bbff36ae55e90f561bb` | `src/services/ai/apiAIService.ts` | 1099-1101 | `tree-sitter-typescript` |
| `ev:06cc546147d3c15528b6f0bd` | `src/services/ai/localAIService.ts` | 1162-1162 | `tree-sitter-typescript` |
| `ev:0704214c5f6a379e79ed633b` | `src/services/longTermMemoryClient.ts` | 164-166 | `tree-sitter-typescript` |
| `ev:0732d2bd796c32df4c461ee9` | `src/services/config/runtimeConfigService.ts` | 15-15 | `tree-sitter-typescript` |
<!-- goose:generated:end -->

## User notes

