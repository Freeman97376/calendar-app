from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.server import create_app


DEFAULT_OUTPUT = ROOT / "openapi" / "calendar-app.openapi.json"


def rendered_schema() -> str:
    with tempfile.TemporaryDirectory(prefix="calendar-openapi-") as raw_directory:
        database_path = Path(raw_directory) / "calendar.sqlite3"
        database_url = f"sqlite:///{database_path.as_posix()}"
        app = create_app(
            mode="desktop",
            configured_database_url=database_url,
            launch_token="openapi-export",
        )
        return json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the Calendar App OpenAPI snapshot.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output = args.output.resolve()
    generated = rendered_schema()

    if args.check:
        if not output.is_file() or output.read_text(encoding="utf-8") != generated:
            print(
                f"OpenAPI snapshot is stale: {output}. "
                "Run python scripts/export-openapi.py.",
                file=sys.stderr,
            )
            return 1
        print(f"OpenAPI snapshot is current: {output}")
        return 0

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(generated, encoding="utf-8", newline="\n")
    print(f"Wrote {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
