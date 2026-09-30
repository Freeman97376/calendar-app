# Calendar 子路径部署与 SSH 核查

日期：2026-09-20。状态：已连接服务器并完成本地部署准备；未上线。

## 已确认事实与决定

用户确认 `https://mantleofintelligence.com/calendar/`，替代独立子域名方案。正式 Mantle 运维技能已读取。使用本机已有 SSH 身份和严格主机校验成功连接到用户指定主机；没有读取或展示私钥内容。后续无需用户代跑普通服务器检查。

服务器 Ubuntu 22.04、MySQL 8、Nginx、Mantle 正常；Mantle HTTPS 健康 200。Calendar 服务不存在、18787 空闲、公开 `/calendar/` 返回 404。`db_calendar` 无表；未读取业务数据。旧 `/opt/projects/calendar-app` 有未提交修改，保留原状，新版使用版本目录和 current 链接。

旧 Calendar 环境中前端 AI 密钥非空，且相同值出现在旧公开 JS 文件中。检查只输出布尔结果，未展示/记录秘密。须撤销该密钥，停止公开旧静态文件；不能直接复用到新后端。没有替用户调用供应商、修改旧站点或重启服务。

## 改动

- API 默认根地址继承 Vite base，空环境值不再抹去 `/calendar/`；显式地址和桌面运行时仍可覆盖。
- 增加 `build:server`，产物为 `dist-server/calendar/`，默认构建保留。Git、Lint、格式器排除新生成目录。
- 添加现有 HTTPS 站点内的 Nginx 片段，前端/API/Cookie 路径均限定在 `/calendar/`；部署目录隔离为 `/opt/projects/calendar-app-current`。
- 更新 Linux 手册、README 和治理决定；原有迁移和账号隔离要求保持。

## 执行证据

| 检查                         | 结果                                                              |
| ---------------------------- | ----------------------------------------------------------------- |
| 新路径测试实现前             | 12 项中 3 失败，错误根 API 路径/空覆盖值                          |
| 相关前端最终回归             | 11 文件 92/92 通过                                                |
| 邀请码后端回归               | 10/10 通过，仅临时 SQLite                                         |
| 默认及 server 构建           | 均通过；既有大包提示仍存在                                        |
| Chromium 正式产物 + 模拟 API | `/calendar/` 下资源与注册成功；390px 无溢出、无页面错误           |
| Lint、OpenAPI                | 通过                                                              |
| 目标机 Nginx                 | 新片段在临时完整配置中 `nginx -t` 通过；现有配置亦通过；无 reload |

准确回归命令：

```text
npm.cmd run test:run -- Office/test/unit/services Office/test/unit/store/configStore.test.ts Office/test/unit/store/authStore.test.ts Office/test/integration/authGate.test.tsx
.venv-test/Scripts/python.exe -m unittest Office.test.backend.test_invite_registration
npm.cmd run build:server
npm.cmd run build
npm.cmd run lint
npm.cmd run openapi:check
```

首次 Lint 将新增 dist-server 中的压缩文件当作源码扫描，报 `window is not defined` 等错误。原因确定为生成目录未进入 ESLint 排除列表；已按既有 dist 规则补充，未削弱源码断言，复验通过。

完整默认测试的既有 3 个前端失败、15 个后端失败/错误未在本轮修改，详见 [前次记录](shared-invite-registration-20260920.md)。本轮集中验证不代表全量发布门禁通过。

## 发布包与保护

改动前工作快照：系统临时目录 `calendar-subpath-checkpoint-h54k2166`，保留 138 个原工作文件。没有 reset、暂存、提交或删除用户文件。

本地候选包 `.scratch/server-release/calendar-20260920T173350Z.tar.gz`，63 个运行文件、428340 字节；SHA-256 `a4d4b9cd10bfa8a4c18a4d58d11af88ebcef5746036b48deadb888f4832fbca6`。包内逐文件清单均已复核；只含后端代码/迁移、锁文件、公共默认数据、部署模板和新版静态资源，无私密配置、用户数据库或虚拟环境。这是未提交工作树快照，不冒充已发布 Git 提交。包尚未上传。

## 继续条件

真实 MySQL 与服务器端到端测试的临时环境批准已询问，尚未收到答复；不得用等待时长推定批准。批准后仅创建独立测试库/账号、使用合成数据、运行并发注册和账号隔离等门禁，完成后删除本次测试资源。之后处理既有全量失败，复核发布包、备份当前 Nginx/私密配置，配置独立运行环境和服务，再验证直连、本机代理、公网 HTTPS。邀请码尚未落盘，systemd 未安装，生产数据库未变更。
