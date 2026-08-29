from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from backend.database import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def select_database_url(
    *,
    command_line_url: str | None,
    configured_url: str | None,
    environment_url: str | None,
) -> str:
    for candidate in (command_line_url, configured_url, environment_url):
        if candidate and candidate.strip():
            return candidate.strip()
    raise RuntimeError(
        'Alembic requires an explicit database URL via -x database_url=..., '
        'alembic.ini sqlalchemy.url, or CALENDAR_DATABASE_URL.'
    )


def database_url() -> str:
    command_line_url = context.get_x_argument(as_dictionary=True).get("database_url")
    configured_url = config.get_main_option("sqlalchemy.url")
    return select_database_url(
        command_line_url=command_line_url,
        configured_url=configured_url,
        environment_url=os.getenv('CALENDAR_DATABASE_URL'),
    )


def run_migrations_offline() -> None:
    context.configure(
        url=database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = database_url()
    connectable = engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=connection.dialect.name == "sqlite",
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
