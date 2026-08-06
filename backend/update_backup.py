from __future__ import annotations

import hashlib
import re
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.engine import Engine


SEMVER_PATTERN = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$"
)


class PreUpdateBackupError(ValueError):
    pass


def _clean_version(value: str, field_name: str) -> str:
    version = value.strip()
    if not SEMVER_PATTERN.fullmatch(version):
        raise PreUpdateBackupError(f"{field_name} must be a valid semantic version.")
    return version


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _prune_old_backups(backup_dir: Path, keep: int) -> None:
    snapshots = sorted(
        backup_dir.glob("pre-update-*.sqlite3"),
        key=lambda path: path.stat().st_mtime_ns,
        reverse=True,
    )
    for snapshot in snapshots[max(keep, 1) :]:
        snapshot.unlink(missing_ok=True)
        snapshot.with_suffix(f"{snapshot.suffix}.sha256").unlink(missing_ok=True)


def create_pre_update_backup(
    engine: Engine,
    *,
    from_version: str,
    to_version: str,
    keep: int = 3,
) -> dict[str, Any]:
    if engine.dialect.name != "sqlite":
        raise PreUpdateBackupError("Pre-update snapshots are available only for desktop SQLite data.")

    source_value = str(engine.url.database or "").strip()
    if not source_value or source_value == ":memory:":
        raise PreUpdateBackupError("The desktop SQLite database does not have a durable file path.")
    source_path = Path(source_value).expanduser().resolve()
    if not source_path.is_file():
        raise PreUpdateBackupError("The desktop SQLite database file could not be found.")

    current = _clean_version(from_version, "fromVersion")
    target = _clean_version(to_version, "toVersion")
    created_at = datetime.now(timezone.utc)
    stamp = created_at.strftime("%Y%m%dT%H%M%S%fZ")
    backup_dir = source_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    filename = f"pre-update-{current}-to-{target}-{stamp}.sqlite3"
    destination = backup_dir / filename
    temporary = backup_dir / f".{filename}.tmp"

    try:
        with closing(sqlite3.connect(source_path)) as source, closing(sqlite3.connect(temporary)) as backup:
            source.backup(backup)
            backup.commit()
        temporary.replace(destination)
        checksum = _sha256(destination)
        checksum_path = destination.with_suffix(f"{destination.suffix}.sha256")
        checksum_path.write_text(f"{checksum}  {destination.name}\n", encoding="utf-8")
        _prune_old_backups(backup_dir, keep)
    except OSError as exc:
        raise PreUpdateBackupError(f"Unable to create the pre-update backup: {exc}") from exc
    except sqlite3.Error as exc:
        raise PreUpdateBackupError(f"Unable to snapshot the desktop database: {exc}") from exc
    finally:
        temporary.unlink(missing_ok=True)

    return {
        "fileName": destination.name,
        "createdAt": created_at.isoformat().replace("+00:00", "Z"),
        "fromVersion": current,
        "toVersion": target,
        "checksum": checksum,
        "sizeBytes": destination.stat().st_size,
    }
