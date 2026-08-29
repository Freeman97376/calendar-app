# 当前测试与验证状态

> 初始审计日期：2026-08-10
> 后续整改验收：2026-08-11
> 分支：`codex/calendar-0.2.0-stabilization`
> 基准提交：`019148deda493a0135a4438da9087fda7169046d`
> 验收对象：上述提交上的已暂存、未提交工作区
> 状态：审计后续整改与本地真实 MySQL 验收完成；Windows 签名安装包和干净机器升级 smoke 仍属于后续发布任务。

## 1. 环境与安全边界

| 组件                   | 当前版本 / 状态                           |
| ---------------------- | ----------------------------------------- |
| Windows / PowerShell   | 本地 Windows 工作区                       |
| Node.js                | v24.16.0                                  |
| npm                    | 11.13.0                                   |
| Python                 | 3.14.5                                    |
| Rust                   | rustc 1.97.0 / cargo 1.97.0               |
| Docker client / server | 29.5.3 / 29.5.3                           |
| MySQL 测试镜像         | `mysql:8.0`，`MYSQL_VERSION=8.0.46-1.el9` |
| Alembic head           | `20260819_0009`                           |

所有数据库验收仅使用 `docker-compose.mysql-test.yml` 创建的可丢弃 `calendar_test`，数据目录为容器 tmpfs。命令结束后已执行 `docker compose down --volumes`，`docker compose ps -a` 无残留。本轮没有读取生产数据库、真实用户数据、签名密钥，也没有发起付费 AI 调用。

## 2. 迁移前基线（2026-08-10）

| 命令 / 门禁                                 | 迁移前结果                                   |
| ------------------------------------------- | -------------------------------------------- |
| `npm.cmd run format:check`                  | 失败，49 个文件不符合格式                    |
| `npm.cmd run lint`                          | 通过                                         |
| `npm.cmd run test:run`                      | 52 个文件、264 项通过                        |
| `python -m unittest discover tests/backend` | 77 项通过、1 项 MySQL 条件跳过               |
| build / OpenAPI / Rust / version            | 通过                                         |
| `npm.cmd run test:e2e:desktop`              | 9 项通过                                     |
| 完整 `npm audit`                            | 4 high、1 moderate                           |
| `npm audit --omit=dev`                      | 0 漏洞                                       |
| 真实 MySQL / server E2E                     | Docker daemon 当时不可用，未运行且未标记通过 |

## 3. 最终复验（2026-08-11）

| 命令 / 门禁                               | 结果                  | 耗时 / 证据                                       |
| ----------------------------------------- | --------------------- | ------------------------------------------------- |
| `npm.cmd run format:check`                | 通过                  | 3.920 秒                                          |
| `npm.cmd run lint`                        | 通过                  | 4.006 秒；仓库外临时 venv 不参与扫描              |
| `npm.cmd run test:run`                    | 52 个文件、264 项通过 | 47.447 秒，Vitest 报告 45.49 秒                   |
| test-lock Python unittest                 | 77 项通过、1 项跳过   | 23.822 秒；默认 SQLite，MySQL 契约按 URL 条件跳过 |
| `npm.cmd run build`                       | 通过                  | 504 个模块，最终 Vite 构建 2.15 秒                |
| `npm.cmd run openapi:check`               | 通过                  | 2.354 秒；快照一致                                |
| `npm.cmd run rust:check`                  | 通过                  | 9.862 秒                                          |
| `npm.cmd run version:check`               | 通过                  | 0.644 秒；版本 0.2.0                              |
| `npm.cmd run test:e2e:desktop`            | 9 项通过              | 23.875 秒；临时 SQLite 与隔离 loopback 端口       |
| `npm.cmd run test:server:local`           | 通过                  | 31.297 秒；见下一节                               |
| `npm audit --audit-level=high`            | 0 漏洞                | 0.984 秒                                          |
| `npm audit --omit=dev --audit-level=high` | 0 漏洞                | 0.942 秒                                          |
| server lock `pip-audit`                   | 0 已知漏洞            | 2.738 秒                                          |
| desktop lock `pip-audit`                  | 0 已知漏洞            | 1.646 秒                                          |
| test lock `pip-audit`                     | 0 已知漏洞            | 1.220 秒                                          |

Python 测试环境通过 `pip install --require-hashes -r requirements-test.lock` 创建。该锁保留后端 `httpx==0.28.1`，并为 Starlette TestClient 加入 `httpx2==2.10.0`；全新环境确认 TestClient transport 来自 `httpx2`。

## 4. 真实 MySQL 与 server E2E 验收

稳定入口：

```powershell
npm.cmd run test:server:local
```

该命令在同一临时 MySQL 生命周期中执行并清理：

| 阶段                  | 结果                                                             |
| --------------------- | ---------------------------------------------------------------- |
| `mysql:8.0` 健康检查  | 通过；实际 `MYSQL_VERSION=8.0.46-1.el9`                          |
| 空库 Alembic upgrade  | 通过；从空库迁移至 `20260719_0008`                               |
| MySQL 契约            | 1 项通过，0.301 秒                                               |
| server Playwright E2E | 2 项通过，16.5 秒；覆盖 CSRF、会话失效/重登/退出与两账户数据隔离 |
| 总耗时                | 31.297 秒                                                        |
| 清理                  | 容器、网络和卷均移除；无 compose 残留                            |

聚合脚本为 Web/API 自动选择两个空闲 loopback 端口，避免占用或终止其他本地服务。现有 `test:mysql` 与 `test:e2e:server` 名称和默认语义保持不变；外部 MySQL 模式仍必须显式提供测试 URL，禁止指向生产或真实用户数据。

## 5. 警告升级验证

- `alembic.ini` 同时保留兼容配置 `version_path_separator = os` 并增加 `path_separator = os`。
- 77 项后端测试在 `DeprecationWarning` 和 `starlette.exceptions.StarletteDeprecationWarning` 均升级为错误时通过，确认 Alembic 与 Starlette TestClient 弃用警告已消失。
- Playwright 进程树移除了继承的 `NO_COLOR`；desktop 9 项和 server 2 项最终输出不再出现 `NO_COLOR` / `FORCE_COLOR` 冲突警告。

## 6. 测试边界

- Vitest 单元测试验证纯逻辑、服务适配器和 store，不代表真实浏览器、FastAPI 或数据库。
- React 集成测试运行在 jsdom/MSW，不代表真实网络、浏览器布局、文件系统或 MySQL。
- Python 默认测试使用临时 SQLite；只有显式 MySQL 契约验证 MySQL 方言、约束和多用户隔离。
- 桌面 E2E 验证本地 sidecar、一次性启动令牌和 SQLite 主链路；server E2E 使用真实 MySQL 验证登录与账户隔离。
- AI 测试使用 mock、确定性降级或无密钥状态，不调用付费模型。
- Windows 签名安装包、portable 包和干净机器升级 smoke 未在本轮执行，也未读取签名密钥。

## 7. 测试迁移与仓库卫生验收

- 根目录 `tests/` 已移除，不保留副本或兼容镜像。
- 测试统一位于 `Office/test/{unit,integration,backend,e2e,support}`。
- Vitest、TypeScript、Playwright、CI、发布工作流、脚本和活动说明已切换到新路径。
- 运行态数据库与冰箱缓存只从 Git 跟踪中移除，磁盘本地文件保留并由 `.gitignore` 保护。
- Golden Goose 约 34 MB 生成产物保持 `0122bc` partial 历史快照，未重生成、删除或迁移；该接受风险不阻塞发布。
- 产品 API、数据库 schema 和运行时业务行为未做功能性修改。

## 8. 2026-08-12 增量全量审计

> 本节是当前工作树的新一轮证据入口。上文 2026-08-11 的 52 files / 264 tests、77 项 backend、真实 MySQL 与 Server E2E 等数据只属于历史基线，不能证明 2026-08-12 修复后的状态。

本轮修复覆盖 schema fail-closed、跨租户 Fridge 状态、异步旧响应、复合 goal/project 事务、calendar 引用与 snapshot 原子性、时区/DST、严格 DTO、E2E 数据库防误连、Tauri structured recovery、锁定 Python runner 和 catalog provenance。详细发现与证据见 `Office/audits/code-audit-2026-08-12.md`。

### 最终门禁

| 命令 / 门禁                              | 2026-08-12 最终结果                                       |
| ---------------------------------------- | --------------------------------------------------------- |
| `npm.cmd run format:check`               | 通过                                                      |
| `npm.cmd run lint`                       | 通过                                                      |
| `npm.cmd run test:run`                   | 58 个文件、308 项通过                                     |
| `npm.cmd run build`                      | 通过；504 modules                                         |
| `npm.cmd run openapi:check`              | 通过；签入快照 current                                    |
| `npm.cmd run test:backend`               | Ran 120；119 通过，1 项 MySQL URL 条件跳过                |
| `npm.cmd run rust:check`                 | 通过                                                      |
| Rust recovery tests                      | 6/6 通过                                                  |
| `npm.cmd run version:check`              | 通过；0.2.0                                               |
| `npm.cmd run test:e2e:desktop`           | `NOT RUN`；最终复跑未获显式授权，修复期间曾 9/9 通过      |
| npm full/prod audit                      | 均为 0 漏洞                                               |
| Python server/desktop/test lock audit    | 三份均为 0 已知漏洞                                       |
| catalog structure + exact provenance     | 通过；schema、17 个 Goose 映射与精确 worktree hash 均有效 |
| Office governance structure + self-tests | 通过                                                      |
| `git diff --check`                       | 通过；仅 LF/CRLF 提示，无 whitespace error                |

### 本轮未运行边界

| 项目                                        | 状态      | 原因 / 重新验证条件                                                 |
| ------------------------------------------- | --------- | ------------------------------------------------------------------- |
| Docker / 真实 MySQL contract 与 concurrency | `NOT RUN` | 需要显式批准、可丢弃 MySQL 和文档化前置条件                         |
| Server E2E                                  | `NOT RUN` | 需要上述一次性 MySQL；不得继承普通 `CALENDAR_DATABASE_URL`          |
| NSIS/portable 打包与签名                    | `NOT RUN` | 未获本轮授权，未读取签名 key                                        |
| 干净 Windows 安装/升级/恢复 smoke           | `NOT RUN` | 需要实际 artifact 和隔离 VM                                         |
| 真实 AI/OCR provider                        | `NOT RUN` | 单元/集成测试使用 fake、mock 或确定性降级，不发起付费或真实数据调用 |

本节只对已运行门禁标记通过；上表与“本轮未运行边界”中的 `NOT RUN` 项仍需在发布前按各自授权和隔离前置条件补证据。

## 9. 2026-08-19 Active Tool UX 实施复验

本轮完成 Goal Planner 与 Fitness AI 共用的“推荐 -> 关键问题 -> 可编辑计划审核 -> 事务激活 -> 打开工作区”链路，并新增本地隐私受限漏斗。计划生成和审核阶段不创建 Goal、Project、Milestone、Action 或日历事件；Fitness 安全限制必须显式确认。

| 命令 / 门禁                           | 结果                                               |
| ------------------------------------- | -------------------------------------------------- |
| `npm.cmd run format:check`            | 通过                                               |
| `npm.cmd run lint`                    | 通过                                               |
| `npm.cmd run test:run`                | 59 个文件、315 项通过                              |
| `npm.cmd run build`                   | 通过；512 modules                                  |
| `npm.cmd run openapi:check`           | 通过；空库迁移至 `20260819_0009`，签入快照 current |
| `npm.cmd run test:backend`            | Ran 127；125 通过，2 项条件跳过                    |
| `npm.cmd run test:e2e:desktop`        | 10/10 通过；临时 SQLite、确定性 fake AI            |
| `npm.cmd run test:server:local`       | MySQL contract 2/2、Server E2E 2/2；容器与卷已清理 |
| `npm.cmd run rust:check`              | 通过                                               |
| `npm.cmd run version:check`           | 通过；0.2.0                                        |
| `npm.cmd run catalog:check:structure` | 通过；schema 与 17 个 Goose 映射有效               |

2026-08-20 自动验收首次暴露两个问题：计划审核中的输入值需要使用表单值定位；Active Tool 数据里的 `0.0` 经浏览器 JSON 往返变为 `0`，导致旧 checksum 规范无法预览应用自己导出的备份。现已改为跨 Python/JavaScript 稳定的类型化数字规范，同时兼容能按旧算法验证的历史备份，并隔离共享 Check-in fixture。修复后 Desktop E2E、MySQL contract、Server E2E 和完整快速门禁全部通过。

### 本轮未运行边界

| 项目                    | 状态      | 原因 / 重新验证条件                                       |
| ----------------------- | --------- | --------------------------------------------------------- |
| 真实 DeepSeek 验收      | `NOT RUN` | 本轮保持 0 次调用、0 token；需显式批准 `--live` 双开关    |
| 精确 catalog provenance | `STALE`   | 工作树含大量既有混合修改；需先人工确认隔离/提交范围再刷新 |
| 打包、签名、发布        | `NOT RUN` | 不属于本轮授权范围，未读取签名 key                        |

本节不以 SQLite 或 mock 结果替代 MySQL、真实浏览器或真实 provider 证据；数值转化目标仍等待本地漏斗基线。
