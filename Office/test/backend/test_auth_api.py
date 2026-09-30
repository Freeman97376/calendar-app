from __future__ import annotations

import hashlib
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import date
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.auth import AuthError, AuthService
from backend.database import ALEMBIC_HEAD, AIUsageEventRecord, SessionRecord, UserRecord, create_database_engine
from backend.desktop_migration import _alembic_upgrade
from backend.fridge.deepseek_client import DeepSeekRateLimitError, DeepSeekRequestError, DeepSeekTimeoutError
from backend.fridge.models import OCRResult, ShelfLifePrediction, expiration_date_for
from backend.goal_control import GoalControlService
from backend.server import MeteredReceiptDeepSeekClient, create_app
from backend.user_data import checksum_entities


RECEIPT_PNG_BYTES = b'\x89PNG\r\n\x1a\n' + b'fake receipt image'


class SequenceReceiptOCR:
    def __init__(self, results: list[OCRResult]) -> None:
        self.results = list(results)

    def extract_text(self, _image_bytes: bytes, _extension: str) -> OCRResult:
        return self.results.pop(0)


class FakeReceiptProviderConfig:
    model = 'fake-fridge-model'


class FakeReceiptProvider:
    def __init__(self, outcomes: list[object]) -> None:
        self.config = FakeReceiptProviderConfig()
        self.outcomes = list(outcomes)
        self.calls: list[tuple[str, list[str], date]] = []

    def extract_fridge_items(
        self,
        receipt_text: str,
        candidate_items: list[str],
        purchase_date: date,
    ) -> list[ShelfLifePrediction]:
        self.calls.append((receipt_text, candidate_items, purchase_date))
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome  # type: ignore[return-value]


def receipt_prediction(
    item_name: str,
    purchase_date: date,
    *,
    notes: str = 'Fake provider estimate.',
) -> ShelfLifePrediction:
    normalized_name = item_name.lower()
    return ShelfLifePrediction(
        item_name=item_name,
        normalized_name=normalized_name,
        category='plant_protein',
        storage_type='fridge',
        estimated_shelf_life_days=5,
        purchase_date=purchase_date.isoformat(),
        estimated_expiration_date=expiration_date_for(purchase_date, 5),
        confidence=0.99,
        source='deepseek',
        notes=notes,
    )


class AuthApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "server.sqlite3"
        self.url = f"sqlite:///{self.db_path.as_posix()}"
        self.env = patch.dict(
            "os.environ",
            {"CALENDAR_COOKIE_SECURE": "false", "CALENDAR_ALLOW_SERVER_SQLITE": "true"},
        )
        self.env.start()
        self.provider_env = patch.dict('os.environ', {'DEEPSEEK_API_KEY': ''})
        self.provider_env.start()
        _alembic_upgrade(self.url)
        self.app = create_app(mode="server", configured_database_url=self.url)
        self.auth: AuthService = self.app.state.calendar.auth
        self.alice = self.auth.create_user("alice", "alice-password-123", admin=True)
        self.bob = self.auth.create_user("bob", "bob-password-123")

    def tearDown(self) -> None:
        self.app.state.calendar.engine.dispose()
        self.provider_env.stop()
        self.env.stop()
        self.temp_dir.cleanup()

    def login(self, username: str, password: str) -> tuple[TestClient, str]:
        client = TestClient(self.app)
        response = client.post("/api/auth/login", json={"username": username, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        return client, response.json()["csrfToken"]

    def post_receipt(self, client: TestClient, csrf: str):
        return client.post(
            '/api/fridge/receipt/analyze',
            headers={'X-CSRF-Token': csrf},
            files={'image': ('receipt.png', RECEIPT_PNG_BYTES, 'image/png')},
            data={'purchase_date': '2026-06-06', 'timezone': 'UTC'},
        )

    def test_atomic_goal_project_endpoint_requires_auth_csrf_and_strict_payload(self) -> None:
        body = {
            "goal": {"title": "Atomic goal", "metadata": {"source": "test"}},
            "project": {"title": "Atomic project", "metadata": {"source": "test"}},
        }
        anonymous = TestClient(self.app)
        self.assertEqual(anonymous.post("/api/memory/goal-projects", json=body).status_code, 401)

        alice_client, alice_csrf = self.login("alice", "alice-password-123")
        self.assertEqual(alice_client.post("/api/memory/goal-projects", json=body).status_code, 403)
        headers = {"X-CSRF-Token": alice_csrf}
        invalid = alice_client.post(
            "/api/memory/goal-projects",
            headers=headers,
            json={**body, "unexpected": True},
        )
        self.assertEqual(invalid.status_code, 422, invalid.text)

        created = alice_client.post("/api/memory/goal-projects", headers=headers, json=body)
        self.assertEqual(created.status_code, 200, created.text)
        payload = created.json()
        self.assertEqual(payload["project"]["goal_id"], payload["goal"]["goal_id"])
        self.assertEqual(len(alice_client.get("/api/memory/goals").json()["goals"]), 1)
        self.assertEqual(len(alice_client.get("/api/memory/projects").json()["projects"]), 1)

        bob_client, _bob_csrf = self.login("bob", "bob-password-123")
        self.assertEqual(bob_client.get("/api/memory/goals").json()["goals"], [])
        self.assertEqual(bob_client.get("/api/memory/projects").json()["projects"], [])

    def test_server_fridge_runtime_cache_does_not_leak_provider_notes_between_users(self) -> None:
        purchase_date = date(2026, 6, 6)
        item_name = 'Private Tofu Family Size Package'
        state = self.app.state.calendar
        self.assertFalse(state.analyzer.cache.runtime_enabled)
        state.analyzer.ocr_engine = SequenceReceiptOCR(
            [
                OCRResult(f'{item_name.upper()} 4.99', 'fake_ocr', 0.2),
                OCRResult(f'{item_name.upper()} 4.99', 'fake_ocr', 0.95),
            ]
        )
        provider = FakeReceiptProvider(
            [[receipt_prediction(item_name, purchase_date, notes='Alice membership 1234')]]
        )
        state.analyzer.deepseek_client = provider
        alice_client, alice_csrf = self.login('alice', 'alice-password-123')
        bob_client, bob_csrf = self.login('bob', 'bob-password-123')

        alice_response = self.post_receipt(alice_client, alice_csrf)
        bob_response = self.post_receipt(bob_client, bob_csrf)

        self.assertEqual(alice_response.status_code, 200, alice_response.text)
        self.assertEqual(bob_response.status_code, 200, bob_response.text)
        self.assertIn('Alice membership 1234', alice_response.json()['items'][0]['notes'])
        self.assertNotIn('Alice membership 1234', str(bob_response.json()))
        self.assertEqual(len(provider.calls), 1)
        with state.auth.session_factory() as session:
            alice_events = list(
                session.scalars(
                    select(AIUsageEventRecord).where(
                        AIUsageEventRecord.user_id == self.alice['id'],
                        AIUsageEventRecord.operation == 'receipt_analysis',
                    )
                )
            )
            bob_events = list(
                session.scalars(
                    select(AIUsageEventRecord).where(
                        AIUsageEventRecord.user_id == self.bob['id'],
                        AIUsageEventRecord.operation == 'receipt_analysis',
                    )
                )
            )
        self.assertEqual([event.status for event in alice_events], ['success'])
        self.assertEqual(bob_events, [])

    def test_server_fridge_hard_limit_blocks_provider_without_new_usage_event(self) -> None:
        state = self.app.state.calendar
        state.analyzer.ocr_engine = SequenceReceiptOCR(
            [OCRResult('MYSTERY CHILLED SPREAD 4.99', 'fake_ocr', 0.2)]
        )
        provider = FakeReceiptProvider(
            [[receipt_prediction('Mystery Chilled Spread', date(2026, 6, 6))]]
        )
        state.analyzer.deepseek_client = provider
        control = GoalControlService(
            engine=state.engine,
            user_id=self.alice['id'],
            app_mode='server',
            client_timezone='UTC',
        )
        with patch.dict(
            'os.environ',
            {'AI_MONTHLY_SOFT_LIMIT': '1', 'AI_MONTHLY_HARD_LIMIT': '1'},
        ):
            control.record_usage(
                operation='routine',
                model='seed',
                usage_mode='balanced',
                input_tokens=1,
                output_tokens=0,
                estimated=True,
            )
            client, csrf = self.login('alice', 'alice-password-123')
            response = self.post_receipt(client, csrf)

        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn(
            'ai_monthly_hard_limit',
            [error['code'] for error in response.json()['recoverable_errors']],
        )
        self.assertEqual(provider.calls, [])
        with state.auth.session_factory() as session:
            events = list(
                session.scalars(
                    select(AIUsageEventRecord).where(AIUsageEventRecord.user_id == self.alice['id'])
                )
            )
        self.assertEqual(len(events), 1)

    def test_fridge_provider_rate_limit_is_per_user_and_blocked_calls_are_not_metered(self) -> None:
        state = self.app.state.calendar
        purchase_date = date(2026, 6, 6)
        prediction = receipt_prediction('Private Tofu', purchase_date)
        provider = FakeReceiptProvider([[prediction], [prediction]])
        alice_control = GoalControlService(
            engine=state.engine,
            user_id=self.alice['id'],
            app_mode='server',
            client_timezone='UTC',
        )
        bob_control = GoalControlService(
            engine=state.engine,
            user_id=self.bob['id'],
            app_mode='server',
            client_timezone='UTC',
        )
        alice_client = MeteredReceiptDeepSeekClient(provider, state, alice_control)
        bob_client = MeteredReceiptDeepSeekClient(provider, state, bob_control)

        with patch.dict('os.environ', {'AI_REQUESTS_PER_MINUTE': '1'}):
            alice_client.extract_fridge_items('PRIVATE TOFU', ['PRIVATE TOFU'], purchase_date)
            with self.assertRaises(DeepSeekRateLimitError):
                alice_client.extract_fridge_items('PRIVATE TOFU', ['PRIVATE TOFU'], purchase_date)
            bob_client.extract_fridge_items('PRIVATE TOFU', ['PRIVATE TOFU'], purchase_date)

        self.assertEqual(len(provider.calls), 2)
        with state.auth.session_factory() as session:
            events = list(
                session.scalars(
                    select(AIUsageEventRecord).where(
                        AIUsageEventRecord.operation == 'receipt_analysis'
                    )
                )
            )
        self.assertEqual(
            sorted(event.user_id for event in events),
            sorted([self.alice['id'], self.bob['id']]),
        )

    def test_fridge_provider_success_failure_and_timeout_use_one_accounting_policy(self) -> None:
        state = self.app.state.calendar
        purchase_date = date(2026, 6, 6)
        provider = FakeReceiptProvider(
            [
                [receipt_prediction('Private Tofu', purchase_date)],
                DeepSeekRequestError('provider rejected request'),
                DeepSeekTimeoutError('provider timed out'),
            ]
        )
        control = GoalControlService(
            engine=state.engine,
            user_id=self.alice['id'],
            app_mode='server',
            client_timezone='UTC',
        )
        client = MeteredReceiptDeepSeekClient(provider, state, control)

        client.extract_fridge_items('PRIVATE TOFU', ['PRIVATE TOFU'], purchase_date)
        with self.assertRaises(DeepSeekRequestError):
            client.extract_fridge_items('PRIVATE TOFU', ['PRIVATE TOFU'], purchase_date)
        with self.assertRaises(DeepSeekTimeoutError):
            client.extract_fridge_items('PRIVATE TOFU', ['PRIVATE TOFU'], purchase_date)

        with state.auth.session_factory() as session:
            events = list(
                session.scalars(
                    select(AIUsageEventRecord)
                    .where(
                        AIUsageEventRecord.user_id == self.alice['id'],
                        AIUsageEventRecord.operation == 'receipt_analysis',
                    )
                    .order_by(AIUsageEventRecord.row_id)
                )
            )
        self.assertEqual(
            [event.status for event in events],
            ['success', 'upstream_error', 'upstream_timeout'],
        )
        self.assertTrue(all(event.estimated for event in events))
        self.assertTrue(all(event.input_tokens > 0 for event in events))
        self.assertGreater(events[0].output_tokens, 0)
        self.assertEqual([events[1].output_tokens, events[2].output_tokens], [0, 0])
        self.assertEqual(control.usage_summary()['request_count'], 3)

    def test_ai_proxy_rejects_invalid_limits_and_context_ids_before_provider_call(self) -> None:
        client, csrf = self.login('alice', 'alice-password-123')
        headers = {'X-CSRF-Token': csrf}
        invalid_payloads = (
            ({'max_tokens': 'bad'}, 'ai_max_tokens_invalid', 'max_tokens'),
            ({'max_tokens': True}, 'ai_max_tokens_invalid', 'max_tokens'),
            ({'max_tokens': 0}, 'ai_max_tokens_invalid', 'max_tokens'),
            ({'max_tokens': -1}, 'ai_max_tokens_invalid', 'max_tokens'),
            ({'max_tokens': 1.5}, 'ai_max_tokens_invalid', 'max_tokens'),
            ({'_calendarProjectId': 123}, 'ai_context_id_invalid', '_calendarProjectId'),
            ({'_calendarProjectId': 'p' * 65}, 'ai_context_id_invalid', '_calendarProjectId'),
            ({'_calendarThreadId': None}, 'ai_context_id_invalid', '_calendarThreadId'),
            ({'_calendarThreadId': 't' * 65}, 'ai_context_id_invalid', '_calendarThreadId'),
        )

        with (
            patch.dict('os.environ', {'DEEPSEEK_API_KEY': 'test-provider-key'}),
            patch('backend.server.httpx.AsyncClient') as provider_client,
        ):
            for invalid_fields, expected_code, field_name in invalid_payloads:
                with self.subTest(invalid_fields=invalid_fields):
                    response = client.post(
                        '/api/ai/chat/completions',
                        headers=headers,
                        json={
                            'messages': [{'role': 'user', 'content': 'hello'}],
                            **invalid_fields,
                        },
                    )

                    self.assertEqual(response.status_code, 422, response.text)
                    error = response.json()['error']
                    self.assertEqual(error['code'], expected_code)
                    self.assertIn(field_name, error['fieldErrors'])

        provider_client.assert_not_called()

    def test_ai_planning_budget_accounts_for_reasoning_and_stays_bounded(self) -> None:
        client, csrf = self.login('alice', 'alice-password-123')
        cases = [
            # mode, administrator cap, selected model, operation, requested total, expected total
            ('economy', 'quality', 'deepseek-reasoner', 'goal_plan', None, 8192),
            ('balanced', 'quality', 'deepseek-reasoner', 'goal_plan', None, 16384),
            ('quality', 'quality', 'deepseek-reasoner', 'goal_plan', None, 24576),
            ('quality', 'balanced', 'deepseek-reasoner', 'goal_plan', None, 16384),
            ('balanced', 'balanced', 'deepseek-reasoner', 'activation', None, 16384),
            ('balanced', 'balanced', 'deepseek-reasoner', 'calendar_plan', None, 16384),
            ('balanced', 'balanced', 'deepseek-reasoner', 'replan', None, 16384),
            ('balanced', 'balanced', 'deepseek-reasoner', 'weekly_review', None, 16384),
            ('balanced', 'balanced', 'deepseek-reasoner', 'planning', None, 16384),
            ('balanced', 'balanced', 'deepseek-chat', 'goal_plan', None, 3000),
            ('balanced', 'balanced', 'deepseek-reasoner', 'routine', None, 800),
            ('balanced', 'balanced', 'deepseek-reasoner', 'goal_plan', 10**12, 16384),
            ('balanced', 'balanced', 'deepseek-chat', 'goal_plan', 10**12, 3000),
            ('balanced', 'balanced', 'deepseek-reasoner', 'goal_plan', 1024, 1024),
        ]
        upstream = AsyncMock()
        upstream.post.return_value = httpx.Response(200, json={
            'choices': [{'finish_reason': 'stop', 'message': {'content': '{"plan": "complete"}'}}],
            'usage': {'prompt_tokens': 20, 'completion_tokens': 40},
        })
        for mode, maximum, model, operation, requested, expected in cases:
            with self.subTest(case=(mode, maximum, model, operation, requested)), patch.dict('os.environ', {
                'DEEPSEEK_API_KEY': 'synthetic-key', 'AI_PLANNING_MODEL': model,
                'AI_ROUTINE_MODEL': model, 'AI_DEFAULT_USAGE_MODE': mode,
                'AI_MAX_USAGE_MODE': maximum, 'AI_MONTHLY_HARD_LIMIT': '2000000',
            }), patch('backend.server.httpx.AsyncClient') as factory:
                factory.return_value.__aenter__.return_value = upstream
                upstream.post.reset_mock()
                payload = {'_calendarOperation': operation, 'model': 'untrusted-override',
                           'messages': [{'role': 'user', 'content': 'Return a compact JSON plan.'}]}
                if requested is not None:
                    payload['max_tokens'] = requested
                response = client.post('/api/ai/chat/completions', headers={'X-CSRF-Token': csrf}, json=payload)
                self.assertEqual(response.status_code, 200, response.text)
                upstream.post.assert_awaited_once()
                sent = upstream.post.call_args.kwargs['json']
                self.assertEqual(sent['model'], model)
                self.assertEqual(sent['max_tokens'], expected)
                self.assertNotIn('_calendarOperation', sent)
                factory.assert_called_once_with(timeout=180 if model == 'deepseek-reasoner' and operation != 'routine' else 60)

    def test_ai_truncation_is_metered_without_partial_plan_or_automatic_retry(self) -> None:
        client, csrf = self.login('alice', 'alice-password-123')
        upstream = AsyncMock()
        upstream.post.return_value = httpx.Response(200, json={
            'choices': [{'finish_reason': 'length', 'message': {'content': '{"partial":', 'reasoning_content': 'synthetic reasoning'}}],
            'usage': {'prompt_tokens': 20, 'completion_tokens': 16384},
        })
        with patch.dict('os.environ', {
            'DEEPSEEK_API_KEY': 'synthetic-key', 'AI_PLANNING_MODEL': 'deepseek-reasoner',
            'AI_DEFAULT_USAGE_MODE': 'balanced', 'AI_MAX_USAGE_MODE': 'balanced',
            'AI_MONTHLY_HARD_LIMIT': '16000',
        }), patch('backend.server.httpx.AsyncClient') as factory:
            factory.return_value.__aenter__.return_value = upstream
            payload = {'_calendarOperation': 'goal_plan', 'messages': [{'role': 'user', 'content': 'JSON plan'}]}
            response = client.post('/api/ai/chat/completions', headers={'X-CSRF-Token': csrf}, json=payload)
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(response.json()['error']['code'], 'ai_output_truncated')
            self.assertEqual(response.json()['error']['details']['outputLimit'], 16384)
            self.assertNotIn('choices', response.json())
            self.assertNotIn('synthetic reasoning', response.text)
            self.assertNotIn('partial', response.text)
            upstream.post.assert_awaited_once()
            control = GoalControlService(engine=self.app.state.calendar.engine, user_id=self.alice['id'], app_mode='server')
            self.assertEqual(control.usage_summary()['planning_output_tokens'], 16384)
            with control.session_factory() as session:
                event = session.scalar(select(AIUsageEventRecord))
                self.assertEqual(event.status, 'output_truncated')
                self.assertFalse(event.estimated)
            blocked = client.post('/api/ai/chat/completions', headers={'X-CSRF-Token': csrf}, json=payload)
            self.assertEqual(blocked.status_code, 429, blocked.text)
            self.assertEqual(blocked.json()['error']['code'], 'ai_monthly_hard_limit')
            upstream.post.assert_awaited_once()

    def test_fridge_item_writes_use_strict_bounded_dtos(self) -> None:
        client, csrf = self.login('alice', 'alice-password-123')
        headers = {'X-CSRF-Token': csrf}
        created = client.post(
            '/api/fridge/items',
            headers=headers,
            json={
                'item_id': 'strict-fridge',
                'item_name': ' Milk ',
                'normalized_name': 'milk',
                'category': 'dairy',
                'storage_type': 'fridge',
                'purchase_date': '2026-07-19',
                'estimated_expiration_date': '2026-07-26',
                'estimated_shelf_life_days': 7,
                'confidence': 0.9,
                'source': 'local_cache',
                'receipt_id': 'receipt-1',
                'quantity': '1 carton',
                'notes': '',
                'cache_hit': True,
                'cache_match_type': 'exact',
                'cache_layer': 'defaults',
                'metadata': {
                    'cache_hit': True,
                    'cache_match_type': 'exact',
                    'cache_layer': 'defaults',
                    'source': 'local_cache',
                    'confidence': 0.9,
                },
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()['item']['item_name'], 'Milk')

        invalid_creates = (
            {'item_name': 'Milk', 'confidence': '0.5'},
            {'item_name': 'Milk', 'estimated_shelf_life_days': '7'},
            {'item_name': 'Milk', 'purchase_date': 'not-a-date'},
            {'item_name': 'Milk', 'storage_type': 'pantry'},
            {'item_name': 'Milk', 'unknown': True},
            {'item_name': '   '},
            {'item_name': 'x' * 201},
        )
        for payload in invalid_creates:
            response = client.post('/api/fridge/items', headers=headers, json=payload)
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(response.json()['error']['code'], 'validation_error')

        invalid_updates = (
            {},
            {'item_name': None},
            {'category': None},
            {'confidence': '0.5'},
            {'confidence': 1.1},
            {'purchase_date': 'not-a-date'},
            {'estimated_shelf_life_days': -1},
            {'notes': 'x' * 10_001},
            {'unknown': True},
        )
        for payload in invalid_updates:
            response = client.patch(
                '/api/fridge/items/strict-fridge',
                headers=headers,
                json=payload,
            )
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(response.json()['error']['code'], 'validation_error')

        unchanged = client.get('/api/fridge/items').json()['items']
        self.assertEqual(len(unchanged), 1)
        self.assertEqual(unchanged[0]['confidence'], 0.9)
        cleared = client.patch(
            '/api/fridge/items/strict-fridge',
            headers=headers,
            json={
                'estimated_expiration_date': None,
                'estimated_shelf_life_days': None,
                'receipt_id': None,
                'quantity': None,
            },
        )
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertIsNone(cleared.json()['item']['estimated_expiration_date'])
        self.assertIsNone(cleared.json()['item']['estimated_shelf_life_days'])

    def test_desktop_key_only_config_patch_rebuilds_fridge_analyzer(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / 'desktop.sqlite3'
            database_url = f'sqlite:///{database_path.as_posix()}'
            with patch('backend.server.local_ai_key', return_value=''):
                desktop_app = create_app(
                    mode='desktop',
                    configured_database_url=database_url,
                    launch_token='launch-secret',
                )
            try:
                original_analyzer = desktop_app.state.calendar.analyzer
                with (
                    patch('backend.server.set_local_ai_key') as save_key,
                    patch('backend.server.local_ai_key', return_value='stored-desktop-key'),
                ):
                    response = TestClient(desktop_app).patch(
                        '/api/config',
                        headers={'X-Desktop-Token': 'launch-secret'},
                        json={'deepseek_api_key': 'stored-desktop-key'},
                    )

                self.assertEqual(response.status_code, 200, response.text)
                save_key.assert_called_once_with('stored-desktop-key')
                refreshed_analyzer = desktop_app.state.calendar.analyzer
                self.assertIsNot(refreshed_analyzer, original_analyzer)
                self.assertTrue(refreshed_analyzer.cache.runtime_enabled)
                self.assertEqual(
                    refreshed_analyzer.deepseek_client.config.api_key,
                    'stored-desktop-key',
                )
            finally:
                desktop_app.state.calendar.engine.dispose()

    def test_fake_head_partial_server_schema_fails_closed_without_modification(self) -> None:
        partial_path = Path(self.temp_dir.name) / 'fake-head-partial.sqlite3'
        with closing(sqlite3.connect(partial_path)) as connection:
            connection.execute('CREATE TABLE alembic_version (version_num TEXT PRIMARY KEY)')
            connection.execute('INSERT INTO alembic_version VALUES (?)', (ALEMBIC_HEAD,))
            connection.execute('CREATE TABLE users (id TEXT PRIMARY KEY)')
            connection.execute('CREATE TABLE goals (user_id TEXT, goal_id TEXT)')
            connection.execute('CREATE TABLE projects (user_id TEXT, project_id TEXT, goal_id TEXT)')
            connection.execute('CREATE TABLE sentinel (value TEXT NOT NULL)')
            connection.execute('INSERT INTO sentinel VALUES (?)', ('keep me',))
            connection.commit()
        before_digest = hashlib.sha256(partial_path.read_bytes()).hexdigest()

        with self.assertRaisesRegex(RuntimeError, 'schema fingerprint mismatch') as raised:
            create_app(
                mode='server',
                configured_database_url=f'sqlite:///{partial_path.as_posix()}',
            )

        self.assertIn('users missing unique key', str(raised.exception))
        self.assertIn('projects missing unique key', str(raised.exception))
        self.assertIn('projects missing foreign key', str(raised.exception))
        self.assertEqual(hashlib.sha256(partial_path.read_bytes()).hexdigest(), before_digest)
        with closing(sqlite3.connect(partial_path)) as connection:
            tables = {
                row[0]
                for row in connection.execute(
                    'SELECT name FROM sqlite_master WHERE type = ? ORDER BY name',
                    ('table',),
                )
            }
            sentinel = connection.execute('SELECT value FROM sentinel').fetchall()
        self.assertEqual(tables, {'alembic_version', 'goals', 'projects', 'sentinel', 'users'})
        self.assertEqual(sentinel, [('keep me',)])

    def test_server_sqlite_opt_in_requires_explicit_database_url(self) -> None:
        with patch.dict(
            'os.environ',
            {
                'CALENDAR_ALLOW_SERVER_SQLITE': 'true',
                'CALENDAR_DATABASE_URL': '',
                'CALENDAR_DB_PATH': '',
            },
        ):
            with self.assertRaisesRegex(RuntimeError, 'must pass configured_database_url explicitly'):
                create_app(mode='server')

    def test_server_sqlite_opt_in_never_allows_another_database_dialect(self) -> None:
        engine = Mock()
        engine.dialect.name = 'postgresql'
        with patch('backend.server.create_database_engine', return_value=engine):
            with self.assertRaisesRegex(RuntimeError, 'requires a mysql'):
                create_app(
                    mode='server',
                    configured_database_url='postgresql://test.invalid/calendar_test',
                )
        engine.dispose.assert_called_once_with()

    def test_login_csrf_logout_and_no_registration_route(self) -> None:
        client, csrf = self.login("alice", "alice-password-123")
        self.assertEqual(client.get("/api/auth/me").json()["user"]["username"], "alice")
        denied = client.post("/api/calendar/todos", json={"title": "No CSRF"})
        self.assertEqual(denied.status_code, 403)
        created = client.post(
            "/api/calendar/todos",
            headers={"X-CSRF-Token": csrf},
            json={"id": "todo-1", "title": "Protected task"},
        )
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(client.post("/api/register", json={}).status_code, 404)
        self.assertEqual(
            client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf}).status_code,
            200,
        )
        self.assertEqual(client.get("/api/auth/me").status_code, 401)

    def test_two_users_can_reuse_ids_without_cross_account_access(self) -> None:
        alice_client, alice_csrf = self.login("alice", "alice-password-123")
        bob_client, bob_csrf = self.login("bob", "bob-password-123")
        for client, csrf, title in (
            (alice_client, alice_csrf, "Alice event"),
            (bob_client, bob_csrf, "Bob event"),
        ):
            response = client.post(
                "/api/calendar/events",
                headers={"X-CSRF-Token": csrf},
                json={
                    "id": "same-id",
                    "title": title,
                    "startAt": "2026-07-13T10:00:00.000Z",
                    "endAt": "2026-07-13T11:00:00.000Z",
                },
            )
            self.assertEqual(response.status_code, 200, response.text)

        alice_client.post(
            "/api/calendar/events",
            headers={"X-CSRF-Token": alice_csrf},
            json={
                "id": "alice-only",
                "title": "Private",
                "startAt": "2026-07-13T12:00:00.000Z",
                "endAt": "2026-07-13T13:00:00.000Z",
            },
        )
        alice_events = alice_client.get(
            "/api/calendar/events?start=2026-07-13T00:00:00.000Z&end=2026-07-13T23:59:59.999Z"
        ).json()["events"]
        bob_events = bob_client.get(
            "/api/calendar/events?start=2026-07-13T00:00:00.000Z&end=2026-07-13T23:59:59.999Z"
        ).json()["events"]
        self.assertEqual({item["title"] for item in alice_events}, {"Alice event", "Private"})
        self.assertEqual({item["title"] for item in bob_events}, {"Bob event"})
        cross_update = bob_client.patch(
            "/api/calendar/events/alice-only",
            headers={"X-CSRF-Token": bob_csrf},
            json={"title": "Stolen"},
        )
        self.assertEqual(cross_update.status_code, 404)

    def test_calendar_write_dtos_reject_invalid_and_unknown_fields(self) -> None:
        client, csrf = self.login("alice", "alice-password-123")
        headers = {"X-CSRF-Token": csrf}
        valid_event = {
            "id": "validated-event",
            "title": "Validated event",
            "startAt": "2026-07-19T10:00:00Z",
            "endAt": "2026-07-19T11:00:00Z",
        }
        created = client.post("/api/calendar/events", headers=headers, json=valid_event)
        self.assertEqual(created.status_code, 200, created.text)

        invalid_events = [
            {**valid_event, "id": "unknown-field", "unexpected": True},
            {**valid_event, "id": "empty-title", "title": ""},
            {
                **valid_event,
                "id": "backwards",
                "startAt": "2026-07-19T12:00:00Z",
                "endAt": "2026-07-19T11:00:00Z",
            },
            {
                **valid_event,
                "id": "bad-recurrence",
                "recurrenceRule": {
                    "frequency": "weekly",
                    "daysOfWeek": [],
                    "endCondition": {"type": "never"},
                },
            },
        ]
        for payload in invalid_events:
            response = client.post("/api/calendar/events", headers=headers, json=payload)
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(response.json()["error"]["code"], "validation_error")
            self.assertTrue(response.json()["error"]["fieldErrors"])

        invalid_patch = client.patch(
            "/api/calendar/events/validated-event",
            headers=headers,
            json={"endAt": "2026-07-19T09:00:00Z"},
        )
        self.assertEqual(invalid_patch.status_code, 422, invalid_patch.text)
        self.assertEqual(invalid_patch.json()["error"]["code"], "validation_error")

        for payload in (
            {"title": "Too short", "etaMinutes": 1},
            {"title": "Bad status", "status": "maybe"},
            {"title": "Unknown", "unexpected": True},
            {"title": "x" * 201},
        ):
            response = client.post("/api/calendar/todos", headers=headers, json=payload)
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(response.json()["error"]["code"], "validation_error")
            self.assertTrue(response.json()["error"]["fieldErrors"])

    def test_calendar_references_and_snapshot_dtos_are_tenant_scoped(self) -> None:
        alice_client, alice_csrf = self.login("alice", "alice-password-123")
        alice_headers = {"X-CSRF-Token": alice_csrf}
        bob_client, bob_csrf = self.login("bob", "bob-password-123")
        bob_headers = {"X-CSRF-Token": bob_csrf}

        event_type = alice_client.post(
            "/api/calendar/event-types",
            headers=alice_headers,
            json={"id": "alice-type", "label": "Alice", "color": "#047857"},
        )
        self.assertEqual(event_type.status_code, 200, event_type.text)
        alice_client.post(
            "/api/calendar/todos",
            headers=alice_headers,
            json={"id": "alice-todo", "title": "Alice todo"},
        )
        alice_client.post(
            "/api/calendar/events",
            headers=alice_headers,
            json={
                "id": "alice-event",
                "title": "Alice event",
                "startAt": "2026-07-19T10:00:00Z",
                "endAt": "2026-07-19T11:00:00Z",
            },
        )

        invalid_requests = (
            ("/api/calendar/todos", {"title": "Bad type", "eventTypeId": "alice-type"}),
            ("/api/calendar/todos", {"title": "Bad link", "linkedEventId": "alice-event"}),
            (
                "/api/calendar/events",
                {
                    "title": "Bad todo",
                    "startAt": "2026-07-19T10:00:00Z",
                    "endAt": "2026-07-19T11:00:00Z",
                    "linkedTodoId": "alice-todo",
                },
            ),
            (
                "/api/calendar/events",
                {
                    "title": "Bad master",
                    "startAt": "2026-07-19T10:00:00Z",
                    "endAt": "2026-07-19T11:00:00Z",
                    "masterId": "alice-event",
                },
            ),
            (
                "/api/calendar/events",
                {
                    "title": "Bad exception",
                    "startAt": "2026-07-19T10:00:00Z",
                    "endAt": "2026-07-19T11:00:00Z",
                    "exceptionFor": "alice-event",
                },
            ),
        )
        for path, payload in invalid_requests:
            response = bob_client.post(path, headers=bob_headers, json=payload)
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(response.json()["error"]["code"], "validation_error")

        bob_client.post(
            "/api/calendar/todos",
            headers=bob_headers,
            json={"id": "bob-todo", "title": "Bob todo"},
        )
        bob_client.post(
            "/api/calendar/events",
            headers=bob_headers,
            json={
                "id": "bob-event",
                "title": "Bob event",
                "startAt": "2026-07-19T12:00:00Z",
                "endAt": "2026-07-19T13:00:00Z",
            },
        )
        invalid_patches = (
            ("/api/calendar/todos/bob-todo", {"linkedEventId": "alice-event"}),
            ("/api/calendar/events/bob-event", {"linkedTodoId": "alice-todo"}),
            ("/api/calendar/events/bob-event", {"eventTypeId": "alice-type"}),
        )
        for path, payload in invalid_patches:
            response = bob_client.patch(path, headers=bob_headers, json=payload)
            self.assertEqual(response.status_code, 422, response.text)

        malformed_type = bob_client.post(
            "/api/calendar/event-types",
            headers=bob_headers,
            json={"id": "bad", "label": "Bad", "color": "#fff", "unexpected": True},
        )
        self.assertEqual(malformed_type.status_code, 422, malformed_type.text)
        missing_type = bob_client.patch(
            "/api/calendar/event-types/missing",
            headers=bob_headers,
            json={"label": "Still missing"},
        )
        self.assertEqual(missing_type.status_code, 404, missing_type.text)

        invalid_snapshot = bob_client.post(
            "/api/calendar/import/local-snapshot",
            headers=bob_headers,
            json={
                "eventTypes": [
                    {"id": "must-not-write", "label": "No write", "color": "#047857"},
                ],
                "events": [
                    {
                        "id": "bad-import",
                        "title": "Bad import",
                        "startAt": "2026-07-19T10:00:00Z",
                        "endAt": "2026-07-19T11:00:00Z",
                        "eventTypeId": "must-not-write",
                        "linkedTodoId": "alice-todo",
                    }
                ],
            },
        )
        self.assertEqual(invalid_snapshot.status_code, 422, invalid_snapshot.text)
        bob_types = bob_client.get("/api/calendar/event-types").json()["eventTypes"]
        self.assertNotIn("must-not-write", {item["id"] for item in bob_types})

    def test_tool_presets_use_strict_payloads_and_patch_without_losing_required_fields(self) -> None:
        client, csrf = self.login("alice", "alice-password-123")
        headers = {"X-CSRF-Token": csrf}
        preset = {
            "defaultLlmOptions": {"provider": "global"},
            "description": "Create focused calendar blocks.",
            "fields": [
                {
                    "id": "focus",
                    "label": "Focus",
                    "required": True,
                    "type": "text",
                }
            ],
            "id": "focus-planner",
            "isBuiltIn": False,
            "label": "Focus planner",
            "outputSchemaKey": "calendar_event_drafts",
            "prompt": "Create a focused event from the supplied fields.",
        }
        created = client.post("/api/tool-presets", headers=headers, json=preset)
        self.assertEqual(created.status_code, 200, created.text)

        patched = client.patch(
            "/api/tool-presets/focus-planner",
            headers=headers,
            json={"label": "Updated focus planner"},
        )
        self.assertEqual(patched.status_code, 200, patched.text)
        updated = patched.json()["preset"]
        self.assertEqual(updated["label"], "Updated focus planner")
        self.assertEqual(updated["description"], preset["description"])
        self.assertEqual(updated["fields"], preset["fields"])
        self.assertEqual(updated["prompt"], preset["prompt"])

        invalid_payloads = (
            {**preset, "id": {"not": "text"}},
            {**preset, "id": "x" * 81},
            {**preset, "unexpected": True},
        )
        for payload in invalid_payloads:
            response = client.post("/api/tool-presets", headers=headers, json=payload)
            self.assertEqual(response.status_code, 422, response.text)

        for patch_payload in ({}, {"label": None}, {"unexpected": True}):
            response = client.patch(
                "/api/tool-presets/focus-planner",
                headers=headers,
                json=patch_payload,
            )
            self.assertEqual(response.status_code, 422, response.text)

        presets = client.get("/api/tool-presets").json()["presets"]
        self.assertEqual(len(presets), 1)
        self.assertEqual(presets[0]["label"], "Updated focus planner")
        self.assertEqual(presets[0]["fields"], preset["fields"])

    def test_preferences_reject_invalid_types_and_unknown_fields_without_writing(self) -> None:
        client, csrf = self.login("alice", "alice-password-123")
        headers = {"X-CSRF-Token": csrf}
        baseline = client.patch(
            "/api/me/preferences",
            headers=headers,
            json={"defaultEventColor": "#123456"},
        )
        self.assertEqual(baseline.status_code, 200, baseline.text)

        invalid_payloads = (
            {"aiMonthlySoftLimit": "not-an-int"},
            {"layoutPanelSizePercent": "25"},
            {"defaultEventStartTime": "25:99"},
            {"defaultTodoPriority": "urgent"},
            {"unexpectedPreference": True},
        )
        for payload in invalid_payloads:
            response = client.patch("/api/me/preferences", headers=headers, json=payload)
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(response.json()["error"]["code"], "validation_error")

        preferences = client.get("/api/me/preferences").json()["preferences"]
        self.assertEqual(preferences["defaultEventColor"], "#123456")
        self.assertNotIn("unexpectedPreference", preferences)

    def test_failed_logins_lock_and_cli_password_change_revokes_sessions(self) -> None:
        for _index in range(5):
            response = TestClient(self.app).post(
                "/api/auth/login",
                json={"username": "bob", "password": "wrong-password"},
            )
            self.assertEqual(response.status_code, 401)
        locked = TestClient(self.app).post(
            "/api/auth/login",
            json={"username": "bob", "password": "bob-password-123"},
        )
        self.assertEqual(locked.status_code, 429)
        self.assertGreaterEqual(int(locked.headers["Retry-After"]), 1)
        self.assertEqual(locked.json()["error"]["retryAfterSeconds"], int(locked.headers["Retry-After"]))
        self.auth.unlock("bob")
        client, _csrf = self.login("bob", "bob-password-123")
        self.auth.set_password("bob", "new-bob-password-123")
        self.assertEqual(client.get("/api/auth/me").status_code, 401)

    def test_unknown_login_reuses_dummy_hash_and_applies_username_throttle(self) -> None:
        dummy_hash = self.auth._dummy_password_hash
        with patch.dict("os.environ", {"AUTH_LOGIN_USERNAME_MAX_ATTEMPTS": "1"}):
            first = TestClient(self.app).post(
                "/api/auth/login",
                json={"username": "missing-user", "password": "wrong-password"},
            )
            second = TestClient(self.app).post(
                "/api/auth/login",
                json={"username": "missing-user", "password": "wrong-password"},
            )
        self.assertEqual(first.status_code, 401, first.text)
        self.assertEqual(second.status_code, 429, second.text)
        self.assertGreaterEqual(int(second.headers["Retry-After"]), 1)
        self.assertEqual(second.json()["error"]["code"], "login_rate_limited")
        self.assertEqual(self.auth._dummy_password_hash, dummy_hash)

    def test_concurrent_failed_logins_preserve_every_counter_update(self) -> None:
        def attempt(index: int) -> int:
            try:
                self.auth.login(
                    "bob",
                    "wrong-password",
                    client_ip=f"203.0.113.{index}",
                )
            except AuthError as exc:
                return exc.status
            return 200

        with ThreadPoolExecutor(max_workers=8) as executor:
            statuses = list(executor.map(attempt, range(8)))

        self.assertEqual(statuses.count(401), 5)
        self.assertEqual(statuses.count(429), 3)
        with self.auth.session_factory() as session:
            user = session.scalar(select(UserRecord).where(UserRecord.username == "bob"))
            self.assertIsNotNone(user)
            self.assertEqual(user.failed_login_count, 5)
            self.assertIsNotNone(user.locked_until)

    def test_session_expiry_and_account_disable_revoke_access(self) -> None:
        expired_client, _csrf = self.login("bob", "bob-password-123")
        with self.auth.session_factory.begin() as session:
            record = session.scalar(select(SessionRecord).where(SessionRecord.user_id == self.bob["id"]))
            self.assertIsNotNone(record)
            record.expires_at = "2000-01-01T00:00:00Z"
        self.assertEqual(expired_client.get("/api/auth/me").status_code, 401)

        active_client, _csrf = self.login("bob", "bob-password-123")
        self.auth.set_active("bob", False)
        self.assertEqual(active_client.get("/api/auth/me").status_code, 401)
        disabled_login = TestClient(self.app).post(
            "/api/auth/login",
            json={"username": "bob", "password": "bob-password-123"},
        )
        self.assertEqual(disabled_login.status_code, 401)
        self.assertEqual(disabled_login.json()["error"]["code"], "invalid_credentials")
        self.auth.set_active("bob", True)
        self.login("bob", "bob-password-123")

    def test_export_import_is_scoped_and_idempotent(self) -> None:
        alice_client, alice_csrf = self.login("alice", "alice-password-123")
        alice_client.post(
            "/api/calendar/todos",
            headers={"X-CSRF-Token": alice_csrf},
            json={"id": "portable", "title": "Portable task"},
        )
        backup = alice_client.get("/api/data/export").json()["backup"]
        bob_client, bob_csrf = self.login("bob", "bob-password-123")
        body = {"backup": backup, "mode": "merge", "source": "test-backup"}
        first = bob_client.post("/api/data/import", headers={"X-CSRF-Token": bob_csrf}, json=body)
        second = bob_client.post("/api/data/import", headers={"X-CSRF-Token": bob_csrf}, json=body)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertTrue(second.json()["report"]["skipped"])
        self.assertEqual(bob_client.get("/api/calendar/todos").json()["todos"][0]["title"], "Portable task")

    def test_backup_preview_requires_equal_time_choices_and_rejects_stale_execution(self) -> None:
        timestamp = "2026-07-19T12:00:00Z"
        alice_client, alice_csrf = self.login("alice", "alice-password-123")
        alice_client.post(
            "/api/calendar/todos",
            headers={"X-CSRF-Token": alice_csrf},
            json={
                "id": "shared-preview-id",
                "title": "Backup title",
                "createdAt": timestamp,
                "updatedAt": timestamp,
            },
        )
        backup = alice_client.get("/api/data/export").json()["backup"]

        bob_client, bob_csrf = self.login("bob", "bob-password-123")
        headers = {"X-CSRF-Token": bob_csrf}
        bob_client.post(
            "/api/calendar/todos",
            headers=headers,
            json={
                "id": "shared-preview-id",
                "title": "Local title",
                "createdAt": timestamp,
                "updatedAt": timestamp,
            },
        )
        preview_response = bob_client.post(
            "/api/data/import/preview",
            headers=headers,
            json={"backup": backup, "mode": "merge"},
        )
        self.assertEqual(preview_response.status_code, 200, preview_response.text)
        preview = preview_response.json()["preview"]
        self.assertEqual(preview["counts"]["todos"]["conflicts"], 1)
        self.assertEqual(preview["conflicts"][0]["key"], "todos:shared-preview-id")

        missing_choice = bob_client.post(
            "/api/data/import",
            headers=headers,
            json={
                "backup": backup,
                "mode": "merge",
                "source": "preview-conflict",
                "expectedBackupChecksum": preview["backupChecksum"],
                "currentDataChecksum": preview["currentChecksum"],
            },
        )
        self.assertEqual(missing_choice.status_code, 400)
        self.assertIn("requires a local or backup choice", missing_choice.text)

        bob_client.patch(
            "/api/calendar/todos/shared-preview-id",
            headers=headers,
            json={"title": "Changed after preview", "updatedAt": "2026-07-19T13:00:00Z"},
        )
        stale = bob_client.post(
            "/api/data/import",
            headers=headers,
            json={
                "backup": backup,
                "mode": "merge",
                "source": "preview-stale",
                "expectedBackupChecksum": preview["backupChecksum"],
                "currentDataChecksum": preview["currentChecksum"],
                "conflictChoices": {"todos:shared-preview-id": "local"},
            },
        )
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertEqual(stale.json()["error"]["code"], "import_preview_stale")
        self.assertEqual(
            bob_client.get("/api/calendar/todos").json()["todos"][0]["title"],
            "Changed after preview",
        )

    def test_server_enforces_ai_mode_and_budget_policy(self) -> None:
        client, csrf = self.login("alice", "alice-password-123")
        headers = {"X-CSRF-Token": csrf}
        allowed = client.patch("/api/me/preferences", headers=headers, json={"aiUsageMode": "economy"})
        self.assertEqual(allowed.status_code, 200, allowed.text)
        usage = client.get("/api/me/ai-usage").json()["usage"]
        self.assertEqual(usage["selected_mode"], "economy")
        denied_mode = client.patch("/api/me/preferences", headers=headers, json={"aiUsageMode": "quality"})
        self.assertEqual(denied_mode.status_code, 403)
        denied_budget = client.patch("/api/me/preferences", headers=headers, json={"aiMonthlyHardLimit": 3_000_000})
        self.assertEqual(denied_budget.status_code, 403)

    def test_backup_import_cannot_raise_server_budget(self) -> None:
        client, csrf = self.login("alice", "alice-password-123")
        headers = {"X-CSRF-Token": csrf}
        backup = client.get("/api/data/export").json()["backup"]
        backup["entities"]["preferences"]["aiMonthlySoftLimit"] = 8_000_000
        backup["entities"]["preferences"]["aiMonthlyHardLimit"] = 9_000_000
        backup["checksum"] = checksum_entities(backup["entities"])
        response = client.post(
            "/api/data/import",
            headers=headers,
            json={"backup": backup, "mode": "merge", "source": "budget-attack"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            response.json()["report"]["ignoredPreferenceKeys"],
            ["aiMonthlyHardLimit", "aiMonthlySoftLimit"],
        )
        usage = client.get("/api/me/ai-usage").json()["usage"]
        self.assertEqual(usage["hard_limit"], 2_000_000)

    def test_replace_import_replays_the_same_backup(self) -> None:
        client, csrf = self.login("alice", "alice-password-123")
        headers = {"X-CSRF-Token": csrf}
        client.post(
            "/api/calendar/todos",
            headers=headers,
            json={"id": "replace-me", "title": "Restored task"},
        )
        backup = client.get("/api/data/export").json()["backup"]
        body = {"backup": backup, "mode": "replace", "replaceConfirmed": True, "source": "replace-test"}
        first = client.post("/api/data/import", headers=headers, json=body)
        self.assertEqual(first.status_code, 200, first.text)
        client.delete("/api/calendar/todos/replace-me", headers=headers)
        second = client.post("/api/data/import", headers=headers, json=body)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertTrue(second.json()["report"]["replayed"])
        self.assertEqual(client.get("/api/calendar/todos").json()["todos"][0]["title"], "Restored task")

    def test_goal_conversation_activation_and_dashboard_are_user_scoped(self) -> None:
        alice_client, alice_csrf = self.login("alice", "alice-password-123")
        bob_client, _bob_csrf = self.login("bob", "bob-password-123")
        headers = {"X-CSRF-Token": alice_csrf}
        created = alice_client.post(
            "/api/goal-conversations",
            headers=headers,
            json={"thread_id": "private-thread", "title": "Private goal"},
        )
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(bob_client.get("/api/goal-conversations/private-thread").status_code, 404)
        plan = {
            "title": "Private goal",
            "summary": "A measurable private plan.",
            "project_id": "private-project",
            "goal_id": "private-goal",
            "metrics": [{"name": "Completion", "role": "leading", "unit": "%", "direction": "increase", "target_value": 80}],
            "milestones": [{"title": "First milestone"}],
            "actions": [{"title": "First action", "due_date": "2026-08-01", "estimated_minutes": 30, "execution_tier": "standard"}],
            "policy": {"weekly_capacity_minutes": 120, "active_tier": "standard"},
        }
        activated = alice_client.post(
            "/api/goal-conversations/private-thread/activate",
            headers=headers,
            json=plan,
        )
        self.assertEqual(activated.status_code, 200, activated.text)
        dashboard = alice_client.get("/api/memory/projects/private-project/dashboard")
        self.assertEqual(dashboard.status_code, 200, dashboard.text)
        self.assertEqual(dashboard.json()["dashboard"]["actions"][0]["estimated_minutes"], 30)
        self.assertEqual(bob_client.get("/api/memory/projects/private-project/dashboard").status_code, 404)

    def test_goal_control_invalid_numerics_return_422_without_writes(self) -> None:
        client, csrf = self.login("alice", "alice-password-123")
        headers = {"X-CSRF-Token": csrf}
        created = client.post(
            "/api/memory/goal-projects",
            headers=headers,
            json={
                "goal": {"title": "Numeric validation goal"},
                "project": {"title": "Numeric validation project"},
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        project_id = created.json()["project"]["project_id"]
        metric = client.post(
            f"/api/memory/projects/{project_id}/metrics",
            headers=headers,
            json={"name": "Completion"},
        )
        self.assertEqual(metric.status_code, 200, metric.text)
        metric_id = metric.json()["metric"]["metric_id"]

        invalid_policy_values = (
            {"weekly_capacity_minutes": "bad"},
            {"weekly_capacity_minutes": True},
            {"buffer_percent": "Infinity"},
        )
        for value in invalid_policy_values:
            with self.subTest(policy=value):
                response = client.patch(
                    f"/api/memory/projects/{project_id}/control-policy",
                    headers=headers,
                    json=value,
                )
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(response.json()["error"]["code"], "goal_control_invalid")

        invalid_metric_values = (
            {"numeric_value": 1, "confidence": "bad"},
            {"numeric_value": "NaN"},
        )
        for value in invalid_metric_values:
            with self.subTest(metric=value):
                response = client.post(
                    f"/api/metrics/{metric_id}/entries",
                    headers=headers,
                    json=value,
                )
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(response.json()["error"]["code"], "goal_control_invalid")

        invalid_effort_values = (
            {"minutes": "bad"},
            {"minutes": 1.5},
            {"minutes": 30, "confidence": True},
        )
        for value in invalid_effort_values:
            with self.subTest(effort=value):
                response = client.post(
                    f"/api/memory/projects/{project_id}/effort",
                    headers=headers,
                    json=value,
                )
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(response.json()["error"]["code"], "goal_control_invalid")

        policy = client.get(
            f"/api/memory/projects/{project_id}/control-policy"
        ).json()["policy"]
        self.assertEqual(policy["weekly_capacity_minutes"], 300)
        self.assertEqual(policy["buffer_percent"], 20)
        metrics = client.get(
            f"/api/memory/projects/{project_id}/metrics"
        ).json()["metrics"]
        self.assertEqual(metrics[0]["entries"], [])
        effort = client.get(
            f"/api/memory/projects/{project_id}/effort"
        ).json()["effort"]
        self.assertEqual(effort, [])

    def test_memory_writes_reject_invalid_shapes_without_partial_writes(self) -> None:
        client, csrf = self.login("alice", "alice-password-123")
        headers = {"X-CSRF-Token": csrf}
        invalid_goals = (
            {"title": {"nested": "not text"}},
            {"title": "x" * 201},
            {"title": "Unknown field", "unexpected": True},
        )
        for payload in invalid_goals:
            with self.subTest(goal=payload):
                response = client.post(
                    "/api/memory/goals",
                    headers=headers,
                    json=payload,
                )
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(
                    response.json()["error"]["code"],
                    "invalid_request",
                )
        self.assertEqual(
            client.get("/api/memory/goals").json()["goals"],
            [],
        )

        created = client.post(
            "/api/memory/goal-projects",
            headers=headers,
            json={
                "goal": {"title": "Valid memory goal"},
                "project": {"title": "Valid memory project"},
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        project_id = created.json()["project"]["project_id"]

        bad_date = client.post(
            "/api/memory/milestones",
            headers=headers,
            json={
                "project_id": project_id,
                "title": "Invalid date milestone",
                "due_date": "not-a-date",
            },
        )
        self.assertEqual(bad_date.status_code, 422, bad_date.text)
        self.assertEqual(
            client.get(
                f"/api/memory/projects/{project_id}/milestones"
            ).json()["milestones"],
            [],
        )

        for payload in ({}, {"unexpected": True}):
            with self.subTest(project_patch=payload):
                response = client.patch(
                    f"/api/memory/projects/{project_id}",
                    headers=headers,
                    json=payload,
                )
                self.assertEqual(response.status_code, 422, response.text)
        project = client.get(
            f"/api/memory/projects/{project_id}"
        ).json()["project"]
        self.assertEqual(project["title"], "Valid memory project")

    def test_bootstrap_reports_backend_ai_truth_and_atomic_capabilities(self) -> None:
        client, _csrf = self.login("alice", "alice-password-123")

        payload = client.get("/api/bootstrap").json()

        self.assertEqual(payload["aiRuntime"]["mode"], "backend-managed")
        self.assertEqual(payload["aiRuntime"]["provider"], "deepseek-compatible")
        self.assertFalse(payload["aiRuntime"]["editable"])
        self.assertFalse(payload["aiRuntime"]["keyConfigured"])
        self.assertFalse(payload["aiRuntime"]["ruleBasedFallback"])
        self.assertTrue(payload["capabilities"]["calendarActionBatches"])
        self.assertTrue(payload["capabilities"]["globalScheduling"])
        self.assertTrue(payload["capabilities"]["aiConversationHistory"])
        self.assertTrue(payload["capabilities"]["specializedToolHandoff"])

    def test_calendar_action_batch_is_atomic_idempotent_and_tenant_scoped(self) -> None:
        alice_client, alice_csrf = self.login("alice", "alice-password-123")
        alice_headers = {"X-CSRF-Token": alice_csrf}
        def saved_batch(client, headers, batch):
            thread = client.post("/api/ai/conversations", headers=headers, json={"title": "Batch review"}).json()["thread"]["thread_id"]
            actions = []
            for action in batch["actions"]:
                raw = {"type": action["type"]}
                raw.update(action.get("event", action.get("todo", {})))
                for field in ("eventId", "todoId", "changes"):
                    if field in action:
                        raw[field] = action[field]
                actions.append(raw)
            response = client.post(f"/api/ai/conversations/{thread}/messages", headers=headers, json={"role": "assistant", "content": "Synthetic review", "structured": {"actionPlan": {"summary": "Batch", "actions": actions}}})
            self.assertEqual(response.status_code, 200, response.text)
            return {**batch, "aiPlanRef": {"threadId": thread, "messageId": response.json()["message"]["message_id"]}, "aiPlanOperation": "apply"}

        first_event = {
            "title": "Atomic review",
            "startAt": "2026-08-30T17:00:00Z",
            "endAt": "2026-08-30T18:00:00Z",
            "allDay": False,
        }
        rollback_batch = {
            "idempotencyKey": "rollback-on-second-action",
            "source": "ai-action-plan",
            "actions": [
                {
                    "clientActionId": "create-first",
                    "type": "create_event",
                    "event": first_event,
                },
                {
                    "clientActionId": "fail-second",
                    "type": "update_event",
                    "eventId": "missing-event",
                    "changes": {"title": "Must not persist"},
                },
            ],
        }

        rollback_batch = saved_batch(alice_client, alice_headers, rollback_batch)
        rolled_back = alice_client.post(
            "/api/calendar/action-batches",
            headers=alice_headers,
            json=rollback_batch,
        )
        self.assertEqual(rolled_back.status_code, 404, rolled_back.text)
        self.assertEqual(alice_client.get("/api/calendar/events", params={"start": "2026-08-01T00:00:00Z", "end": "2026-09-30T00:00:00Z"}).json()["events"], [])

        committed_batch = {
            "idempotencyKey": "stable-double-click-key",
            "source": "ai-action-plan",
            "actions": [
                {
                    "clientActionId": "create-once",
                    "type": "create_event",
                    "event": first_event,
                }
            ],
        }
        committed_batch = saved_batch(alice_client, alice_headers, committed_batch)
        committed = alice_client.post(
            "/api/calendar/action-batches",
            headers=alice_headers,
            json=committed_batch,
        )
        replayed = alice_client.post(
            "/api/calendar/action-batches",
            headers=alice_headers,
            json=committed_batch,
        )
        self.assertEqual(committed.status_code, 200, committed.text)
        self.assertFalse(committed.json()["replayed"])
        self.assertEqual(replayed.status_code, 200, replayed.text)
        self.assertTrue(replayed.json()["replayed"])
        self.assertEqual(len(alice_client.get("/api/calendar/events", params={"start": "2026-08-01T00:00:00Z", "end": "2026-09-30T00:00:00Z"}).json()["events"]), 1)

        changed_payload = {
            **committed_batch,
            "actions": [
                {
                    **committed_batch["actions"][0],
                    "event": {**first_event, "title": "Different payload"},
                }
            ],
        }
        conflict = alice_client.post(
            "/api/calendar/action-batches",
            headers=alice_headers,
            json=changed_payload,
        )
        self.assertEqual(conflict.status_code, 409, conflict.text)
        self.assertEqual(conflict.json()["error"]["code"], "calendar_batch_conflict")

        event_id = committed.json()["eventsUpserted"][0]["id"]
        invalid_time = alice_client.post(
            "/api/calendar/action-batches",
            headers=alice_headers,
            json=saved_batch(alice_client, alice_headers, {
                "idempotencyKey": "invalid-partial-time-update",
                "source": "ai-action-plan",
                "actions": [
                    {
                        "clientActionId": "invalid-time",
                        "type": "update_event",
                        "eventId": event_id,
                        "changes": {"endAt": "2026-08-30T16:00:00Z"},
                    }
                ],
            }),
        )
        self.assertEqual(invalid_time.status_code, 422, invalid_time.text)
        self.assertEqual(
            next(event for event in alice_client.get("/api/calendar/events", params={"start": "2026-08-01T00:00:00Z", "end": "2026-09-30T00:00:00Z"}).json()["events"] if event["id"] == event_id)["endAt"],
            "2026-08-30T18:00:00Z",
        )

        bob_client, bob_csrf = self.login("bob", "bob-password-123")
        bob_attempt = bob_client.post(
            "/api/calendar/action-batches",
            headers={"X-CSRF-Token": bob_csrf},
            json=saved_batch(bob_client, {"X-CSRF-Token": bob_csrf}, {
                "idempotencyKey": "bob-cannot-touch-alice",
                "source": "ai-action-plan",
                "actions": [
                    {
                        "clientActionId": "cross-tenant-update",
                        "type": "update_event",
                        "eventId": event_id,
                        "changes": {"title": "Cross tenant"},
                    }
                ],
            }),
        )
        self.assertEqual(bob_attempt.status_code, 404, bob_attempt.text)
        self.assertEqual(bob_client.get("/api/calendar/events", params={"start": "2026-08-01T00:00:00Z", "end": "2026-09-30T00:00:00Z"}).json()["events"], [])

    def test_ai_review_apply_copy_reload_and_dismiss(self) -> None:
        client, csrf = self.login("alice", "alice-password-123")
        headers = {"X-CSRF-Token": csrf}
        thread = client.post("/api/ai/conversations", headers=headers, json={"thread_id": "review-chat", "title": "Review"})
        self.assertEqual(thread.status_code, 200, thread.text)
        saved = client.post("/api/ai/conversations/review-chat/messages", headers=headers, json={"message_id": "review-message", "role": "assistant", "content": "One task", "structured": {"actionPlan": {"summary": "One task", "actions": [{"type": "create_todo", "title": "One task"}]}}})
        self.assertEqual(saved.status_code, 200, saved.text)
        batch = {"source": "ai-action-plan", "idempotencyKey": "caller", "aiPlanRef": {"threadId": "review-chat", "messageId": "review-message"}, "aiPlanOperation": "apply", "actions": [{"clientActionId": "one", "type": "create_todo", "todo": {"title": "One task"}}]}
        applied = client.post("/api/calendar/action-batches", headers=headers, json=batch)
        self.assertEqual(applied.status_code, 200, applied.text)
        self.assertFalse(applied.json()["replayed"])
        self.assertTrue(client.post("/api/calendar/action-batches", headers=headers, json={**batch, "idempotencyKey": "another-browser"}).json()["replayed"])
        loaded = client.get("/api/ai/conversations/review-chat").json()["messages"][0]
        self.assertEqual(loaded["structured"]["actionPlanReview"]["operations"]["apply"]["status"], "applied")
        copied = client.post("/api/calendar/action-batches", headers=headers, json={**batch, "aiPlanOperation": "copy_to_todos"})
        self.assertEqual(copied.status_code, 200, copied.text)
        self.assertEqual(len(client.get("/api/calendar/todos").json()["todos"]), 2)
        dismissed = client.post("/api/ai/conversations/review-chat/messages/review-message/action-plan/dismiss", headers=headers)
        self.assertEqual(dismissed.status_code, 200, dismissed.text)
        self.assertTrue(dismissed.json()["message"]["structured"]["actionPlanReview"]["dismissed"])
        legacy = client.post("/api/calendar/action-batches", headers=headers, json={key: value for key, value in batch.items() if key not in {"aiPlanRef", "aiPlanOperation"}})
        self.assertEqual(legacy.status_code, 409, legacy.text)

    def test_ai_conversation_history_is_reloadable_and_tenant_scoped(self) -> None:
        alice_client, alice_csrf = self.login("alice", "alice-password-123")
        alice_headers = {"X-CSRF-Token": alice_csrf}
        created = alice_client.post(
            "/api/ai/conversations",
            headers=alice_headers,
            json={"title": "Plan my week", "metadata": {"surface": "ai-assistant"}},
        )
        self.assertEqual(created.status_code, 200, created.text)
        thread_id = created.json()["thread"]["thread_id"]
        for role, content in (("user", "Plan my week"), ("assistant", "Here is a draft.")):
            response = alice_client.post(
                f"/api/ai/conversations/{thread_id}/messages",
                headers=alice_headers,
                json={"role": role, "content": content, "structured": {}},
            )
            self.assertEqual(response.status_code, 200, response.text)

        reloaded = alice_client.get(f"/api/ai/conversations/{thread_id}")
        self.assertEqual(
            [message["content"] for message in reloaded.json()["messages"]],
            ["Plan my week", "Here is a draft."],
        )

        bob_client, _bob_csrf = self.login("bob", "bob-password-123")
        self.assertEqual(bob_client.get("/api/ai/conversations").json()["threads"], [])
        self.assertEqual(bob_client.get(f"/api/ai/conversations/{thread_id}").status_code, 404)


if __name__ == "__main__":
    unittest.main()
