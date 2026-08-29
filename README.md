# Calendar App

React/Vite calendar app with a FastAPI backend. It supports a MySQL multi-user server mode and a login-free Windows desktop mode.

## Run modes

- `server`: MySQL 8.0+ is the only data source. Users sign in with accounts created by the operator; registration does not exist.
- `desktop`: Tauri starts a bundled FastAPI/PyInstaller sidecar on a random `127.0.0.1` port. SQLite lives in `%LOCALAPPDATA%\CalendarApp`, or `data\` beside a portable build.

The modes do not synchronize automatically. Move personal data only with the versioned backup export/import in Settings.

## MySQL server

Set backend-only values in the service environment. Never put AI keys or database credentials in `VITE_*` variables.

```env
CALENDAR_APP_MODE=server
CALENDAR_DATABASE_URL=mysql+pymysql://calendar_user:CHANGE_ME@127.0.0.1:3306/calendar_app?charset=utf8mb4
CALENDAR_COOKIE_SECURE=true
CALENDAR_ALLOWED_ORIGINS=
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
AI_REQUESTS_PER_MINUTE=30
CALENDAR_LOGIN_MAX_REQUEST_BYTES=16384
CALENDAR_JSON_MAX_REQUEST_BYTES=1048576
CALENDAR_BACKUP_MAX_REQUEST_BYTES=26214400
CALENDAR_RECEIPT_MAX_FILE_BYTES=8388608
CALENDAR_MULTIPART_MAX_REQUEST_BYTES=10485760
AI_MAX_REQUEST_BYTES=262144
AI_ROUTINE_MODEL=deepseek-chat
AI_PLANNING_MODEL=deepseek-chat
AI_DEFAULT_USAGE_MODE=balanced
AI_MAX_USAGE_MODE=balanced
AI_MONTHLY_SOFT_LIMIT=1500000
AI_MONTHLY_HARD_LIMIT=2000000
```

Install, migrate, create the first operator account, and start from the repository root:

```powershell
python -m venv .venv-server
.\.venv-server\Scripts\python.exe -m pip install --require-hashes -r requirements-server.lock
.\.venv-server\Scripts\python.exe -m alembic upgrade head
.\.venv-server\Scripts\python.exe -m backend.manage_users create --username owner --admin
.\.venv-server\Scripts\python.exe -m backend.server --mode server --host 127.0.0.1 --port 8787
```

`manage_users` also provides `set-password`, `enable`, `disable`, `unlock`, and `list`. Password input is hidden and is never accepted as a command-line argument. Put the React build at `/` and reverse-proxy `/api` to `127.0.0.1:8787` on the same HTTPS origin. Validate with `GET /api/health`.

## Long-term goal control and AI usage

Open `AI Assistant` and choose `New long-term goal / 新长期目标`. The recoverable goal conversation asks one to three selectable questions per turn. It creates a measurable plan preview only; the Goal, Project, metrics, Milestones, Actions, dependencies, control policy, Check-in schedule, and first version are written in one transaction after confirmation.

`Active Tools` opens the goal as a full workspace with the planning brief, selected/effective AI mode, health factors, metric trends, planned/actual capacity, Milestones, critical path, complete plan table, Check-in, versions/rollback, and the same goal conversation. Templates are a small read-only link in AI Assistant, Active Tools, and the workspace footer rather than a primary home card.

AI-generated Active Tool changes are saved as a `PlanChangeProposal`, not applied directly. The full page shows each Milestone/Action difference, buffered-capacity impact and calendar-draft count; the user can accept all, accept selected items, or reject. Manual structural edits save immediately and coalesce into one plan version during a five-minute editing window. Standard plus Minimum actions cannot exceed the weekly capacity after the configured buffer (20% by default).

Periodic review uses deterministic medium-sensitivity rules for consecutive off-track reviews, seven-day Milestone delay, repeated 20% capacity overrun, leading/lagging metric drift and three missed Minimum actions. Low-confidence, anomalous or safety-boundary readings only request confirmation or suggest a pause; they never replan or pause automatically. The desktop app sends a native notification when pending Check-ins are discovered while the app is open, without an AI call.

AI usage resolution is:

```text
goal override -> user global default -> server default -> administrator maximum clamp
```

The Settings page shows Economy, Balanced, and Quality-first behavior, current monthly routine/planning tokens, Soft/Hard limits, and degraded status. Server users cannot change budgets or model names. Desktop users can change local budgets. Reaching the Hard limit stops model calls without blocking Check-ins, charts, manual edits, versions, or local data. AI usage events are not included in backup v2.

The database migration head is `20260719_0008`. Existing servers first upgrade to `20260715_0006`, run `python -m backend.audit_integrity`, archive and repair any reported orphan records with `--archive-and-repair`, and only then upgrade explicitly to `head` while writes are stopped. Server startup never creates, stamps, or migrates the production schema.

Desktop SQLite uses a migration lock and SQLite online backup to build a separate migration candidate. Known layouts, including a false `0007` stamp missing its foreign keys, are repaired and fully migrated; unknown layouts stop with `recovery_required`. The candidate must pass integrity, foreign-key, schema-fingerprint, revision, and record-count checks before it atomically replaces the original. The original and checksummed snapshot remain untouched on failure.

### Legacy import

Settings first previews every backup import. Newer `updatedAt` values win; equal-time content conflicts require an explicit local/backup choice. Execution includes both preview checksums and returns 409 if current data changed. Replace mode is enabled only after a checksummed desktop SQLite snapshot or a downloaded server-account JSON backup succeeds.

Back up the old files before migrating. After the MySQL migration and first account creation, import the old read-only SQLite/JSON sources:

```powershell
python -m backend.migrate_legacy --username owner `
  --calendar-db backend\data\calendar_app.sqlite3 `
  --memory-db backend\data\long_term_memory.sqlite3 `
  --fridge-json backend\data\fridge_inventory.json
```

The command reports read/created/updated/skipped/failed counts and is idempotent. In the old web app, Settings also has `Export legacy browser data`; import that file after signing in.

Firebase is no longer part of the normal Settings page or production bundle. If an old deployment still has Firestore events, copy `.env.legacy.example` values into the current PowerShell environment and run the operator-only exporter:

```powershell
npm.cmd run legacy:firebase-export -- .\legacy-firebase-backup.json
```

The generated v1 backup can be imported into the current account. Firebase remains a development-only dependency solely for this exporter and its legacy adapter tests.

## Windows desktop packages

The unified build creates a dedicated `build\desktop-venv`, installs only the hash-locked desktop dependencies, bundles the FastAPI sidecar plus Tesseract/tessdata/licenses, builds the Tauri v2 NSIS app, and creates a portable ZIP:

```powershell
npm.cmd run desktop:build
```

Outputs:

- `dist-desktop/Calendar App Setup.exe`
- `dist-desktop/Calendar App Setup.exe.sig`
- `dist-desktop/Calendar App Portable.zip`
- `dist-desktop/SHA256SUMS.txt`

The portable archive contains `portable.mode`. If its directory is read-only, the app shows a warning and uses `%LOCALAPPDATA%\CalendarApp`. The desktop DeepSeek key is stored through Windows Credential Manager and is excluded from SQLite and backup files.

Installed NSIS builds check the public GitHub Release updater after desktop bootstrap and also expose a manual check in Settings. The user must confirm the download and installation. Immediately before installing, the local sidecar creates a consistent SQLite snapshot under `%LOCALAPPDATA%\CalendarApp\backups`, writes its SHA-256 checksum, and retains the three newest pre-update snapshots. Portable builds never self-install; they notify the user and open the latest release page instead. The MySQL server edition has no updater dependency and does not synchronize with the desktop database.

Version `0.2.0` is the updater bootstrap and must be installed manually. Published `0.2.1` and later releases can update installed copies automatically. Keep all manifests synchronized with:

```powershell
npm.cmd run version:set -- 0.2.1
npm.cmd run version:check
```

Pushing the matching `v0.2.1` tag runs `.github/workflows/release-desktop.yml`. The reusable validation workflow must first pass format, lint, Vitest, build, backend, OpenAPI, isolated desktop E2E, real-MySQL contract/server E2E, Rust, and dependency-audit gates. The Windows job then builds and signs the artifacts and creates a draft GitHub Release. Before the first tag, add the ignored local `calendar-app-updater.key` content as the repository secret `TAURI_SIGNING_PRIVATE_KEY`, and the ignored `.secrets/updater-password.txt` content as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Publish the draft only after installing and smoke-testing both NSIS and portable assets on a clean Windows machine.

The sidecar pre-binds its own random loopback socket and emits one stdout handshake containing its port and ephemeral token. The token is never passed in process arguments or environment variables. Tauri waits up to 15 seconds for the handshake and health check.

The build also enables native desktop Check-in notifications. Notification permission is requested by the Tauri shell only when a pending goal Check-in exists.

## Fridge Receipt Backend

Receipt analysis endpoint:

```text
POST http://127.0.0.1:8787/api/fridge/receipt/analyze
```

Request type: `multipart/form-data`

Fields:

- `image`: required receipt image file. Supports `jpg`, `jpeg`, `png`, and `webp`.
- `purchase_date`: optional ISO date, defaults to today.
- `timezone`: optional timezone string.
- `create_reminders`: optional `true`/`false`. The current backend does not have an event creation API, so this returns `reminder_suggestions` for the frontend.

### Environment

Add backend-only DeepSeek values to `.env.local` or your shell environment:

```env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
FRIDGE_DATA_DIR=
```

Do not use a `VITE_` prefix for `DEEPSEEK_API_KEY`; this is a backend secret.
`FRIDGE_DATA_DIR` is optional and defaults to `backend/data`.

### Local OCR

The backend tries local OCR first by calling the `tesseract` command. Install Tesseract OCR and make sure `tesseract` is available on PATH.

Windows options:

- Install from the official Tesseract Windows installer.
- Or use a package manager such as Chocolatey/Scoop if already configured.

If Tesseract is unavailable or OCR confidence is too low, the pipeline falls back to DeepSeek when useful OCR text exists. Image-native DeepSeek fallback is documented as a limitation because the default `deepseek-chat` model is text-only.

### Run Locally

First change to the repository directory. Running `npm.cmd` from `C:\Windows\System32` makes npm try to write `C:\Windows\System32\package-lock.json` and fails with `EPERM`.

```powershell
Set-Location "C:\Users\Zheng\Desktop\calendar app"
npm.cmd install
```

Then, in one terminal, run the frontend:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run dev
```

In another terminal, run the backend:

```powershell
python -m pip install --require-hashes -r requirements-server.lock
python -m backend.server --mode desktop
```

Vite proxies same-origin `/api` requests to `127.0.0.1:8787` during development. Production also uses same-origin `/api`; Tauri injects its random sidecar URL at startup.

### Example Request

```powershell
curl.exe -X POST "http://127.0.0.1:8787/api/fridge/receipt/analyze" `
  -F "image=@C:\path\to\receipt.png" `
  -F "purchase_date=2026-06-06" `
  -F "timezone=America/Los_Angeles"
```

### Example Response

```json
{
  "success": true,
  "receipt_id": "receipt_abc123",
  "purchase_date": "2026-06-06",
  "timezone": "America/Los_Angeles",
  "confidence": 0.82,
  "source": "local_ocr",
  "ocr": {
    "text": "ORGANIC MILK 4.99",
    "source": "local_ocr",
    "confidence": 0.78
  },
  "candidates": [
    {
      "item_name": "ORGANIC MILK",
      "normalized_name": "milk",
      "is_fridge_item": true,
      "category": "dairy",
      "storage_type": "fridge",
      "confidence": 0.92,
      "source": "local_parser",
      "reason": "Dairy products usually require refrigeration."
    }
  ],
  "items": [
    {
      "item_name": "ORGANIC MILK",
      "normalized_name": "milk",
      "category": "dairy",
      "storage_type": "fridge",
      "estimated_shelf_life_days": 7,
      "purchase_date": "2026-06-06",
      "estimated_expiration_date": "2026-06-13",
      "confidence": 0.86,
      "source": "local_cache",
      "notes": "exact cache match. Seeded default entry for purchased milk.",
      "cache_hit": true,
      "cache_match_type": "exact",
      "cache_layer": "defaults",
      "metadata": {
        "cache_hit": true,
        "cache_match_type": "exact",
        "cache_layer": "defaults",
        "source": "local_cache",
        "confidence": 0.86
      }
    }
  ],
  "reminder_suggestions": [
    {
      "title": "Use before: ORGANIC MILK",
      "date": "2026-06-13",
      "description": "Receipt item: ORGANIC MILK. Estimated shelf life: 7 days. Confidence: 0.86. Source: local_cache."
    }
  ],
  "trace": {
    "receipt_id": "receipt_abc123",
    "steps": []
  },
  "recoverable_errors": [],
  "warnings": []
}
```

### Inventory API

Fridge inventory is stored per user in the unified SQL database. Shelf-life defaults/cache remain shared resources; receipt images are processed only for the request and are not persisted.

```text
GET    http://127.0.0.1:8787/api/fridge/items
POST   http://127.0.0.1:8787/api/fridge/items
PATCH  http://127.0.0.1:8787/api/fridge/items/{item_id}
DELETE http://127.0.0.1:8787/api/fridge/items/{item_id}
```

Create example:

```powershell
curl.exe -X POST "http://127.0.0.1:8787/api/fridge/items" `
  -H "Content-Type: application/json" `
  -d "{\"item_name\":\"Milk\",\"category\":\"dairy\",\"storage_type\":\"fridge\",\"purchase_date\":\"2026-06-06\",\"estimated_expiration_date\":\"2026-06-13\",\"estimated_shelf_life_days\":7,\"confidence\":0.86,\"source\":\"local_cache\"}"
```

Stable error responses use this shape:

```json
{
  "success": false,
  "error": {
    "code": "invalid_image",
    "message": "Unsupported image extension. Use jpg, jpeg, png, or webp.",
    "recoverable": true
  }
}
```

Current error codes include `invalid_image`, `invalid_request`, `ocr_unavailable`, `ocr_empty_result`, `deepseek_timeout`, `deepseek_rate_limit`, `deepseek_request_failed`, `deepseek_malformed_response`, `deepseek_missing_api_key`, `no_fridge_items_detected`, and `inventory_item_not_found`.

### Frontend Flow

Open the app, click `Fridge`, upload a receipt image, and run analysis. The panel can:

- add analyzed fridge/freezer items to backend inventory
- show current backend inventory
- remove inventory items
- create all-day calendar reminder events from `reminder_suggestions`

### Limitations

- OCR quality depends on image clarity and local Tesseract installation.
- Shelf-life predictions are estimates, not food-safety guarantees.
- DeepSeek calls are skipped in tests and should be mocked in automated coverage.
- Shelf-life estimates still require human judgment; the calendar/event API itself is now available through the authenticated backend.

### Backend Tests

Install the isolated test dependency lock, which adds `httpx2` without changing server or desktop production locks:

```powershell
python -m venv .venv-test
.\.venv-test\Scripts\python.exe -m pip install --require-hashes -r requirements-test.lock
```

```powershell
.\.venv-test\Scripts\python.exe -m unittest discover Office/test/backend
npm.cmd run test:mysql
```

Complete release verification:

```powershell
npm.cmd run version:check
npm.cmd run format:check
npm.cmd run lint
npm.cmd run test:run
npm.cmd run build
npm.cmd run openapi:check
.\.venv-test\Scripts\python.exe -m unittest discover Office/test/backend
npm.cmd run test:e2e:desktop
npm.cmd run test:server:local
npm.cmd run rust:check
npm.cmd audit
python -m pip_audit -r requirements-server.lock
python -m pip_audit -r requirements-desktop.lock
python -m pip_audit -r requirements-test.lock
npm.cmd run desktop:build
```

See `office/docs/deployment.md` for the staged server, desktop, and legacy migration release procedure. Third-party notices are in `THIRD_PARTY_NOTICES.md` and are copied into both Windows package formats.
