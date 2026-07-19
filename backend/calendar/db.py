from __future__ import annotations

from pathlib import Path

from ..database import DEFAULT_DB_PATH, create_database_engine, database_url, initialize_schema


def calendar_db_path() -> Path:
    url = database_url()
    if not url.startswith("sqlite:///"):
        raise ValueError("CALENDAR_DB_PATH is only available for SQLite databases")
    return Path(url.removeprefix("sqlite:///"))


def initialize_database(path: Path | str | None = None) -> Path:
    db_path = Path(path) if path else calendar_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    initialize_schema(create_database_engine(db_path=db_path))
    return db_path
