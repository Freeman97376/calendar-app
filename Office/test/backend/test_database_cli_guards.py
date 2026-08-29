from __future__ import annotations

import importlib.util
import os
import sys
import types
import unittest
from contextlib import nullcontext, redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from backend import audit_integrity, manage_users, migrate_legacy


ROOT = Path(__file__).resolve().parents[3]
MIGRATION_ENV_PATH = ROOT / 'backend' / 'calendar' / 'migrations' / 'env.py'
MYSQL_URL = 'mysql+pymysql://calendar_admin:secret@127.0.0.1/calendar_app'


class FakeAlembicConfig:
    config_file_name = None
    config_ini_section = 'alembic'

    def __init__(self) -> None:
        self.configured_url = ''

    def get_main_option(self, _name: str) -> str:
        return self.configured_url

    def get_section(self, _name: str, _default: object) -> dict[str, str]:
        return {}


class FakeAlembicContext:
    def __init__(self) -> None:
        self.config = FakeAlembicConfig()
        self.command_line_url = 'sqlite:///:memory:'

    def get_x_argument(self, *, as_dictionary: bool) -> dict[str, str]:
        if not as_dictionary:
            raise AssertionError('The migration environment must request dictionary arguments.')
        return {'database_url': self.command_line_url} if self.command_line_url else {}

    def is_offline_mode(self) -> bool:
        return True

    def configure(self, **_kwargs: object) -> None:
        return None

    def begin_transaction(self) -> object:
        return nullcontext()

    def run_migrations(self) -> None:
        return None


def load_migration_environment() -> tuple[types.ModuleType, FakeAlembicContext]:
    fake_context = FakeAlembicContext()
    fake_alembic = types.ModuleType('alembic')
    fake_alembic.context = fake_context
    spec = importlib.util.spec_from_file_location('calendar_test_migration_env', MIGRATION_ENV_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError('Unable to load the Alembic migration environment.')
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, {'alembic': fake_alembic}):
        spec.loader.exec_module(module)
    return module, fake_context


class ManageUsersDatabaseGuardTests(unittest.TestCase):
    def test_missing_database_url_fails_before_engine_creation(self) -> None:
        error_output = StringIO()
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(manage_users, 'load_env_files'),
            patch.object(manage_users, 'project_env_paths', return_value=()),
            patch.object(manage_users, 'create_database_engine') as create_engine,
            redirect_stderr(error_output),
        ):
            result = manage_users.main(['list'])

        self.assertEqual(result, 2)
        create_engine.assert_not_called()
        self.assertIn('CALENDAR_DATABASE_URL', error_output.getvalue())

    def test_sqlite_database_url_fails_before_engine_creation(self) -> None:
        with (
            patch.dict(os.environ, {'CALENDAR_DATABASE_URL': 'sqlite:///local.sqlite3'}, clear=True),
            patch.object(manage_users, 'load_env_files'),
            patch.object(manage_users, 'project_env_paths', return_value=()),
            patch.object(manage_users, 'create_database_engine') as create_engine,
            redirect_stderr(StringIO()),
        ):
            result = manage_users.main(['list'])

        self.assertEqual(result, 2)
        create_engine.assert_not_called()

    def test_invalid_or_non_mysql_url_error_does_not_disclose_password(self) -> None:
        password = 'do-not-disclose-this-password'
        candidates = (
            f'postgresql://calendar:{password}@127.0.0.1/calendar_app',
            f'mysql+pymysql://calendar:{password}@127.0.0.1:badport/calendar_app',
        )
        for candidate in candidates:
            with self.subTest(candidate=candidate):
                error_output = StringIO()
                with (
                    patch.dict(os.environ, {'CALENDAR_DATABASE_URL': candidate}, clear=True),
                    patch.object(manage_users, 'load_env_files'),
                    patch.object(manage_users, 'project_env_paths', return_value=()),
                    patch.object(manage_users, 'create_database_engine') as create_engine,
                    redirect_stderr(error_output),
                ):
                    result = manage_users.main(['list'])
                self.assertEqual(result, 2)
                create_engine.assert_not_called()
                self.assertNotIn(password, error_output.getvalue())

    def test_valid_mysql_path_requires_migration_head_before_account_access(self) -> None:
        engine = SimpleNamespace(dialect=SimpleNamespace(name='mysql'))
        service = Mock()
        service.list_users.return_value = []
        standard_output = StringIO()
        with (
            patch.dict(os.environ, {'CALENDAR_DATABASE_URL': MYSQL_URL}, clear=True),
            patch.object(manage_users, 'load_env_files'),
            patch.object(manage_users, 'project_env_paths', return_value=()),
            patch.object(manage_users, 'create_database_engine', return_value=engine) as create_engine,
            patch.object(manage_users, 'require_migration_head') as require_head,
            patch.object(manage_users, 'AuthService', return_value=service) as auth_service,
            redirect_stdout(standard_output),
        ):
            result = manage_users.main(['list'])

        self.assertEqual(result, 0)
        create_engine.assert_called_once_with(MYSQL_URL)
        require_head.assert_called_once_with(engine)
        auth_service.assert_called_once_with(engine)
        self.assertEqual(standard_output.getvalue().strip(), '[]')


class IntegrityAuditDatabaseGuardTests(unittest.TestCase):
    def test_missing_database_url_fails_before_audit(self) -> None:
        error_output = StringIO()
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(audit_integrity, 'audit') as audit,
            redirect_stderr(error_output),
        ):
            result = audit_integrity.main([])

        self.assertEqual(result, 2)
        audit.assert_not_called()
        self.assertIn('explicit MySQL database URL', error_output.getvalue())

    def test_non_mysql_database_url_fails_before_audit(self) -> None:
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(audit_integrity, 'audit') as audit,
            redirect_stderr(StringIO()),
        ):
            result = audit_integrity.main(
                ['--database-url', 'sqlite:///desktop.sqlite3', '--archive-and-repair']
            )

        self.assertEqual(result, 2)
        audit.assert_not_called()

    def test_invalid_url_error_does_not_disclose_password(self) -> None:
        password = 'integrity-secret-must-not-leak'
        error_output = StringIO()
        with (
            patch.dict(
                os.environ,
                {'CALENDAR_DATABASE_URL': f'postgresql://audit:{password}@localhost/db'},
                clear=True,
            ),
            patch.object(audit_integrity, 'audit') as audit,
            redirect_stderr(error_output),
        ):
            result = audit_integrity.main([])

        self.assertEqual(result, 2)
        audit.assert_not_called()
        self.assertNotIn(password, error_output.getvalue())

    def test_explicit_mysql_url_reaches_audit_after_validation(self) -> None:
        report = {'issueCount': 0}
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(audit_integrity, 'audit', return_value=report) as audit,
            redirect_stdout(StringIO()),
        ):
            result = audit_integrity.main(
                ['--database-url', MYSQL_URL, '--archive-and-repair']
            )

        self.assertEqual(result, 0)
        audit.assert_called_once_with(MYSQL_URL, True)


class LegacyImportDatabaseGuardTests(unittest.TestCase):
    def test_missing_database_url_fails_before_migration(self) -> None:
        error_output = StringIO()
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(migrate_legacy, 'migrate') as migrate,
            redirect_stderr(error_output),
        ):
            result = migrate_legacy.main(['--username', 'owner'])

        self.assertEqual(result, 2)
        migrate.assert_not_called()
        self.assertIn('explicit MySQL database URL', error_output.getvalue())

    def test_non_mysql_database_url_fails_before_migration(self) -> None:
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(migrate_legacy, 'migrate') as migrate,
            redirect_stderr(StringIO()),
        ):
            result = migrate_legacy.main(
                [
                    '--username',
                    'owner',
                    '--database-url',
                    'sqlite:///desktop.sqlite3',
                ]
            )

        self.assertEqual(result, 2)
        migrate.assert_not_called()

    def test_invalid_url_error_does_not_disclose_password(self) -> None:
        password = 'legacy-secret-must-not-leak'
        error_output = StringIO()
        with (
            patch.dict(
                os.environ,
                {'CALENDAR_DATABASE_URL': f'postgresql://legacy:{password}@localhost/db'},
                clear=True,
            ),
            patch.object(migrate_legacy, 'migrate') as migrate,
            redirect_stderr(error_output),
        ):
            result = migrate_legacy.main(['--username', 'owner'])

        self.assertEqual(result, 2)
        migrate.assert_not_called()
        self.assertNotIn(password, error_output.getvalue())

    def test_explicit_mysql_url_reaches_migration_after_validation(self) -> None:
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(migrate_legacy, 'migrate', return_value={}) as migrate,
            redirect_stdout(StringIO()),
        ):
            result = migrate_legacy.main(
                ['--username', 'owner', '--database-url', MYSQL_URL]
            )

        self.assertEqual(result, 0)
        args = migrate.call_args.args[0]
        self.assertEqual(args.database_url, MYSQL_URL)
        self.assertEqual(args.username, 'owner')

    def test_mysql_migration_requires_head_before_account_access(self) -> None:
        engine = SimpleNamespace(
            dialect=SimpleNamespace(name='mysql'),
            dispose=Mock(),
        )
        args = SimpleNamespace(
            database_url=MYSQL_URL,
            username='owner',
            calendar_db=Path('calendar.sqlite3'),
            memory_db=Path('memory.sqlite3'),
            fridge_json=Path('fridge.json'),
        )
        with (
            patch.object(
                migrate_legacy,
                'create_database_engine',
                return_value=engine,
            ),
            patch.object(
                migrate_legacy,
                'require_migration_head',
                side_effect=RuntimeError('wrong migration head'),
            ) as require_head,
            patch.object(migrate_legacy, 'AuthService') as auth_service,
        ):
            with self.assertRaisesRegex(RuntimeError, 'wrong migration head'):
                migrate_legacy.migrate(args)

        require_head.assert_called_once_with(engine)
        auth_service.assert_not_called()
        engine.dispose.assert_called_once_with()


class AlembicDatabaseUrlGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.migration_env, cls.fake_context = load_migration_environment()

    def setUp(self) -> None:
        self.fake_context.command_line_url = ''
        self.fake_context.config.configured_url = ''

    def test_url_precedence_is_command_line_then_config_then_environment(self) -> None:
        self.fake_context.command_line_url = 'mysql+pymysql://cli/db'
        self.fake_context.config.configured_url = 'mysql+pymysql://config/db'
        with patch.dict(os.environ, {'CALENDAR_DATABASE_URL': 'mysql+pymysql://env/db'}, clear=True):
            self.assertEqual(self.migration_env.database_url(), 'mysql+pymysql://cli/db')

        self.fake_context.command_line_url = ''
        with patch.dict(os.environ, {'CALENDAR_DATABASE_URL': 'mysql+pymysql://env/db'}, clear=True):
            self.assertEqual(self.migration_env.database_url(), 'mysql+pymysql://config/db')

        self.fake_context.config.configured_url = ''
        with patch.dict(os.environ, {'CALENDAR_DATABASE_URL': 'mysql+pymysql://env/db'}, clear=True):
            self.assertEqual(self.migration_env.database_url(), 'mysql+pymysql://env/db')

    def test_missing_explicit_url_fails_instead_of_using_local_sqlite(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, 'requires an explicit database URL'):
                self.migration_env.database_url()

    def test_selector_ignores_blank_sources(self) -> None:
        selected = self.migration_env.select_database_url(
            command_line_url=' ',
            configured_url='\t',
            environment_url=' sqlite:///explicit-desktop.sqlite3 ',
        )
        self.assertEqual(selected, 'sqlite:///explicit-desktop.sqlite3')


if __name__ == '__main__':
    unittest.main()
