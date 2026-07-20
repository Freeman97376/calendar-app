# ADR-001: Monorepo Strategy — Flat Now, Monorepo-Ready

| Field        | Value                            |
| ------------ | -------------------------------- |
| **Date**     | 2026-05-24                       |
| **Status**   | Accepted                         |
| **Deciders** | Project Supervisor (Claude Code) |

---

## Context

The calendar app currently has a single deliverable: a React web app. However, the following future extensions are likely:

- A React Native mobile app (same domain logic, different UI)
- A Node.js backend or Firebase Cloud Functions (same schemas, different runtime)
- A browser extension (same local storage logic, different host)

The question is: should we set up a monorepo (Turborepo + pnpm workspaces with `apps/` and `packages/` folders) from day one?

## Decision

**Stay flat. Structure for extraction.**

Do not set up Turborepo or workspace tooling now. Instead:

1. Keep all source code directly under `src/` at the project root
2. Enforce strict layer separation (see `architecture.md`) so that extraction is a copy operation later, not a rewrite
3. Document the exact migration steps in this ADR so the path is clear when the time comes

## Rationale

### Arguments for monorepo now

- Avoids a future restructuring
- Forces clean boundaries from the start

### Arguments against (why we chose flat)

- Turborepo/pnpm workspaces add non-trivial tooling overhead
- There is nothing to share yet — the mobile app doesn't exist
- A flat structure with strict layer rules enforces the same boundaries as a monorepo, at zero tooling cost
- The `src/domain/` architecture already guarantees extractability

### Why it works: the `src/domain/` guarantee

Because `src/domain/` imports nothing except `zod` and `date-fns`, extracting it to `packages/domain` requires:

1. `mv src/domain packages/domain/src` — move the files
2. Update import paths — a single find-and-replace
3. Nothing else changes, because nothing in `domain/` depends on the web app

## Migration Path (when the time comes)

```bash
# 1. Create monorepo structure
mkdir -p apps/web apps/mobile packages/domain packages/ui

# 2. Move web app
mv src public vite.config.ts tsconfig.json index.html apps/web/
mv apps/web/src/domain packages/domain/src

# 3. Move shared UI primitives
mv apps/web/src/components/ui packages/ui/src

# 4. Add Turborepo
npm install turbo --save-dev
# Create turbo.json, pnpm-workspace.yaml

# 5. Update imports in both apps to point to @calendar/domain, @calendar/ui
```

## Consequences

- ✅ No tooling overhead now
- ✅ Monorepo migration is a known, documented operation
- ⚠️ Import path refactor required at migration time (mitigated by `@/` alias path)
- ⚠️ Developer must maintain layer discipline (mitigated by ESLint import rules)
