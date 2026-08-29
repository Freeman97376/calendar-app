# Calendar App agent guide

## Purpose

This repository ships a browser application, a Python backend, and a Tauri desktop runtime. Inspect the real working tree before edits, preserve unrelated user changes, and use deterministic local evidence instead of assumptions.

## Fixed runtime boundaries

- Server mode uses MySQL.
- Server accounts are provisioned manually by administrators. There is no public registration.
- Desktop mode uses SQLite, has no login, and is a true local build.
- Desktop does not automatically synchronize data to a cloud service.
- AI requests use the backend DeepSeek-compatible interface. Provider secrets stay in backend environment variables and must never use a `VITE_*` variable.
- Firebase is legacy migration/export compatibility only, not the current storage or AI architecture.

Do not weaken authentication, tenant isolation, CSRF/cookie policy, backup integrity, or server-versus-desktop database checks. Tests must never use production databases, real accounts, user backups, or signing keys.

## Repository routing

- `src/domain`: schemas, types, and pure rules.
- `src/services`: API and local adapters; no secret-bearing provider SDK in the browser.
- `src/store`: application state and session reset boundaries.
- `src/hooks`: React orchestration between stores and views.
- `src/components`: UI and accessibility behavior.
- `backend`: FastAPI, authentication, persistence, migrations, AI gateway, OCR, and server/desktop runtime policy.
- `src-tauri`: desktop packaging and native runtime.
- `Office`: machine governance, durable architecture facts, plans, reports, and the only stable automated test tree.

Trace cross-layer changes through schema, service, store, hook, UI or API, repository, migration, and tests. Keep persisted/public contract changes additive where possible and add migration coverage for breaking state changes.

## Validation

The machine source of truth is `Office/goose.yaml` and `Office/tests/test-catalog.json`; human guidance is `Office/test/README.md`. The default quick gate is format check, lint, Vitest, build, OpenAPI, Python backend, Rust, and version checks.

Desktop E2E is a conditional local extension. MySQL and Server E2E require Docker or an explicitly supplied disposable test URL and must never point at production data. npm and Python dependency audits are release suites. Do not run Docker/MySQL, Server E2E, desktop packaging, signing, publishing, or real provider calls without explicit approval and the documented prerequisites.

When a check fails, report the exact command, first useful diagnostic, affected file or component, confirmed versus inferred cause, and smallest next action. Always run `git diff --check` before claiming completion.

<!-- office-governance:start -->

Before substantive work in this project, read Office/README.md and Office/AGENTS.md. Treat Office/AGENTS.md as the project-wide agent governance contract.

When creating, repairing, or auditing agent governance, use Office/skills/manage-agent-governance/SKILL.md. Run Office/scripts/Test-OfficeGovernance.ps1 after governance changes. Preserve user work and never store secrets in Office/records/.

<!-- office-governance:end -->
