# 项目链路修复记录 — 2026-09-20

## 已完成

- 暂停和完成的工具可以通过审核重新启用；只有启用状态参与实际排程。
- 工具修改随自动重排、手动重算和过期刷新保留。已有修改未处理时，新修改返回冲突并提供现有提案；版本变化保留草稿并阻塞写入。
- 排程重算、接受、拒绝在数据库用户级锁下串行执行；前端请求队列和会话代次阻止旧响应覆盖新状态。
- 新 AI 方案保存后才开放操作。消息和会话使用稳定身份，失败可重试；执行、添加任务分别幂等，业务数据和状态同事务提交。
- 旧历史只读；已执行和已放弃的状态可恢复。审核使用冻结内容，账号切换不会恢复旧会话结果。
- README 和部署手册改为校验当前发布 head（当前 20260829_0011），明确旧库分阶段检查与新库直接升级路径。本次无新表、无数据库迁移、无发布。

## 验证

| 检查                                  | 结果                                      |
| ------------------------------------- | ----------------------------------------- |
| 相关前端回归（5 文件）                | 35/35 通过                                |
| 新增后端生命周期回归                  | 11/11 通过                                |
| HTTP 审核完整链路与原子批量操作       | 2/2 通过                                  |
| 全量前端                              | 350/353 通过；3 项既有失败                |
| 全量后端                              | 154 项：137 通过、1 失败、14 错误、2 跳过 |
| Lint、生产构建、OpenAPI、Rust、版本   | 通过；版本 0.2.0                          |
| 数据库迁移                            | 未增加；临时测试库迁移至既有 head         |
| MySQL 并发、Server E2E、真实 AI、发布 | 未执行                                    |

受影响检查的精确命令和覆盖指纹见 [TC-CHAIN-LIFECYCLE-001-v1](test-cases/functional/tc-chain-lifecycle-001-v1.md)。构建仍提示主 JS 超过 500 kB，这是已有性能提示。

## 尚未通过的全量基线

- 命令：`npm.cmd run test:run`。`Office/test/integration/aiDemoTools.test.tsx` 的 Fitness/SEO 两项，以及 `Office/test/integration/fridgePanel.test.tsx` 一项，仍在分派后查找旧的 Active Tools 页面内容。当前行为停留在对话中；这些失败在本次修复前已存在。下一步是单独确认导航契约并更新相应测试，不能仅删除断言。
- 命令：`npm.cmd run test:backend`。全部剩余失败来自 `Office/test/backend/test_goal_control.py`。`mock_plan()` 使用固定的 2026 年 8 月行动日期和 10 月 15 日目标；当前时间下日期归一化触发目标日期边界检查，导致 14 个错误和 1 个预期错误文本不匹配。下一步是为测试固定时钟或采用相对日期，保持原日期约束断言。
- 原 `test_auth_api.py` 批量接口测试的无范围事件列表请求已升级为真实契约，并替换不存在的单事件 GET 断言；审核前置步骤现在保存真实方案，原子性和租户隔离断言保留且通过。

## 工作树保护与证据

实施前保存了 107 个文件以及 tracked binary patch；恢复快照位于 `C:\Users\Zheng\AppData\Local\Temp\calendar-chain-fix-checkpoint-e9i31dzh`。未重置、覆盖或提交用户原有工作。

覆盖指纹：`covered-files-sha256:24a910a78a2394c7771c8238d272bf99acdfb5c2ef011cac220f200af05ce604`。完整前端结果为 `test-results/chain-fix-vitest.json`（本地忽略目录）。详细执行输出保存在本机临时目录 `calendar-chain-final-frontend.log`、`calendar-chain-final-backend.log`、`calendar-chain-api-targeted.log`。永久记录只保留必要结论。

发布前仍需清理上述测试基线，并在获准的可丢弃 MySQL 环境执行并发与服务器端到端检查。
