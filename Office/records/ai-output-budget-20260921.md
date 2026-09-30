# AI planning output budget correction — 2026-09-21

The reported incomplete JSON came from a goal_plan call using deepseek-reasoner in Balanced mode, with 1925 input and exactly 3000 output tokens. Only usage metadata was inspected; no personal credential, prompt or response text was read.

## Change

Planning budgets now distinguish reasoning from ordinary chat: 8192/16384/24576 total output tokens for reasoning under Economy/Balanced/Quality, while normal planning retains 2000/3000/4000. The selected account model and administrator-clamped usage mode choose the budget; explicit smaller totals are respected. Backend-routed planning callers omit their obsolete 1024–3072 caps. Reasoning planning reads may wait 180 seconds, within the existing 300-second Nginx window. Monthly limits and accounting remain in place; incomplete output is rejected and never automatically retried. No provider model migration was attempted.

Primary provider reference: [DeepSeek JSON output](https://api-docs.deepseek.com/guides/json_mode/) explains that JSON still requires an adequate output budget. The exact 3000-token failure is established by this application's live usage metadata, not inferred from provider documentation.

## Evidence

- New tests failed before the fix: backend expected 16384 but forwarded 3000; frontend unexpectedly sent 1024. After fixing, 45 auth/personal AI backend tests and all 371 frontend tests passed. The backend parameter matrix includes every planning operation, alias, usage mode, model selection, administrator clamping, huge and lower explicit limits. Truncation accounting and hard-limit rejection are tested without real network calls.
- Full backend command `npm.cmd run test:backend`: 180 tests; 172 passed, 6 conditional MySQL skips, one failure and one error in the previously reproduced date-fixture cases. First useful failures: test_activation_rejects_standard_plan_above_buffered_capacity expects a weekly-capacity message but receives the zero-executable-day guard; test_twelve_week_plan_is_checked_per_week_not_as_one_week raises the same guard. See [ERR-CAPACITY-DATE-FIXTURE-001](known-errors/err-capacity-date-fixture-001.md). Those cases were independently reproduced against the old release during the previous change. No assertions or capacity behavior changed here.
- `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run build:server`, `npm.cmd run openapi:check`, `npm.cmd run rust:check`, `npm.cmd run version:check` passed. Build retains its existing large-chunk warning. The first lint run accidentally scanned an agent-created extracted baseline under `.scratch`; moving that copy to the repository's already-excluded `scratch/` location made the unchanged lint rules pass.
- Detailed repeatable test contracts: [TC-AI-OUTPUT-001-v1](test-cases/functional/tc-ai-output-001-v1.md). Logs are under ignored `.scratch/ai-output-*.log`. The broader previous personal-AI MySQL/E2E evidence is marked stale because it was not fully rerun after this shared backend change.

## Deployment

Released `calendar-output-20260921T024347Z` from the preserved dirty working tree, based on Git HEAD 28245bb15972986745fe0d7035513acef0a040ce. Archive SHA256: 7ebc932ffaaa4275862c13432ce3d2e0843dafece9c0d99ad72c9888ad72ee07. All 65 runtime-file hashes were checked; only backend/goal_control.py, backend/server.py and rebuilt frontend resources differ from the preceding release. The old live manifest was verified before deployment. A fresh isolated Python environment installed dependencies using the unchanged server lock with required hashes.

Current link: `/opt/projects/calendar-app-current` → `/opt/projects/calendar-app-releases/calendar-output-20260921T024347Z`. Prior release retained: calendar-ai-20260921T011928Z. Private backup directory `/var/backups/calendar-app/20260921T024347Z-ai-output` contains the environment copy and MySQL gzip dump with CRC and SHA256 verification. Environment bytes were unchanged before/after switching; the encryption master and all personal credentials were preserved. Alembic current and heads both remain 20260920_0012; no migration ran.

Calendar alone was restarted through systemd. Direct and public health returned MySQL/ok. Public /calendar/ returned 200; anonymous AI settings and AI proxy returned 401. The public new JavaScript asset hash matched the local build exactly. Importing the installed module confirmed Balanced reasoningOutput=16384. Existing Mantle health=200, SmartStock=401, blog=200. No production test accounts, account mutations or paid AI calls were performed.

Rollback is the retained previous release link and a Calendar-only restart; database and environment rollback are unnecessary for this code-only update. The failed user request was not regenerated automatically. The user must refresh and explicitly regenerate; a future oversized or schema-invalid AI answer can still fail safely.
