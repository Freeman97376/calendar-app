# Claude Code - Project Config

> Full config: [Office/claude.md](Office/claude.md)

## TL;DR Rules

|                | Action                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------- |
| Autonomous     | Planning, reading anything, writing to `Office/`, writing to `tests/`, writing to `scratch/` |
| Needs approval | Editing `src/`, `package.json`, config files, git ops, destructive commands                  |

**Approval flow:** Post `APPROVAL REQUIRED` + exact diff, wait for "approved", then act.

**Scratch rule:** Temporary files, generated diagnostics, and one-off/manual test scripts must live under `scratch/`. Put scripts specifically in `scratch/test-scripts/`; do not scatter them through `src/`, `tests/`, `Office/`, or the project root.

## Quick Structure Map

```text
Office/          <- project management hub
  claude.md      <- full supervisor config
  planning/      <- roadmap, architecture, ADRs
  tasks/         <- backlog / active-sprint / done
  tracking/      <- progress log, error journal
  testing/       <- test plan and results
  docs/          <- onboarding, feature specs
  extensions/    <- future extension backlog

src/             <- application source (5 layers; approval required to edit)
  domain/        <- layer 1: pure domain (Zod schemas, logic, types)
  services/      <- layer 2: I/O adapters (Firebase, localStorage, AI)
  store/         <- layer 3: Zustand state
  hooks/         <- layer 4: React glue
  components/    <- layer 5: presentation

tests/           <- stable automated test suite
  unit/
  integration/
  e2e/

scratch/         <- temp files and one-off/manual test scripts only
  test-scripts/  <- ad hoc scripts; stable coverage moves to tests/
```
