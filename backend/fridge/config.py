from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = PROJECT_ROOT / "backend" / "data"


def load_env_files(*paths: Path | str) -> None:
    for path_value in paths:
        path = Path(path_value)
        if not path.exists():
            continue

        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def fridge_data_dir() -> Path:
    configured = os.getenv("FRIDGE_DATA_DIR", "").strip()
    return Path(configured) if configured else DEFAULT_DATA_DIR
