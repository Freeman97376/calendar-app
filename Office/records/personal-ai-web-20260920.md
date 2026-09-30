# 网页个人 API 配置与上线

日期：2026-09-20（America/Los_Angeles）；证据时间：2026-09-21T01:30:24.118297+00:00。

## 用户入口与边界

[Calendar](https://mantleofintelligence.com/calendar/) → 设置 → AI API 配置。每账号可保存、更换、移除自己的 DeepSeek Key，选择对话与规划模型。保存失败保留输入，成功清空；刷新恢复已配置状态，返回数据不含原 Key。表单支持中英文、密码显示切换、移除确认和手机宽度。保存不调用供应商，未使用真实 AI 验证连接。

个人密钥使用独立表和 Fernet 加密；主密钥在服务器私密环境，既不进入构建也不写入 Office。个人配置不进入偏好/用户导出。个人 Key 优先，移除后可使用管理员服务；当前全站共用 Key 仍未配置。任意自定义 URL 被拒绝，个人 Key 仅发送到 DeepSeek 官方通道。旧泄漏 Key 不复用。

## 发布与保护

- 发布 `calendar-ai-20260921T011928Z`：65 个运行文件，438605 字节，SHA-256 `d3853973864b6249d7657e60a483e1b418d599650a5d080317ab0383efcba2f9`。
- 保留基线提交 28245bb15972 上的未提交工作，以明确的工作树快照发布；没有提交、reset 或覆盖旧 checkout。
- 上传新目录、逐文件校验、独立虚拟环境严格 hash 安装、服务账号导入均通过。发布目录 `/opt/projects/calendar-app-releases/calendar-ai-20260921T011928Z`。
- 停止 Calendar 写入后备份数据库和环境；备份 `/var/backups/calendar-app/20260921T011928Z-personal-ai` 为 root 私有，gzip 完整性及备份 SHA-256 检查通过。没有把真实备份用于测试。
- 迁移 0011 → `20260920_0012` 只新增密钥表；原有每个表行数一致，完整性检查 valid=true。后端先更新，匹配前端随发布链接切换。Calendar 已恢复 active；Mantle 未重启。

## 验证

- 完整前端 369/369；最终分层改动与追加状态保护用例后相关 8/8。Lint、默认/server build、OpenAPI、Rust、版本检查通过。
- 新增后端 10 项覆盖权限、CSRF、错误输入不回显、存储与导出、持久化、账号绑定、密钥替换/移除、加密配置失效、AI/收据路由和迁移。
- 完整后端 177 项：170 通过、5 MySQL 跳过、2 个既有容量用例失败。失败在旧发布包 `calendar-20260920T180036Z` 上独立复现。新增第 6 个 MySQL 用例在服务器独立运行通过。
- 真实 MySQL 6/6（1.943s），真实 Chromium server E2E 4/4（12.9s）；使用独立临时数据库、合成用户和假 Key，没有真实供应商请求。手机截图已检查。
- 当前新功能证据：[TC-PERSONAL-AI-001-v1](test-cases/functional/tc-personal-ai-001-v1.md)。历史覆盖记录在源文件变化后标记 stale，保留原证据。

## 已有问题

`npm.cmd run test:backend` 中 `test_activation_rejects_standard_plan_above_buffered_capacity` 和 `test_twelve_week_plan_is_checked_per_week_not_as_one_week` 使用动态日期与执行日窗口；本次运行先触发“截至 2026-09-21 没有可执行日”，分别导致错误信息断言不匹配和容量异常。已确认新旧版本同样失败；具体时区/星期边界如何固定属于后续测试夹具修复，不改业务断言使其变绿。日志 `.scratch/personal-ai-baseline-tests.log`。既有 bundle 体积提示和开发依赖告警未在此任务中处理。

## 公开检查与清理

公开静态文件逐个 SHA-256 与发布清单完全一致。直连、同机 HTTPS 代理及公开 HTTPS 健康均通过；匿名个人设置返回 401。Mantle health 200、SmartStock 401、博客 200，与更新前一致。服务环境权限仍是 root:root/0600，Calendar active，迁移 current=head=20260920_0012。

独立测试数据库和 SQL 用户已删除并确认不存在；临时测试源码、虚拟环境、依赖、凭据清单和上传归档均已清理。正式库没有创建自动化测试账号，没有使用真实 API Key 或发起真实 AI 调用。新入口用户使用：刷新网页 → 设置 → AI API 配置 → 保存个人 Key；若旧页仍显示缓存内容，可强制刷新。
