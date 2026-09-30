# Calendar 正式部署与隔离验证

日期：2026-09-20。结果：已上线 [Calendar](https://mantleofintelligence.com/calendar/)，共享长期邀请码注册已开启。AI 暂未配置。

## 发布身份与保护

- 发布：`calendar-20260920T180036Z`，当前链接 `/opt/projects/calendar-app-current`，独立服务 `calendar-app.service`（开机启动，127.0.0.1:18787）。
- 来源：保留用户未提交工作的已验证快照，基线提交 `28245bb15972`；不是声称已提交/推送的新版本。没有 reset、stash、覆盖旧服务器 checkout 或创建提交。
- 包：63 个运行文件，432600 字节，SHA-256 `2d863973e93debcbaf25285072f60a9283894fa97f2e780048913d36355ec463`。包内逐文件清单已验证，生产目录不含 Node 开发工具、测试数据或本地私密配置。
- 备份：`/var/backups/calendar-app/20260920T180036Z`，root 私有，含切换前 Nginx、旧环境及原空库 dump。原 `/opt/projects/calendar-app` 原样保留。
- 新配置：`/etc/calendar-app/calendar.env`，root/0600；用户指定邀请码仅在此设置，没有写入代码、记录或前端包。
- 数据库：原空 `db_calendar`，专属 SQL 用户只授权该库；`alembic current` 与 `heads` 均为 `20260829_0011`。完整性报告 valid=true，问题、修复和归档均为 0。

## 真实测试与修复

用户明确批准独立临时测试库、合成账号和完成后的清理。通过 SSH 隧道的首轮 MySQL 3 项通过；增加并发审批覆盖后，在服务器本机 5 项全部通过：

1. 共享码并发同名注册只创建一个用户，其他用户仍可使用同一码。
2. 多账号相同业务 ID 的事件隔离、迁移版本一致。
3. 工具激活回滚、重试和租户范围。
4. AI apply/copy 各自并发幂等，异常全部回滚，不同内容冲突。
5. 排程暂停/恢复/完成后启用；并发接受只应用一次，接受与拒绝冲突，重算保留待审核修改。

服务器 Playwright 3 项全通过（9.7s），覆盖登录、CSRF、过期草稿保留与重认证、显式重试、退出、两个账号数据隔离，以及无效码/复用码注册两个普通用户。未调用真实 AI。

发现并修复的发布阻塞：

- Linux hash 安装报缺失未固定 secretstorage：补全跨平台锁文件，保留所有原版本，仅增加 cryptography、jeepney、secretstorage、uvloop 条件依赖和哈希。验证/生产两个独立环境严格安装均通过。
- 过期目标计划测试样例：将通用计划日期设为相对测试日；保留固定时区/DST样例及产品日期边界断言。
- 旧工具测试期望自动跳转并立即保存：现在显式断言结果停留对话、变更只在待审提案中、审核前不写入行动/里程碑/日历，再手动查看工具页。重放同一批次校验原结果与相同实体 ID。
- 首轮跨网数据库浏览器测试停在登录后的默认 5 秒等待。本机 Linux 复验在原断言和超时内通过；没有加长超时。Linux 首次浏览器缺失系统共享库，安装缺失库时禁止软件升级和服务自动重启。

## 最终验证

| 项目                          | 结果                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| 完整 Vitest                   | 365/365，通过                                                                                           |
| 完整本地后端                  | 167 项中 162 通过、5 MySQL 跳过；这 5 项在服务器另行通过                                                |
| 真实 MySQL                    | 5/5，通过                                                                                               |
| Server E2E                    | 3/3，通过                                                                                               |
| server 构建、Lint、Rust、版本 | 通过；保留既有 bundle 体积提示                                                                          |
| OpenAPI                       | 当前接口未变，快照检查通过                                                                              |
| Nginx                         | 临时片段及最终完整配置 `nginx -t` 均通过                                                                |
| systemd                       | Calendar 单元验证通过，服务 active/running；另有系统原有 tat_agent/snapd 单元兼容提示，与 Calendar 无关 |
| 健康三层                      | 直连、本机 HTTPS 代理、公开 HTTPS 均为 server/MySQL/ok                                                  |
| 公开浏览器                    | 1280px/390px 注册页面可见，无页面/资源错误和横向溢出；注册能力 true、匿名 me=401                        |
| npm 运行依赖审计              | 0 漏洞                                                                                                  |
| Python 服务锁审计             | No known vulnerabilities found                                                                          |
| npm 完整开发依赖审计          | 6 告警：2 高、4 中；未通过全依赖审计，详见后续事项                                                      |

准确本地命令：`npm.cmd run test:run -- --reporter=json --outputFile=test-results/deployment-20260920/vitest-final.json`、`npm.cmd run test:backend`、`npm.cmd run build:server`、`npm.cmd run lint`、`npm.cmd run rust:check`、`npm.cmd run version:check`。真实服务器命令与哈希范围见 `TC-SERVER-RELEASE-001-v1`。原始日志与截图在忽略目录 `test-results/deployment-20260920/`。

## 切换和清理

只在现有 HTTPS server 增加 Calendar include；Mantle 健康切换前后均 200，SmartStock 均 401，博客均 200。没有重启 Mantle。服务端口只绑定回环，MySQL 仍只供本机使用。

旧公开 JS 确认含 AI 密钥。没有读取展示该值或复用到新后端；旧 HTTP 静态入口改为跳转新版，旧 assets 返回 302，保留其他代理。供应商处的旧密钥仍需撤销。

专用测试库和 SQL 用户删除后核查均为 0；临时服务器源码、虚拟环境、上传文件、测试进程、SSH 数据库隧道和临时凭证已清理。清理时最初将迁移内置 local 行误算为注册用户，检查后确认无其他用户；没有因此删除或修改正式库记录。上线浏览器探针只读，没有创建正式测试账号。

## 剩余事项

- AI 暂未启用。先由用户在供应商后台撤销旧密钥，再通过服务器私密环境配置新的后端密钥；不能把新密钥放到前端变量。
- 开发依赖告警涉及 Vitest/mocker/coverage、baseline-browser-mapping、browserslist 和 ESLint 间接 js-yaml。其中 Vitest 提示涉及大版本升级，应另行验证；本次不执行强制升级。它们未进入 63 文件的生产运行包。
- 生产登录/Cookie 不用真实账号做自动化探针；认证行为在隔离服务器环境验证，Nginx 已按模板将 Cookie Path 设置为 `/calendar/`。
- 管理员账号没有自动创建，需要时用现有管理 CLI 隐藏输入密码创建；普通用户直接通过网页注册。

这是带有上述明确限制的部署完成记录，不表示 AI 配置或全开发依赖审计已经完成。
