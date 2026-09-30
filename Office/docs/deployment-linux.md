# Calendar 部署到现有 Mantle 站点

用户确认的公开地址：`https://mantleofintelligence.com/calendar/`。本手册取代独立子域名方案。2026-09-20 已通过 SSH 完成部署，公开页面及健康接口正常。当前发布为 `calendar-20260920T180036Z`，详情见 [部署验证记录](../records/calendar-live-deployment-20260920.md)。

## 注册规则

普通用户通过一个共享、长期有效、可重复使用的邀请码自行设置用户名和密码。管理员仍由运维命令创建。注册成功后回到登录页；桌面版继续免登录。在 root 所有、0600 权限的 `/etc/calendar-app/calendar.env` 设置 `CALENDAR_REGISTRATION_INVITE_CODE`，空值关闭注册，更换并重启 Calendar 服务使旧码失效，已有账号不受影响。邀请码不写入 Git、URL、前端构建、日志或运维记录；不计次数和到期时间，无需新增数据库迁移。

## 已核查的服务器边界

Ubuntu 22.04、MySQL 8、Nginx 和 Mantle 正常运行。`calendar-app.service` 已运行且开机启动，仅监听 127.0.0.1:18787。`db_calendar` 当前已迁移到 `20260920_0012`，完整性检查无问题。普通注册账号通过网页建立，未创建测试账号到正式库。已有 `/opt/projects/calendar-app` 留有未提交修改及旧网页，不能覆盖或 reset。现有 HTTPS 配置实际文件为 `/etc/nginx/sites-available/mantleofintelligence.conf`；保留 `/bid-system/`、`/smartstock/`、`/blog/` 和现有证书配置。

| 项目           | 新版目标                                           |
| -------------- | -------------------------------------------------- |
| 发布目录       | `/opt/projects/calendar-app-releases/<release-id>` |
| 当前版本链接   | `/opt/projects/calendar-app-current`               |
| 服务、用户     | `calendar-app.service`、`calendar-app`             |
| 后端地址       | `127.0.0.1:18787`                                  |
| 持久目录       | `/var/lib/calendar-app`                            |
| 私密配置       | `/etc/calendar-app/calendar.env`                   |
| 数据库         | 独立 Calendar MySQL 库及仅有该库权限的用户         |
| 公网前端、接口 | `/calendar/`、`/calendar/api/`                     |

运维沿用正式 Mantle 技能的方法，但不执行 Mantle 的部署脚本、不重启 Mantle。生产数据库和真实账号不能用作自动化测试环境。所有服务器命令以实际 systemd 配置为准。

## 1. 准备独立发布版本

保留本地和服务器未提交工作。使用经过验证的提交，或附文件清单与 SHA-256 的工作树发布快照；不能用远端旧提交假装包含本地修改。发布包只包含运行代码、迁移、锁定依赖、部署模板与前端产物，不打包 `.env*`、密钥、SQLite、用户数据、日志、node_modules 或虚拟环境。原目录不变，先上传到新版本目录并核验哈希。

前端构建：

```powershell
npm.cmd run build:server
```

输出为 `dist-server/calendar/`。Vite 的 `/calendar/` base 同时用于资源与默认接口前缀；清空旧的 `VITE_API_BASE_URL` / `VITE_FRIDGE_API_BASE_URL` 覆盖值，避免指向开发机或根路径。默认 `npm run build` 仍用于根路径/桌面构建。依据 [Vite public base path](https://vite.dev/guide/build.html#public-base-path)。

后端锁文件已使用 Python 3.14 的跨平台解析补全 Linux 条件依赖，既有版本没有升级。更新时保留 `--require-hashes`；不能用忽略依赖来绕过 Linux 缺失项。为 Calendar 使用独立的 Python 3.14 运行时和虚拟环境，不替换 Mantle 的 Python。由于服务启用 `ProtectHome=true`，解释器及虚拟环境不能依赖 `/home/ubuntu` 下的 Python；将独立解释器置于 `/opt`，再创建发布目录下的 `.venv-server`。

```bash
cd /opt/projects/calendar-app-releases/<release-id>
/path/to/isolated/python3.14 -m venv .venv-server
.venv-server/bin/python -m pip install --require-hashes -r requirements-server.lock
```

代码和静态文件由部署人员维护，运行用户仅需读取；Nginx 需要目录遍历和静态文件读取权限。建立独立系统用户、数据目录和数据库账号。将环境模板复制到私密配置文件后，在服务器安全设置数据库密码和邀请码，不在终端输出秘密。`CALENDAR_COOKIE_SECURE=true`，同域下 `CALENDAR_ALLOWED_ORIGINS` 留空；全站共用 AI 密钥使用后端 `DEEPSEEK_API_KEY`；个人密钥由登录后的 API 配置入口提交并在数据库中加密保存。

旧网页中曾打包前端 AI 密钥：已备份配置，并将旧静态网页入口改为跳转到新版，旧文件不再公开。供应商侧仍须撤销旧密钥并生成新密钥；当前后端 `DEEPSEEK_API_KEY` 留空。不要迁移或复用旧密钥，磁盘备份不等于继续公开旧文件。

## 2. 测试、数据库与管理员

真实 MySQL 与服务器端到端测试须先得到明确批准，使用独立且可丢弃的测试库、专属测试账号和合成邀请码，不调用真实 AI。运行 `Office/test/backend/test_mysql_contract.py` 和 `Office/test/e2e/serverAuth.test.ts`；并发注册、登录、Cookie/CSRF 和账号隔离通过后删除仅本次建立的测试库与账号。测试账户不得有生产库权限，删除前核对名称与本轮清单。

新空库可直接升至 `head`。旧库先备份、验证恢复、停止写入，按 [分阶段升级流程](deployment.md) 完成完整性检查；已处于较新版本的库不应再升级到旧目标。当前 head 为 `20260920_0012`。不得 stamp 跳过验证。

确认 `calendar-app-current` 指向已验证的新版本后，可用 systemd 加载私密环境：

```bash
sudo systemd-run --wait --pipe --collect \
  --property=User=calendar-app \
  --property=WorkingDirectory=/opt/projects/calendar-app-current \
  --property=EnvironmentFile=/etc/calendar-app/calendar.env \
  /opt/projects/calendar-app-current/.venv-server/bin/python -m alembic upgrade head
```

同样运行 `alembic current` 与 `alembic heads` 并核对一致，执行启动前完整性检查。创建管理员时使用隐藏输入的交互终端：把上例换为 `--pty`，Python 参数换为 `-m backend.manage_users create --username owner --admin`。不为用户预设或公开管理员密码。

## 3. 服务与现有 HTTPS 站点

安装 `deploy/calendar-app.service` 前核对目录、用户、私密配置与端口。先用 `systemd-analyze verify` 验证，再启动 Calendar，验证直连健康与匿名访问保护。

```bash
sudo systemd-analyze verify /etc/systemd/system/calendar-app.service
sudo systemctl daemon-reload
sudo systemctl enable --now calendar-app
curl --fail http://127.0.0.1:18787/api/health
```

备份现有 Nginx 配置。将 `deploy/nginx-calendar-path.conf` 安装为 `/etc/nginx/snippets/calendar-app.conf`，只在现有域名的 HTTPS server 中增加这一条 include：

```nginx
include /etc/nginx/snippets/calendar-app.conf;
```

不要安装用于独立域名的旧 `nginx-calendar.conf.template`，不要替换整个站点。新 snippet 将 `/calendar/api/` 转发到后端 `/api/`，覆盖客户端转发 IP 头，关闭 API 缓存，支持流式响应；将设置和删除的 Cookie Path 从 `/` 改成 `/calendar/`。后端不加 `--root-path`，避免改变同源校验依据。依据 [Nginx proxy_cookie_path](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_cookie_path)。

静态文件来自 current 链接下的 `dist-server`；缺失 assets 返回 404，页面路由回落至 `/calendar/index.html`。前后端来自同一发布版本，确认文件可读且 `nginx -t` 通过后再 reload。

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 4. 三层验证和回退

```bash
curl --fail http://127.0.0.1:18787/api/health
curl --fail --resolve mantleofintelligence.com:443:127.0.0.1 https://mantleofintelligence.com/calendar/api/health
curl --fail https://mantleofintelligence.com/calendar/api/health
```

健康应显示 server/MySQL。检查 `/calendar` 跳转、静态资源、匿名 `/calendar/api/auth/me` 返回 401、注册入口能力以及 Cookie 的 Secure/HttpOnly/SameSite 和 Path。不要在生产批量创建测试账号。再检查 Mantle `/bid-system/health` 和其他既有路径未受影响。纯健康检查不能代替专用数据库测试。

后续更新先后端再匹配前端。旧前端只接受 `registration: false`，因此兼容升级期间先关闭邀请码，匹配前端发布后再开启。保存上一版链接目标、Nginx 私密备份及数据库备份；失败时回退相应发布文件和配置，验证后恢复服务。不要盲目降级数据库，也不要回退到已暴露密钥的旧静态网页。

## 当前运行状态与后续

邀请码已写入 root/0600 私密配置，长期有效且可重复使用。前端 365/365、后端本地 162 项、真实 MySQL 5 项及服务器浏览器 3 项均通过；临时库、账号、目录和凭证已清理。`nginx -t`、systemd 单元验证、迁移版本和完整性检查通过，外网浏览器确认注册页可用、匿名保护为 401。

正式账号不会由部署探针自动创建。数据库中保留迁移自带的内部 `local` 记录，不算注册用户。管理员有需要时按上文命令手动创建。

网页现支持“设置 → AI API 配置”，登录用户可保存个人 DeepSeek Key，无需重启服务。全站共用 Key 仍未配置；旧密钥必须在供应商侧撤销，不可继续使用。运行 npm 依赖与 Python 依赖审计无已知漏洞；开发工具链有 6 项告警（2 高、4 中），未进入运行发布包，留待独立升级处理，不执行未经验证的强制大版本升级。

私密备份位于 `/var/backups/calendar-app/20260920T180036Z`。这是首次正式部署；若需停用，可移除 HTTPS 内的 Calendar include 并通过 `nginx -t` 后 reload，再停止 Calendar 服务。保留数据库和旧文件备份，旧 HTTP 静态入口继续跳转或返回 404，不能恢复发布含旧密钥的页面。

## 网页个人 API 配置更新

新增 `20260920_0012`：只增加 `user_ai_settings`，不修改已有账号或日历行。网页版入口为“设置 → AI API 配置”，普通用户仅能管理自己的 DeepSeek Key；接口不接受其他账号 ID 或自定义 URL，也不返回原密钥。保留桌面凭据管理器、服务器 MySQL、CSRF 和既有用量限制。

升级前备份数据库和 `/etc/calendar-app/calendar.env`，停止 Calendar 写入，再升级至 head 并核对 current/head。服务私密环境中首次生成 `CALENDAR_AI_ENCRYPTION_KEY`（Fernet 32 字节随机密钥的 URL-safe base64）；生成结果直接写入私密配置文件，不能输出到日志、终端历史或 Office。后续部署保留它，数据库与该密钥必须配套备份。密钥轮换需要专门的解密/重加密流程，不能仅替换环境变量。

个人 Key 优先于管理员共用 Key。移除后如有共用服务则回退，否则显示未配置。未设置加密主密钥时，个人配置入口说明暂不可用；已有个人密钥无法解密时返回错误，不静默改用别人的或共用 Key。用户导出不包含这些凭据，完整运维数据库备份包含加密记录。Fernet 使用见 [官方文档](https://cryptography.io/en/latest/fernet/)。

迁移后旧版后端要求旧 head，不能仅切回旧链接。如发布失败且新增表仍为空，可以停止服务后回退这一个新增迁移，再恢复旧链接；若已有个人配置，先保留加密记录并单独制定回退方案，不盲目降级或删除数据。旧网页的已暴露密钥入口始终保持关闭。

2026-09-20（本地日期）已发布 `calendar-ai-20260921T011928Z`。加密主密钥已在私密环境中生成，网站入口已启用。升级前备份为 `/var/backups/calendar-app/20260921T011928Z-personal-ai`，原有数据行数和完整性验证通过。
