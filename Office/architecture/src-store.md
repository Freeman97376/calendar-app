<!-- goose:generated:start -->
# Store

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
- cli_subprocess execute -> external:cli-subprocess
- filesystem read -> external:filesystem
- filesystem read -> external:filesystem
- message_system emit -> external:message-system
- message_system emit -> external:message-system
- http_api request -> external:http-api:local-service
- filesystem read -> external:filesystem
- http_api request -> external:http-api
- http_api request -> external:http-api
- message_system emit -> external:message-system
- filesystem read -> external:filesystem
- http_api request -> external:http-api
- http_api request -> external:http-api:local-service
- message_system emit -> external:message-system
- message_system emit -> external:message-system
- filesystem read -> external:filesystem
- http_api request -> external:http-api
- http_api request -> external:http-api:local-service
- http_api request -> external:http-api
- http_api request -> external:http-api

## Key flows
- `flow:static:02f61302496a322fddae2807`: http_api request (resolved / complete)
- `flow:static:1591990dba03c216cde045f5`: message_system emit (resolved / complete)
- `flow:static:1839087d45a0437088d274ac`: http_api request (resolved / complete)
- `flow:static:2bf1f86a6967945f0ebd6667`: http_api request (resolved / complete)
- `flow:static:54e11fa8f455d0ed9f4d98ec`: filesystem read (resolved / complete)
- `flow:static:54e3a3cb66e2d559f8930033`: http_api request (resolved / complete)
- `flow:static:554ecf8cb43248660c6df235`: filesystem read (resolved / complete)
- `flow:static:615d19800ffa07d7ffdd31ea`: http_api request (resolved / complete)
- `flow:static:692cd2f882dd62f4e26a0e8b`: http_api request (resolved / complete)
- `flow:static:6c5d468e0a5b415507b72bba`: filesystem read (resolved / complete)
- `flow:static:6d133b336d772feddb420d5f`: filesystem read (resolved / complete)
- `flow:static:7a1cc5714c817e480c94c407`: http_api request (resolved / complete)
- `flow:static:7a914b85047e73f38640a487`: message_system emit (resolved / complete)
- `flow:static:8b82e568047c4a2c85bd1135`: http_api request (resolved / complete)
- `flow:static:90db42a49070931cb4cf2ea9`: filesystem read (resolved / complete)
- `flow:static:aa417284a2340e2a95ea4abd`: http_api request (resolved / complete)
- `flow:static:b5c35fada70fbf053017391b`: filesystem read (resolved / complete)
- `flow:static:c007fbfff6ae63d4a30496e6`: cli_subprocess execute (resolved / complete)
- `flow:static:c57e88ad83226084025b2d9a`: http_api request (resolved / complete)
- `flow:static:d581392d462243606c2e451f`: message_system emit (resolved / complete)

## Tests
- `src/store/desktopUpdateStore.ts`

## Evidence
| Evidence | File | Lines | Analyzer |
| --- | --- | --- | --- |
| `ev:000d3ba547a37c7e0e50db3e` | `src/store/authStore.ts` | 141-141 | `tree-sitter-typescript` |
| `ev:00503de8a1c3c2aa43abd281` | `src/store/toolSessionStore.ts` | 12-12 | `tree-sitter-typescript` |
| `ev:00980b934452ebbcf97c1379` | `src/store/aiStore.ts` | 383-383 | `tree-sitter-typescript` |
| `ev:016275c3d60a526fac060355` | `src/store/enabledToolRunner.ts` | 32-41 | `tree-sitter-typescript` |
| `ev:016ca65a0ece6c0e14b375a5` | `src/store/uiStore.ts` | 140-140 | `tree-sitter-typescript` |
| `ev:0192ceea7237b38f909c7e2e` | `src/store/eventTypeStore.ts` | 75-75 | `tree-sitter-typescript` |
| `ev:027f931d1bf8b343a14a41e9` | `src/store/calendarStore.ts` | 24-24 | `tree-sitter-typescript` |
| `ev:02845b9d3bfbfa5ec7b07aee` | `src/store/aiStore.ts` | 78-117 | `tree-sitter-typescript` |
| `ev:02c4868fdc39f2aa28b90772` | `src/store/eventTypeStore.ts` | 79-79 | `tree-sitter-typescript` |
| `ev:02d5120e77c8fc2b9287fcb7` | `src/store/longTermMemoryStore.ts` | 216-216 | `tree-sitter-typescript` |
| `ev:03088057c17ab17d06b55774` | `src/store/aiStore.ts` | 518-518 | `tree-sitter-typescript` |
| `ev:0334c8cc56ab998241dd6ae7` | `src/store/calendarStore.ts` | 39-39 | `tree-sitter-typescript` |
| `ev:034f4bb7e74d86ec842950e9` | `src/store/aiStore.ts` | 17-25 | `tree-sitter-typescript` |
| `ev:03a63e8d49f8fcea2d182bab` | `src/store/enabledToolRunner.ts` | 227-227 | `tree-sitter-typescript` |
| `ev:03f2062ebb3faff14b951ea1` | `src/store/authStore.ts` | 94-265 | `tree-sitter-typescript` |
| `ev:04225f10dee9043385f76c94` | `src/store/eventStore.ts` | 15-18 | `tree-sitter-typescript` |
| `ev:04908d815b574f94b022913e` | `src/store/authStore.ts` | 21-35 | `tree-sitter-typescript` |
| `ev:0511cba11d1481ab875493c2` | `src/store/aiStore.ts` | 601-605 | `tree-sitter-typescript` |
| `ev:056256ea82db42eed7f64ad6` | `src/store/enabledToolRunner.ts` | 57-57 | `tree-sitter-typescript` |
| `ev:05839de1ce47dadf99aa5030` | `src/store/longTermMemoryStore.ts` | 298-298 | `tree-sitter-typescript` |
| `ev:05a92b23b633620603b17c69` | `src/store/fridgeStore.ts` | 9-13 | `tree-sitter-typescript` |
| `ev:05e719f29fc0011229410806` | `src/store/aiStore.ts` | 230-230 | `tree-sitter-typescript` |
| `ev:05f28669acd8f43b190b474c` | `src/store/configStore.ts` | 75-75 | `tree-sitter-typescript` |
| `ev:062b2173a1d14a6ab3a63271` | `src/store/eventStore.ts` | 393-393 | `tree-sitter-typescript` |
| `ev:06898debfe03bbc305cc2aa8` | `src/store/uiStore.ts` | 134-134 | `tree-sitter-typescript` |
| `ev:06ad80f412eb045aab3d98ea` | `src/store/dataPortabilityStore.ts` | 67-67 | `tree-sitter-typescript` |
| `ev:0717af2666f2da6f247d58af` | `src/store/authStore.ts` | 64-77 | `tree-sitter-typescript` |
| `ev:074b1372e0aa8b8491386e44` | `src/store/toolSessionStore.ts` | 121-121 | `tree-sitter-typescript` |
| `ev:0767f842c89e7d47335865f0` | `src/store/aiStore.ts` | 244-244 | `tree-sitter-typescript` |
| `ev:076c497ff6d824642571141d` | `src/store/eventStore.ts` | 332-332 | `tree-sitter-typescript` |
| `ev:07881fca43a61e980352f073` | `src/store/aiStore.ts` | 34-34 | `tree-sitter-typescript` |
| `ev:07a264b914f869adc92d1817` | `src/store/aiStore.ts` | 457-457 | `tree-sitter-typescript` |
| `ev:07baeb0b4b64dc29fd437d86` | `src/store/configStore.ts` | 63-63 | `tree-sitter-typescript` |
| `ev:0840a8928b745a813acfbc01` | `src/store/toolSessionStore.ts` | 118-118 | `tree-sitter-typescript` |
| `ev:084a50fb75974ddffaeba48c` | `src/store/aiStore.ts` | 549-556 | `tree-sitter-typescript` |
| `ev:088adc852f106d97e4665c16` | `src/store/aiStore.ts` | 649-653 | `tree-sitter-typescript` |
| `ev:08948c4879880a02fe4cbe6f` | `src/store/toolSessionStore.ts` | 141-141 | `tree-sitter-typescript` |
| `ev:089582f0479063728ff2335e` | `src/store/eventStore.ts` | 72-72 | `tree-sitter-typescript` |
| `ev:0998baf071b08a2055e641c5` | `src/store/eventStore.ts` | 72-72 | `tree-sitter-typescript` |
| `ev:09daf4673a6bbdd48202f850` | `src/store/toolSessionStore.ts` | 212-218 | `tree-sitter-typescript` |
| `ev:09ebe61627c567df1cc605a1` | `src/store/resetUserSession.ts` | 16-16 | `tree-sitter-typescript` |
| `ev:0a0f906be7f2a23d0626cec0` | `src/store/aiStore.ts` | 365-365 | `tree-sitter-typescript` |
| `ev:0a6c51d3b896a2b5770d0157` | `src/store/uiStore.ts` | 250-252 | `tree-sitter-typescript` |
| `ev:0aabfd9dfcca2aaf3ff4116c` | `src/store/configStore.ts` | 60-64 | `tree-sitter-typescript` |
| `ev:0bd5e656aff337936d113b31` | `src/store/aiStore.ts` | 346-346 | `tree-sitter-typescript` |
| `ev:0be30381f24c0cb9fe98cea4` | `src/store/todoStore.ts` | 33-98 | `tree-sitter-typescript` |
| `ev:0c053c9b7013d470fb10786d` | `src/store/longTermMemoryStore.ts` | 381-386 | `tree-sitter-typescript` |
| `ev:0c298fbab35ec3076fb5f4b5` | `src/store/eventStore.ts` | 131-131 | `tree-sitter-typescript` |
| `ev:0c8c9324a0afe995698e2e92` | `src/store/aiStore.ts` | 149-155 | `tree-sitter-typescript` |
| `ev:0ca4ca93afc3c8d0b81db15e` | `src/store/goalControlStore.ts` | 21-21 | `tree-sitter-typescript` |
<!-- goose:generated:end -->

## User notes

