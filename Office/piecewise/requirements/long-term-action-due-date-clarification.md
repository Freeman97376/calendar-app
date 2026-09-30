---
piecewise_version: 1
status: finalized
type: requirements
topic: long-term-action-due-date-clarification
updated_at: 2026-08-29T11:17:53-07:00
next_question: "None - finalized for implementation."
---

# Long-term action due-date clarification

## Confirmed

- This finalized checkpoint is implemented within the broader accepted architecture decision `PRODUCT-GLOBAL-TOOL-SCHEDULING-001` at `Office/decisions/global-tool-scheduling-20260829.md`; the original confirmations below remain historical requirements.

- Keep the backend activation validation as the final protection boundary.
- Before activation, unfinished `minimum` and `standard` actions must have a planning date; `stretch`, `done`, and `skipped` actions may remain undated.
- When target, capacity, estimates, dependencies, and date bounds are sufficient, fill only missing dates deterministically and preserve existing valid dates.
- Schedule in dependency order into the earliest feasible week using buffered weekly capacity.
- Use the user's last available execution day in the assigned week; when none is known, use Sunday, without exceeding the milestone or target date.
- When deterministic scheduling is impossible, ask one consolidated scheduling question for that plan version and do not send activation to the backend.
- After the user answers, resolve the schedule deterministically. If it remains impossible, show the exact conflict and do not ask again.
- When the user confirms there is no hard deadline, keep `target_date` nullable, treat the plan as rolling, assign flexible system-planned dates only to near-term required actions, and keep future optional work as undated `stretch` work.
- Default the rolling planning horizon to four weeks. Store planning-date provenance and flexibility in action metadata without a database migration.
- Continue to require explicit user approval before creating the Active Tool.

## TBD

- None.

## Working assumptions

- None.

## Unresolved conflicts

- None.

## Next question

None - finalized for implementation.
