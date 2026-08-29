# Calendar App 2026-08-12 增量全量审计与修复

> 审计日期：2026-08-12
> 分支：`codex/calendar-0.2.0-stabilization`
> 基准提交：`019148deda493a0135a4438da9087fda7169046d`
> 审计对象：上述提交上的共享未提交工作区
> 审计方式：在 2026-08-10 全量基线之上，对当前前端、FastAPI、数据库、Tauri、测试链和发布链做增量全量复核；发现可确认缺陷后直接修复并补回归测试。

## 1. 结论

本轮确认并修复了 6 类高风险问题和 6 类中风险问题。高风险集中在运行时 schema 完整性、跨租户状态、测试数据库防误连、复合写事务、导入/引用完整性和异步旧响应覆盖；中风险集中在时区/DST、输入契约、桌面恢复、可访问性和发布门禁可信度。

修复保持既定产品边界：Server 仍是 MySQL + 管理员手工开户且无公开注册；Desktop 仍是免登录 SQLite 本地应用且不隐式同步云端；AI secret 仍只存在于后端环境。没有读取生产数据库、真实账号、真实用户备份或签名密钥，也没有调用真实 AI provider。

共享修改冻结后已完成本轮允许范围内的最终门禁。真实 MySQL、Server E2E、打包、签名和真实 provider 仍明确标记为未运行，不用历史结果或条件跳过冒充本轮通过。

## 2. 审计范围

- 前端：domain schema、service、Zustand store、hook、Calendar/Todo/Goal Planner/Fridge/UI 可访问性。
- 后端：认证与租户隔离、calendar CRUD、memory 复合写、Goal Control、AI proxy、Fridge、备份/导入、完整性审计、迁移与启动策略。
- 桌面：Tauri sidecar handshake、SQLite 恢复错误、desktop/server 环境隔离。
- 工具链：Vitest、Python 解释器解析、Playwright launcher、OpenAPI、Rust、CI、依赖审计、测试目录与 provenance。
- 仓库治理：`AGENTS.md`、`Office/` 入口、审计记录、测试说明和扩展 backlog。

不逐行审阅 `node_modules/`、构建目录或历史 Golden Goose 大型 partial 快照；不读取任何被忽略的 secret 或用户运行数据内容。

## 3. 已修复高风险问题

| ID               | 发现与影响                                                                     | 修复与证据入口                                                                                                                                        | 状态   |
| ---------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AUD-20260812-001 | 运行时可能把迁移版本正确但表/列不完整的数据库当成可启动，造成延迟数据损坏      | `backend/database.py` 增加全 ORM schema fingerprint；`backend/server.py` 先验证 Alembic head 再验证表、列、主键、唯一约束和关键外键，运行时不再补建表 | 已修复 |
| AUD-20260812-002 | Server Fridge 动态缓存和 provider 生命周期可能跨用户共享，预算隔离不完整       | `backend/fridge/` 与 `backend/server.py` 改为请求级计量 provider；Server 仅使用静态默认缓存，按用户记录成功、失败、超时、限流和非法用量               | 已修复 |
| AUD-20260812-003 | Server E2E 曾可能继承普通数据库 URL，存在误连非测试 MySQL 的风险               | `scripts/e2e-launcher.mjs`、`scripts/seed-e2e-users.py` 只接受显式 `CALENDAR_E2E_DATABASE_URL`，要求 `mysql+` driver 且库名包含 test/e2e 独立分段     | 已修复 |
| AUD-20260812-004 | 本地快照导入和 calendar 引用写入缺少完整预校验/单事务，失败可能留下半成品      | `backend/server.py`、`backend/calendar/` 与 `backend/audit_integrity.py` 增加严格嵌套 DTO、前向引用校验、同租户校验、单事务回滚和可修复 orphan 审计   | 已修复 |
| AUD-20260812-005 | “创建目标后再创建项目”是两次写入，第二步失败会留下孤立目标                     | 新增 `POST /api/memory/goal-projects` 与 repository 同事务写入；前端四条生产路径统一调用 `createGoalProject`，失败整体回滚                            | 已修复 |
| AUD-20260812-006 | Calendar、AI、长期记忆的旧异步响应可能覆盖切换范围、会话、写入或账号后的新状态 | `src/store/eventStore.ts`、`aiStore.ts`、`longTermMemoryStore.ts` 引入 generation 失效边界；reset、账号切换、成功写入和新请求会废弃旧结果             | 已修复 |

## 4. 已修复中风险问题

| ID               | 发现与影响                                                                   | 修复与证据入口                                                                                                                                             | 状态   |
| ---------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AUD-20260812-007 | 循环实例和 until 日期使用 UTC 截取，负偏移时区会跨日；本地 AI 时间未覆盖 DST | `src/domain/logic/recurrence.ts` 与 `src/services/ai/localAIService.ts` 使用本地日期/IANA 时区，按目标日期解析 offset，并拒绝春季不存在时间                | 已修复 |
| AUD-20260812-008 | TimeGrid 点击小时未传到表单；Modal 缺少完整焦点管理                          | `src/components/calendar/TimeGrid.tsx`、`EventModal.tsx` 和 `src/components/ui/Modal.tsx` 增加时间预填、初始焦点、focus trap、Escape、焦点恢复和键盘可见态 | 已修复 |
| AUD-20260812-009 | 多个请求体仍允许宽松类型、未知字段或非有限数值，错误可能下沉为 500           | `backend/server.py`、`backend/memory/service.py`、`backend/goal_control.py`、`backend/user_data.py` 对关键入口增加 strict DTO/allowlist 和稳定 422         | 已修复 |
| AUD-20260812-010 | Tauri 只能把 sidecar 恢复失败当普通文本，用户无法获得可操作诊断              | `src-tauri/src/lib.rs` 解析 `CALENDAR_BACKEND_RECOVERY` 结构化 payload，保留 typed code、数据库、备份与诊断路径                                            | 已修复 |
| AUD-20260812-011 | Python 命令可回退全局 PATH；测试 catalog provenance 在 merge/squash 后不可靠 | `scripts/python-executable.mjs` 只接受显式解释器或 `.venv-test`；catalog 以 Git-filtered worktree hash 校验内容，clean checkout 不再绑定旧提交拓扑         | 已修复 |
| AUD-20260812-012 | Vitest 默认并发在全量套件中出现资源型不稳定                                  | `vitest.config.ts` 将 worker 上限固定为 4；相关全量和 focused 测试纳入最终门禁                                                                             | 已修复 |

## 5. 数据完整性与安全边界复核

- Event type、linked event/todo、master/exception 等引用在写入前验证同租户存在性；删除 event/todo 时同事务清理允许为空的反向引用，不删除业务对象。
- 本地 snapshot 在落库前完成严格嵌套校验与前向引用解析；晚期失败整体回滚，重复 replay 保持幂等。
- Server 启动只接受 MySQL；测试中的 SQLite server opt-in 必须显式提供隔离 URL，不能只靠环境默认值开启。
- Server 维护 CLI 需要显式 MySQL URL 和迁移 head；不会静默指向桌面 SQLite。
- AI proxy 对 `max_tokens`、项目/线程标识和 Goal Control 数值做边界检查；bool、非数字、NaN/Infinity 不再进入业务计算。
- `.env.local`、更新签名 key、运行 SQLite、`.dev-data` 和 Fridge 动态缓存继续由 ignore 边界保护；本轮未读取其内容。

## 6. 本轮验证证据

以下证据来自共享工作树冻结后的本轮最终命令；详细边界以 `Office/test/CURRENT_STATUS.md` 的 2026-08-12 节为准。

| 检查                                  | 最终结果                                                                |
| ------------------------------------- | ----------------------------------------------------------------------- |
| Vitest 全量                           | 58 files / 308 tests 通过                                               |
| Python backend                        | Ran 120；119 通过，1 项因未配置一次性 MySQL URL 跳过                    |
| Desktop Playwright                    | 最终冻结后未运行；修复期间曾 9/9 通过，不能替代最终证据                 |
| Rust                                  | `rust:check` 通过；recovery tests 6/6 通过                              |
| npm full/prod audit                   | 均为 0 漏洞                                                             |
| server/desktop/test Python lock audit | 三份均为 0 已知漏洞                                                     |
| 核心门禁                              | format、lint、504-module build、OpenAPI、version 均通过                 |
| catalog / governance / diff check     | schema 与 17 个 Goose 映射通过；精确 provenance、完整治理与 diff 均通过 |

## 7. 明确未运行

以下项目在 2026-08-12 本轮没有运行，状态必须是 **NOT RUN**，不能由 2026-08-11 历史结果、SQLite 测试或 mock 替代：

- Docker 与真实 MySQL contract/concurrency。
- Server E2E。
- Desktop NSIS/portable 打包、签名、发布。
- 干净 Windows 机器上的安装/升级/恢复 smoke。
- 真实 DeepSeek/OCR provider 调用。

2026-08-11 的真实 MySQL 与 Server E2E 结果只保留为历史基线；本轮修改后仍需要显式批准和一次性测试数据库才能重新形成当前证据。

## 8. 剩余风险与拓展建议

1. **真实 MySQL 并发门禁（P1）**：在 disposable MySQL 上覆盖事务竞争、唯一约束、重试与账号隔离，并把 migration + contract + Server E2E 作为发布前显式门禁。
2. **打包恢复 smoke（P1）**：对实际 NSIS/portable artifact 在干净 Windows VM 上验证升级、备份回滚和结构化恢复提示；不把源码级 Rust 测试当作打包证明。
3. **持久幂等键（P1）**：为 goal/project 复合写、导入与可能重试的提交增加 durable idempotency key，覆盖“服务端已提交但响应丢失”的重复请求。
4. **严格 DTO 系统化补齐（P2）**：盘点剩余 raw dictionary 和兼容入口，统一未知字段、null、长度、枚举、非有限数值和日期规则，并用 OpenAPI 快照锁定。
5. **可观测性（P2）**：基于现有 AI 计量和 structured recovery，增加脱敏 latency、预算/限流、重试、迁移失败、后台任务健康指标和关联 ID。
6. **产品拓展**：优先 `.ics` 导入/导出预览与提醒投递；共享日历应先引入独立 ACL，桌面到服务端同步必须保持显式 opt-in 和冲突预览。
7. **Golden Goose**：当前 `0122bc` partial 快照继续视为历史证据；未来重生成时绑定当前 source snapshot，并评估把大型产物迁到 release artifact/外部分析存储。

完整候选及安全首步见 `Office/extensions/future-backlog.md`。
