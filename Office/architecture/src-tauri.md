<!-- goose:generated:start -->
# Src Tauri

Module responsibility inferred from code location (confirm in draft)

## Responsibilities
- Module responsibility inferred from code location (confirm in draft)

## Non-responsibilities
- None

## Entrypoints
- src-tauri/src/lib.rs
- src-tauri/src/main.rs

## Public API
| Symbol | Kind | Signature |
| --- | --- | --- |
| `lib::run` | function | `pub fn run()` |

## Inputs, outputs and errors
| Symbol | Inputs | Output | Errors |
| --- | --- | --- | --- |
| `lib::BackendReady` | `` | `-` | `-` |
| `lib::BackendState` | `` | `-` | `-` |
| `lib::RuntimeInfo` | `` | `-` | `-` |
| `lib::data_directory` | `app: &tauri::AppHandle` | `(PathBuf` | `Option<String>` |
| `lib::desktop_runtime` | `state: State<'_, BackendState>: unknown` | `RuntimeInfo` | `-` |
| `lib::open_release_page` | `app: AppHandle` | `()` | `String` |
| `lib::run` | `` | `-` | `-` |
| `lib::terminate_sidecar` | `process: CommandChild` | `-` | `-` |
| `lib::writable` | `path: &Path` | `bool` | `-` |
| `src-tauri/src/lib.rs` | `` | `-` | `-` |
| `main::main` | `` | `-` | `-` |
| `src-tauri/src/main.rs` | `` | `-` | `-` |

## External I/O and side effects
- filesystem read -> external:filesystem
- cli_subprocess execute -> external:cli-subprocess
- environment read -> external:environment
- message_system emit -> external:message-system
- cli_subprocess execute -> external:cli-subprocess
- filesystem write -> external:filesystem
- filesystem read -> external:filesystem
- environment read -> external:environment
- environment read -> external:environment
- filesystem write -> external:filesystem
- cli_subprocess execute -> external:cli-subprocess
- cli_subprocess execute -> external:cli-subprocess
- message_system emit -> external:message-system
- filesystem read -> external:filesystem
- environment read -> external:environment
- filesystem read -> external:filesystem
- filesystem read -> external:filesystem
- filesystem read -> external:filesystem
- cli_subprocess execute -> external:cli-subprocess
- filesystem read -> external:filesystem

## Key flows
- `flow:static:0a7b3a0fdc2f50c766b62d80`: environment read (resolved / complete)
- `flow:static:0a97d4b991e021a178036634`: cli_subprocess execute (resolved / complete)
- `flow:static:1a354f7d4d9128ba61ea45ec`: cli_subprocess execute (resolved / complete)
- `flow:static:2903fe84312c6fabd17d5955`: environment read (resolved / complete)
- `flow:static:3307965baa3c75631fd0c9d1`: message_system emit (resolved / complete)
- `flow:static:3ba047bf3f8d3f4b1f52f923`: filesystem read (resolved / complete)
- `flow:static:3d2a8768c790463ecf6ccba3`: filesystem write (resolved / complete)
- `flow:static:4290b0faab753107881bc764`: environment read (resolved / complete)
- `flow:static:486fde1b7973ae11dcbfb430`: filesystem write (resolved / complete)
- `flow:static:4c7681dfbfc4eec8c9b8fb95`: cli_subprocess execute (resolved / complete)
- `flow:static:6432b0fc3cea9c0e2392b4a1`: message_system emit (resolved / complete)
- `flow:static:71bfef2a243096c989f58559`: filesystem read (resolved / complete)
- `flow:static:75e2688265c9dc284524066f`: environment read (resolved / complete)
- `flow:static:7a3498cbd420e4d575df0ad4`: environment read (resolved / complete)
- `flow:static:80aa7f52151b237315aba791`: cli_subprocess execute (resolved / complete)
- `flow:static:82de7ec50640ee99694cbf8b`: cli_subprocess execute (resolved / complete)
- `flow:static:8c376023ca584da36d651a18`: environment read (resolved / complete)
- `flow:static:92d1f3b325a561b4cb617126`: filesystem read (resolved / complete)
- `flow:static:99ad4a80761cd5db3ac89e32`: filesystem read (resolved / complete)
- `flow:static:a854b62e3462251984fdbc4d`: environment read (resolved / complete)

## Tests
- None

## Evidence
| Evidence | File | Lines | Analyzer |
| --- | --- | --- | --- |
| `ev:00ca035c76709dbc44ee8ba9` | `src-tauri/src/lib.rs` | 98-98 | `tree-sitter-rust` |
| `ev:03abcbe407c0c6ff1a4cf153` | `src-tauri/src/main.rs` | 2-2 | `tree-sitter-rust` |
| `ev:03e287e3387fca8eb9e9167e` | `src-tauri/src/lib.rs` | 53-55 | `tree-sitter-rust` |
| `ev:03ea65352b609a2461fa8917` | `src-tauri/src/lib.rs` | 151-151 | `tree-sitter-rust` |
| `ev:053eadf9717d6e6792d53f36` | `src-tauri/src/lib.rs` | 197-197 | `tree-sitter-rust` |
| `ev:07fa0fd42b4beff9185bed6b` | `src-tauri/src/lib.rs` | 204-204 | `tree-sitter-rust` |
| `ev:085f8a331134990949ff04eb` | `src-tauri/src/lib.rs` | 103-103 | `tree-sitter-rust` |
| `ev:0a96b6f77036d6959fa2bb04` | `src-tauri/src/lib.rs` | 63-67 | `tree-sitter-rust` |
| `ev:0cf9b543b66a245aad09dc36` | `src-tauri/src/lib.rs` | 83-115 | `tree-sitter-rust` |
| `ev:0db3ec8b2d7cc89cdef3db6a` | `src-tauri/src/lib.rs` | 66-66 | `tree-sitter-rust` |
| `ev:0ee78930ab090961850d6a4f` | `src-tauri/src/lib.rs` | 123-123 | `tree-sitter-rust` |
| `ev:1176cc85a671fd12aaa5c02a` | `src-tauri/src/lib.rs` | 159-159 | `tree-sitter-rust` |
| `ev:13601f4b9ed0f228dbf81d7f` | `src-tauri/src/lib.rs` | 132-150 | `tree-sitter-rust` |
| `ev:17c5e410a84f9113562babd6` | `src-tauri/src/lib.rs` | 112-112 | `tree-sitter-rust` |
| `ev:1a4c3c993763165b5151327e` | `src-tauri/src/lib.rs` | 40-40 | `tree-sitter-rust` |
| `ev:1a65307810a1c7907e8acbac` | `src-tauri/src/lib.rs` | 189-189 | `tree-sitter-rust` |
| `ev:1b0b2f9a34739b1d7833dc29` | `src-tauri/src/lib.rs` | 153-187 | `tree-sitter-rust` |
| `ev:1b162e3ca5e078663bf45f78` | `src-tauri/src/lib.rs` | 70-70 | `tree-sitter-rust` |
| `ev:1c8882b3d8d8de72afe50397` | `src-tauri/src/lib.rs` | 119-206 | `tree-sitter-rust` |
| `ev:1da7a6e260ed407fba87c3fb` | `src-tauri/src/lib.rs` | 114-114 | `tree-sitter-rust` |
| `ev:203e02751071fb47b0e6926a` | `src-tauri/src/lib.rs` | 92-95 | `tree-sitter-rust` |
| `ev:2437830c4927e20b3a9ef789` | `src-tauri/src/lib.rs` | 135-135 | `tree-sitter-rust` |
| `ev:264de599d65cb23d21fab17e` | `src-tauri/src/lib.rs` | 160-160 | `tree-sitter-rust` |
| `ev:2692fa1f9154b40e071ccd5b` | `src-tauri/src/lib.rs` | 120-120 | `tree-sitter-rust` |
| `ev:2863c6cbb03c01ec7dc38107` | `src-tauri/src/lib.rs` | 43-45 | `tree-sitter-rust` |
| `ev:2b5b3b76fccad046219eb43a` | `src-tauri/src/lib.rs` | 92-93 | `tree-sitter-rust` |
| `ev:2e22f66475842a5e7962805d` | `src-tauri/src/lib.rs` | 74-74 | `tree-sitter-rust` |
| `ev:311afb91c74dc12e1a4861a8` | `src-tauri/src/lib.rs` | 177-180 | `tree-sitter-rust` |
| `ev:315e815de47eb7d5aec36e5d` | `src-tauri/src/lib.rs` | 112-112 | `tree-sitter-rust` |
| `ev:328e02ce1ac40182781c49c6` | `src-tauri/src/lib.rs` | 215-215 | `tree-sitter-rust` |
| `ev:32eabc331809722a4d8f92a7` | `src-tauri/src/lib.rs` | 197-197 | `tree-sitter-rust` |
| `ev:353b658538242b7423e3442a` | `src-tauri/build.rs` | 1-3 | `tree-sitter-rust` |
| `ev:35a61b6b8d2242ffdab8f3e0` | `src-tauri/src/lib.rs` | 92-96 | `tree-sitter-rust` |
| `ev:376c614f8fdc3e409fc43f06` | `src-tauri/src/lib.rs` | 195-195 | `tree-sitter-rust` |
| `ev:38f06488298ae0685fd96b81` | `src-tauri/src/lib.rs` | 47-47 | `tree-sitter-rust` |
| `ev:395d7e4104e3673c1f7ba088` | `src-tauri/src/lib.rs` | 214-214 | `tree-sitter-rust` |
| `ev:3bb156f4a3c62fa944373a59` | `src-tauri/src/lib.rs` | 102-102 | `tree-sitter-rust` |
| `ev:3bcd34070d135651b5c9ea32` | `src-tauri/src/lib.rs` | 97-97 | `tree-sitter-rust` |
| `ev:411d61f33e2e0f1438278f1b` | `src-tauri/src/lib.rs` | 10-10 | `tree-sitter-rust` |
| `ev:4292c39cd507b2cacd0ece94` | `src-tauri/src/lib.rs` | 108-108 | `tree-sitter-rust` |
| `ev:4723c2427332d19257f4f574` | `src-tauri/src/lib.rs` | 84-91 | `tree-sitter-rust` |
| `ev:4816b5d37dee8751f5abf2e9` | `src-tauri/src/lib.rs` | 95-95 | `tree-sitter-rust` |
| `ev:484885e0546165ff6dcd496b` | `src-tauri/src/lib.rs` | 127-128 | `tree-sitter-rust` |
| `ev:48c0686f0bc97d373dcc97a4` | `src-tauri/src/lib.rs` | 11-11 | `tree-sitter-rust` |
| `ev:4b986d093cf9a4b971661e91` | `src-tauri/src/lib.rs` | 69-81 | `tree-sitter-rust` |
| `ev:50d192b964786f3f302704eb` | `src-tauri/src/lib.rs` | 70-70 | `tree-sitter-rust` |
| `ev:525512cf75c19ca437b84ca9` | `src-tauri/src/lib.rs` | 163-166 | `tree-sitter-rust` |
| `ev:54406c4acadf666071818ebb` | `src-tauri/src/lib.rs` | 54-54 | `tree-sitter-rust` |
| `ev:54bac316c82cadfd2b5b3b0b` | `src-tauri/src/lib.rs` | 97-97 | `tree-sitter-rust` |
| `ev:563144688a67c2962808daf3` | `src-tauri/src/lib.rs` | 163-163 | `tree-sitter-rust` |
<!-- goose:generated:end -->

## User notes

