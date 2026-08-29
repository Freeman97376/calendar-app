# Codex Working Brief

> Updated: 2026-08-10

## Product contract

Calendar App uses one shared React/FastAPI source tree with two runtime surfaces:

- Server: MySQL-only, operator-created accounts, no public registration, same-origin API.
- Desktop: Tauri + PyInstaller sidecar + local SQLite, no login, no automatic server sync.

Do not weaken these boundaries without an explicit product decision.

## Source layout

- `src/domain`: schemas and deterministic logic.
- `src/services`: API and external-I/O adapters.
- `src/store`: Zustand state and service orchestration.
- `src/hooks`: React view models and asynchronous glue.
- `src/components`: UI and approval surfaces.
- `backend`: FastAPI, SQLAlchemy repositories, auth, Goal Control, Fridge/OCR, migrations and backup.
- `src-tauri`: desktop shell, sidecar lifecycle, updater and notifications.
- `Office/test`: the only stable automated test suite.
- `scratch/test-scripts`: ignored one-off/manual diagnostics.

## Sources of truth

1. Current code, Alembic migrations, OpenAPI snapshot and CI configuration.
2. `Office/planning/architecture.md`, `Office/docs/input-output-flow.md`, `Office/docs/algorithms.md`.
3. `Office/test/README.md` and `CURRENT_STATUS.md`.
4. Golden Goose architecture output is a partial historical snapshot, not the current contract.

## Working rules

- Preserve user work; never reset or overwrite unrelated changes.
- Keep components on hook/view-model boundaries and stores on service/domain boundaries.
- All personal SQL reads and writes must remain scoped by authenticated `user_id`.
- AI output is preview/proposal data until the user explicitly approves it.
- Tests never use production databases, real user backups, paid AI keys or signing keys.
- Put stable tests in `Office/test/<category>` and update `TEST_MATRIX.md`.
- Validate changes with the repo commands documented in `Office/test/README.md`.
