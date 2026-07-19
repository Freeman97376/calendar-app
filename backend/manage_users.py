from __future__ import annotations

import argparse
import getpass
import json
import sys

from .auth import AuthError, AuthService
from .database import create_database_engine, initialize_schema, require_migration_head
from .fridge.config import load_env_files
from .server_paths import project_env_paths


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Manage Calendar App server accounts.")
    commands = result.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create")
    create.add_argument("--username", required=True)
    create.add_argument("--admin", action="store_true")
    password = commands.add_parser("set-password")
    password.add_argument("--username", required=True)
    for name in ("enable", "disable", "unlock"):
        command = commands.add_parser(name)
        command.add_argument("--username", required=True)
    commands.add_parser("list")
    return result


def prompted_password() -> str:
    first = getpass.getpass("Password: ")
    second = getpass.getpass("Confirm password: ")
    if first != second:
        raise AuthError("password_mismatch", "Passwords do not match.")
    return first


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    load_env_files(*project_env_paths())
    engine = create_database_engine()
    if engine.dialect.name == "mysql":
        require_migration_head(engine)
    else:
        initialize_schema(engine)
    service = AuthService(engine)
    try:
        if args.command == "create":
            print(json.dumps(service.create_user(args.username, prompted_password(), admin=args.admin), indent=2))
        elif args.command == "set-password":
            service.set_password(args.username, prompted_password())
            print("Password updated and existing sessions revoked.")
        elif args.command == "enable":
            service.set_active(args.username, True)
            print("Account enabled.")
        elif args.command == "disable":
            service.set_active(args.username, False)
            print("Account disabled and existing sessions revoked.")
        elif args.command == "unlock":
            service.unlock(args.username)
            print("Account unlocked.")
        else:
            print(json.dumps(service.list_users(), indent=2))
    except AuthError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
