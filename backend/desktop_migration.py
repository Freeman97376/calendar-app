from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
from contextlib import closing, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

from .audit_integrity import audit
from .database import ALEMBIC_HEAD, PROJECT_ROOT


class DesktopMigrationError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        database_path: Path,
        backup_path: Path | None = None,
        diagnostic_path: Path | None = None,
    ) -> None:
        super().__init__(message)
        self.database_path = database_path
        self.backup_path = backup_path
        self.diagnostic_path = diagnostic_path

    def recovery_payload(self) -> dict[str, str | None]:
        return {
            "code": "desktop_migration_failed",
            "message": str(self),
            "databasePath": str(self.database_path),
            "backupPath": str(self.backup_path) if self.backup_path else None,
            "diagnosticPath": str(self.diagnostic_path) if self.diagnostic_path else None,
        }


KNOWN_REVISIONS_BY_TABLE = (
    ("auth_throttle_buckets", "20260715_0006"),
    ("ai_usage_monthly", "20260714_0005"),
    ("goal_control_policies", "20260714_0004"),
    ("conversation_threads", "20260714_0003"),
    ("users", "20260713_0002"),
    ("events", "20260708_0001"),
)

EXPECTED_0007_RELATIONSHIPS = (
    ("projects", ("user_id", "goal_id"), "goals"),
    ("milestones", ("user_id", "project_id"), "projects"),
    ("action_items", ("user_id", "project_id"), "projects"),
    ("conversation_threads", ("user_id", "project_id"), "projects"),
    ("conversation_messages", ("user_id", "thread_id"), "conversation_threads"),
    ("check_ins", ("user_id", "project_id"), "projects"),
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sqlite_backup(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(source)) as source_db:
        with closing(sqlite3.connect(destination)) as destination_db:
            source_db.backup(destination_db)


@contextmanager
def _migration_lock(database_path: Path) -> Iterator[None]:
    lock_path = database_path.with_suffix(f"{database_path.suffix}.migration.lock")
    try:
        descriptor = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as error:
        raise DesktopMigrationError(
            "Another Calendar App database migration is already in progress.",
            database_path=database_path,
            diagnostic_path=lock_path,
        ) from error
    try:
        os.write(descriptor, json.dumps({"pid": os.getpid(), "startedAt": _now_iso()}).encode("utf-8"))
        os.close(descriptor)
        yield
    finally:
        try:
            os.close(descriptor)
        except OSError:
            pass
        lock_path.unlink(missing_ok=True)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _has_expected_0007_relationships(inspector: object) -> bool:
    for table_name, columns, referred_table in EXPECTED_0007_RELATIONSHIPS:
        foreign_keys = inspector.get_foreign_keys(table_name)  # type: ignore[attr-defined]
        if not any(
            tuple(item.get("constrained_columns") or ()) == columns
            and item.get("referred_table") == referred_table
            for item in foreign_keys
        ):
            return False
    return True


def _write_revision(connection: object, revision: str) -> None:
    connection.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"))  # type: ignore[attr-defined]
    connection.execute(text("DELETE FROM alembic_version"))  # type: ignore[attr-defined]
    connection.execute(text("INSERT INTO alembic_version (version_num) VALUES (:revision)"), {"revision": revision})  # type: ignore[attr-defined]


def _correct_known_revision(database_url: str) -> str | None:
    engine = create_engine(database_url, future=True, poolclass=NullPool)
    try:
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        application_tables = tables - {"alembic_version", "sqlite_sequence"}
        if not application_tables:
            return None
        current: str | None = None
        if "alembic_version" in tables:
            with engine.connect() as connection:
                current = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one_or_none()
        if current == "20260715_0007" and not _has_expected_0007_relationships(inspector):
            with engine.begin() as connection:
                _write_revision(connection, "20260715_0006")
            return "20260715_0006"
        if current:
            return current

        detected = next(
            (revision for marker, revision in KNOWN_REVISIONS_BY_TABLE if marker in application_tables),
            None,
        )
        if detected is None:
            raise RuntimeError("The database layout does not match a supported Calendar App revision.")
        if detected == "20260715_0006" and _has_expected_0007_relationships(inspector):
            detected = "20260715_0007"
        with engine.begin() as connection:
            _write_revision(connection, detected)
        return detected
    finally:
        engine.dispose()


def _alembic_upgrade(database_url: str, target: str = "head") -> None:
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(PROJECT_ROOT / "backend" / "calendar" / "migrations"))
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    command.upgrade(config, target)


def _validate_candidate(database_path: Path) -> None:
    with closing(sqlite3.connect(database_path)) as connection:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()
        if integrity != ("ok",):
            raise RuntimeError(f"SQLite integrity_check failed: {integrity!r}")
        foreign_key_issues = connection.execute("PRAGMA foreign_key_check").fetchall()
        if foreign_key_issues:
            raise RuntimeError(f"SQLite foreign_key_check reported {len(foreign_key_issues)} issue(s).")
        revision = connection.execute("SELECT version_num FROM alembic_version").fetchone()
        if revision != (ALEMBIC_HEAD,):
            raise RuntimeError(f"Migration finished at {revision!r}; expected {ALEMBIC_HEAD}.")


def database_path_from_url(database_url: str) -> Path:
    parsed = make_url(database_url)
    if parsed.drivername != "sqlite" or not parsed.database or parsed.database == ":memory:":
        raise DesktopMigrationError(
            "Desktop mode requires a durable SQLite database path.",
            database_path=Path(str(parsed.database or ":memory:")),
        )
    return Path(parsed.database).expanduser().resolve()


def prepare_desktop_database(database_url: str) -> dict[str, str | None]:
    database_path = database_path_from_url(database_url)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    backup_path: Path | None = None
    candidate_path = database_path.with_suffix(f"{database_path.suffix}.migration-candidate")
    diagnostic_path = database_path.parent / "calendar-migration-error.json"

    with _migration_lock(database_path):
        candidate_path.unlink(missing_ok=True)
        try:
            if database_path.is_file() and database_path.stat().st_size:
                stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
                backup_dir = database_path.parent / "backups"
                backup_path = backup_dir / f"pre-migration-{stamp}.sqlite3"
                _sqlite_backup(database_path, backup_path)
                checksum = _sha256(backup_path)
                backup_path.with_suffix(f"{backup_path.suffix}.sha256").write_text(
                    f"{checksum}  {backup_path.name}\n",
                    encoding="utf-8",
                )
                shutil.copy2(backup_path, candidate_path)
            else:
                sqlite3.connect(candidate_path).close()

            candidate_url = f"sqlite:///{candidate_path.as_posix()}"
            revision = _correct_known_revision(candidate_url)
            if revision in {"20260715_0006", "20260715_0007"}:
                audit(candidate_url, repair=True)
            _alembic_upgrade(candidate_url)
            _validate_candidate(candidate_path)
            os.replace(candidate_path, database_path)
            diagnostic_path.unlink(missing_ok=True)
            return {
                "databasePath": str(database_path),
                "backupPath": str(backup_path) if backup_path else None,
                "revision": ALEMBIC_HEAD,
            }
        except Exception as error:
            candidate_path.unlink(missing_ok=True)
            diagnostic = {
                "code": "desktop_migration_failed",
                "message": str(error),
                "databasePath": str(database_path),
                "backupPath": str(backup_path) if backup_path else None,
                "occurredAt": _now_iso(),
            }
            try:
                diagnostic_path.write_text(json.dumps(diagnostic, indent=2), encoding="utf-8")
            except OSError:
                diagnostic_path = None
            raise DesktopMigrationError(
                f"Unable to migrate the desktop database safely: {error}",
                database_path=database_path,
                backup_path=backup_path,
                diagnostic_path=diagnostic_path,
            ) from error
