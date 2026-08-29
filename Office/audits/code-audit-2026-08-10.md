# Calendar App 全量代码与项目卫生审计

> 审计日期：2026-08-10
> 基线分支：`codex/calendar-0.2.0-stabilization`
> 基线提交：`019148deda493a0135a4438da9087fda7169046d`
> 审计类型：源码、架构、数据流、测试、依赖、Git 卫生；不读取密钥或个人数据库内容。

## 1. 结论

当前应用已形成可解释的共享前端双运行时架构：Server 为手工账号 + MySQL，Desktop 为免登录 + SQLite/Tauri。核心本地测试在测试目录迁移后保持稳定，产品 API、数据库 schema 和业务运行时未发生功能改动。

本次发现的高优先级问题集中在仓库卫生和开发工具链，而不是已验证的生产依赖：运行数据库曾被 Git 跟踪、开发依赖出现新披露漏洞、格式门禁被大型生成产物和未格式化源码阻塞。三项均在本次进行安全整改。

2026-08-11 后续整改已在 Docker Desktop 29.5.3 与 MySQL 8.0.46 上完成真实验收：空库迁移到 `20260719_0008`、1 项 MySQL 契约与 2 项 Server E2E 均通过，`AUD-20260810-007` 已关闭。

## 2. 审计范围与方法

### 纳入

- `src/`：183 文件，约 25,626 行可读源码/文档。
- `backend/`：48 文件，约 9,428 行。
- `src-tauri/`：Rust 入口、Tauri 配置、capabilities 和打包资源清单。
- `scripts/`：13 个构建、迁移、测试和发布脚本。
- 8 个 Alembic revision，head `20260719_0008`。
- OpenAPI 签入快照、83 个业务路由、31 个 SQLAlchemy record。
- `.github/workflows`、依赖 lock、lint/format/test/build 配置。
- 迁移后的 `Office/test/`：76 个测试/支持文件。
- Git tracked/ignored 状态、大文件、运行数据和生成架构元数据。

### 排除内容

- `node_modules/`、`dist/`、`build/`、`src-tauri/target/` 的内容正确性。
- `.env.local`、`*.key`、`.secrets/` 和 Credential Manager 中的秘密值。
- `.dev-data/`、SQLite、库存/缓存中的用户数据内容。
- Golden Goose JSON 的逐行人工审阅；只审阅其 schema、source snapshot、coverage、体积和可用性。

### 方法

1. 核对 repo root、分支、HEAD、Git 状态与最近提交。
2. 从入口、manifest、OpenAPI、数据库模型和 lint boundary 反推架构。
3. 追踪启动、认证、CRUD、AI、Goal Control、OCR、备份和桌面迁移链路。
4. 运行格式、lint、Vitest、Python、构建、OpenAPI、Rust、版本、E2E 和依赖审计。
5. 迁移测试后重复运行核心套件，确保路径调整不改变行为。

## 3. 模块与数据流摘要

| 子系统        | 主要入口                            | 数据落点                                | 主要保护                               |
| ------------- | ----------------------------------- | --------------------------------------- | -------------------------------------- |
| 启动/认证     | `src/main.tsx`, `backend/server.py` | users/sessions/preferences              | bootstrap、CSRF、loopback token        |
| Calendar/Todo | stores + API adapters               | events/todos/event_types                | Zod、user_id、复合约束                 |
| AI            | `useAI`, `apiAIService`, proxy      | pending state / approved writes         | schema、预算 clamp、人工审批           |
| Goal Control  | `goal_control.py/api.py`            | goals/projects/actions/metrics/versions | transaction、capacity、proposal diff   |
| Active Tools  | metadata + tool runs                | projects/tool_runs                      | active/routing gate、预览              |
| Fridge        | `backend/fridge/pipeline.py`        | fridge_items/cache                      | upload validation、OCR trace、fallback |
| Backup/import | data endpoints                      | versioned account backup                | preview checksum、冲突、关系校验       |
| Desktop       | Tauri + sidecar                     | local SQLite                            | random port/token、candidate migration |

详细说明见：

- `Office/planning/architecture.md`
- `Office/docs/input-output-flow.md`
- `Office/docs/algorithms.md`

## 4. 审计发现

| ID               | 等级   | 发现                                                                         | 用户/项目影响                               | 状态                                             |
| ---------------- | ------ | ---------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| AUD-20260810-001 | High   | `.dev-data` 快照、长期记忆 SQLite、库存/缓存曾被 Git 跟踪                    | 可能扩大仓库并把本机运行数据带入历史        | 已整改：只取消跟踪，本地文件保留并忽略           |
| AUD-20260810-002 | High   | npm 开发依赖出现 4 high、1 moderate 新漏洞                                   | `npm audit --audit-level=high` 和 CI 会失败 | 已整改：patch-level 更新；完整/生产 audit 均 0   |
| AUD-20260810-003 | Medium | Prettier 基线失败 49 文件                                                    | 主分支 validate 不能全绿                    | 已整改：生成物明确排除，人工源码/文档格式化      |
| AUD-20260810-004 | Medium | 架构/数据流/Governance 文档仍把 Firebase/localStorage 描述为主链路           | 新维护者会按错误运行时修改代码              | 已整改：以 FastAPI + SQL 双运行时重写            |
| AUD-20260810-005 | Medium | `findings.json` 包含不存在 `src/web/cart.tsx` 的演示发现                     | 审计结果不可信                              | 已整改：替换为本次证据化发现                     |
| AUD-20260810-006 | Low    | Golden Goose 生成产物为父提交 `0122bc` 的 partial 快照，且大型 JSON 约 34 MB | 仓库较重，静态图可能滞后                    | Open：`retainedByDecision=true`，非发布阻塞      |
| AUD-20260810-007 | Info   | 初始 Docker daemon 不可用，真实 MySQL / Server E2E 未复验                    | 无法以 SQLite 结果证明 MySQL 与认证隔离     | 已解决：`test:server:local` 三阶段通过并完成清理 |

### 运行数据整改边界

从 Git index 移除但不删除磁盘文件：

- `.dev-data/**`
- `backend/data/long_term_memory.sqlite3`
- `backend/data/fridge_inventory.json`
- `backend/data/shelf_life_cache.json`

`backend/data/shelf_life_defaults.json` 是打包需要的静态默认表，继续跟踪。

### 密钥与本地文件

下列路径已确认被忽略，审计未读取其内容：`.env.local`、`calendar-app-updater.key*`、`.secrets/`、`*.log`、构建目录、测试结果和 Tauri target/resources 生成内容。

## 5. 测试与质量状态

### 迁移前基线

| 命令                                        | 结果                      |
| ------------------------------------------- | ------------------------- |
| `npm.cmd run test:run`                      | 52 files / 264 tests 通过 |
| `python -m unittest discover tests/backend` | 77 通过，1 MySQL 条件跳过 |
| `npm.cmd run test:e2e:desktop`              | 9 通过                    |
| lint/build/OpenAPI/Rust/version             | 通过                      |
| format                                      | 失败，49 文件             |

### 迁移后即时复验

| 命令                                              | 结果                      |
| ------------------------------------------------- | ------------------------- |
| `npm.cmd run test:run`                            | 52 files / 264 tests 通过 |
| `python -m unittest discover Office/test/backend` | 77 通过，1 MySQL 条件跳过 |

最终全门禁结果记录于 `Office/test/CURRENT_STATUS.md`。

## 6. 依赖审计

- `npm audit --audit-level=high`：整改后 0 漏洞。
- `npm audit --omit=dev --audit-level=high`：0 漏洞。
- `requirements-server.lock`：临时隔离环境用 `pip-audit --no-deps --disable-pip` 检查，0 已知漏洞。
- `requirements-desktop.lock`：同上，0 已知漏洞。
- `requirements-test.lock`：同上，0 已知漏洞；保留运行时 `httpx` 并为测试加入 `httpx2`。

三份 lock 均完整 pin + hash，并以 pip-audit 2.10.1 的 pinned-lock 模式完成审计；CI 同步审计 server、desktop 与 test 三份锁。

## 7. 架构与安全评价

### 已确认的正向边界

- Server 强制 MySQL URL，不会静默退回 SQLite；无公开注册路由。
- Desktop 是真正免登录的本地主体，不复用服务端管理员捷径。
- API client 统一 credentials、CSRF、401 reset 和 session epoch request abort。
- 个人数据读写、导入导出和目标关系以 `user_id` 隔离。
- AI 输出必须通过 schema 和人工审批，hard limit 不阻断本地非 AI 功能。
- Desktop migration 使用独立 candidate 并在替换前做多重验证。
- 上传、请求体、登录和 AI 路径均有大小/速率/错误边界。

### 真实环境验收结果与剩余边界

- Docker Desktop 29.5.3 上的 MySQL 8.0.46 空库已迁移到 `20260719_0008`。
- MySQL 契约确认两用户可使用相同业务 ID 且事件读取按用户隔离；本轮未单独执行并发压力测试。
- Server Playwright 2 项确认登录、CSRF、会话失效/重登/退出与两账户数据隔离。
- Windows 安装版/portable 的干净机器升级与签名 smoke 仍是后续发布任务；本轮未读取签名密钥。

## 8. 后续建议

1. 继续以 `npm.cmd run test:server:local` 作为本地 MySQL 三阶段验收入口，并在 CI 保留独立 MySQL 门禁。
2. 后续 Golden Goose 重新生成时绑定当前提交，并把 source coverage 从 partial 提升；否则继续视为历史快照。
3. 评估将大型生成 JSON 放入 Release artifact 或外部分析存储；本次按用户选择不做深度瘦身。
4. 保持 `Office/test/TEST_MATRIX.md` 与新增/删除测试同步，并在 CI 中继续使用稳定的 `npm run test:*` 接口。
