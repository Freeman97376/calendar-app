# Calendar App 输入输出流程说明

> Last updated: 2026-06-18

本文说明用户输入如何经过前端、状态层、服务层、校验层和后端，最终变成日历、任务、冰箱库存或文档化输出。

## 1. 普通日历事件

输入：

- 用户在月/周/日视图点击日期或时间格。
- 用户在事件表单输入标题、时间、类型、颜色、循环规则等。

处理：

- `CalendarShell` 将点击传给 `useEvents`。
- `useEvents` 调用 `eventStore` 的创建或更新动作。
- `eventStore` 使用 `EventSchema` 校验事件形状，并通过 sync service 写入本地存储。
- 如果远程 Firebase 可用，`SyncManager` 会同步；离线时保留本地队列。

输出：

- 校验通过的 `Event` 存入 store。
- Calendar views 重新按日期分组渲染事件卡片。

## 2. AI Break Down Goal

输入：

- 用户在 AI Assistant 的 `Goal` 输入框写目标。
- 用户选择 `api` 或 `local` provider。

处理：

- `AIAssistantPanel` 调用 `useAI.sendGoal`。
- `useAI` 读取 focused date、配置和当前 store 状态。
- `aiStore` 调用已配置的 `IAIService.breakdownGoal`。
- `api` provider 通过 `ApiAIService` 调用 OpenAI-compatible chat completions endpoint，默认 DeepSeek。
- `local` provider 通过 `LocalAIService` 直接生成确定性计划。
- 返回值必须通过 `AIBreakdownResultSchema`。

输出：

- UI 展示可审阅的步骤卡片。
- 用户点击 `Schedule All` 后，`useAI.acceptSuggestion` 将每个 step 转成 calendar event。

## 3. AI Action Plan

输入：

- 用户在 `Calendar or task command` 输入自然语言命令，例如创建会议、删除事件、创建任务、安排任务。

处理：

- `useAI.buildContext` 通过浏览器 `new Date()` 和 `Intl.DateTimeFormat().resolvedOptions()` 读取本机当前日期/时间、IANA timezone、timezone name、UTC offset、locale；如果 Settings 里配置了 `timezoneOverride`，则使用该 IANA 时区生成 `currentLocalDateTime` 和展示 label。它同时收集当前日历焦点日期、events、todos、event types。
- `aiStore.sendActionCommand` 调用 `IAIService.planCalendarActions`。
- `api` 或 `local` provider 返回 action plan。
- 48 小时内开始的 event create/update 动作会追加确认时间 warning；重复或重叠的 event 时间段会追加阻塞 warning。
- 返回值必须通过 `AICalendarActionPlanSchema`，并且时间范围必须有效。

输出：

- UI 以 action cards 展示待执行动作、可读时间和原因。
- 需要确认的近期时间必须勾选确认后才能点击 `Apply Actions`；重复或重叠的时间段必须先调整，不能直接 apply。
- 用户点击 `Apply Actions` 后，`useAI.applyActionPlan` 调用对应 store：
  - event create/update/delete -> `eventStore`
  - todo create/update/delete -> `todoStore`
  - schedule todo -> 创建 linked event，并回写 todo 的 `linkedEventId`

## 4. Tools Panel

输入：

- 用户点击顶部 `Tools`，再选择 Settings、Tool Sessions 或 Fridge。

处理：

- `ToolsPanel` 只读取 `TOOL_DEFINITIONS` registry。
- 每个 tool 有自己的目录和 `{ id, label, Component }` 注册入口。

输出：

- 选中的 tool component 渲染到右侧面板。
- 新 tool 只需新增目录并加入 registry。

## 5. Tool Sessions

输入：

- 用户选择 built-in preset 或 custom preset。
- 用户填写 preset fields，并选择 `global`、`api` 或 `local` provider。

处理：

- Built-in presets 分别由独立目录管理，例如 Dining Planner 和 Workout Planner。
- `useToolSessions` 将 preset、inputs、本机当前日期/时间、timezone、timezone name、UTC offset、当前日历焦点日期和 llmOptions 组装成 `ToolSessionRequest`，并同样尊重 Settings 中的 `timezoneOverride`。
- `toolSessionStore` 调用当前 `IAIService.runToolSession`。
- 返回值必须通过 `ToolSessionResultSchema`。

输出：

- UI 展示生成的 calendar event drafts。
- 用户点击 `Apply events` 后，drafts 写入 `eventStore`。

## 6. Settings

输入：

- Frontend runtime：AI provider、AI API profile、API key、API base URL、model、timezone override、Firebase、Fridge API、默认事件/任务输入值。
- Backend DeepSeek/Fridge：后端 receipt pipeline 的 DeepSeek key/base URL/model 和 fridge data dir。

处理：

- Frontend runtime 写入 `RuntimeConfigService` 的 localStorage。
- `configStore.applyRuntimeConfig` 立即重建 AI service 和 Fridge API service。
- Backend config 通过 `BackendConfigApiService` PATCH 到 Python backend `/api/config`。

输出：

- 前端配置即时影响 AI 和 Fridge service。
- 后端配置写入 `.env.local` 并重建 receipt analyzer/inventory store。

## 7. Fridge Receipt Flow

输入：

- 用户上传 receipt image，可选 purchase date。

处理：

- `FridgePanel` 调用 `useFridge.analyzeReceipt`。
- `FridgeApiService` 发送 multipart request 到 `/api/fridge/receipt/analyze`。
- Python backend 验证图片，执行 OCR，本地解析 fridge/freezer candidates。
- Shelf life 先查 defaults/runtime cache，必要时用 backend DeepSeek fallback。
- 响应由前端 `FridgeReceiptAnalysisResponseSchema` 校验。

输出：

- UI 展示 receipt items、warnings 和 reminder suggestions。
- 用户可将分析结果加入 backend inventory。
- 用户可将 expiration reminders 转成 all-day calendar events。
