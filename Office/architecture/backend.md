<!-- goose:generated:start -->
# Backend

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
- database query -> external:database:sqlite
- environment read -> external:environment
- http_api register-DELETE /api/dependencies/{dependency_id} -> external:http-api:local-service
- http_api register-POST /api/auth/logout -> external:http-api:local-service
- environment read -> external:environment
- database query -> external:database
- http_api register-GET /api/memory/projects/{project_id}/progress -> external:http-api:local-service
- environment read -> external:environment
- http_api register-GET /api/memory/projects/{project_id}/effort -> external:http-api:local-service
- http_api register-GET /api/fridge/items -> external:http-api:local-service
- http_api register-DELETE /api/fridge/items/{item_id} -> external:http-api:local-service
- environment read -> external:environment
- database query -> external:database
- http_api register-POST /api/plan-change-proposals -> external:http-api:local-service
- database query -> external:database:sqlite
- http_api register-PATCH /api/calendar/todos/{todo_id} -> external:http-api:local-service
- database query -> external:database:sqlite
- http_api register-POST /api/metrics/{metric_id}/entries -> external:http-api:local-service
- http_api register-GET /api/calendar/todos -> external:http-api:local-service
- http_api register-POST /api/data/pre-update-backup -> external:http-api:local-service

## Key flows
- `flow:static:0025b4dc66e1f4c77ed04d5a`: database query (resolved / complete)
- `flow:static:0072b1e3bb7f64ffcb45c509`: database query (resolved / complete)
- `flow:static:0101aee5562b03d573304c6e`: http_api register-PATCH /api/calendar/event-types/{event_type_id} (resolved / complete)
- `flow:static:0178bf70b3d86511823dba0b`: database query (resolved / complete)
- `flow:static:023974c55c5f814022f7acd8`: http_api register-POST /api/tool-presets (resolved / complete)
- `flow:static:03fc8d420fa307128aa11a66`: http_api register-GET /api/memory/projects/{project_id}/dependencies (resolved / complete)
- `flow:static:04d20cdfd5a349ff3ef279a6`: database query (resolved / complete)
- `flow:static:0519aa85a8a76166a945410a`: environment read (resolved / complete)
- `flow:static:07d0182108cfa2ae741ff70a`: environment read (resolved / complete)
- `flow:static:08b4e83903edbd7628d11cce`: http_api register-PATCH /api/calendar/events/{event_id} (resolved / complete)
- `flow:static:09455e5b24951080bb906ca8`: http_api register-GET /api/memory/projects/{project_id}/actions (resolved / complete)
- `flow:static:0ad7d5799d9ca36225a9a04e`: http_api request (resolved / complete)
- `flow:static:0c6fca1d1e21ce19d67a3411`: database query (resolved / complete)
- `flow:static:0cd2e6fadb3049cacf24328e`: database query (resolved / complete)
- `flow:static:0d91650b76deed3f9d7c120f`: http_api register-GET /api/data/export (resolved / complete)
- `flow:static:0e492c456c70740f0f71e543`: database query (resolved / complete)
- `flow:static:0fd347ea3bb5c86fb8888f08`: http_api request (resolved / complete)
- `flow:static:11dfb4439a02a2623442ff5b`: cli_subprocess execute (resolved / complete)
- `flow:static:1288c3a674959792af045823`: http_api request (resolved / complete)
- `flow:static:12975a676821171f3caaedd0`: http_api register-POST /api/calendar/events (resolved / complete)

## Tests
- None

## Evidence
| Evidence | File | Lines | Analyzer |
| --- | --- | --- | --- |
| `ev:0004d39b0d6d322357712f32` | `backend/server.py` | 935-935 | `tree-sitter-python` |
| `ev:00074a441695c4192c8621b7` | `backend/user_data.py` | 417-417 | `tree-sitter-python` |
| `ev:0009e35fcde21d0592b3dc08` | `backend/calendar/migrations/versions/20260714_0004_goal_control_versions_dependencies.py` | 48-65 | `tree-sitter-python` |
| `ev:000fe96ec36dc475cb320a2c` | `backend/user_data.py` | 306-311 | `tree-sitter-python` |
| `ev:00103d28a97533dcbd0e6527` | `backend/calendar/migrations/versions/20260714_0003_goal_conversations_metrics_checkins.py` | 82-82 | `tree-sitter-python` |
| `ev:002722a902941b62a6ff0168` | `backend/goal_control_api.py` | 31-31 | `tree-sitter-python` |
| `ev:00289090333d5e642495e2e3` | `backend/database.py` | 121-121 | `tree-sitter-python` |
| `ev:0028dae83a12f3bd3ec16c8b` | `backend/calendar/migrations/versions/20260714_0003_goal_conversations_metrics_checkins.py` | 81-81 | `tree-sitter-python` |
| `ev:002bf2557b5cd2d7a6b24a77` | `backend/user_data.py` | 532-532 | `tree-sitter-python` |
| `ev:003e21a1e4f458b4c979229a` | `backend/database.py` | 543-543 | `tree-sitter-python` |
| `ev:004e2314e8d30d36815ad9b7` | `backend/calendar/repository.py` | 113-113 | `tree-sitter-python` |
| `ev:004f994ba0062504300104bf` | `backend/database.py` | 497-526 | `tree-sitter-python` |
| `ev:0050e18def68450ce9d1fc29` | `backend/fridge/models.py` | 25-32 | `tree-sitter-python` |
| `ev:005165e71caab7fd52a8d658` | `backend/goal_control.py` | 2118-2118 | `tree-sitter-python` |
| `ev:005ff98294207002873906d1` | `backend/calendar/migrations/versions/20260713_0002_multi_user_unification.py` | 182-182 | `tree-sitter-python` |
| `ev:0062f39a73ee0a96bb240f3b` | `backend/migrate_legacy.py` | 120-120 | `tree-sitter-python` |
| `ev:0065a8293c7932230779ec11` | `backend/goal_control.py` | 1081-1081 | `tree-sitter-python` |
| `ev:007299ea4763e63b4e244be2` | `backend/goal_control.py` | 1897-1897 | `tree-sitter-python` |
| `ev:00751eb058b21ce568750901` | `backend/fridge/receipt_parser.py` | 27-27 | `tree-sitter-python` |
| `ev:0075588821ebac158ab264da` | `backend/user_data.py` | 941-941 | `tree-sitter-python` |
| `ev:007bbce1cd067b0dee0bf94a` | `backend/goal_control.py` | 2038-2080 | `tree-sitter-python` |
| `ev:00804f7411a05a154a380bec` | `backend/goal_control.py` | 954-954 | `tree-sitter-python` |
| `ev:0083029c0aa48aa00f35b890` | `backend/goal_control.py` | 1381-1385 | `tree-sitter-python` |
| `ev:008bd0ed64453adaee71f7b4` | `backend/calendar/repository.py` | 140-140 | `tree-sitter-python` |
| `ev:008d0567fb92a852327e4fb8` | `backend/fridge/shelf_life_cache.py` | 71-71 | `tree-sitter-python` |
| `ev:008fd603f6254a2ded416518` | `backend/server.py` | 1115-1115 | `tree-sitter-python` |
| `ev:00956a2b5ba20bda3afc8e37` | `backend/database.py` | 45-45 | `tree-sitter-python` |
| `ev:009a6b8b49ce51b0b8bd1539` | `backend/server.py` | 703-703 | `tree-sitter-python` |
| `ev:00b1d7ad78f3e5d1b34696c3` | `backend/calendar/migrations/versions/20260714_0005_ai_usage_controls.py` | 22-22 | `tree-sitter-python` |
| `ev:00b87a1923e84bc430fadc32` | `backend/desktop_migration.py` | 187-187 | `tree-sitter-python` |
| `ev:00ba9b3a36154f1a6dd719ed` | `backend/calendar/repository.py` | 138-138 | `tree-sitter-python` |
| `ev:00c4475d0d817de1504d7b4f` | `backend/calendar/migrations/versions/20260714_0004_goal_control_versions_dependencies.py` | 60-60 | `tree-sitter-python` |
| `ev:00cf65bb215c6c8f15a70a91` | `backend/goal_control.py` | 1969-1969 | `tree-sitter-python` |
| `ev:00d9f57246e8e0d5475cc66e` | `backend/user_data.py` | 945-945 | `tree-sitter-python` |
| `ev:00dde534a511abffb4541037` | `backend/calendar/migrations/versions/20260714_0003_goal_conversations_metrics_checkins.py` | 132-132 | `tree-sitter-python` |
| `ev:00e52cfe1f8d61a2506212c2` | `backend/fridge/store.py` | 61-61 | `tree-sitter-python` |
| `ev:00e6776ba84af104ff0d936e` | `backend/database.py` | 420-420 | `tree-sitter-python` |
| `ev:00f4e83f5b1c6da7842b6db5` | `backend/fridge/models.py` | 145-145 | `tree-sitter-python` |
| `ev:010eb8aaf9f85c90902631e9` | `backend/goal_control.py` | 602-602 | `tree-sitter-python` |
| `ev:0115540439c296322d657314` | `backend/goal_control.py` | 297-297 | `tree-sitter-python` |
| `ev:0117ac26201c1cacd27ca428` | `backend/fridge/receipt_ocr.py` | 35-35 | `tree-sitter-python` |
| `ev:012e1f0603c37fc8815920df` | `backend/calendar/migrations/versions/20260714_0004_goal_control_versions_dependencies.py` | 84-84 | `tree-sitter-python` |
| `ev:01352af53a800d9ef4644bf6` | `backend/user_data.py` | 945-945 | `tree-sitter-python` |
| `ev:013c534335fb079a5e5bfd6f` | `backend/user_data.py` | 762-762 | `tree-sitter-python` |
| `ev:01459bdf4eacb32e42d336c8` | `backend/goal_control.py` | 444-444 | `tree-sitter-python` |
| `ev:01509d59dba81b52ae124960` | `backend/calendar/migrations/versions/20260713_0002_multi_user_unification.py` | 33-33 | `tree-sitter-python` |
| `ev:0155d1c7c0ee2fc595f58d45` | `backend/fridge/receipt_parser.py` | 47-47 | `tree-sitter-python` |
| `ev:016dc9e9b92abf16f408cb21` | `backend/goal_control.py` | 1574-1574 | `tree-sitter-python` |
| `ev:0173c5a3576a7b4f229459a1` | `backend/user_data.py` | 690-690 | `tree-sitter-python` |
| `ev:0174b9525a865212da701d80` | `backend/database.py` | 185-192 | `tree-sitter-python` |
<!-- goose:generated:end -->

## User notes

