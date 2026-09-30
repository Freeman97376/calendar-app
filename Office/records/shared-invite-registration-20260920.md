# 共享邀请码注册与 Linux 部署准备

日期：2026-09-20。状态：本地实现完成，服务器尚未部署。

## 用户决定与范围

使用统一、长期有效、可重复使用的邀请码，普通用户自行设置用户名与密码。这个决定取代服务器仅由管理员手动创建所有账号的旧限制；管理员仍由运维命令创建。桌面免登录、MySQL/SQLite 边界和账号隔离不变。正式 Mantle 运维技能已读取并用于服务隔离、保护服务器修改、备份及三层健康检查方法；未将 Mantle 的目录、数据库或服务作为 Calendar 部署目标。

## 实现

- `CALENDAR_REGISTRATION_INVITE_CODE` 仅在后端配置；默认空值关闭注册。码不计次数、不自动过期，可更换或关闭。摘要恒定时间比较；不在 API 或浏览器持久状态返回或保存码。无需新增数据库表/迁移，head 保持 `20260829_0011`。
- `POST /api/auth/register` 严格验证字段，拒绝管理员权限字段和异源浏览器请求。原有用户、默认偏好和事件类型创建事务复用；唯一约束处理并发重名，失败整体回滚。
- 注册限流使用已有数据库桶，和登录分开。默认每 15 分钟每 IP 10 次、每用户名 5 次；登录原阈值不变。
- 前端根据服务能力显示注册入口，含密码确认、可聚焦错误、限流倒计时、中英文提示和提交防重。成功后清空秘密字段并回到登录；响应不明时提示先尝试登录。重新认证覆盖层不显示注册。
- 已准备独立 systemd、Nginx 和私密环境模板，详见 [Linux 手册](../docs/deployment-linux.md)。服务只监听 `127.0.0.1:18787`；真实端口、域名和服务器配置待确认。
- 修正 E2E 启动器错误的 `SESSION_COOKIE_SECURE` 名称为实际读取的 `CALENDAR_COOKIE_SECURE`，并仅为可丢弃测试库设置合成邀请码。

## 本地验证

| 检查                            | 实际结果                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| 新后端注册用例                  | 10/10 通过；实现前 20 个失败（包含子用例）                                           |
| 认证前端用例                    | 13/13 通过                                                                           |
| 最终相关前端回归                | 7 文件 48/48 通过，含上一轮工具与 AI 审核用例                                        |
| 完整前端                        | 360 项：357 通过，3 项既有失败                                                       |
| 完整后端                        | 165 项：147 通过，1 失败、14 报错、3 跳过；失败均为既有目标计划固定日期夹具          |
| 构建、Lint、OpenAPI、Rust、版本 | 通过；构建仍有既有主包超过 500 kB 提示                                               |
| 页面检查                        | 模拟 API 的 Chromium：1280px 和 390px 截图可读；手机无横向溢出；注册成功，无页面错误 |
| 服务器安全门禁                  | 未指定专用数据库时启动器拒绝执行；现有安全测试包含该边界                             |

准确命令：

```text
.venv-test/Scripts/python.exe -m unittest Office.test.backend.test_invite_registration
npm.cmd run test:run -- Office/test/integration/authGate.test.tsx Office/test/unit/store/authStore.test.ts Office/test/unit/store/aiPlanLifecycle.test.ts Office/test/unit/store/schedulingStore.test.ts Office/test/integration/aiAssistant.test.tsx Office/test/integration/globalSchedulePanel.test.tsx Office/test/integration/toolPlanEditor.test.tsx
npm.cmd run test:run -- --reporter=json --outputFile=test-results/invite-vitest.json
npm.cmd run test:backend
npm.cmd run lint
npm.cmd run build
npm.cmd run openapi:check
npm.cmd run rust:check
npm.cmd run version:check
```

首次 Lint 指出组件直接导入服务和逻辑类型违反分层规则；已将错误映射移到认证状态层并通过 Hook 使用，复验通过。首次治理检查提示 catalog 来源哈希过期；这是实现后需更新的生成元数据，收口时刷新并重新验证。

## 既有失败和最小后续动作

- `Office/test/integration/aiDemoTools.test.tsx` 两项：找不到 `Active Tools` 标题或 `SEO foundations and keyword research`；`fridgePanel.test.tsx` 一项同样找不到 `Active Tools`。与上一轮报告相同。下一步单独校准工具路由后导航行为及相应预期。
- `Office/test/backend/test_goal_control.py`：`Complete three sessions` 或 `Review weekly load` 的日期超出固定 `2026-10-15` 目标日期，导致 14 个错误及一个期望“缺少有效日期”却收到日期边界错误的失败。与上一轮相同。下一步单独将过期固定日期夹具改为确定性时钟/相对日期，不放宽产品断言。
- 没有改动上述失败断言。本轮不是完整发布验证通过。

## 尚未执行

真实 MySQL 并发、服务器端到端、目标机 `nginx -t` 和 `systemd-analyze verify`、DNS、证书和公开 HTTPS 验证未执行。实际子域名和已授权 SSH 连接方式待用户提供，系统信息将在连接后只读检查。没有连接生产服务器、创建真实账号、调用真实 AI 或修改 Mantle 服务。

## 工作保留与证据

修改前快照：`C:\Users\Zheng\AppData\Local\Temp\calendar-shared-invite-checkpoint-fvfyx004`。118 个原文件的归档哈希全部核对一致，未删除任何原文件。没有提交、暂存、reset 或覆盖原工作。

测试证据：`TC-SHARED-INVITE-001-v1`（derived / passed）；覆盖状态 covered-files-sha256:013dbd9676626235921344b685f4882897d957fdd9cbbb50495cee7335f5ff5a，时间 2026-09-20T16:51:49.384485+00:00。原链路案例经最终 35 项前端子集和完整后端相应用例重新验证，保留原规范并追加新的执行证据。完整日志位于本机临时目录的 `calendar-invite-*.log`，页面截图在忽略目录 `test-results/invite-ui/`。
