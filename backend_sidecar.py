from __future__ import annotations

import os
import sys
import traceback
from datetime import UTC, datetime
from pathlib import Path


_LOG_STREAM = None

def _data_directory_from_argv() -> Path:
    try:
        index = sys.argv.index("--data-dir")
        value = sys.argv[index + 1].strip()
        if value:
            return Path(value)
    except (ValueError, IndexError):
        pass
    local_app_data = os.getenv("LOCALAPPDATA", "").strip()
    root = Path(local_app_data) if local_app_data else Path.home() / "AppData" / "Local"
    return root / "CalendarApp"


def _record_unexpected_exit(error: BaseException | None = None) -> None:
    try:
        data_directory = _data_directory_from_argv()
        data_directory.mkdir(parents=True, exist_ok=True)
        detail = (
            "".join(traceback.format_exception(error))
            if error is not None
            else "Backend main() returned without serving requests.\n"
        )
        (data_directory / "calendar-backend-error.log").write_text(
            f"{datetime.now(UTC).isoformat()}\n{detail}",
            encoding="utf-8",
        )
    except OSError:
        pass


def _configure_file_logging() -> None:
    global _LOG_STREAM
    try:
        data_directory = _data_directory_from_argv()
        data_directory.mkdir(parents=True, exist_ok=True)
        log_path = data_directory / "calendar-backend.log"
        if log_path.exists() and log_path.stat().st_size > 2_000_000:
            previous = data_directory / "calendar-backend.previous.log"
            previous.unlink(missing_ok=True)
            log_path.replace(previous)
        _LOG_STREAM = log_path.open("a", encoding="utf-8", buffering=1)
        # Stdout is the private launch protocol consumed by Tauri. Keep it on
        # the inherited pipe so the one-time launch token never enters a log.
        # Runtime diagnostics continue to the rotating local stderr log.
        sys.stderr = _LOG_STREAM
        print(
            f"\n{datetime.now(UTC).isoformat()} Calendar desktop backend starting",
            file=_LOG_STREAM,
            flush=True,
        )
    except OSError:
        _LOG_STREAM = None


if __name__ == "__main__":
    _configure_file_logging()
    try:
        from backend.server import main

        main()
    except BaseException as error:
        _record_unexpected_exit(error)
        raise
    else:
        _record_unexpected_exit()
