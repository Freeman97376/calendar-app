# Active Sprint - Phase 7: Polish & QA

> Maintained by: Claude Code / Codex | Last updated: 2026-06-07
> Status legend: Not started | In progress | Done | Blocked

---

## Sprint Goal

Harden the app for usability, accessibility, resilience, and critical end-to-end workflows.

---

## Completed Baseline

- Phase 0 Bootstrap: verified.
- Phase 1 Calendar Views: verified.
- Phase 2 Event CRUD: verified.
- Phase 3 Recurring Events: verified.
- Phase 4 Drag & Drop: verified.
- Phase 5 Persistence Layer: verified.
- Phase 6 AI Assistant: verified.

Current verification:

- Full Vitest baseline: 136 passing, 0 failing after to-do/type extension.
- ESLint: passing.
- TypeScript build: passing.
- Vite production build: passing with existing vendor chunk warning.
- Backend unittest: 15 passing with `PYTHONPATH` set to the repo root.
- Playwright E2E run: still not part of the latest automated verification pass.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 7.1 | Responsive design audit and fixes | Done | AI panel now stacks below calendar on smaller screens. |
| 7.2 | ARIA labels on all interactive elements | Done | Existing controls reviewed; AI panel uses complementary landmark. |
| 7.3 | Keyboard navigation | Done | Modal Escape handling existed; view switcher now supports arrow keys. |
| 7.4 | Add `ErrorBoundary` around major sections | Done | Calendar shell wrapped in `ErrorBoundary`. |
| 7.5 | Loading skeleton states | Done | Event loading status added; AI thinking state already present. |
| 7.6 | E2E tests: create event flow | In progress | Tests written; execution blocked by escalation usage limit. |
| 7.7 | E2E tests: AI breakdown and schedule flow | In progress | No-key AI E2E written; full API-backed flow remains integration-tested. |
| 7.8 | E2E tests: drag and drop rescheduling | In progress | Tests written; execution blocked by escalation usage limit. |
| 7.9 | Performance audit | In progress | Manual chunks added; production build rerun still needed. |
| 7.10 | Final code review | Not started | |

---

## Blockers

Playwright E2E still needs a live dev server and browser pass for final Phase 7 confidence.

---

## Notes

- Use `C:\Program Files\nodejs\node.exe` directly when package shims resolve to the blocked WindowsApps Node.
- Stable automated tests belong in `tests/`; ad hoc scripts belong in `scratch/test-scripts/`.
- Commands that invoke Vite/Vitest/esbuild may need sandbox escalation in this desktop environment.
- To-do types are stored in `calendar_event_types` and should stay user-editable data, not an enum in the event schema.
- For receipt OCR manual QA, run `tesseract --version` in the same PowerShell session that starts `python -m backend.server`.
- If Tesseract is installed but not detected, prepend the default install folder for the session: `$env:Path = "C:\Program Files\Tesseract-OCR;$env:Path"`.
