from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TypeVar

from sqlalchemy import delete, select
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
    ) -> None:
        self.engine = engine or create_database_engine(db_path=db_path)
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
        with self.session_factory.begin() as session:
            session.add(record)
        return todo_from_record(record)

    def get_todo(self, todo_id: str, user_id: str = "local") -> dict[str, Any]:
        with self.session_factory() as session:
            return todo_from_record(self._required(session, TodoRecord, TodoRecord.id, todo_id, user_id, "todo"))

    def update_todo(self, todo_id: str, payload: dict[str, Any], user_id: str = "local") -> dict[str, Any]:
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
        with self.session_factory.begin() as session:
            record = self._required(session, TodoRecord, TodoRecord.id, todo_id, user_id, "todo")
            self._apply_patch(record, payload, mapping)
            record.updated_at = str(payload.get("updatedAt", now_iso()))
        return todo_from_record(record)

    def delete_todo(self, todo_id: str, user_id: str = "local") -> None:
        with self.session_factory.begin() as session:
            record = self._required(session, TodoRecord, TodoRecord.id, todo_id, user_id, "todo")
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
        with self.session_factory.begin() as session:
            session.add(record)
        return event_from_record(record)

    def get_event(self, event_id: str, user_id: str = "local") -> dict[str, Any]:
        with self.session_factory() as session:
            return event_from_record(
                self._required(session, EventRecord, EventRecord.id, event_id, user_id, "event")
            )

    def update_event(self, event_id: str, payload: dict[str, Any], user_id: str = "local") -> dict[str, Any]:
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
        with self.session_factory.begin() as session:
            record = self._required(session, EventRecord, EventRecord.id, event_id, user_id, "event")
            self._apply_patch(record, payload, mapping)
            record.updated_at = str(payload.get("updatedAt", now_iso()))
        return event_from_record(record)

    def delete_event(self, event_id: str, user_id: str = "local") -> None:
        with self.session_factory.begin() as session:
            record = self._required(session, EventRecord, EventRecord.id, event_id, user_id, "event")
            session.delete(record)

    def list_event_types(self, user_id: str = "local") -> list[dict[str, Any]]:
        with self.session_factory() as session:
            records = session.scalars(
                select(EventTypeRecord)
                .where(EventTypeRecord.user_id == user_id)
                .order_by(EventTypeRecord.is_archived.asc(), EventTypeRecord.label.asc())
            ).all()
            return [event_type_from_record(record) for record in records]

    def upsert_event_type(self, payload: dict[str, Any], user_id: str = "local") -> dict[str, Any]:
        timestamp = now_iso()
        external_id = str(payload["id"])
        with self.session_factory.begin() as session:
            record = session.scalar(
                select(EventTypeRecord).where(
                    EventTypeRecord.user_id == user_id,
                    EventTypeRecord.id == external_id,
                )
            )
            if record is None:
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
        return event_type_from_record(record)

    def import_local_snapshot(self, payload: dict[str, Any], user_id: str = "local") -> dict[str, int]:
        counts = {"eventTypes": 0, "events": 0, "todos": 0}
        for event_type in payload.get("eventTypes", []):
            self.upsert_event_type(event_type, user_id)
            counts["eventTypes"] += 1
        for todo in payload.get("todos", []):
            try:
                self.get_todo(str(todo["id"]), user_id)
            except CalendarRowNotFoundError:
                self.create_todo(todo, user_id)
            else:
                self.update_todo(str(todo["id"]), todo, user_id)
            counts["todos"] += 1
        for event in payload.get("events", []):
            try:
                self.get_event(str(event["id"]), user_id)
            except CalendarRowNotFoundError:
                self.create_event(event, user_id)
            else:
                self.update_event(str(event["id"]), event, user_id)
            counts["events"] += 1
        return counts

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
    def _required(
        session: Session,
        model: type[RecordT],
        id_column: Any,
        external_id: str,
        user_id: str,
        label: str,
    ) -> RecordT:
        record = session.scalar(
            select(model).where(model.user_id == user_id, id_column == external_id)
        )
        if record is None:
            raise CalendarRowNotFoundError(f"{label} not found: {external_id}")
        return record
