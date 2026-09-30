# Deployment and Recovery Runbook

> Updated: 2026-09-20. Server, desktop, and legacy migration commands are intentionally separate.

## MySQL server release

1. Save a database backup and the dirty-worktree snapshot before changing runtime state.
2. Install the reproducible server environment:

```powershell
python -m venv .venv-server
.\.venv-server\Scripts\python.exe -m pip install --require-hashes -r requirements-server.lock
```

3. Set `CALENDAR_APP_MODE=server`, a MySQL 8.0+ `CALENDAR_DATABASE_URL`, HTTPS cookie settings, AI models/budgets, login throttle limits, and trusted proxy addresses. Server budget values come only from environment variables.
4. Stop application writes, verify the backup can be restored, and inspect the current revision and the release head:

```powershell
.\.venv-server\Scripts\python.exe -m alembic current
.\.venv-server\Scripts\python.exe -m alembic heads
```

The current release has one head, `20260920_0012`. For an existing database older than `20260715_0006`, upgrade to that guardrail revision first, then run the integrity audit. If already at or beyond `0006`, skip the intermediate upgrade; never target an older revision. For a new empty database, upgrade directly to `head`.

```powershell
# Only for an existing database older than the guardrail revision:
.\.venv-server\Scripts\python.exe -m alembic upgrade 20260715_0006
# For every existing database:
.\.venv-server\Scripts\python.exe -m backend.audit_integrity
```

5. If the audit finds orphan or duplicate records, inspect the report and archive their original row JSON before repair. Run `python -m backend.audit_integrity --archive-and-repair` only against the intended, backed-up database, then rerun the audit. Inspect `data_integrity_repairs` before restoring writes. Once the audit is clean, apply all remaining release migrations:

```powershell
.\.venv-server\Scripts\python.exe -m alembic upgrade head
.\.venv-server\Scripts\python.exe -m alembic current
.\.venv-server\Scripts\python.exe -m alembic heads
```

6. Verify `current` equals the single release `head` and the backend's expected revision. Startup deliberately refuses stale MySQL schemas and never runs migrations or `create_all`. Do not stamp a database to bypass this check.
7. Deploy the backend first, then the matching frontend. The AI review lifecycle adds no migration: it uses existing conversation JSON and batch records. Old browser pages without a saved AI plan reference are refused with a refresh message. Old history lacking review state remains read-only; generate a new plan to execute it. Create the first administrator through `python -m backend.manage_users`. Set the backend-only `CALENDAR_REGISTRATION_INVITE_CODE` to enable ordinary users to register with one shared, non-expiring code; blank disables new registrations. This feature adds no migration. When upgrading old clients, keep the code empty until the matching frontend is deployed, then enable it and restart the service; old clients only accept `registration: false`. See [Linux deployment](deployment-linux.md) for separate Calendar service and Nginx templates.
8. Before restoring writes, use disposable test accounts to verify pause/resume, pending edits surviving recomputation, independent once-only AI apply/copy, refresh/retry behavior, and two-user isolation. Real MySQL and Server E2E require an explicitly approved disposable environment. Record skipped checks as release blockers rather than claiming production readiness. Monitor conflict and failed-save errors without logging conversation content or secrets.

## Recovery

Retain the pre-release database backup and previous application release. If acceptance fails, stop writes and diagnose before rollback. Do not roll back only the backend while leaving the new frontend active. A schema rollback or backup restore requires a separately reviewed recovery operation; never blindly downgrade a populated database.

## Windows desktop release

Desktop does not use MySQL and never displays the login page.

Before the UI starts, the sidecar migrates a candidate copy under an exclusive lock. It switches files only after Alembic head, relationship audit, `integrity_check`, `foreign_key_check`, schema fingerprint, and record counts pass. An unknown or damaged layout returns structured `recovery_required`; the recovery screen exposes the original/snapshot locations, copy diagnostics, open directory, retry, and exit. It never opens an empty fallback database.

Build both Windows packages with:

```powershell
npm.cmd run desktop:build
```

The build uses `requirements-desktop.lock` with `pip --require-hashes` inside a dedicated temporary venv. Its smoke test launches `calendar-backend.exe --sidecar --port 0`, parses the stdout handshake, and checks `/api/health` using the generated token. The command produces:

- `dist-desktop/Calendar App Setup.exe`
- `dist-desktop/Calendar App Setup.exe.sig`
- `dist-desktop/Calendar App Portable.zip`
- `dist-desktop/SHA256SUMS.txt`

Test both formats in a clean Windows environment: migrate a populated pre-0008 database, start, create data, restart, OCR a receipt, preview merge conflicts, perform a checksummed replace backup/import, and confirm persistence. Also inject a damaged database and verify recovery without changing the original hash. The portable directory must contain `portable.mode` and `licenses/`.

### Signed updater release

The updater endpoint is the public repository's `latest.json`. It is used only by installed and portable desktop builds; the MySQL server mode remains an independent deployment and there is no cloud synchronization.

1. The first updater-capable `0.2.0` installer is a manual bootstrap. Set the next version across npm, Tauri, Cargo, and the lock file:

```powershell
npm.cmd run version:set -- 0.2.1
npm.cmd run version:check
```

2. Store the ignored `calendar-app-updater.key` content in GitHub Actions as `TAURI_SIGNING_PRIVATE_KEY`, and the ignored `.secrets/updater-password.txt` content as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Never commit either secret and keep an offline backup; losing the key prevents future updates for installed users. The matching public key is embedded in `src-tauri/tauri.conf.json`.
3. Commit the version change, create the exact matching tag, and push it:

```powershell
git tag v0.2.1
git push origin v0.2.1
```

4. `.github/workflows/release-desktop.yml` calls the reusable full-gate workflow first: format, lint, Vitest, frontend build, OpenAPI snapshot, backend suite, both Playwright modes, real MySQL migration/contract, Rust check, npm audit, and both Python lock audits. Only then does it validate the tag/version contract and create the signed draft release.
5. Download the draft NSIS installer and test it before publishing. A published release becomes the next `releases/latest` updater feed.

Installed builds ask before downloading/installing. After the download and before installation, `POST /api/data/pre-update-backup` uses SQLite's online-backup API and retains three checksummed snapshots in the desktop data `backups` directory. Verify that an update preserves the database and that rollback data is readable. Portable builds only open the release page; replace the portable program files manually while retaining its `data` directory.

## Legacy data migration

Keep old SQLite/JSON/browser data read-only until counts and manual samples match. Import server-side files with `backend.migrate_legacy`; export old browser localStorage from the old app. Firebase is not part of the normal runtime. For remaining Firestore events only, configure `.env.legacy.example` values as environment variables and run:

```powershell
npm.cmd run legacy:firebase-export -- .\legacy-firebase-backup.json
```

Import the resulting file only after signing into the intended owner account. Repeat merge imports are checksum-idempotent; a confirmed replace import deliberately replays the same backup.

Every v1/v2 import first calls `/api/data/import/preview`. Equal-timestamp divergent records require a per-item or batch conflict choice. Import execution carries the backup and current-data checksums from that preview and rolls back the single transaction if either checksum is stale or any write fails.
