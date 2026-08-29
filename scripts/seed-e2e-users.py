from __future__ import annotations

import os
import re
import sys
from pathlib import Path

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.auth import AuthService
from backend.database import create_database_engine, require_migration_head


DISPOSABLE_DATABASE_NAME_PATTERN = re.compile(
    r"(?:^|[_-])(?:test|e2e)(?:$|[_-])", re.IGNORECASE
)


def validate_disposable_mysql_url(value: str) -> str:
    if not value:
        raise RuntimeError(
            "Server E2E requires an explicit CALENDAR_E2E_DATABASE_URL; "
            "CALENDAR_DATABASE_URL is never accepted as a fallback."
        )
    try:
        parsed = make_url(value)
    except (ArgumentError, TypeError, ValueError) as error:
        raise RuntimeError(
            "CALENDAR_E2E_DATABASE_URL must be a valid MySQL SQLAlchemy URL."
        ) from error
    if not parsed.drivername.lower().startswith("mysql+"):
        raise RuntimeError(
            "CALENDAR_E2E_DATABASE_URL must use an explicit mysql+ SQLAlchemy driver."
        )
    database_name = (parsed.database or "").strip()
    if not DISPOSABLE_DATABASE_NAME_PATTERN.search(database_name):
        raise RuntimeError(
            "CALENDAR_E2E_DATABASE_URL must target a dedicated database whose name "
            "contains a test or e2e segment."
        )
    return database_name


def require_disposable_e2e_database() -> str:
    explicit_url = os.getenv("CALENDAR_E2E_DATABASE_URL", "").strip()
    database_name = validate_disposable_mysql_url(explicit_url)
    configured_url = os.getenv("CALENDAR_DATABASE_URL", "").strip()
    if configured_url != explicit_url:
        raise RuntimeError(
            "CALENDAR_DATABASE_URL must exactly match the validated "
            "CALENDAR_E2E_DATABASE_URL before E2E account seeding."
        )
    return database_name


def main() -> None:
    if os.getenv("CALENDAR_E2E_ALLOW_SEED") != "1":
        raise RuntimeError("Refusing to seed users outside the explicit E2E environment.")
    database_name = require_disposable_e2e_database()
    password = os.getenv("CALENDAR_E2E_PASSWORD", "")
    if len(password) < 12:
        raise RuntimeError("CALENDAR_E2E_PASSWORD must contain at least 12 characters.")

    engine = create_database_engine()
    if engine.dialect.name != "mysql":
        raise RuntimeError("Server E2E account seeding requires MySQL.")
    if (engine.url.database or "").strip() != database_name:
        raise RuntimeError("The connected database does not match the validated E2E database.")
    require_migration_head(engine)
    auth = AuthService(engine)
    existing = {item["username"] for item in auth.list_users()}
    for username in ("e2e_alice", "e2e_bob"):
        if username in existing:
            auth.set_active(username, True)
            auth.unlock(username)
            auth.set_password(username, password)
        else:
            auth.create_user(username, password, admin=username == "e2e_alice")


if __name__ == "__main__":
    main()
