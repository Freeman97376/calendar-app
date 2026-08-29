# Calendar App Office

`Office/` 是项目审计、架构、测试和治理文档中心。当前事实以源码、配置、迁移和 OpenAPI 为准。

## 当前入口

- [2026-08-12 增量全量审计与修复](audits/code-audit-2026-08-12.md)
- [2026-08-10 全量代码与卫生审计（历史基线）](audits/code-audit-2026-08-10.md)
- [技术架构](planning/architecture.md)
- [输入输出数据流](docs/input-output-flow.md)
- [核心算法](docs/algorithms.md)
- [测试集说明](test/README.md)
- [逐文件测试矩阵](test/TEST_MATRIX.md)
- [当前验证状态](test/CURRENT_STATUS.md)
- [部署说明](docs/deployment.md)
- [新成员上手](docs/onboarding.md)

## 目录职责

| 目录                   | 职责                                     |
| ---------------------- | ---------------------------------------- |
| `audits/`              | 证据化发现与整改状态                     |
| `planning/`            | 当前架构、ADR 和演进方案                 |
| `docs/`                | 数据流、算法、部署、onboarding、功能规范 |
| `test/`                | 所有稳定自动化测试、支持文件和测试文档   |
| `tasks/` / `tracking/` | 历史任务、进度和错误日志                 |
| `architecture/`        | Golden Goose 机器生成的历史静态快照      |

## Golden Goose 快照边界

`architecture.json` 和 `architecture/` 当前记录的是父提交 `0122bc`，分析完整度为 `partial`。这些大型产物被保留用于证据追溯，但不作为当前架构真相；当前说明以人工审计文档和实际代码为准。

## 当前测试目录与 provenance

`tests/test-catalog.json` 是当前机器可执行测试目录，不属于上述历史架构快照。它必须通过 `schemas/test-catalog-v1.schema.json`，且每个 suite 必须与 `goose.yaml` 中的 validation command 一一对应。

```powershell
npm.cmd run catalog:check:structure
npm.cmd run catalog:provenance
npm.cmd run catalog:check
```

结构修改期间可用 `--skip-provenance` 验证 schema 和 command 映射；dirty 工作树收口时必须把 `catalog:provenance` 输出的当前 HEAD 写入 `sourceSnapshot`，再运行完整 `catalog:check`。在 clean checkout 中，`headCommit` 仅作为生成基线的 informational provenance，不要求仍与当前 Git 拓扑相关；merge commit、squash 或 rebase 不会制造不可满足的门禁。clean checkout 的真实性由精确 `worktreeHash` 保证。哈希输入为 `git ls-files -co --exclude-standard -z` 列出的当前文件相对路径和经 Git clean filter 处理后的当前内容 identity；输入确定性排序并排除 catalog 自身，因此 Windows CRLF checkout 与 Linux LF checkout 一致，更新 `sourceSnapshot` 也不会改变其自身哈希。

所有 OpenAPI、backend、E2E 和 MySQL Python 命令都通过 `scripts/python-executable.mjs` 解析解释器：显式 `PYTHON_EXECUTABLE` 必须指向文件，否则只接受仓库 `.venv-test/Scripts/python.exe` 或 `.venv-test/bin/python`，不会回退到 PATH 上的全局 Python。

## 命名说明

仓库在 Windows 上保留既有目录名 `Office`。文档中的 `./office`、`office/` 均指同一治理目录，但新链接和配置统一使用 Git 中的 `Office/` 大小写。
