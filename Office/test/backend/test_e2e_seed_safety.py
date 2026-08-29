from __future__ import annotations

import importlib.util
import os
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / 'scripts' / 'seed-e2e-users.py'
SPEC = importlib.util.spec_from_file_location('calendar_e2e_seed', SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError('Unable to load the E2E seed safety module.')
seed = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(seed)

DISPOSABLE_URL = (
    'mysql+pymysql://calendar_test:calendar_test@127.0.0.1:3306/'
    'calendar_test?charset=utf8mb4'
)


class E2ESeedSafetyTests(unittest.TestCase):
    def test_accepts_a_dedicated_mysql_test_database(self) -> None:
        self.assertEqual(
            seed.validate_disposable_mysql_url(DISPOSABLE_URL),
            'calendar_test',
        )

    def test_rejects_non_mysql_and_non_test_databases(self) -> None:
        with self.assertRaises(RuntimeError):
            seed.validate_disposable_mysql_url('sqlite:///calendar_test.sqlite3')
        with self.assertRaises(RuntimeError):
            seed.validate_disposable_mysql_url(
                'mysql+pymysql://user:password@example.invalid/calendar_prod'
            )

    def test_requires_explicit_e2e_url_instead_of_application_fallback(self) -> None:
        with patch.dict(
            os.environ,
            {
                'CALENDAR_DATABASE_URL': DISPOSABLE_URL,
                'CALENDAR_E2E_DATABASE_URL': '',
            },
            clear=False,
        ):
            with self.assertRaises(RuntimeError):
                seed.require_disposable_e2e_database()

    def test_requires_the_seed_target_to_match_the_validated_url(self) -> None:
        with patch.dict(
            os.environ,
            {
                'CALENDAR_DATABASE_URL': DISPOSABLE_URL.replace(
                    'calendar_test?charset', 'other_test?charset'
                ),
                'CALENDAR_E2E_DATABASE_URL': DISPOSABLE_URL,
            },
            clear=False,
        ):
            with self.assertRaises(RuntimeError):
                seed.require_disposable_e2e_database()


if __name__ == '__main__':
    unittest.main()
