---
known_error_version: 1
id: ERR-DESKTOP-GLOBAL-SCHEDULING-MIGRATION-004
status: fixed_unverified
severity: high
reported_at: 2026-08-30T00:58:25-07:00
resolved_at: 2026-08-30
root_cause_status: confirmed
regression_test_case: TC-GLOBAL-SCHEDULING-001-v1
regression_test_path: Office/test/backend/test_desktop_migration.py
regression_test_command: node scripts/run-python.mjs -m unittest Office.test.backend.test_desktop_migration
last_verified_at: 2026-08-30T01:54:46.4390909-07:00
verified_against: working-tree@28245bb
waiver_status: none
waiver_confirmed_at: none
superseded_by: none
---

# ERR-DESKTOP-GLOBAL-SCHEDULING-MIGRATION-004 - Old desktop databases fail before global-scheduling migration

## Symptom

An existing desktop SQLite database at a supported older revision cannot complete startup migration after the global scheduler adds provenance columns to `action_event_links`. Migration fails safely with `sqlite3.OperationalError: no such column: action_event_links.managed_by`.

## Trigger

Prepare a desktop database at revision `20260715_0006` or a known false `20260715_0007` stamp, then call `prepare_desktop_database` against the current Alembic head `20260829_0011`.

## Evidence

The approved isolated backend run on 2026-08-30 executed 39 tests and produced five desktop-migration errors with the same missing-column family. Exact reproduced paths include `test_unmarked_0006_layout_is_detected_and_upgraded` and `test_false_0007_stamp_repairs_project_goal_and_installs_constraint`. The migration candidate is discarded and the original database remains protected.

## Expected behavior

Supported old desktop databases must be backed up, repaired using a schema-compatible audit, upgraded through all migrations, validated at the new head, and atomically replace the original only after every check succeeds.

## Root cause

Confirmed in `backend/desktop_migration.py`: revisions `20260715_0006` and `20260715_0007` call `audit(candidate_url, repair=True)` before `_alembic_upgrade`. `backend/audit_integrity.py` builds ORM selects from the current `ActionEventLinkRecord`, which now includes `managed_by` and `proposal_id`; those columns do not exist until migration `20260829_0011`.

## Resolution

Implemented. The integrity audit now reflects each candidate database table and selects only columns that actually exist at that revision. Reference repair, quarantine payload capture, tenant-scoped identity matching, and deletion operate on those reflected tables. The later Alembic upgrade and full candidate integrity/foreign-key validation remain unchanged.

## Verification

Verified at evidence level A. The approved affected backend command completed 43/43 tests, including the supported old desktop database upgrade paths and the global scheduling migration upgrade/rollback contract.

## Manual verification

Not applicable. No waiver has been requested or approved.

## Notes

This is a migration-path blocker for existing desktop data, not a fresh-database creation failure. The backup/candidate replacement safety behavior remained fail-closed during reproduction.

## Evidence invalidation — 2026-09-20

The linked case is stale after covered lifecycle implementation changes. The earlier fix remains historical evidence; this record does not claim current verification. Rerun the complete linked case before restoring verified status.
