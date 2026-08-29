from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TypeVar

from sqlalchemy import delete, select, update
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from ..database import (
    EventRecord,
    EventTypeRecord,
    TodoRecord,
    create_database_engine,
    create_session_factory,
    initialize_schema,
)


class CalendarRowNotFoundError(KeyError):
    pass


class CalendarReferenceError(ValueError):
    pass


RecordT = TypeVar("RecordT", EventRecord, EventTypeRecord, TodoRecord)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def todo_from_record(record: TodoRecord) -> dict[str, Any]:
    output: dict[str, Any] = {
        "id": record.id,
        "title": record.title,
        "status": record.status,
        "eventTypeId": record.event_type_id,
        "etaMinutes": record.eta_minutes,
        "energyNeeded": record.energy_needed,
        "priority": record.priority,
        "createdAt": record.created_at,
        "updatedAt": record.updated_at,
    }
    for key, value in {
        "notes": record.notes,
        "dueDate": record.due_date,
        "linkedEventId": record.linked_event_id,
        "completedAt": record.completed_at,
    }.items():
        if value is not None:
            output[key] = value
    if record.long_project_json:
        output["longProject"] = record.long_project_json
    return output


def event_from_record(record: EventRecord) -> dict[str, Any]:
    output: dict[str, Any] = {
        "id": record.id,
        "title": record.title,
        "startAt": record.start_at,
        "endAt": record.end_at,
        "allDay": bool(record.all_day),
        "eventTypeId": record.event_type_id,
        "syncStatus": record.sync_status,
        "createdAt": record.created_at,
        "updatedAt": record.updated_at,
    }
    for key, value in {
        "description": record.description,
        "displayDetails": record.display_details,
        "color": record.color,
        "linkedTodoId": record.linked_todo_id,
        "masterId": record.master_id,
        "exceptionFor": record.exception_for,
        "exceptionDate": record.exception_date,
    }.items():
        if value is not None:
            output[key] = value
    if record.recurrence_rule_json:
        output["recurrenceRule"] = record.recurrence_rule_json
    if record.deleted_occurrences_json:
        output["deletedOccurrences"] = record.deleted_occurrences_json
    return output


def event_type_from_record(record: EventTypeRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "label": record.label,
        "color": record.color,
        "appliesTo": record.applies_to,
        "isArchived": bool(record.is_archived),
        "createdAt": record.created_at,
        "updatedAt": record.updated_at,
    }


class CalendarRepository:
    def __init__(
        self,
        db_path: Path | str | None = None,
        *,
        engine: Engine | None = None,
        initialize: bool | None = None,
    ) -> None:
        owns_engine = engine is None
        self.engine = engine or create_database_engine(db_path=db_path)
        if initialize if initialize is not None else owns_engine:
            initialize_schema(self.engine)
        self.session_factory = create_session_factory(self.engine)

    def list_todos(self, user_id: str = "local") -> list[dict[str, Any]]:
        with self.session_factory() as session:
            records = session.scalars(
                select(TodoRecord)
                .where(TodoRecord.user_id == user_id)
                .order_by(TodoRecord.created_at.desc(), TodoRecord.title.asc())
            ).all()
            return [todo_from_record(record) for record in records]

    def create_todo(self, payload: dict[str, Any], user_id: str = "local") -> dict[str, Any]:
        with self.session_factory.begin() as session:
            record = self._create_todo_in_session(session, payload, user_id)
        return todo_from_record(record)

    def get_todo(self, todo_id: str, user_id: str = "local") -> dict[str, Any]:
        with self.session_factory() as session:
            return todo_from_record(self._required(session, TodoRecord, TodoRecord.id, todo_id, user_id, "todo"))

    def update_todo(self, todo_id: str, payload: dict[str, Any], user_id: str = "local") -> dict[str, Any]:
        with self.session_factory.begin() as session:
            record = self._update_todo_in_session(session, todo_id, payload, user_id)
        return todo_from_record(record)

    def delete_todo(self, todo_id: str, user_id: str = "local") -> None:
        with self.session_factory.begin() as session:
            record = self._required(session, TodoRecord, TodoRecord.id, todo_id, user_id, "todo")
            session.execute(
                update(EventRecord)
                .where(
                    EventRecord.user_id == user_id,
                    EventRecord.linked_todo_id == todo_id,
                )
                .values(linked_todo_id=None, updated_at=now_iso())
            )
            session.delete(record)

    def list_events(self, start: str, end: str, user_id: str = "local") -> list[dict[str, Any]]:
        with self.session_factory() as session:
            records = session.scalars(
                select(EventRecord)
                .where(
                    EventRecord.user_id == user_id,
                    EventRecord.end_at >= start,
                    EventRecord.start_at <= end,
                )
                .order_by(EventRecord.start_at.asc(), EventRecord.title.asc())
            ).all()
            return [event_from_record(record) for record in records]

    def create_event(self, payload: dict[str, Any], user_id: str = "local") -> dict[str, Any]:
        with self.session_factory.begin() as session:
            record = self._create_event_in_session(session, payload, user_id)
        return event_from_record(record)

    def get_event(self, event_id: str, user_id: str = "local") -> dict[str, Any]:
        with self.session_factory() as session:
            return event_from_record(
                self._required(session, EventRecord, EventRecord.id, event_id, user_id, "event")
            )

    def update_event(self, event_id: str, payload: dict[str, Any], user_id: str = "local") -> dict[str, Any]:
        with self.session_factory.begin() as session:
            record = self._update_event_in_session(session, event_id, payload, user_id)
        return event_from_record(record)

    def delete_event(self, event_id: str, user_id: str = "local") -> None:
        with self.session_factory.begin() as session:
            record = self._required(session, EventRecord, EventRecord.id, event_id, user_id, "event")
            timestamp = now_iso()
            session.execute(
                update(TodoRecord)
                .where(
                    TodoRecord.user_id == user_id,
                    TodoRecord.linked_event_id == event_id,
                )
                .values(linked_event_id=None, updated_at=timestamp)
            )
            session.execute(
                update(EventRecord)
                .where(
                    EventRecord.user_id == user_id,
                    EventRecord.master_id == event_id,
                )
                .values(master_id=None, updated_at=timestamp)
            )
            session.execute(
                update(EventRecord)
                .where(
                    EventRecord.user_id == user_id,
                    EventRecord.exception_for == event_id,
                )
                .values(exception_for=None, updated_at=timestamp)
            )
            session.delete(record)

    def list_event_types(self, user_id: str = "local") -> list[dict[str, Any]]:
        with self.session_factory() as session:
            records = session.scalars(
                select(EventTypeRecord)
                .where(EventTypeRecord.user_id == user_id)
                .order_by(EventTypeRecord.is_archived.asc(), EventTypeRecord.label.asc())
            ).all()
            return [event_type_from_record(record) for record in records]

    def upsert_event_type(
        self,
        payload: dict[str, Any],
        user_id: str = "local",
        *,
        create_missing: bool = True,
    ) -> dict[str, Any]:
        with self.session_factory.begin() as session:
            record = self._upsert_event_type_in_session(
                session,
                payload,
                user_id,
                create_missing=create_missing,
            )
        return event_type_from_record(record)

    def import_local_snapshot(self, payload: dict[str, Any], user_id: str = "local") -> dict[str, int]:
        counts = {"eventTypes": 0, "events": 0, "todos": 0}
        event_types = payload.get("eventTypes", [])
        todos = payload.get("todos", [])
        events = payload.get("events", [])
        with self.session_factory.begin() as session:
            references = self._snapshot_reference_sets(session, user_id, event_types, todos, events)
            self._validate_snapshot_references(todos, events, references)

            for event_type in event_types:
                self._upsert_event_type_in_session(session, event_type, user_id)
                counts["eventTypes"] += 1
            for todo in todos:
                todo_id = str(todo["id"])
                record = self._find(session, TodoRecord, TodoRecord.id, todo_id, user_id)
                if record is None:
                    self._create_todo_in_session(session, todo, user_id, references=references)
                else:
                    self._update_todo_in_session(
                        session,
                        todo_id,
                        todo,
                        user_id,
                        references=references,
                    )
                counts["todos"] += 1
            for event in events:
                event_id = str(event["id"])
                record = self._find(session, EventRecord, EventRecord.id, event_id, user_id)
                if record is None:
                    self._create_event_in_session(session, event, user_id, references=references)
                else:
                    self._update_event_in_session(
                        session,
                        event_id,
                        event,
                        user_id,
                        references=references,
                    )
                counts["events"] += 1
        return counts

    def _create_todo_in_session(
        self,
        session: Session,
        payload: dict[str, Any],
        user_id: str,
        *,
        references: dict[str, set[str]] | None = None,
    ) -> TodoRecord:
        self._validate_todo_references(session, payload, user_id, references)
        timestamp = now_iso()
        record = TodoRecord(
            id=str(payload.get("id") or new_id("todo")),
            user_id=user_id,
            title=str(payload["title"]),
            notes=payload.get("notes"),
            status=str(payload.get("status", "todo")),
            event_type_id=str(payload.get("eventTypeId", "general")),
            due_date=payload.get("dueDate"),
            linked_event_id=payload.get("linkedEventId"),
            long_project_json=payload.get("longProject"),
            eta_minutes=int(payload.get("etaMinutes", 30)),
            energy_needed=str(payload.get("energyNeeded", "medium")),
            priority=str(payload.get("priority", "medium")),
            created_at=str(payload.get("createdAt", timestamp)),
            updated_at=str(payload.get("updatedAt", timestamp)),
            completed_at=payload.get("completedAt"),
        )
        session.add(record)
        return record

    def _update_todo_in_session(
        self,
        session: Session,
        todo_id: str,
        payload: dict[str, Any],
        user_id: str,
        *,
        references: dict[str, set[str]] | None = None,
    ) -> TodoRecord:
        self._validate_todo_references(session, payload, user_id, references)
        record = self._required(session, TodoRecord, TodoRecord.id, todo_id, user_id, "todo")
        mapping = {
            "title": "title",
            "notes": "notes",
            "status": "status",
            "eventTypeId": "event_type_id",
            "dueDate": "due_date",
            "linkedEventId": "linked_event_id",
            "longProject": "long_project_json",
            "etaMinutes": "eta_minutes",
            "energyNeeded": "energy_needed",
            "priority": "priority",
            "completedAt": "completed_at",
        }
        self._apply_patch(record, payload, mapping)
        record.updated_at = str(payload.get("updatedAt", now_iso()))
        return record

    def _create_event_in_session(
        self,
        session: Session,
        payload: dict[str, Any],
        user_id: str,
        *,
        references: dict[str, set[str]] | None = None,
    ) -> EventRecord:
        self._validate_event_references(session, payload, user_id, references)
        timestamp = now_iso()
        record = EventRecord(
            id=str(payload.get("id") or new_id("event")),
            user_id=user_id,
            title=str(payload["title"]),
            description=payload.get("description"),
            display_details=payload.get("displayDetails"),
            start_at=str(payload["startAt"]),
            end_at=str(payload["endAt"]),
            all_day=bool(payload.get("allDay", False)),
            color=payload.get("color"),
            event_type_id=str(payload.get("eventTypeId", "general")),
            linked_todo_id=payload.get("linkedTodoId"),
            recurrence_rule_json=payload.get("recurrenceRule"),
            master_id=payload.get("masterId"),
            exception_for=payload.get("exceptionFor"),
            exception_date=payload.get("exceptionDate"),
            deleted_occurrences_json=payload.get("deletedOccurrences"),
            sync_status=str(payload.get("syncStatus", "pending")),
            created_at=str(payload.get("createdAt", timestamp)),
            updated_at=str(payload.get("updatedAt", timestamp)),
        )
        session.add(record)
        return record

    def _update_event_in_session(
        self,
        session: Session,
        event_id: str,
        payload: dict[str, Any],
        user_id: str,
        *,
        references: dict[str, set[str]] | None = None,
    ) -> EventRecord:
        self._validate_event_references(session, payload, user_id, references)
        record = self._required(session, EventRecord, EventRecord.id, event_id, user_id, "event")
        mapping = {
            "title": "title",
            "description": "description",
            "displayDetails": "display_details",
            "startAt": "start_at",
            "endAt": "end_at",
            "allDay": "all_day",
            "color": "color",
            "eventTypeId": "event_type_id",
            "linkedTodoId": "linked_todo_id",
            "recurrenceRule": "recurrence_rule_json",
            "masterId": "master_id",
            "exceptionFor": "exception_for",
            "exceptionDate": "exception_date",
            "deletedOccurrences": "deleted_occurrences_json",
            "syncStatus": "sync_status",
        }
        self._apply_patch(record, payload, mapping)
        record.updated_at = str(payload.get("updatedAt", now_iso()))
        return record

    def _upsert_event_type_in_session(
        self,
        session: Session,
        payload: dict[str, Any],
        user_id: str,
        *,
        create_missing: bool = True,
    ) -> EventTypeRecord:
        timestamp = now_iso()
        external_id = str(payload["id"])
        record = self._find(session, EventTypeRecord, EventTypeRecord.id, external_id, user_id)
        if record is None:
            if not create_missing:
                raise CalendarRowNotFoundError(f"event type not found: {external_id}")
            record = EventTypeRecord(
                id=external_id,
                user_id=user_id,
                label=str(payload["label"]),
                color=str(payload.get("color", "#047857")),
                applies_to=str(payload.get("appliesTo", "both")),
                is_archived=bool(payload.get("isArchived", False)),
                created_at=str(payload.get("createdAt", timestamp)),
                updated_at=str(payload.get("updatedAt", timestamp)),
            )
            session.add(record)
        else:
            if "label" in payload:
                record.label = str(payload["label"])
            if "color" in payload:
                record.color = str(payload["color"])
            if "appliesTo" in payload:
                record.applies_to = str(payload["appliesTo"])
            if "isArchived" in payload:
                record.is_archived = bool(payload["isArchived"])
            record.updated_at = str(payload.get("updatedAt", timestamp))
        return record

    def _validate_todo_references(
        self,
        session: Session,
        payload: dict[str, Any],
        user_id: str,
        references: dict[str, set[str]] | None,
    ) -> None:
        event_type_id = str(payload.get("eventTypeId", "general"))
        self._require_reference(
            session,
            EventTypeRecord,
            EventTypeRecord.id,
            event_type_id,
            user_id,
            "eventTypeId",
            references["eventTypes"] if references else None,
            allow_general=True,
        )
        linked_event_id = payload.get("linkedEventId")
        if linked_event_id is not None:
            self._require_reference(
                session,
                EventRecord,
                EventRecord.id,
                str(linked_event_id),
                user_id,
                "linkedEventId",
                references["events"] if references else None,
            )

    def _validate_event_references(
        self,
        session: Session,
        payload: dict[str, Any],
        user_id: str,
        references: dict[str, set[str]] | None,
    ) -> None:
        event_type_id = str(payload.get("eventTypeId", "general"))
        self._require_reference(
            session,
            EventTypeRecord,
            EventTypeRecord.id,
            event_type_id,
            user_id,
            "eventTypeId",
            references["eventTypes"] if references else None,
            allow_general=True,
        )
        linked_todo_id = payload.get("linkedTodoId")
        if linked_todo_id is not None:
            self._require_reference(
                session,
                TodoRecord,
                TodoRecord.id,
                str(linked_todo_id),
                user_id,
                "linkedTodoId",
                references["todos"] if references else None,
            )
        for field_name in ("masterId", "exceptionFor"):
            event_id = payload.get(field_name)
            if event_id is not None:
                self._require_reference(
                    session,
                    EventRecord,
                    EventRecord.id,
                    str(event_id),
                    user_id,
                    field_name,
                    references["events"] if references else None,
                )

    def _snapshot_reference_sets(
        self,
        session: Session,
        user_id: str,
        event_types: list[dict[str, Any]],
        todos: list[dict[str, Any]],
        events: list[dict[str, Any]],
    ) -> dict[str, set[str]]:
        snapshot_ids = {
            "eventTypes": self._unique_snapshot_ids("eventTypes", event_types),
            "todos": self._unique_snapshot_ids("todos", todos),
            "events": self._unique_snapshot_ids("events", events),
        }
        snapshot_ids["eventTypes"].add("general")
        snapshot_ids["eventTypes"].update(
            str(value)
            for value in session.scalars(
                select(EventTypeRecord.id).where(EventTypeRecord.user_id == user_id)
            )
        )
        snapshot_ids["todos"].update(
            str(value)
            for value in session.scalars(select(TodoRecord.id).where(TodoRecord.user_id == user_id))
        )
        snapshot_ids["events"].update(
            str(value)
            for value in session.scalars(select(EventRecord.id).where(EventRecord.user_id == user_id))
        )
        return snapshot_ids

    def _validate_snapshot_references(
        self,
        todos: list[dict[str, Any]],
        events: list[dict[str, Any]],
        references: dict[str, set[str]],
    ) -> None:
        for index, todo in enumerate(todos):
            event_type_id = str(todo.get("eventTypeId", "general"))
            self._require_snapshot_reference(
                "todos",
                index,
                "eventTypeId",
                event_type_id,
                references["eventTypes"],
            )
            linked_event_id = todo.get("linkedEventId")
            if linked_event_id is not None:
                self._require_snapshot_reference(
                    "todos",
                    index,
                    "linkedEventId",
                    str(linked_event_id),
                    references["events"],
                )
        for index, event in enumerate(events):
            event_type_id = str(event.get("eventTypeId", "general"))
            self._require_snapshot_reference(
                "events",
                index,
                "eventTypeId",
                event_type_id,
                references["eventTypes"],
            )
            linked_todo_id = event.get("linkedTodoId")
            if linked_todo_id is not None:
                self._require_snapshot_reference(
                    "events",
                    index,
                    "linkedTodoId",
                    str(linked_todo_id),
                    references["todos"],
                )
            for field_name in ("masterId", "exceptionFor"):
                referenced_event_id = event.get(field_name)
                if referenced_event_id is not None:
                    self._require_snapshot_reference(
                        "events",
                        index,
                        field_name,
                        str(referenced_event_id),
                        references["events"],
                    )

    @staticmethod
    def _unique_snapshot_ids(label: str, items: list[dict[str, Any]]) -> set[str]:
        identifiers = [str(item["id"]) for item in items]
        if len(identifiers) != len(set(identifiers)):
            raise CalendarReferenceError(f"{label} must not contain duplicate ids.")
        return set(identifiers)

    @staticmethod
    def _require_snapshot_reference(
        collection: str,
        index: int,
        field_name: str,
        external_id: str,
        allowed_ids: set[str],
    ) -> None:
        if external_id not in allowed_ids:
            raise CalendarReferenceError(
                f"{collection}[{index}].{field_name} references a missing calendar item: {external_id}"
            )

    @classmethod
    def _require_reference(
        cls,
        session: Session,
        model: type[RecordT],
        id_column: Any,
        external_id: str,
        user_id: str,
        field_name: str,
        allowed_ids: set[str] | None,
        *,
        allow_general: bool = False,
    ) -> None:
        if allow_general and external_id == "general":
            return
        exists = external_id in allowed_ids if allowed_ids is not None else (
            cls._find(session, model, id_column, external_id, user_id) is not None
        )
        if not exists:
            raise CalendarReferenceError(
                f"{field_name} references a missing calendar item: {external_id}"
            )

    def clear_user(self, user_id: str) -> None:
        with self.session_factory.begin() as session:
            session.execute(delete(EventRecord).where(EventRecord.user_id == user_id))
            session.execute(delete(TodoRecord).where(TodoRecord.user_id == user_id))
            session.execute(delete(EventTypeRecord).where(EventTypeRecord.user_id == user_id))

    @staticmethod
    def _apply_patch(record: Any, payload: dict[str, Any], mapping: dict[str, str]) -> None:
        for public_key, column in mapping.items():
            if public_key in payload:
                setattr(record, column, payload[public_key])

    @staticmethod
    def _find(
        session: Session,
        model: type[RecordT],
        id_column: Any,
        external_id: str,
        user_id: str,
    ) -> RecordT | None:
        return session.scalar(
            select(model).where(model.user_id == user_id, id_column == external_id)
        )

    @staticmethod
    def _required(
        session: Session,
        model: type[RecordT],
        id_column: Any,
        external_id: str,
        user_id: str,
        label: str,
    ) -> RecordT:
        record = CalendarRepository._find(session, model, id_column, external_id, user_id)
        if record is None:
            raise CalendarRowNotFoundError(f"{label} not found: {external_id}")
        return record
