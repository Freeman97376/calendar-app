from __future__ import annotations

import os
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def executable_dir() -> Path:
    return Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else PROJECT_ROOT


def portable_root() -> Path | None:
    root = executable_dir()
    return root if (root / "portable.mode").exists() else None


def application_data_dir() -> Path:
    configured = os.getenv("CALENDAR_DATA_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    portable = portable_root()
    if portable:
        data_dir = portable / "data"
        try:
            data_dir.mkdir(parents=True, exist_ok=True)
            probe = data_dir / ".write-test"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink()
            return data_dir
        except OSError:
            pass
    local_app_data = os.getenv("LOCALAPPDATA", "").strip()
    base = Path(local_app_data) if local_app_data else Path.home() / "AppData" / "Local"
    return base / "CalendarApp"


def project_env_paths() -> tuple[Path, Path]:
    data_env = application_data_dir() / ".env.local"
    return data_env, PROJECT_ROOT / ".env.local"
