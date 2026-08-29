# Active Tool UX 下一迭代实施交接稿

> Status: first increment implemented; automated local, Desktop, and MySQL/Server acceptance passed  
> Date: 2026-08-19  
> Source: [roadmap `/piecewise` checkpoint](roadmap.md#next-iteration-discovery---piecewise-checkpoint)  
> First increment: Goal Planner + Fitness AI

Implementation checkpoint (2026-08-19): the shared strict plan contract, converged creation flow, recoverable structured review, transactional/idempotent activation, resume summary, private funnel, and deterministic acceptance tests are implemented.

Automated acceptance checkpoint (2026-08-20): format, lint, 59-file/315-test Vitest, 512-module build, OpenAPI through `20260819_0009`, 127-test backend run with two conditional skips, Rust, version, Desktop E2E 10/10, MySQL contract 2/2, Server E2E 2/2, catalog structure, and whitespace checks passed. The disposable MySQL container, network, and volume were removed. Real DeepSeek remains at zero calls/tokens; exact catalog provenance waits for the unrelated dirty worktree to be isolated.

## 1. Outcome

Make AI Assistant the default way to create an Active Tool:

`natural-language need -> template recommendation -> only missing high-impact questions -> editable initial-plan review -> explicit approval -> durable Active Tool -> opened workspace`

The user receives a useful plan before an Active Tool exists. Calendar drafts remain a later, separate review/apply flow.

The primary outcome metric is the completion rate from a natural-language tool-creation request to a durably created Active Tool whose workspace has opened. Establish the baseline before setting a numeric target.

## 2. Fixed product and runtime boundaries

- Server remains MySQL with administrator-provisioned accounts and no public registration.
- Desktop remains a login-free local SQLite build with no implicit cloud synchronization.
- Provider secrets remain in backend environment variables and never move to `VITE_*` variables.
- No Active Tool is created before plan approval.
- No calendar event is created or applied during activation.
- Existing Active Tool routing takes precedence over recommending the same template again.
- Template Library remains available, but manual selection enters the same review-first journey.
- The first increment supports Goal Planner and Fitness AI only.
- Touched AI Assistant, plan-review, and Active Tool workspace copy must use consistent Chinese and English localization.

## 3. Current capability to reuse

The repository already contains most of the required engine:

- `src/store/aiStore.ts` detects template intent, extracts activation fields, and prefers an existing Active Tool route.
- `src/components/ai/GoalConversationPanel.tsx` and `src/hooks/useGoalConversation.ts` already provide a recoverable draft conversation, plan preview, direct title/summary editing, regeneration, and explicit confirmation.
- `src/domain/types/goalControl.ts::GoalActivationPlan` already carries metrics, Milestones, Actions, dependencies, and policy.
- `backend/goal_control.py::activate_thread` already creates Goal, Project, Milestones, Actions, metrics, dependencies, policy, Check-ins, and the initial plan version in one database transaction.
- `src/components/tools/EnabledToolsPanel.tsx` and `GoalControlDashboard.tsx` already expose plan health, actions, Milestones, Check-ins, proposals, versions, and calendar-draft review.
- `src/domain/types/toolTemplateMetadata.ts` already defines Goal Planner and Fitness AI metadata and Fitness-specific activation fields.

This iteration should join these paths. It should not create a second plan model or replace the transactional activation endpoint.

## 4. Current-state conflicts that must change

1. `aiStore.confirmToolTemplateActivation` currently calls the model and immediately creates a Goal/Project through `createGoalProject`. This violates review-before-create.
2. `useToolTemplateActivation.createEnabledTool` gives Template Library a separate direct-create path. Manual selection must enter the same draft/review journey.
3. `GoalConversationPanel` asks three fixed batches, while this iteration requires extraction first and only one to three remaining high-impact questions in total.
4. The current plan preview directly edits only title and summary. The confirmed shared plan fields must all be reviewable.
5. Active Tools opens directly into a dense dashboard. Returning users need a compact resume summary before the full plan.
6. Touched surfaces mix English-only and hard-coded bilingual strings instead of consistently using the localization catalog.

## 5. Target journey and states

### 5.1 State machine

`idle -> matching -> recommendation -> clarification? -> generating_draft -> draft_ready -> revising? -> activating -> opening_workspace -> completed`

Failure behavior:

- Match failure returns to ordinary AI conversation without creating a draft.
- Clarification or generation failure keeps the user's request and answers retryable.
- Revision failure preserves the last valid draft.
- Activation failure leaves the draft conversation in `draft` status and permits retry.
- Workspace-load failure must not emit completion; show a retry/open action for the already-created project.
- Repeated approval must be idempotent or return the already-created project, never create a duplicate.

### 5.2 Detailed flow

1. The user describes a need in AI Assistant.
2. If an existing Active Tool matches, keep the existing route-confirmation behavior.
3. Otherwise, match only supported first-increment templates and show:
   - recommended template and reason;
   - confidence;
   - extracted details;
   - one primary action to continue to plan creation;
   - a secondary action to continue without a tool.
4. Create or resume a draft Goal Conversation thread with `template_id` and the original request. A draft thread is recoverable state, not an Active Tool.
5. Determine missing fields from the request and template rules. Ask one to three questions total, chosen by impact.
6. Optional fields may be skipped with a visible accuracy/confidence consequence.
7. Fitness safety constraints require an explicit answer, including an explicit “none known” choice. They are never inferred from silence.
8. Generate one canonical initial-plan draft and store it as a `plan_preview` message.
9. Let the user:
   - edit structured fields directly;
   - ask AI to revise the same draft with a natural-language instruction;
   - compare warnings and missing information;
   - approve only when blocking validation passes.
10. Approval calls the existing transactional activation endpoint with template metadata and the approved plan.
11. After the transaction returns, load the new project, open Active Tools on that project, and wait for the workspace data to render.
12. Only then record journey completion.
13. Calendar drafts, if later produced by Active Tool use, continue through the existing separate approval drawer.

## 6. Canonical initial-plan contract

Use `GoalActivationPlan` as the single approval and activation contract. Strengthen it with a Zod schema and additive optional fields rather than creating a parallel type.

### 6.1 Shared visible core

- outcome/title and concise summary;
- assumptions;
- missing information and its accuracy impact;
- Milestones;
- initial Actions;
- constraints;
- risks and safety warnings;
- review cadence.

The existing `metrics`, `dependencies`, and `policy` fields remain in the canonical contract. They can appear under template-specific or advanced progressive disclosure.

### 6.2 Additive typed fields

Add typed, bounded fields equivalent to:

- `assumptions: string[]`
- `missing_information: Array<{ id; label; impact; blocking }>`
- `constraints: string[]`
- `risks: Array<{ label; severity; mitigation? }>`
- `review_cadence: { frequency; local_time?; timezone? }`
- `confidence: { level; reasons: string[] }`
- `template_id`, `template_label`, `tool_name`, `tool_kind`, `adapter_id`, `activation_form`, `route_tags`, and `tool_features`

Keep persisted/public changes additive. The backend must ignore neither safety confirmations nor template identity.

### 6.3 Template-specific sections

Goal Planner:

- target date or planning horizon;
- realistic weekly capacity;
- success measures;
- dependencies and execution tiers under progressive disclosure.

Fitness AI:

- training outcome;
- current level and known baseline;
- equipment and preferences;
- weekly frequency and session length;
- injuries, medical concerns, movement restrictions, or explicit “none known” confirmation;
- conservative workload/progression notes and professional-review warning when applicable.

Height, weight, and preferences remain optional accuracy inputs. Injury/medical constraints are blocking until explicitly answered; the application must not offer medical diagnosis.

## 7. Clarification selection rules

Implement a pure domain function that receives the template, extracted activation form, and current draft context, and returns zero to three questions.

Priority order:

1. safety-critical confirmation;
2. outcome ambiguity that would materially change the plan;
3. capacity/time or baseline information that would materially change Milestones or Actions;
4. lower-impact preference fields.

Rules:

- Never ask for a field already extracted with adequate confidence.
- Group closely related facts into one question when the answer format remains clear.
- A skip action is available only for non-blocking questions.
- Skipped inputs remain visible in `missing_information` and lower the displayed confidence.
- Validation is deterministic; the model may propose values but may not decide whether a safety field is confirmed.

## 8. Plan review UX

The plan review is a first-class state inside AI Assistant, not an Approval Drawer for calendar writes.

Above the fold:

- template identity and plan title;
- outcome/summary;
- confidence and blocking warnings;
- primary “Approve and create Active Tool” action, disabled when blocking validation fails.

Editable sections:

- assumptions and missing information;
- Milestones;
- initial Actions;
- constraints/risks;
- review cadence;
- template-specific fields.

Actions:

- direct edit;
- “Revise with AI” using an instruction against the current draft;
- regenerate only as an explicitly destructive draft action with confirmation;
- approve;
- cancel while preserving or discarding the draft explicitly.

AI revision must include the current structured draft, the user's revision instruction, confirmed facts, and template rules. Parse and validate the response before replacing the current draft. On invalid output, retain the previous draft.

## 9. Active Tool workspace home

Add a compact `ActiveToolResumeSummary` before the existing full dashboard.

The summary shows, in this order:

1. overdue and due-next Actions;
2. pending Check-in and pending change approvals;
3. blockers and safety warnings;
4. changes since the previous visit;
5. one recommended next action.

The full `GoalControlDashboard`, roadmap, Milestones, Actions, metrics, versions, AI-assistance explanation, and calendar drafts remain below through progressive disclosure. The existing AI conversation remains secondary; expose it as a contextual action that routes to the selected project rather than making chat the workspace home.

For the first increment, “changes since previous visit” may be derived from a user-scoped, project-scoped last-view timestamp and existing record `updated_at`/version data. Do not store visit state in plan metadata or create plan versions merely for viewing.

## 10. Funnel instrumentation

There is no existing product-analytics layer. Add a minimal first-party event ledger stored in the active runtime database; do not send telemetry to an external service.

Required bounded fields:

- random `journey_id`;
- authenticated `user_id` in Server mode or local desktop identity;
- `template_id`;
- enum `event_name`;
- timestamp;
- small metadata object containing only non-sensitive enum/count/error-category values.

Do not store the raw user prompt, plan text, calendar details, provider secrets, or model responses in analytics events.

Required events:

- `tool_creation_request_submitted`
- `template_recommendation_shown`
- `template_recommendation_accepted`
- `clarification_shown`
- `clarification_completed` or `clarification_skipped`
- `initial_plan_generated`
- `initial_plan_structured_edit`
- `initial_plan_ai_revision`
- `initial_plan_approved`
- `active_tool_created`
- `active_tool_workspace_opened`
- `journey_failed` with bounded stage/category

Deduplicate one-time stage events by journey and event name. Revision/edit events may carry counts.

Primary baseline:

`distinct journeys with active_tool_workspace_opened / distinct journeys with tool_creation_request_submitted`

Also report match coverage and post-recommendation completion separately so intent-matching failures are not hidden.

## 11. Implementation slices

### Slice A - Domain contract and deterministic rules

Primary files:

- `src/domain/types/goalControl.ts`
- `src/domain/schemas/ai.schema.ts` or a focused new plan schema file
- `src/domain/types/toolTemplateMetadata.ts`
- `src/domain/logic/toolTemplateMetadata.ts`
- `src/domain/logic/goalPlanningPrompt.ts`
- new focused domain modules for question selection, plan validation, and funnel event enums

Deliver:

- canonical Zod-validated plan;
- Goal Planner/Fitness template plan rules;
- zero-to-three question selector;
- safety blocking rules;
- AI generation and revision prompt builders.

### Slice B - One onboarding orchestrator

Primary files:

- `src/store/aiStore.ts`
- `src/hooks/useAI.ts`
- `src/hooks/useGoalConversation.ts`
- `src/hooks/useToolTemplateActivation.ts`
- `src/components/ai/AIAssistantPanel.tsx`
- `src/components/ai/GoalConversationPanel.tsx` or a renamed shared onboarding panel

Deliver:

- recommendation accept creates/resumes a draft thread instead of a Goal/Project;
- AI Assistant and Template Library enter the same flow;
- existing Active Tool routing still wins;
- draft recovery works after closing/reopening the panel;
- direct-create paths are removed from UI orchestration.

### Slice C - Structured review and revision

Primary files:

- focused plan-review components under `src/components/ai/`;
- `src/store/goalControlStore.ts`;
- `src/services/goalControlClient.ts`;
- `src/domain/logic/goalPlanningPrompt.ts`.

Deliver:

- structured edits for shared and template-specific sections;
- AI revision against the same draft;
- last-valid-draft preservation;
- blocking safety validation;
- localized copy.

### Slice D - Transactional activation hardening

Primary files:

- `backend/goal_control.py`
- `backend/goal_control_api.py`
- `src/services/goalControlClient.ts`
- `src/domain/types/goalControl.ts`
- OpenAPI snapshot when the public contract changes.

Deliver:

- reuse `POST /api/goal-conversations/{thread_id}/activate`;
- strict bounded validation for the expanded plan;
- template identity and activation form persisted in Active Tool metadata;
- retry/idempotency protection;
- whole transaction rollback on any invalid Milestone, Action, metric, dependency, policy, or template rule.

### Slice E - Resume-first workspace

Primary files:

- `src/components/tools/EnabledToolsPanel.tsx`
- `src/components/tools/GoalControlDashboard.tsx`
- `src/hooks/useEnabledTools.ts`
- new `ActiveToolResumeSummary` component and focused derivation helper.

Deliver:

- resume summary above the dashboard;
- deterministic next-action ranking;
- user/project-scoped last-view tracking;
- no view-only mutation of plan metadata or versions;
- full dashboard remains available below.

### Slice F - Instrumentation and localization

Primary files:

- backend model/migration/service/API files for the first-party event ledger;
- a small frontend event client;
- `src/domain/logic/i18n.ts`;
- touched AI/plan/workspace components.

Deliver:

- bounded, tenant-isolated/local-only events;
- success emitted only after workspace render;
- baseline query/report definition;
- consistent English and Chinese keys on touched surfaces.

## 12. Acceptance criteria

### Journey

- A Chinese or English natural-language Goal Planner request reaches a recommended template and reviewable plan without creating a Goal, Project, Milestone, Action, or calendar draft.
- A Chinese or English Fitness request extracts supplied details and asks no more than three remaining questions.
- A Fitness journey cannot approve until safety constraints are explicitly answered, including “none known.”
- Direct edits and AI revision both update the same draft; an invalid AI response does not destroy the last valid version.
- Approval creates exactly one complete Active Tool transaction and opens its workspace.
- Reopening AI Assistant restores an unfinished draft.
- Selecting Goal Planner or Fitness AI from Template Library enters the same review-first journey.
- An existing matching Active Tool is routed rather than recommending a duplicate.
- Calendar application remains absent from activation and continues to require its existing review/apply action.

### Workspace

- A returning project first shows due/overdue work, pending Check-ins/approvals, blockers, changes since last view, and one next action.
- The full dashboard remains reachable without losing current functionality.
- View tracking does not alter plan versions or project planning metadata.

### Security and runtime

- Server events and drafts are tenant-isolated.
- Desktop behavior requires no login and stays local.
- No raw prompts or plan bodies enter the funnel event ledger.
- No real provider call, production database, real account, user backup, or signing key is used in automated tests.
- SQLite and MySQL activation transactions behave consistently.

## 13. Test plan

Add or extend:

- `Office/test/unit/domain/goalPlanningPrompt.test.ts` for schema parsing, revision prompts, template fields, and invalid-output preservation.
- A focused unit test for missing-question selection, skip impact, and Fitness safety blocking.
- `Office/test/unit/store/aiStore.test.ts` for route precedence and recommendation state without creation.
- `Office/test/integration/aiAssistant.test.tsx` for both end-to-end onboarding journeys, recovery, edits, AI revision, no pre-approval persistence, and workspace open.
- `Office/test/integration/goalConversationAnchoring.test.tsx` for extracted context and one-to-three question behavior.
- `Office/test/integration/goalPlanner.test.tsx` and `aiDemoTools.test.tsx` for Template Library convergence.
- `Office/test/integration/toolsPanel.test.tsx` for resume-summary hierarchy and last-view behavior.
- `Office/test/backend/test_goal_control.py` for atomic activation, retry/idempotency, invalid-plan rollback, safety enforcement, and event-ledger privacy.
- `Office/test/backend/test_auth_api.py` and `test_mysql_contract.py` for tenant isolation and MySQL transaction behavior.
- A new Desktop E2E focused on request -> recommendation -> plan approval -> opened Active Tool, using fake/deterministic AI only.

When test files or commands change, update `Office/test/TEST_MATRIX.md`, `Office/test/test-catalog.json`, and relevant status documentation without claiming unrun gates.

## 14. Validation gates

Focused development loop:

1. targeted Vitest files for the changed slice;
2. targeted backend unittest files for API/transaction changes;
3. `npm.cmd run format:check`;
4. `npm.cmd run lint`;
5. `npm.cmd run test:run`;
6. `npm.cmd run build`;
7. `npm.cmd run openapi:check`;
8. `npm.cmd run test:backend`;
9. `npm.cmd run rust:check`;
10. `npm.cmd run version:check`;
11. `git diff --check`.

Before release, with explicit approval and disposable prerequisites:

- `npm.cmd run test:e2e:desktop`;
- `npm.cmd run test:server:local` to cover real MySQL plus Server E2E.

No Docker/MySQL, packaging, signing, publishing, or real provider calls are implied by this handoff.

## 15. Explicitly deferred

- Remaining templates beyond Goal Planner and Fitness AI.
- Calendar-draft review redesign.
- Full-application localization sweep.
- Advanced Goal Control additions beyond fields required by the shared plan.
- External calendar interoperability, reminders expansion, mobile, or shared calendars.
- External analytics/telemetry service.
- Numeric completion target before baseline evidence exists.

## 16. Working assumptions, TBD, and conflicts

### Working assumptions

None at the product-framework level.

### TBD after evidence

- Numeric activation-completion target, after the event baseline is collected.
- Rollout order for remaining templates, after the shared flow is validated.

### Unresolved conflicts

None in the confirmed product direction. The current-state implementation conflicts listed in section 4 are required refactor work, not open product decisions.
