from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.calendar import CalendarRepository
from backend.calendar.repository import CalendarReferenceError


class CalendarRepositoryTests(unittest.TestCase):
    def test_deletes_clear_only_same_tenant_calendar_references(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repository = CalendarRepository(Path(tmp_dir) / 'calendar.sqlite3')
            for user_id in ('alice', 'bob'):
                repository.create_event(
                    {
                        'id': 'event-to-delete',
                        'title': 'Target event',
                        'startAt': '2026-06-20T16:00:00Z',
                        'endAt': '2026-06-20T17:00:00Z',
                    },
                    user_id,
                )
                repository.create_todo(
                    {
                        'id': 'linked-to-event',
                        'title': 'Linked todo',
                        'linkedEventId': 'event-to-delete',
                    },
                    user_id,
                )
                repository.create_event(
                    {
                        'id': 'master-child',
                        'title': 'Recurring child',
                        'startAt': '2026-06-21T16:00:00Z',
                        'endAt': '2026-06-21T17:00:00Z',
                        'masterId': 'event-to-delete',
                    },
                    user_id,
                )
                repository.create_event(
                    {
                        'id': 'exception-child',
                        'title': 'Recurring exception',
                        'startAt': '2026-06-22T16:00:00Z',
                        'endAt': '2026-06-22T17:00:00Z',
                        'exceptionFor': 'event-to-delete',
                    },
                    user_id,
                )
                repository.create_todo(
                    {'id': 'todo-to-delete', 'title': 'Target todo'},
                    user_id,
                )
                repository.create_event(
                    {
                        'id': 'linked-to-todo',
                        'title': 'Linked event',
                        'startAt': '2026-06-23T16:00:00Z',
                        'endAt': '2026-06-23T17:00:00Z',
                        'linkedTodoId': 'todo-to-delete',
                    },
                    user_id,
                )

            repository.delete_event('event-to-delete', 'alice')
            repository.delete_todo('todo-to-delete', 'alice')

            self.assertNotIn('linkedEventId', repository.get_todo('linked-to-event', 'alice'))
            self.assertNotIn('masterId', repository.get_event('master-child', 'alice'))
            self.assertNotIn('exceptionFor', repository.get_event('exception-child', 'alice'))
            self.assertNotIn('linkedTodoId', repository.get_event('linked-to-todo', 'alice'))
            self.assertEqual(
                repository.get_todo('linked-to-event', 'bob')['linkedEventId'],
                'event-to-delete',
            )
            self.assertEqual(
                repository.get_event('master-child', 'bob')['masterId'],
                'event-to-delete',
            )
            self.assertEqual(
                repository.get_event('exception-child', 'bob')['exceptionFor'],
                'event-to-delete',
            )
            self.assertEqual(
                repository.get_event('linked-to-todo', 'bob')['linkedTodoId'],
                'todo-to-delete',
            )

    def test_calendar_entities_round_trip_with_task_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repository = CalendarRepository(Path(tmp_dir) / "calendar.sqlite3")

            event_type = repository.upsert_event_type(
                {
                    "id": "deep-work",
                    "label": "Deep Work",
                    "color": "#047857",
                    "appliesTo": "both",
                }
            )
            todo = repository.create_todo(
                {
                    "title": "Draft launch plan",
                    "notes": "Prepare outline.",
                    "eventTypeId": event_type["id"],
                    "dueDate": "2026-06-20",
                    "etaMinutes": 45,
                    "energyNeeded": "high",
                    "priority": "high",
                }
            )
            event = repository.create_event(
                {
                    "title": todo["title"],
                    "description": todo["notes"],
                    "displayDetails": "Task metadata: 45 min, high priority, high energy",
                    "startAt": "2026-06-20T16:00:00.000Z",
                    "endAt": "2026-06-20T16:45:00.000Z",
                    "allDay": False,
                    "eventTypeId": event_type["id"],
                    "linkedTodoId": todo["id"],
                }
            )
            updated_todo = repository.update_todo(todo["id"], {"linkedEventId": event["id"]})

            self.assertEqual(event_type["label"], "Deep Work")
            self.assertEqual(todo["etaMinutes"], 45)
            self.assertEqual(todo["energyNeeded"], "high")
            self.assertEqual(event["linkedTodoId"], todo["id"])
            self.assertEqual(updated_todo["linkedEventId"], event["id"])
            self.assertEqual(len(repository.list_todos()), 1)
            self.assertEqual(
                repository.list_events("2026-06-20T00:00:00.000Z", "2026-06-20T23:59:59.999Z")[0]["id"],
                event["id"],
            )
            self.assertEqual(repository.list_event_types()[0]["id"], "deep-work")

    def test_import_local_snapshot_preserves_local_data_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repository = CalendarRepository(Path(tmp_dir) / "calendar.sqlite3")

            result = repository.import_local_snapshot(
                {
                    "eventTypes": [
                        {
                            "id": "general",
                            "label": "General",
                            "color": "#047857",
                            "appliesTo": "both",
                        }
                    ],
                    "todos": [
                        {
                            "id": "todo-1",
                            "title": "Imported task",
                            "etaMinutes": 30,
                            "energyNeeded": "medium",
                            "priority": "medium",
                            "createdAt": "2026-06-20T10:00:00.000Z",
                            "updatedAt": "2026-06-20T10:00:00.000Z",
                        }
                    ],
                    "events": [
                        {
                            "id": "event-1",
                            "title": "Imported event",
                            "startAt": "2026-06-20T16:00:00.000Z",
                            "endAt": "2026-06-20T16:30:00.000Z",
                            "allDay": False,
                            "createdAt": "2026-06-20T10:00:00.000Z",
                            "updatedAt": "2026-06-20T10:00:00.000Z",
                        }
                    ],
                }
            )

            self.assertEqual(result, {"eventTypes": 1, "events": 1, "todos": 1})
            self.assertEqual(repository.list_todos()[0]["id"], "todo-1")
            self.assertEqual(
                repository.list_events("2026-06-20T00:00:00.000Z", "2026-06-20T23:59:59.999Z")[0]["id"],
                "event-1",
            )

    def test_calendar_references_are_user_scoped(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repository = CalendarRepository(Path(tmp_dir) / "calendar.sqlite3")
            repository.upsert_event_type(
                {"id": "private-type", "label": "Private", "color": "#047857"},
                "alice",
            )
            repository.create_todo({"id": "private-todo", "title": "Private"}, "alice")
            repository.create_event(
                {
                    "id": "private-event",
                    "title": "Private",
                    "startAt": "2026-06-20T16:00:00Z",
                    "endAt": "2026-06-20T17:00:00Z",
                },
                "alice",
            )

            invalid_writes = (
                lambda: repository.create_todo(
                    {"title": "Bad type", "eventTypeId": "private-type"},
                    "bob",
                ),
                lambda: repository.create_todo(
                    {"title": "Bad event", "linkedEventId": "private-event"},
                    "bob",
                ),
                lambda: repository.create_event(
                    {
                        "title": "Bad todo",
                        "startAt": "2026-06-20T16:00:00Z",
                        "endAt": "2026-06-20T17:00:00Z",
                        "linkedTodoId": "private-todo",
                    },
                    "bob",
                ),
                lambda: repository.create_event(
                    {
                        "title": "Bad master",
                        "startAt": "2026-06-20T16:00:00Z",
                        "endAt": "2026-06-20T17:00:00Z",
                        "masterId": "private-event",
                    },
                    "bob",
                ),
            )
            for write in invalid_writes:
                with self.assertRaises(CalendarReferenceError):
                    write()

            general = repository.create_todo(
                {"id": "general-is-built-in", "title": "Compatible", "eventTypeId": "general"},
                "bob",
            )
            self.assertEqual(general["eventTypeId"], "general")

    def test_snapshot_import_is_atomic_supports_forward_references_and_replay(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repository = CalendarRepository(Path(tmp_dir) / "calendar.sqlite3")
            snapshot = {
                "eventTypes": [
                    {"id": "focus", "label": "Focus", "color": "#047857"},
                ],
                "todos": [
                    {
                        "id": "todo-forward",
                        "title": "Forward todo",
                        "eventTypeId": "focus",
                        "linkedEventId": "event-forward",
                    }
                ],
                "events": [
                    {
                        "id": "event-forward",
                        "title": "Forward event",
                        "startAt": "2026-06-20T16:00:00Z",
                        "endAt": "2026-06-20T17:00:00Z",
                        "eventTypeId": "focus",
                        "linkedTodoId": "todo-forward",
                    }
                ],
            }

            first = repository.import_local_snapshot(snapshot, "alice")
            second = repository.import_local_snapshot(snapshot, "alice")
            self.assertEqual(first, {"eventTypes": 1, "events": 1, "todos": 1})
            self.assertEqual(second, first)
            self.assertEqual(len(repository.list_todos("alice")), 1)
            self.assertEqual(
                len(repository.list_events("2026-06-20T00:00:00Z", "2026-06-20T23:59:59Z", "alice")),
                1,
            )

            invalid = {
                "eventTypes": [
                    {"id": "rolled-back", "label": "Rolled back", "color": "#123456"},
                ],
                "events": [
                    {
                        "id": "late-invalid",
                        "title": "Must roll back",
                        "startAt": "2026-06-20T18:00:00Z",
                        "endAt": "2026-06-20T19:00:00Z",
                        "eventTypeId": "rolled-back",
                        "linkedTodoId": "missing-todo",
                    }
                ],
            }
            with self.assertRaises(CalendarReferenceError):
                repository.import_local_snapshot(invalid, "alice")
            self.assertNotIn(
                "rolled-back",
                {item["id"] for item in repository.list_event_types("alice")},
            )

            late_failure = {
                "eventTypes": [
                    {"id": "late-type", "label": "Late", "color": "#654321"},
                ],
                "events": [
                    {
                        "id": "late-event",
                        "title": "Late failure",
                        "startAt": "2026-06-20T20:00:00Z",
                        "endAt": "2026-06-20T21:00:00Z",
                        "eventTypeId": "late-type",
                    }
                ],
            }
            with (
                patch.object(
                    repository,
                    "_create_event_in_session",
                    side_effect=RuntimeError("simulated late write failure"),
                ),
                self.assertRaisesRegex(RuntimeError, "simulated late write failure"),
            ):
                repository.import_local_snapshot(late_failure, "alice")
            self.assertNotIn(
                "late-type",
                {item["id"] for item in repository.list_event_types("alice")},
            )


if __name__ == "__main__":
    unittest.main()
