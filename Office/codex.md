# Codex Working Brief

> Prepared: 2026-05-25
> Role: core implementation engineer for this calendar app
> Supervisor reference: `CLAUDE.md` and `Office/claude.md`

## Operating Role

Codex is responsible for writing the core application code for this project, while using the Office folder as the source of truth for planning, architecture, tasks, testing expectations, and project history.

Claude Code is the project supervisor and project manager. Its files define the current technical direction:

- Keep the app in a flat, monorepo-ready structure for now.
- Preserve the strict 5-layer source architecture.
- Keep production code changes focused and test-backed.
- Treat `Office/` as the project management hub.

## Current Repo Reality

The repository currently contains:

- `CLAUDE.md`: root supervisor loader.
- `Office/`: full project office with architecture, specs, ADRs, tasks, testing plan, progress, and error tracking.
- `src/`: a 5-layer skeleton with schemas, interfaces, placeholder components, and unimplemented services/stores/hooks.
- `tests/`: a test skeleton with placeholder/todo tests and mock setup stubs.
- `scratch/`: ignored scratch workspace for temporary files and one-off/manual test scripts.
- `.env.example`: expected environment variable names.

Important gap: there is currently no `package.json`, no Vite config, no TypeScript config, no Tailwind config, and no installed dependency tree. The Office tracker marks Phase 0 Bootstrap as not started, even though `src/` and `tests/` skeletons already exist.

## Architecture Commitments

The application source is organized into five layers:

1. `src/domain/`: Zod schemas, derived TypeScript types, and pure logic.
2. `src/services/`: storage, sync, Firebase, and AI adapters.
3. `src/store/`: Zustand stores.
4. `src/hooks/`: React orchestration and glue.
5. `src/components/`: presentational UI.

Layer import rules are strict:

- `components/` may import from `hooks/`, `domain/types`, and `components/ui/`.
- `hooks/` may import from `store/`, `domain/logic`, and `domain/types`.
- `store/` may import from `services/` and `domain/types`.
- `services/` may import from `domain/schemas`, `domain/types`, and Firebase config.
- `domain/` may import only from `zod` and `date-fns`.

## Accepted Technical Decisions

- ADR-001: stay flat now, but keep `src/domain/` and `src/components/ui/` extractable later.
- ADR-002: all storage access goes through `IStorageAdapter`.
- ADR-003: AI responses must be structured through Claude tool use and validated with Zod.
- ADR-004: use Zustand, split across calendar, event, UI, and AI stores.

## Implementation Priorities

The next practical work is Phase 0 Bootstrap:

1. Add project tooling: `package.json`, Vite, TypeScript, React, Vitest, ESLint, Prettier, Tailwind.
2. Make the existing skeleton compile.
3. Add or activate the smoke test.
4. Verify `npm run dev`, `npm run test:run`, `npm run lint`, and `npm run build`.
5. Then move into Phase 1 calendar views.

After bootstrap, build phase-by-phase:

- Phase 1: calendar view state, date helpers, Month/Week/Day UI.
- Phase 2: event schema, CRUD store, modal/form/card flow.
- Phase 3: recurrence schema and expansion logic.
- Phase 4: drag and drop with `@dnd-kit`.
- Phase 5: localStorage, Firestore, and sync manager.
- Phase 6: AI assistant and structured scheduling suggestions.
- Phase 7: accessibility, responsive QA, E2E coverage, polish.

## Coding Principles

- Prefer the existing architecture over new abstractions.
- Start in the lowest layer that can solve the problem.
- Keep schemas as the single source of truth for runtime validation and derived types.
- Use `date-fns` for date math; avoid raw date arithmetic where library helpers fit.
- Validate all persisted or AI-provided data through Zod.
- Keep adapters swappable and testable behind interfaces.
- Keep components thin; put orchestration in hooks and state in stores.
- Add tests proportional to the implementation risk and the Office test plan.
- Put all temporary files under `scratch/`.
- Put one-off/manual test scripts under `scratch/test-scripts/`; promote stable coverage into `tests/`.

## Office Files Checked

Read and incorporated:

- `Office/claude.md`
- `Office/docs/onboarding.md`
- `Office/docs/feature-specs/ai-assistant.md`
- `Office/docs/feature-specs/recurring-events.md`
- `Office/docs/feature-specs/sync-strategy.md`
- `Office/extensions/future-backlog.md`
- `Office/planning/architecture.md`
- `Office/planning/roadmap.md`
- `Office/planning/decisions/adr-001-monorepo-strategy.md`
- `Office/planning/decisions/adr-002-storage-adapter-pattern.md`
- `Office/planning/decisions/adr-003-ai-structured-output.md`
- `Office/planning/decisions/adr-004-zustand-over-redux.md`
- `Office/tasks/active-sprint.md`
- `Office/tasks/backlog.md`
- `Office/tasks/done.md`
- `Office/testing/test-plan.md`
- `Office/tracking/errors.md`
- `Office/tracking/progress.md`

## Next Move

When asked to start implementation, begin with Phase 0 Bootstrap unless the user explicitly points to a later feature. The first concrete coding move should be to create the missing project tooling and make the current skeleton buildable.
