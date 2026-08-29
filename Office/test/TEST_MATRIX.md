# 测试文件矩阵

> 每个稳定测试文件必须说明验证目标、边界和真实场景。
> Support 文件不是独立测试，但列入矩阵以说明职责。

## Unit（Vitest）

| 文件                                         | 验证目标                             | 边界                        | 实际场景                              |
| -------------------------------------------- | ------------------------------------ | --------------------------- | ------------------------------------- |
| `unit/scripts/pythonExecutable.test.ts`      | Locked Python resolver               | Temp files; no interpreter  | Shared fail-closed Python selection   |
| `unit/scripts/testCatalog.test.ts`           | Catalog schema, mapping, and hash    | Does not run catalog suites | Machine test catalog drift prevention |
| `unit/app.smoke.test.tsx`                    | App 能挂载                           | 不验证后端                  | 发布前最小 UI smoke                   |
| `unit/components/toolsRegistry.test.ts`      | 工具注册表完整                       | 不运行工具                  | Settings/Fridge/Goal 工具入口可发现   |
| `unit/components/Modal.test.tsx`             | Modal 焦点陷阱与关闭后恢复           | jsdom，不验证浏览器视觉布局 | 键盘操作计划编辑对话框                |
| `unit/domain/activeToolPrompt.test.ts`       | Active Tool prompt 框架              | 不调用模型                  | 向 AI 提供稳定工具上下文              |
| `unit/domain/activeToolOnboarding.test.ts`   | 关键问题选择、跳过影响与严格计划校验 | 不调用模型或写数据库        | Goal Planner/Fitness 共用审核前流程   |
| `unit/domain/ai.schema.test.ts`              | AI 动作/result Zod                   | 不判断模型质量              | 拒绝畸形 AI JSON                      |
| `unit/domain/dateHelpers.test.ts`            | 月/周/日范围与日期格式               | 不覆盖系统 locale 全组合    | 日历导航和标题                        |
| `unit/domain/event.schema.test.ts`           | Event 有效/无效形状                  | 不写数据库                  | 表单/API 返回校验                     |
| `unit/domain/eventDeduplication.test.ts`     | existing/batch 去重                  | 不做语义相似度              | AI 批量日程防重复                     |
| `unit/domain/goalPlanningPrompt.test.ts`     | Goal prompt、模式窗口、plan parse    | provider 为 mock            | 长期目标预览和 Check-in 摘要          |
| `unit/domain/i18n.test.ts`                   | locale 和翻译 fallback               | 不截图所有文案              | 登录前/应用语言切换                   |
| `unit/domain/progress.test.ts`               | action/milestone 进度                | 不等于效果指标              | Active Tool 进度条                    |
| `unit/domain/recurrence.schema.test.ts`      | 循环规则 schema                      | 不展开实例                  | 表单/API 规则合法性                   |
| `unit/domain/recurrence.test.ts`             | daily/weekly/monthly 展开和终止      | 只展开给定范围              | 重复会议、例外和月末                  |
| `unit/domain/taskPlanner.test.ts`            | Todo 排序与空档分配                  | 不预测通勤/休息             | 自动把任务放入工作时段                |
| `unit/domain/timeContext.test.ts`            | 当前时间、时区 override              | 不请求 OS 时区数据库外数据  | AI 理解“今天/明天”                    |
| `unit/domain/todo.schema.test.ts`            | Todo 元数据 schema                   | 不持久化                    | ETA/priority/energy 输入校验          |
| `unit/domain/toolRoadmap.test.ts`            | implementationPath/roadmap 派生      | 不渲染 UI                   | Goal Planner 与 Active Tools 共享路线 |
| `unit/domain/toolSessionPresets.test.ts`     | 内置 preset registry/schema          | 不调用 AI                   | Dining/Workout preset 可加载          |
| `unit/hooks/useCalendar.test.ts`             | hook 导航动作                        | jsdom，无真实时钟 UI        | 上一页/下一页/今天                    |
| `unit/scripts/e2eSafety.test.ts`             | E2E 数据库防误用与自动端口           | 不连接数据库或启动浏览器    | 测试入口 fail-closed                  |
| `unit/services/aiServiceFactory.test.ts`     | API/local provider 选择              | provider 为 fake            | 无 key 时可靠降级                     |
| `unit/services/apiAIService.test.ts`         | endpoint、payload、响应校验          | mock fetch                  | DeepSeek-compatible 请求契约          |
| `unit/services/appApiClient.test.ts`         | cookie/CSRF/401/abort                | 不启动 FastAPI              | 会话过期和切换账号                    |
| `unit/services/firestoreAdapter.test.ts`     | legacy adapter 契约                  | 非生产启动路径              | 旧 Firebase 数据迁移兼容              |
| `unit/services/fridgeApiService.test.ts`     | multipart 与响应解析                 | mock fetch/OCR              | 上传票据和库存错误显示                |
| `unit/services/localAIService.test.ts`       | 本地确定性动作/时间                  | 能力有限，不代表 LLM        | 无 API key 的基础排程                 |
| `unit/services/localStorageAdapter.test.ts`  | legacy CRUD/序列化                   | 非生产主存储                | 旧浏览器数据兼容                      |
| `unit/services/runtimeConfigService.test.ts` | 配置默认值和 legacy migration        | 只测 localStorage mock      | 升级旧设置                            |
| `unit/store/authStore.test.ts`               | bootstrap/login/session 状态         | mock API                    | 登录、过期和恢复                      |
| `unit/store/aiStore.test.ts`                 | AI 异步请求代际和会话隔离            | fake AI service             | 新会话不接收旧请求结果                |
| `unit/store/calendarStore.test.ts`           | view/focused date                    | 不渲染网格                  | 日历视图状态                          |
| `unit/store/configStore.test.ts`             | 配置应用和 service 重建              | mock storage/API            | 设置保存即时生效                      |
| `unit/store/desktopUpdateStore.test.ts`      | 更新发现/进度/portable fallback      | 不安装真实包                | 更新提示和下载页                      |
| `unit/store/eventStore.test.ts`              | Event CRUD、乐观状态、系列编辑       | fake adapter                | 新建、修改、删除事件                  |
| `unit/store/eventTypeStore.test.ts`          | 类型 seed/create/archive             | fake service                | 用户管理事件颜色/类型                 |
| `unit/store/longTermMemoryStore.test.ts`     | 详情加载竞态和账号重置失效           | fake client                 | 快速切换项目时只保留最新项目数据      |
| `unit/store/resetUserSession.test.ts`        | 清空跨账号状态                       | 不验证浏览器 cache 全部     | 退出/切换账号不泄漏 UI 数据           |
| `unit/store/todoStore.test.ts`               | Todo CRUD/status                     | fake service                | 完成、恢复、删除任务                  |
| `unit/store/toolSessionStore.test.ts`        | preset/run/result state              | fake AI/memory              | 工具会话运行和草稿                    |
| `unit/store/uiStore.test.ts`                 | modal/panel/approval 状态            | 不渲染组件                  | 工作区面板切换                        |

## Support

| 文件                        | 职责                                        | 边界           | 实际场景             |
| --------------------------- | ------------------------------------------- | -------------- | -------------------- |
| `support/setupTests.ts`     | jest-dom、MSW 生命周期、store/runtime reset | 不含断言       | 每个 Vitest 用例隔离 |
| `support/mocks/server.ts`   | MSW node server                             | 仅测试进程     | 拦截前端 API         |
| `support/mocks/handlers.ts` | 默认配置/AI/Fridge handlers                 | 不使用真实密钥 | 确定性网络响应       |

## Integration（Vitest + RTL/jsdom）

| 文件                                             | 验证目标                            | 边界                       | 实际场景                        |
| ------------------------------------------------ | ----------------------------------- | -------------------------- | ------------------------------- |
| `integration/aiAssistant.test.tsx`               | 对话、动作计划、审批、模板/工具路由 | mock AI/API                | 创建/修改事件和 Todo、拒绝冲突  |
| `integration/aiDemoTools.test.tsx`               | Fitness/Learning tool 激活和路由    | fake memory/AI             | 创建独立 Active Tool 并记录进度 |
| `integration/authGate.test.tsx`                  | 登录门、语言、无注册入口            | 不验证真实 cookie          | Server 未登录首屏               |
| `integration/calendarViews.test.tsx`             | 月/周/日切换                        | jsdom 布局非真实像素       | 浏览不同日历视图                |
| `integration/debugPanel.test.tsx`                | debug 信息与关闭                    | 仅开发 UI                  | 本地诊断状态                    |
| `integration/dragDrop.test.tsx`                  | 日期/时间 drop 与循环 scope         | 模拟 dnd，不是浏览器坐标   | 拖动普通/循环事件               |
| `integration/eventCRUD.test.tsx`                 | 表单创建、编辑、删除                | fake storage               | 用户完整管理事件                |
| `integration/fridgePanel.test.tsx`               | Fridge 模板激活与 tool run          | fake analyzer/memory       | 建立冰箱 Active Tool            |
| `integration/goalConversationAnchoring.test.tsx` | 当前情况优先提问与可审阅 anchor     | MSW，不调用模型            | 长期目标先确认起点              |
| `integration/goalPlanner.test.tsx`               | 激活、路线编辑、Active Tools 视图   | fake memory/AI             | 创建和维护长期计划              |
| `integration/recurringEvents.test.tsx`           | 创建/编辑/删除 this/following/all   | fake persistence           | 管理重复会议实例                |
| `integration/settingsPanel.test.tsx`             | AI profile、local、后端设置         | mock API/localStorage      | 保存 DeepSeek 和运行时设置      |
| `integration/syncManager.test.ts`                | 双 adapter 写入与失败行为           | legacy/fake adapter        | 兼容旧同步模块                  |
| `integration/todoPanel.test.tsx`                 | 创建、类型、排程、步骤编辑          | fake services              | 从任务到日历、AI 步骤细化       |
| `integration/toolsPanel.test.tsx`                | 工具模板/设置导航                   | 不执行真实工具             | 打开/关闭工具面板               |
| `integration/workspaceLayout.test.tsx`           | 默认比例、聚焦、设置更新            | jsdom 无真实 resize engine | 工作区/日历布局切换             |

## Backend（Python unittest）

| 文件                                     | 验证目标                                                    | 边界                           | 实际场景                   |
| ---------------------------------------- | ----------------------------------------------------------- | ------------------------------ | -------------------------- |
| `backend/test_auth_api.py`               | 登录/退出、CSRF、节流、锁定、账号隔离、备份                 | 临时 SQLite；不证明 MySQL 并发 | Server 账号安全            |
| `backend/test_active_tool_onboarding.py` | 草稿恢复、严格激活、回滚、幂等和漏斗隐私                    | 临时 SQLite；provider 为 fake  | 审核后事务创建 Active Tool |
| `backend/test_calendar_repository.py`    | 日历仓储 CRUD/范围                                          | 临时 SQLite                    | API 持久化事件             |
| `backend/test_desktop_auth.py`           | token gate、本地主体、AI 响应和预算                         | 不启动 Tauri binary            | Desktop 免登录安全入口     |
| `backend/test_e2e_seed_safety.py`        | E2E seed URL 与目标库双层防误用                             | 不连接真实 MySQL               | 拒绝向普通数据库写测试账号 |
| `backend/test_desktop_migration.py`      | fresh/known/false stamp/corrupt migration                   | temp 文件，不覆盖用户库        | 桌面升级失败保护           |
| `backend/test_fridge_pipeline.py`        | 上传、OCR、parser、cache、fallback、库存                    | fake OCR/DeepSeek              | 票据识别和保质期           |
| `backend/test_goal_control.py`           | 容量、目标、指标、Check-in、版本、预算、隔离和备份 checksum | 临时 SQLite/冻结时间           | 长期目标与可移植备份       |
| `backend/test_integrity_audit.py`        | orphan、quarantine、repair                                  | temp DB                        | 运维审计并修复脏关系       |
| `backend/test_legacy_migration.py`       | SQLite/JSON legacy import 幂等                              | 临时旧数据                     | 老版本迁入首个账号         |
| `backend/test_memory_service.py`         | Project/Milestone/Action/Progress/ToolRun                   | temp DB                        | Active Tool 长期记忆       |
| `backend/test_mysql_contract.py`         | Alembic head、复合 FK、事务回滚、幂等、漏斗隔离和并发       | 需可丢弃真实 MySQL URL         | 服务端发布数据库契约       |
| `backend/test_openapi_snapshot.py`       | 当前 routes/DTO 等于签入快照                                | Desktop temp app               | 防止未记录 API 漂移        |
| `backend/test_request_limits.py`         | JSON/login/AI/multipart 大小限制                            | TestClient                     | 拒绝超大请求               |
| `backend/test_update_backup.py`          | 快照、checksum、路径、保留三份                              | temp SQLite                    | 更新前可恢复备份           |
| `backend/test_windowed_server.py`        | windowed sidecar 错误日志/parent watchdog                   | 不构建完整安装包               | 无控制台桌面故障诊断       |
| `backend/__init__.py`                    | unittest discovery package marker                           | 无测试                         | 递归发现测试模块           |
| `backend/test_database_cli_guards.py`    | 管理账号、Alembic、审计、旧数据导入 URL 守卫                | mock engine，不连接数据库      | 拒绝默认库或非 MySQL 写入  |

## E2E（Playwright）

| 文件                               | 验证目标                                 | 边界                                  | 实际场景               |
| ---------------------------------- | ---------------------------------------- | ------------------------------------- | ---------------------- |
| `e2e/aiBreakdown.test.ts`          | 打开 AI、无 key 状态                     | 不产生付费调用                        | 首次使用 AI 提示       |
| `e2e/activeToolOnboarding.test.ts` | 推荐、审核、激活、打开工作区与零日历写入 | Desktop 临时 SQLite；AI 为确定性 fake | 首次创建 Active Tool   |
| `e2e/createEvent.test.ts`          | 创建、刷新持久化、三视图                 | Desktop 临时 SQLite                   | 用户创建事件并重开页面 |
| `e2e/desktopStability.test.ts`     | Active Tool 备份预览、隔离 Check-in skip | dev sidecar，不是安装包               | 桌面数据稳定性         |
| `e2e/dragAndDrop.test.ts`          | 月/周拖放和循环 scope                    | Chromium 单 worker                    | 实际鼠标拖动事件       |
| `e2e/serverAuth.test.ts`           | 登录、账号隔离、退出                     | 需要真实 MySQL server mode            | 多用户服务端访问       |
| `e2e/helpers.ts`                   | 定位器、事件创建等共享 helper            | 无独立断言                            | E2E 操作复用           |

## 完整性检查

矩阵应与以下命令的文件集一致：

```powershell
rg --files Office/test -g "*.test.ts" -g "*.test.tsx" -g "test_*.py"
```

新增测试时必须同步更新本文件；重命名/迁移测试后，CI 路径和 `CURRENT_STATUS.md` 也必须同步。
