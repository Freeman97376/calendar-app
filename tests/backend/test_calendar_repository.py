from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.calendar import CalendarRepository


class CalendarRepositoryTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
