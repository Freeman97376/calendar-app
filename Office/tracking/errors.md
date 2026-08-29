# Error Journal

> Maintained by: Claude Code / Codex
> Format: one entry per error. Append; never delete.

---

## Error Entry Template

```text
### [DATE] - [SHORT TITLE]
**Symptom:** What the user sees / what breaks
**Root Cause:** Why it happens (specific file + line if known)
**Affected Files:** list of files
**Resolution:** What was done to fix it
**Test Added:** Yes/No - describe the test if yes
**Status:** Resolved / In progress / Unresolved
```

---

## Log

### 2026-05-25 - Package Manager Unavailable During Bootstrap

**Symptom:** Phase 0 dependency installation and verification commands cannot run from the current shell.
**Root Cause:** `npm` was installed under `C:\Program Files\nodejs`, but that directory was not available on PATH in the active shell. The default `node` command resolves to an access-denied WindowsApps executable.
**Affected Files:** `package.json`, Phase 0 verification workflow.
**Resolution:** Used `C:\Program Files\nodejs\npm.cmd` and `C:\Program Files\nodejs\node.exe` directly. Install, tests, lint, TypeScript build, Vite build, and browser smoke verification now pass.
**Test Added:** Yes - `Office/test/unit/app.smoke.test.tsx`.
**Status:** Resolved

### 2026-05-25 - In-App Browser Runtime Permission Error

**Symptom:** Browser automation through the in-app browser failed before connecting.
**Root Cause:** The browser plugin Node runtime hit `EPERM` while trying to inspect `C:\Users\Zheng\AppData`.
**Affected Files:** None.
**Resolution:** Used a scratch Playwright smoke script in `scratch/test-scripts/phase2-smoke.mjs` and launched installed Microsoft Edge explicitly.
**Test Added:** No - scratch smoke script only.
**Status:** Resolved

### 2026-05-26 - Recurrence Count Input Normalized During Clear

**Symptom:** Creating a daily recurring event with "After count" and typing `3` after clearing the default count rendered seven visible May occurrences instead of three.
**Root Cause:** `RecurrenceSelector` immediately normalized an empty numeric input to `1`, so clearing the default `5` and typing `3` could commit `13`.
**Affected Files:** `src/components/event/RecurrenceSelector.tsx`, `src/components/event/EventForm.tsx`.
**Resolution:** Added local numeric edit state for recurrence interval/day/count inputs and converted dependent form updates to functional `setValues` calls.
**Test Added:** Yes - `Office/test/integration/recurringEvents.test.tsx` covers creating a count-limited daily recurrence through the UI.
**Status:** Resolved

### 2026-05-26 - Following Split Kept Full Count

**Symptom:** Editing "this and following" on occurrence 2 of a 3-occurrence daily series produced three shifted occurrences instead of the remaining two.
**Root Cause:** `eventStore` copied the unchanged count-limited recurrence rule directly to the new tail master instead of reducing the count by occurrences before the split date.
**Affected Files:** `src/store/eventStore.ts`.
**Resolution:** Added following-rule derivation that preserves an explicitly changed rule, but reduces unchanged count rules to the remaining occurrence count.
**Test Added:** Yes - `Office/test/integration/recurringEvents.test.tsx` covers edit following.
**Status:** Resolved

### 2026-05-26 - TypeScript Emitted Root Config Artifacts

**Symptom:** Running `tsc -b` emitted root `*.config.js` and `*.config.d.ts` files, and ESLint then linted the generated declaration files.
**Root Cause:** `tsconfig.node.json` was missing `noEmit: true` while including TypeScript config files as a composite project.
**Affected Files:** `tsconfig.node.json`, `.gitignore`.
**Resolution:** Added `noEmit: true`, removed generated config artifacts, and ignored those generated paths as a safeguard.
**Test Added:** No - verified with ESLint and `tsc -b`.
**Status:** Resolved

### 2026-05-26 - Browser Drag Smoke Did Not Trigger Pointer-Only Path

**Symptom:** The Phase 4 browser smoke created an event, attempted to drag it to May 26, and the event remained on May 25.
**Root Cause:** The first smoke used Playwright's `dragTo` path and the implementation only registered pointer and keyboard sensors; explicit desktop mouse movement was not covered.
**Affected Files:** `src/hooks/useDragDrop.ts`, `scratch/test-scripts/phase4-smoke.mjs`.
**Resolution:** Added `MouseSensor` with the same activation constraint and changed the smoke script to use explicit mouse down/move/up.
**Test Added:** Yes - `scratch/test-scripts/phase4-smoke.mjs`.
**Status:** Resolved

### 2026-05-26 - DST Test Asserted Wrong Invariant

**Symptom:** Full Vitest failed on the weekly recurrence DST test in a timezone with DST.
**Root Cause:** The test asserted UTC hour equality, but the feature requires preserving local clock time; UTC hour should shift when DST starts.
**Affected Files:** `Office/test/unit/domain/recurrence.test.ts`.
**Resolution:** Updated the assertion to compare local hours across generated instances.
**Test Added:** No - corrected existing test.
**Status:** Resolved

### 2026-05-26 - Playwright E2E Run Blocked By Escalation Limit

**Symptom:** The Phase 7 Playwright E2E suite could not be executed from the desktop app.
**Root Cause:** The required escalated command to launch Microsoft Edge and reuse/start the dev server was rejected because the desktop escalation usage limit was reached.
**Affected Files:** `Office/test/e2e/createEvent.test.ts`, `Office/test/e2e/dragAndDrop.test.ts`, `Office/test/e2e/aiBreakdown.test.ts`.
**Resolution:** E2E specs were written but not executed. ESLint and TypeScript validation passed after Phase 7 edits.
**Test Added:** Yes - runnable Playwright E2E specs for create, reload persistence, drag/drop, and AI no-key panel behavior.
**Status:** Unresolved

### 2026-05-26 - AI Fetch Illegal Invocation

**Symptom:** Submitting an AI assistant goal failed in the browser with `Failed to execute 'fetch' on 'Window': Illegal invocation`.
**Root Cause:** `AnthropicService` and `OllamaService` stored the browser `fetch` function and later invoked it as a class property, which can lose the required `window` binding.
**Affected Files:** `src/services/ai/anthropicService.ts`, `src/services/ai/ollamaService.ts`.
**Resolution:** Wrapped the default fetcher as `globalThis.fetch(input, init)` so browser calls keep the correct receiver while test-injected fetchers remain supported.
**Test Added:** No - verified existing Anthropic service tests plus live Ollama browser request.
**Status:** Resolved

---

_(Append new error entries above this line)_
