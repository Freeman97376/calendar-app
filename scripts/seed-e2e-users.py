from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.auth import AuthService
from backend.database import create_database_engine, require_migration_head


def main() -> None:
    if os.getenv("CALENDAR_E2E_ALLOW_SEED") != "1":
        raise RuntimeError("Refusing to seed users outside the explicit E2E environment.")
    password = os.getenv("CALENDAR_E2E_PASSWORD", "")
    if len(password) < 12:
        raise RuntimeError("CALENDAR_E2E_PASSWORD must contain at least 12 characters.")

    engine = create_database_engine()
    if engine.dialect.name != "mysql":
        raise RuntimeError("Server E2E account seeding requires MySQL.")
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
