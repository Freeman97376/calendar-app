# Calendar App 测试集

> 稳定自动化测试的唯一位置：`Office/test/`
> 更新日期：2026-08-11

## 1. 目录

```text
Office/test/
├── unit/          # Vitest：纯逻辑、schema、service、store、hook
├── integration/   # Vitest + RTL/jsdom/MSW：多模块 UI 行为
├── backend/       # Python unittest：FastAPI、SQLite、迁移、MySQL contract
├── e2e/           # Playwright：真实 Chromium + 本地/服务端运行时
├── support/       # Vitest setup 和 MSW 公共支持，不单独执行
├── TEST_MATRIX.md
└── CURRENT_STATUS.md
```

根目录不保留 `tests/` 镜像；配置、CI 和脚本均直接发现 `Office/test/`。

## 2. 快速运行

后端测试依赖使用独立锁，避免把 `httpx2` 带入 server/desktop 生产环境：

```powershell
py -3.14 -m venv .venv-test
node scripts/run-python.mjs -m pip install --require-hashes -r requirements-test.lock
```

第一条命令只用于一次性创建仓库内测试环境。环境存在后，所有项目 Python 命令都必须通过 `scripts/run-python.mjs`；它只接受显式 `PYTHON_EXECUTABLE` 或仓库 `.venv-test`，不会回退到 PATH 上的全局 Python。

从仓库根目录执行：

```powershell
npm.cmd run test:run
npm.cmd run test:backend
npm.cmd run test:e2e:desktop
```

其他门禁：

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run build
npm.cmd run openapi:check
npm.cmd run rust:check
npm.cmd run version:check
npm.cmd audit --audit-level=high
npm.cmd audit --omit=dev --audit-level=high
```

真实 MySQL contract（会创建并删除专用 Docker volume，不使用个人数据）：

```powershell
npm.cmd run test:mysql
```

本地完整 Server 验收在同一个临时 MySQL 生命周期内执行迁移、contract 和 Server E2E，并保证最终删除容器与 volume。命令会为 Web/API 自动选择空闲 loopback 端口，不会停止其他本地服务：

```powershell
npm.cmd run test:server:local
```

已有外部 MySQL 测试库时，仍可显式设置 `CALENDAR_E2E_DATABASE_URL` 后单独运行：

```powershell
npm.cmd run test:e2e:server
```

## 3. 分类、用途、边界与真实场景

| 分类        | 用途                                                                    | 不覆盖的边界                                       | 对应实际情况                               |
| ----------- | ----------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| Unit        | 验证纯函数、Zod schema、store 状态转换和 service 请求形状               | 不启动真实浏览器、FastAPI 或数据库                 | 循环日期、Todo 排序、AI schema、会话清理   |
| Integration | 在 jsdom 中组合 React、hooks、stores 和 mock services                   | MSW/mock 不是实际网络、cookie、MySQL 或 Tauri      | 用户填写表单、审批 AI、拖放、Goal Planner  |
| Backend     | 使用临时 SQLite/FastAPI TestClient 验证 API、事务、迁移、备份、OCR 规则 | SQLite 不能证明 MySQL 方言与并发；不会调用生产服务 | 登录、跨用户隔离、数据导入、桌面恢复       |
| E2E Desktop | 启动真实 Vite + FastAPI desktop mode + Chromium                         | 不等于打包后的 NSIS/portable 干净机测试            | 创建事件、刷新持久化、拖放、备份、Check-in |
| E2E Server  | 真实 Chromium + server mode + MySQL                                     | 本地没有 Docker/MySQL 时不可运行                   | 登录、cookie/CSRF、账号隔离、退出          |
| Support     | 全局 cleanup、MSW server/handlers、E2E helper                           | 不是测试用例                                       | 为测试提供确定性隔离环境                   |

详细到文件的映射见 `TEST_MATRIX.md`；最近一次执行结果见 `CURRENT_STATUS.md`。

## 4. 数据与外部调用边界

- Python 测试默认在 `tempfile` 目录创建数据库和备份；不连接默认桌面数据库。
- MySQL contract 只在 `CALENDAR_MYSQL_TEST_URL` 明确设置时运行。
- Playwright launcher 使用 `test-results/e2e-*` 下的临时数据目录。
- MSW 拦截前端网络请求；测试不得读取 `.env.local` 中的真实 AI key。
- OCR/DeepSeek 测试使用 fake client、fixture bytes 或规则结果，不产生付费调用。
- 更新、备份和迁移测试必须断言原文件在失败时保持不变。
- 测试不得使用生产数据库、真实账号、真实用户备份或签名私钥。

## 5. 测试发现接口

### Vitest

`vitest.config.ts`：

- setup：`Office/test/support/setupTests.ts`
- include：`Office/test/unit/**`、`Office/test/integration/**`
- exclude：`Office/test/e2e/**`
- coverage 排除整个 `Office/test/**`

### TypeScript

`tsconfig.app.json` 包含 `src` 和测试 TypeScript，但排除 E2E；E2E 由 Playwright/Node 环境单独解析。

### Python

完整套件：

```powershell
npm.cmd run test:backend
```

仅 MySQL contract：

```powershell
node scripts/run-python.mjs -m unittest discover Office/test/backend -p "test_mysql_contract.py"
```

使用 discover 而不是 `Office.test...` module path，避免把治理目录强制变成应用 Python package。

### Playwright

`playwright.config.ts` 的 `testDir` 为 `Office/test/e2e`。`CALENDAR_E2E_MODE` 控制 desktop/server 测试匹配；固定单 worker，避免共享端口和数据库发生测试间竞争。

## 6. 通过标准

一次完整可发布验证至少满足：

- 格式、lint、Vitest、build、OpenAPI、Python、Rust 全绿。
- Desktop E2E 全绿。
- MySQL 从空库迁移到 head，contract 全绿。
- Server E2E 全绿。
- npm full/prod audit 无 high/critical；server、desktop、test 三份 Python lock 无已知漏洞。
- `git diff --check` 通过，测试输出保持在忽略目录。

环境阻塞必须写成 `NOT RUN`，不能用 SQLite、历史 CI 或 skipped 结果替代真实 MySQL/Server E2E 的通过结论。

## 7. 新增测试规则

1. 将测试放入最窄的类别，避免用 E2E 覆盖可以由纯函数证明的规则。
2. 新文件同步添加到 `TEST_MATRIX.md`，写明真实场景和不覆盖内容。
3. 时间测试固定 now/timezone；数据库测试使用临时目录；ID 隔离测试至少使用两个用户。
4. 修复跨层问题时同时覆盖 schema/service/store/UI 或 API/repository 中实际共享的边界。
5. 历史一次性诊断脚本留在 `scratch/test-scripts/`；只有稳定、可重复、无真实数据依赖的脚本才能进入本目录。
