# Agent Governance Decision Log

Record only decisions that should influence future agent behavior. Add a new entry when a decision is superseded; keep the earlier entry intact.

## GOV-001 - Centralize agent governance in office

- Date: bootstrap date
- Status: accepted
- Decision: Keep detailed agent governance in `office/` and use the root `AGENTS.md` as the discovery entry point.
- Reason: One indexed, testable location reduces instruction drift while preserving Codex discovery.
- Consequences: Governance changes must update the relevant record and pass the office validator.

## PRODUCT-LONG-TERM-DUE-DATE-001 - Separate hard deadlines from planning dates

- Date: 2026-08-29
- Status: accepted
- Decision: Every unfinished Minimum or Standard action needs a planning date before activation. Preserve valid existing dates; derive missing dates deterministically from dependencies, buffered weekly capacity, available days, and milestone or goal bounds. When the user has no hard deadline, keep `target_date` empty and use a rolling four-week horizon with flexible system-planned date provenance; eligible low-priority overflow may become undated Stretch work.
- Interaction: If scheduling cannot be derived, ask one consolidated `action_schedule` question per plan fingerprint. Resolve the answer deterministically; if it still fails, stop and show the conflict without asking again or calling activation.
- Consequences: The AI prompt, frontend scheduler, review UI, activation preflight, backend guard, and governed regression case must remain aligned. System-planned dates must never be presented as user-supplied hard deadlines.

## PRODUCT-GLOBAL-TOOL-SCHEDULING-001 - Coordinate active tools through one proposal scheduler

- Date: 2026-08-29
- Status: accepted
- Decision: Active-tool Minimum/Standard actions share one deterministic user-level scheduler. Existing calendar events are fixed; only future events owned by the scheduler may move. Every write is preceded by a Chinese impact proposal and explicit confirmation.
- Transaction: Acceptance rechecks the input fingerprint and plan version, then atomically commits approved plan changes, flexible dates, calendar events, action links, and proposal evidence. A stale proposal returns 409 without partial writes.
- UX: Drafts, active tools, and the editor are separate; new tools open blank. Daily conversation keeps a sticky explicit tool context and inline approval surfaces.
- Detail: `Office/decisions/global-tool-scheduling-20260829.md`.

## PRODUCT-CHAIN-LIFECYCLE-20260920 - Durable, independently idempotent AI review

- Date: 2026-09-20
- Status: accepted by user
- Decision: Legacy AI plans without recorded execution state remain read-only. New plan apply and copy-to-tasks are independently once-only operations, backed by existing message JSON and batch records without a new migration.
- Tool editing: One pending tool edit per user. All recomputes preserve it; another edit requires accepting or abandoning the first. Version conflicts retain the draft and block writes.
- Validation: Follow TC-CHAIN-LIFECYCLE-001-v1. MySQL concurrency and Server E2E remain separate release gates.

## PRODUCT-SHARED-INVITE-20260920 - Shared long-lived invitation registration

- Date: 2026-09-20
- Status: explicitly requested by user
- Decision: One backend-configured invitation code can register multiple ordinary users indefinitely. No automatic expiry or consumption. Blank disables registration, replacement invalidates the old code; existing accounts continue working. Administrator provisioning and desktop no-login behavior remain unchanged.
- Supersedes: The prior server manual-provisioning-only rule for ordinary accounts. This replaces the earlier proposed one-time invitation design and requires no migration.
- Deployment: Separate Calendar service, database and subdomain on the existing Mantle Linux host. Actual domain/connection remain pending; formal Mantle operations methodology is applied with Calendar-specific configuration.
- Evidence: TC-SHARED-INVITE-001-v1 remains derived; no claim of separately confirmed test process.

## DEPLOYMENT-CALENDAR-SUBPATH-20260920 - Confirmed existing-domain path

- Status: explicitly confirmed by user.
- Decision: Publish Calendar at `https://mantleofintelligence.com/calendar/`, with `/calendar/api/` and scoped cookies; supersedes the independent-subdomain deployment choice above.
- Preserve the dirty old server checkout. Stage immutable version directories and use `/opt/projects/calendar-app-current` for the new service and static files. Keep Mantle routes and runtime unchanged.
- Existing authorized SSH access is verified. Real MySQL and Server E2E still need explicit disposable-environment approval.
- Old browser-published AI credentials must be revoked and old static assets retired; do not migrate a browser secret into the new release. No secret values recorded.

## DEPLOYMENT-CALENDAR-LIVE-20260920 - Isolated release and backend-only secrets

- Completed the user's confirmed /calendar/ deployment, using the previously empty db_calendar with a dedicated SQL account and versioned release directory.
- User explicitly approved disposable MySQL/browser validation and cleanup; no approval was inferred from pasted logs.
- Keep Python dependency resolution cross-platform and hash-enforced. Preserve original version constraints when adding platform-specific dependencies.
- Public legacy static files redirect to the new site; preserve their private backup. AI stays unconfigured until the exposed old key is revoked and a new backend-only key is configured.

## 2026-09-20 网页个人 API 配置

用户要求网页版提供 API 配置入口。按已说明的默认方案实现每账号独立 DeepSeek Key，个人配置优先、缺省使用管理员服务。密钥在独立表中加密，主密钥仅在服务器私密环境；响应、普通偏好及用户备份均不包含密钥。前端只暂存本次输入，保存成功清空；账号切换丢弃旧响应。支持官方 DeepSeek 通道和两个现有模型，不开放用户任意后端 URL。新增迁移 20260920_0012，其他运行边界不变。

- 2026-09-21: Reasoning planning reserves a bounded total output of 8192/16384/24576 tokens by effective mode, with a 180-second read timeout. Normal planning caps and monthly limits are unchanged. Backend clients use server budgets; explicit lower max_tokens is respected. Never automatically regenerate a truncated result.
