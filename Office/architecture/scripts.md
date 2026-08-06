<!-- goose:generated:start -->
# Scripts

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
- cli_subprocess execute -> external:cli-subprocess
- cli_subprocess execute -> external:cli-subprocess
- environment read -> external:environment
- filesystem read -> external:filesystem
- filesystem write -> external:filesystem
- environment read -> external:environment
- filesystem write -> external:filesystem
- filesystem read -> external:filesystem
- filesystem write -> external:filesystem
- filesystem read -> external:filesystem
- filesystem write -> external:filesystem
- filesystem write -> external:filesystem
- filesystem write -> external:filesystem
- filesystem write -> external:filesystem
- cli_subprocess execute -> external:cli-subprocess
- filesystem write -> external:filesystem
- filesystem read -> external:filesystem
- http_api request -> external:http-api
- filesystem write -> external:filesystem

## Key flows
- `flow:static:0357acea798e8f3f86e83ffb`: filesystem write (resolved / complete)
- `flow:static:14b18d8db4b8da6c9dbb2577`: filesystem write (resolved / complete)
- `flow:static:1a086c96b06f6415581a66db`: cli_subprocess execute (resolved / complete)
- `flow:static:1cab6cff8f19da4e42acb35e`: filesystem read (resolved / complete)
- `flow:static:20885449c553ecbf499e1fa5`: filesystem write (resolved / complete)
- `flow:static:2bb42818775233d2f8bc3b1a`: filesystem write (resolved / complete)
- `flow:static:3dc3c95d1121f01f759c86f3`: cli_subprocess execute (resolved / complete)
- `flow:static:4b318f56d3ab4e0c12392e73`: cli_subprocess execute (resolved / complete)
- `flow:static:55fee97752c2b5a603ce69a5`: environment read (resolved / complete)
- `flow:static:56cc298f00a25bc21fed557f`: filesystem write (resolved / complete)
- `flow:static:58df7fa5f6393a17f808720f`: filesystem read (resolved / complete)
- `flow:static:60fd8a2c4da8af2153199748`: cli_subprocess execute (resolved / complete)
- `flow:static:6796f4a7d7a031324455c929`: cli_subprocess execute (resolved / complete)
- `flow:static:72465b6e6d7cc7cf28acefa2`: filesystem write (resolved / complete)
- `flow:static:7261c8504d4f76f2a530e4df`: filesystem write (resolved / complete)
- `flow:static:72fd2d859f1d904e2f593cff`: cli_subprocess execute (resolved / complete)
- `flow:static:7be5089f4bec26a1e2b1a8cc`: filesystem read (resolved / complete)
- `flow:static:817b0f5371010bc748703bc1`: filesystem read (resolved / complete)
- `flow:static:84286cf4113f47125b374fcf`: http_api request (resolved / complete)
- `flow:static:8a1f2d3fbcdeb923e6cace0a`: filesystem read (resolved / complete)

## Tests
- None

## Evidence
| Evidence | File | Lines | Analyzer |
| --- | --- | --- | --- |
| `ev:00e4a0ef937374f17020aed6` | `scripts/export-openapi.py` | 10-10 | `tree-sitter-python` |
| `ev:00f833d116a4638e93acbb53` | `scripts/e2e-launcher.mjs` | 80-80 | `tree-sitter-javascript` |
| `ev:010517e25ee974a147cd0d66` | `scripts/run-prettier.mjs` | 68-68 | `tree-sitter-javascript` |
| `ev:020614ce94e44ad5e8ba8c59` | `scripts/export-legacy-firebase.mjs` | 62-62 | `tree-sitter-javascript` |
| `ev:0450a59af22cc652b7bfc715` | `scripts/e2e-launcher.mjs` | 9-9 | `tree-sitter-javascript` |
| `ev:04a9dc4f34d84aa73b6a2e7f` | `scripts/seed-e2e-users.py` | 16-16 | `tree-sitter-python` |
| `ev:04b6f04002de8b1b141b3987` | `scripts/export-legacy-firebase.mjs` | 41-41 | `tree-sitter-javascript` |
| `ev:04d9d181068b54c2840f1729` | `scripts/run-playwright.mjs` | 8-8 | `tree-sitter-javascript` |
| `ev:05595adab684232fb1475755` | `scripts/export-openapi.py` | 31-53 | `tree-sitter-python` |
| `ev:062794032ba8924204ecac74` | `scripts/run-prettier.mjs` | 67-67 | `tree-sitter-javascript` |
| `ev:08179fb9d6657074e79f1c14` | `scripts/export-legacy-firebase.mjs` | 54-54 | `tree-sitter-javascript` |
| `ev:0a027987362d4810ea5aeedc` | `scripts/e2e-launcher.mjs` | 84-84 | `tree-sitter-javascript` |
| `ev:0a2c66d7df7437cc8729020a` | `scripts/run-playwright.mjs` | 23-26 | `tree-sitter-javascript` |
| `ev:0abf7f5341072195485e8a35` | `scripts/e2e-launcher.mjs` | 115-115 | `tree-sitter-javascript` |
| `ev:0bdd5fbd7fca8b1578dd4dcc` | `scripts/e2e-launcher.mjs` | 2-2 | `tree-sitter-javascript` |
| `ev:0e51c67b9d110e645c5b9a0a` | `scripts/e2e-launcher.mjs` | 43-43 | `tree-sitter-javascript` |
| `ev:109b3bee1e3c5ad069e404e6` | `scripts/export-openapi.py` | 28-28 | `tree-sitter-python` |
| `ev:113b7e8f7aa0c77b6c846155` | `scripts/e2e-launcher.mjs` | 46-66 | `tree-sitter-javascript` |
| `ev:114eb35ce43594b1d35309f6` | `scripts/export-legacy-firebase.mjs` | 20-20 | `tree-sitter-javascript` |
| `ev:114f959f0cdb271b3a1a63e2` | `scripts/e2e-launcher.mjs` | 69-69 | `tree-sitter-javascript` |
| `ev:115b4ef135036b919dc96727` | `scripts/run-playwright.mjs` | 13-17 | `tree-sitter-javascript` |
| `ev:11b427d30d0971a3ce15c3ba` | `scripts/check-rust.mjs` | 4-4 | `tree-sitter-javascript` |
| `ev:135c678d7056d92bdd93ff21` | `scripts/seed-e2e-users.py` | 17-17 | `tree-sitter-python` |
| `ev:164c7794ab12f3c139b89118` | `scripts/run-playwright.mjs` | 27-27 | `tree-sitter-javascript` |
| `ev:16bb5151f84fc4a421247006` | `scripts/export-openapi.py` | 13-13 | `tree-sitter-python` |
| `ev:172d0a070d85963ca487a0f4` | `scripts/check-rust.mjs` | 21-23 | `tree-sitter-javascript` |
| `ev:1731932ec9f5a987ae7cd31a` | `scripts/export-legacy-firebase.mjs` | 53-53 | `tree-sitter-javascript` |
| `ev:1830c7c012792df1a1c5a936` | `scripts/export-openapi.py` | 50-50 | `tree-sitter-python` |
| `ev:19c352828ddbe7dcd5ab6ff1` | `scripts/check-rust.mjs` | 35-35 | `tree-sitter-javascript` |
| `ev:1bdf0b6c78b2b4e455836563` | `scripts/e2e-launcher.mjs` | 54-57 | `tree-sitter-javascript` |
| `ev:1c75432c7dd5a84309ef77ad` | `scripts/export-openapi.py` | 47-47 | `tree-sitter-python` |
| `ev:1f7e85b24b521306cf7fc7d5` | `scripts/e2e-launcher.mjs` | 7-7 | `tree-sitter-javascript` |
| `ev:205537d63b04442bf920739d` | `scripts/run-prettier.mjs` | 10-10 | `tree-sitter-javascript` |
| `ev:21e05c623ce546f6dc365a51` | `scripts/seed-e2e-users.py` | 34-34 | `tree-sitter-python` |
| `ev:2504fd42574b7193b587269d` | `scripts/run-playwright.mjs` | 20-20 | `tree-sitter-javascript` |
| `ev:25f923b8fbbc4f64d2bd309d` | `scripts/export-legacy-firebase.mjs` | 27-65 | `tree-sitter-javascript` |
| `ev:2794ffdc22f82a73f5ee21c5` | `scripts/run-playwright.mjs` | 6-6 | `tree-sitter-javascript` |
| `ev:28a488984c7e402f5d46f0ee` | `scripts/export-legacy-firebase.mjs` | 53-55 | `tree-sitter-javascript` |
| `ev:2b291f6b9c0d39dd7aabcb67` | `scripts/check-rust.mjs` | 1-1 | `tree-sitter-javascript` |
| `ev:2f91dbbb4f3b9e3a4a5b27ac` | `scripts/export-openapi.py` | 11-11 | `tree-sitter-python` |
| `ev:307a49211526fb4f1b33fdc3` | `scripts/e2e-launcher.mjs` | 56-56 | `tree-sitter-javascript` |
| `ev:30e156f7e15b1b5602cb60df` | `scripts/e2e-launcher.mjs` | 18-18 | `tree-sitter-javascript` |
| `ev:30ff1db3f9832c21577706fb` | `scripts/e2e-launcher.mjs` | 104-104 | `tree-sitter-javascript` |
| `ev:32b6c6daac848d66d04b701a` | `scripts/export-openapi.py` | 51-51 | `tree-sitter-python` |
| `ev:32fcbc0c21aa5747949c8a96` | `scripts/check-rust.mjs` | 31-34 | `tree-sitter-javascript` |
| `ev:34fa2249f2e6abb15d40e346` | `scripts/seed-e2e-users.py` | 18-18 | `tree-sitter-python` |
| `ev:354eb679acc109b4353fb105` | `scripts/seed-e2e-users.py` | 15-34 | `tree-sitter-python` |
| `ev:360c0780017e0ca852aa20c1` | `scripts/e2e-launcher.mjs` | 61-61 | `tree-sitter-javascript` |
| `ev:365ec276f83d237333495705` | `scripts/export-legacy-firebase.mjs` | 64-64 | `tree-sitter-javascript` |
| `ev:36e28cebe8e5c1bdde7eb35b` | `scripts/seed-e2e-users.py` | 24-24 | `tree-sitter-python` |
<!-- goose:generated:end -->

## User notes

