# Task Schema, MySQL, Desktop, and Mobile Migration

Last updated: 2026-07-08

## Current Boundary

- `Todo` is the source of truth for pre-calendar work: title, type, due date, `etaMinutes`, `priority`, and `energyNeeded`.
- `Event` is the applied calendar placement. Scheduled tasks create timed events and link back with `linkedTodoId`; the todo links forward with `linkedEventId`.
- The default frontend runtime still uses localStorage/Firestore adapters. The new `/api/calendar/*` backend and API adapters are migration-ready but are not the default path yet.

## Backend API Shape

- `GET/POST /api/calendar/todos`
- `PATCH/DELETE /api/calendar/todos/{id}`
- `GET /api/calendar/events?start=...&end=...`
- `POST /api/calendar/events`
- `PATCH/DELETE /api/calendar/events/{id}`
- `GET/POST /api/calendar/event-types`
- `PATCH /api/calendar/event-types/{id}`
- `POST /api/calendar/import/local-snapshot`

All JSON remains camelCase to match the frontend Zod schemas.

## MySQL Migration Path

1. Keep localStorage as the active default until API contract tests and a manual import have passed.
2. Install backend dependencies from `requirements.txt`: SQLAlchemy, Alembic, and PyMySQL.
3. Convert the SQLite-compatible calendar repository schema into Alembic migrations for MySQL.
4. Add `CALENDAR_DATABASE_URL` for MySQL and keep the current SQLite `CALENDAR_DB_PATH` as the local fallback.
5. Import local browser data through `/api/calendar/import/local-snapshot`.
6. Switch default frontend services to the API adapters only after import verification.

## Multi-App Route

- Shared package: extract `src/domain` first so web, desktop, mobile, and backend contract tests share schemas.
- Desktop: Tauri shell around the Vite app, talking to the backend API. Do not connect Tauri directly to MySQL.
- Mobile: React Native/Expo app with native screens, shared domain schemas, shared API client, and later offline cache/push notifications.
