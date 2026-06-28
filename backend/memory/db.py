from __future__ import annotations

import os
import sqlite3
from contextlib import closing
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = PROJECT_ROOT / "backend" / "data" / "long_term_memory.sqlite3"
SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def memory_db_path() -> Path:
    configured = os.getenv("CALENDAR_MEMORY_DB_PATH", "").strip()
    return Path(configured) if configured else DEFAULT_DB_PATH


def connect(path: Path | str | None = None) -> sqlite3.Connection:
    db_path = Path(path) if path else memory_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(path: Path | str | None = None) -> Path:
    db_path = Path(path) if path else memory_db_path()
    with closing(connect(db_path)) as connection:
        connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        ensure_tool_run_columns(connection)
        connection.commit()
    return db_path


def ensure_tool_run_columns(connection: sqlite3.Connection) -> None:
    columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(tool_runs)").fetchall()
    }
    additions = {
        "intent": "ALTER TABLE tool_runs ADD COLUMN intent TEXT NOT NULL DEFAULT ''",
        "input_summary": "ALTER TABLE tool_runs ADD COLUMN input_summary TEXT NOT NULL DEFAULT ''",
        "output_summary": "ALTER TABLE tool_runs ADD COLUMN output_summary TEXT NOT NULL DEFAULT ''",
    }
    for column, statement in additions.items():
        if column not in columns:
            connection.execute(statement)
