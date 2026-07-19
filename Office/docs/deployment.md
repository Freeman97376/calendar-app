# Deployment and Recovery Runbook

> Updated: 2026-07-15. Server, desktop, and legacy migration commands are intentionally separate.

## MySQL server release

1. Save a database backup and the dirty-worktree snapshot before changing runtime state.
2. Install the reproducible server environment:

```powershell
python -m venv .venv-server
.\.venv-server\Scripts\python.exe -m pip install --require-hashes -r requirements-server.lock
```

3. Set `CALENDAR_APP_MODE=server`, a MySQL 8.0+ `CALENDAR_DATABASE_URL`, HTTPS cookie settings, AI models/budgets, login throttle limits, and trusted proxy addresses. Server budget values come only from environment variables.
4. Stop application writes, then apply the guardrail migration:

```powershell
.\.venv-server\Scripts\python.exe -m alembic upgrade 20260715_0006
.\.venv-server\Scripts\python.exe -m backend.audit_integrity
```

5. If the audit reports orphan records, archive the original row JSON before removing it from active tables, inspect the report, and rerun the audit:

```powershell
.\.venv-server\Scripts\python.exe -m backend.audit_integrity --archive-and-repair
.\.venv-server\Scripts\python.exe -m backend.audit_integrity
.\.venv-server\Scripts\python.exe -m alembic upgrade 20260715_0007
```

6. Deploy the backward-compatible backend first. Create or manage accounts only through `python -m backend.manage_users`; no registration route exists.
7. Deploy the frontend, then sign into two accounts and verify event, Tool, goal, Check-in, backup, and AI isolation. Monitor normalized AI error codes, login 429 responses, ignored import preferences, and sidecar startup failures without logging secrets or request bodies.

## Windows desktop release

Desktop does not use MySQL and never displays the login page. Run:

```powershell
npm.cmd run desktop:build
```

The build uses `requirements-desktop.lock` with `pip --require-hashes` inside a dedicated temporary venv. Its smoke test launches `calendar-backend.exe --sidecar --port 0`, parses the stdout handshake, and checks `/api/health` using the generated token. The command produces:

- `dist-desktop/Calendar App Setup.exe`
- `dist-desktop/Calendar App Setup.exe.sig`
- `dist-desktop/Calendar App Portable.zip`
- `dist-desktop/SHA256SUMS.txt`

Test both formats in a clean Windows environment: start, create data, restart, OCR a receipt, export/replace/import a backup, and confirm persistence. The portable directory must contain `portable.mode` and `licenses/`.

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

4. `.github/workflows/release-desktop.yml` validates the tag/version contract, frontend, backend, packaged sidecar, and signed NSIS build. It creates a draft release and uploads the NSIS updater artifacts, portable ZIP, and checksums.
5. Download the draft NSIS installer and test it before publishing. A published release becomes the next `releases/latest` updater feed.

Installed builds ask before downloading/installing. After the download and before installation, `POST /api/data/pre-update-backup` uses SQLite's online-backup API and retains three checksummed snapshots in the desktop data `backups` directory. Verify that an update preserves the database and that rollback data is readable. Portable builds only open the release page; replace the portable program files manually while retaining its `data` directory.

## Legacy data migration

Keep old SQLite/JSON/browser data read-only until counts and manual samples match. Import server-side files with `backend.migrate_legacy`; export old browser localStorage from the old app. Firebase is not part of the normal runtime. For remaining Firestore events only, configure `.env.legacy.example` values as environment variables and run:

```powershell
npm.cmd run legacy:firebase-export -- .\legacy-firebase-backup.json
```

Import the resulting file only after signing into the intended owner account. Repeat merge imports are checksum-idempotent; a confirmed replace import deliberately replays the same backup.
