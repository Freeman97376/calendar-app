---
decision_id: PRODUCT-GLOBAL-TOOL-SCHEDULING-001
status: accepted
date: 2026-08-29
owners: product; backend; frontend
---

# Global tool scheduling and proposal boundary

## Decision

All unfinished Minimum and Standard actions from active tools share one deterministic, user-scoped scheduler. Ordinary calendar events, recurring events, and events without a global-scheduler action link are fixed occupancy. Ordinary todos are not scheduled in the first version.

The scheduler uses the user's timezone, configured weekday work windows, each tool's executable days, dependencies, deadlines, tier, priority, stable source order, and existing calendar occupancy. It may split work into configured blocks and may borrow a tool's buffered weekly soft limit only when global free time exists; borrowing must be visible in the proposal. Stretch actions never displace Minimum or Standard work.

Every activation, accepted active-tool plan change, active action/status change, or calendar mutation invalidates the current schedule and creates one latest proposal. Recalculation never calls AI and never writes calendar events. Accepting a current proposal rechecks its input fingerprint and plan version, then commits plan changes, flexible action-date changes, scheduler-owned future events, action links, batch evidence, and proposal status in one transaction. Stale proposals return 409 and are never partially applied.

## Ownership and safety

- Only events linked with `managed_by=global_scheduler` may be updated or deleted by a schedule proposal.
- Historical scheduler events are retained.
- Existing fixed events are never moved or deleted.
- An explicitly fixed historical action date becomes a Chinese conflict; an expired flexible system date may roll forward.
- A plan with no hard deadline keeps `target_date=null` and uses rolling, explicitly flexible action dates.
- Missing work windows produce one setup-required state; no default hours are guessed.
- Active-tool permanent deletion remains a separate destructive lifecycle decision.

## UI boundary

Tool drafts, active tools, and the tool editor are distinct workspaces. Starting a new tool opens a blank editor and never auto-selects a prior draft. Daily conversation exposes an explicit sticky tool context; automatic routing only recommends the initial tool. Tool results and approval surfaces remain in the conversation instead of forcing navigation.

## Verification boundary

SQLite backend, frontend unit/integration, and OpenAPI checks provide local evidence. MySQL, Server E2E, desktop packaging, and real AI provider calls remain conditional and cannot be inferred from local results.
