from __future__ import annotations

from copy import deepcopy
import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.engine import Engine

from .calendar.repository import event_from_record, event_type_from_record, todo_from_record
from .database import (
    ActionEventLinkRecord,
    ActionItemRecord,
    CheckInRecord,
    CheckInScheduleRecord,
    ConversationMessageRecord,
    ConversationThreadRecord,
    EffortEntryRecord,
    EventRecord,
    EventTypeRecord,
    FridgeItemRecord,
    GoalRecord,
    GoalControlPolicyRecord,
    MigrationImportRecord,
    MilestoneRecord,
    MetricDefinitionRecord,
    MetricEntryRecord,
    PlanningRunRecord,
    PlanChangeProposalRecord,
    PlanDependencyRecord,
    PlanVersionRecord,
    ProgressLogRecord,
    ProjectRecord,
    TodoRecord,
    ToolPresetRecord,
    ToolRunRecord,
    UserPreferenceRecord,
    create_session_factory,
    initialize_schema,
)
from .fridge.receipt_parser import normalize_item_name
from .memory.repository import (
    action_from_record,
    goal_from_record,
    milestone_from_record,
    progress_from_record,
    project_from_record,
    tool_run_from_record,
)


BACKUP_FORMAT_VERSION = 2
PORTABLE_PREFERENCE_KEYS = {
    "confirmEnabledToolRouting",
    "defaultEventColor",
    "defaultEventEndTime",
    "defaultEventStartTime",
    "defaultEventTypeId",
    "defaultTodoEventTypeId",
    "defaultTodoPriority",
    "language",
    "aiUsageMode",
    "aiMonthlySoftLimit",
    "aiMonthlyHardLimit",
    "layoutPanelPosition",
    "layoutPanelSizePercent",
    "timezoneOverride",
}
SERVER_MANAGED_PREFERENCE_KEYS = {"aiMonthlySoftLimit", "aiMonthlyHardLimit"}
AI_USAGE_MODES = {"economy", "balanced", "quality"}
PERSONAL_MODELS = (
    ConversationMessageRecord,
    MetricEntryRecord,
    CheckInRecord,
    PlanChangeProposalRecord,
    PlanDependencyRecord,
    EffortEntryRecord,
    ActionEventLinkRecord,
    PlanVersionRecord,
    CheckInScheduleRecord,
    MetricDefinitionRecord,
    GoalControlPolicyRecord,
    ConversationThreadRecord,
    EventRecord,
    TodoRecord,
    EventTypeRecord,
    PlanningRunRecord,
    ToolRunRecord,
    ProgressLogRecord,
    ActionItemRecord,
    MilestoneRecord,
    ProjectRecord,
    GoalRecord,
    FridgeItemRecord,
    ToolPresetRecord,
    UserPreferenceRecord,
)

BACKUP_V2_MODELS: dict[str, tuple[Any, str]] = {
    "conversationThreads": (ConversationThreadRecord, "thread_id"),
    "conversationMessages": (ConversationMessageRecord, "message_id"),
    "metricDefinitions": (MetricDefinitionRecord, "metric_id"),
    "metricEntries": (MetricEntryRecord, "entry_id"),
    "checkInSchedules": (CheckInScheduleRecord, "schedule_id"),
    "checkIns": (CheckInRecord, "check_in_id"),
    "planChangeProposals": (PlanChangeProposalRecord, "proposal_id"),
    "planVersions": (PlanVersionRecord, "version_id"),
    "goalControlPolicies": (GoalControlPolicyRecord, "project_id"),
    "planDependencies": (PlanDependencyRecord, "dependency_id"),
    "effortEntries": (EffortEntryRecord, "effort_id"),
    "actionEventLinks": (ActionEventLinkRecord, "link_id"),
}

BACKUP_ENTITY_IDS: dict[str, str] = {
    "eventTypes": "id",
    "todos": "id",
    "events": "id",
    "planningRuns": "id",
    "goals": "goal_id",
    "projects": "project_id",
    "milestones": "milestone_id",
    "actions": "action_id",
    "progress": "progress_id",
    "toolRuns": "tool_run_id",
    "fridgeItems": "item_id",
    "toolPresets": "id",
    **{key: id_name for key, (_model, id_name) in BACKUP_V2_MODELS.items()},
}


class UserDataNotFoundError(KeyError):
    pass


class BackupValidationError(ValueError):
    pass


class ImportPreviewStaleError(RuntimeError):
    pass


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def checksum_entities(entities: dict[str, Any]) -> str:
    canonical = json.dumps(entities, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def fridge_from_record(record: FridgeItemRecord) -> dict[str, Any]:
    return {
        "item_id": record.item_id,
        "item_name": record.item_name,
        "normalized_name": record.normalized_name,
        "category": record.category,
        "storage_type": record.storage_type,
        "purchase_date": record.purchase_date,
        "estimated_expiration_date": record.estimated_expiration_date,
        "estimated_shelf_life_days": record.estimated_shelf_life_days,
        "confidence": record.confidence,
        "source": record.source,
        "receipt_id": record.receipt_id,
        "quantity": record.quantity,
        "notes": record.notes,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


def planning_run_from_record(record: PlanningRunRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "summary": record.summary,
        "input": record.input_json or {},
        "output": record.output_json or {},
        "createdAt": record.created_at,
    }


def personal_record_payload(record: Any) -> dict[str, Any]:
    return {
        column.name: getattr(record, column.name)
        for column in record.__table__.columns
        if column.name not in {"row_id", "user_id"}
    }


class FridgeRepository:
    def __init__(self, engine: Engine, user_id: str) -> None:
        initialize_schema(engine)
        self.session_factory = create_session_factory(engine)
        self.user_id = user_id

    def list_items(self) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            records = session.scalars(
                select(FridgeItemRecord)
                .where(FridgeItemRecord.user_id == self.user_id)
                .order_by(FridgeItemRecord.created_at.desc())
            ).all()
            return [fridge_from_record(record) for record in records]

    def create_item(self, payload: dict[str, Any]) -> dict[str, Any]:
        timestamp = now_iso()
        item_name = str(payload.get("item_name", "")).strip()
        if not item_name:
            raise ValueError("item_name is required")
        record = FridgeItemRecord(
            user_id=self.user_id,
            item_id=str(payload.get("item_id") or f"fridge_{uuid.uuid4().hex}"),
            item_name=item_name,
            normalized_name=normalize_item_name(str(payload.get("normalized_name") or item_name)),
            category=str(payload.get("category", "unknown")),
            storage_type=str(payload.get("storage_type", "unknown")),
            purchase_date=str(payload.get("purchase_date", "")),
            estimated_expiration_date=_optional_str(payload.get("estimated_expiration_date")),
            estimated_shelf_life_days=_optional_int(payload.get("estimated_shelf_life_days")),
            confidence=float(payload.get("confidence", 0.5)),
            source=str(payload.get("source", "manual")),
            receipt_id=_optional_str(payload.get("receipt_id")),
            quantity=_optional_str(payload.get("quantity")),
            notes=str(payload.get("notes", "")),
            created_at=str(payload.get("created_at", timestamp)),
            updated_at=str(payload.get("updated_at", timestamp)),
        )
        with self.session_factory.begin() as session:
            session.add(record)
        return fridge_from_record(record)

    def update_item(self, item_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        allowed = {
            "item_name",
            "normalized_name",
            "category",
            "storage_type",
            "purchase_date",
            "estimated_expiration_date",
            "estimated_shelf_life_days",
            "confidence",
            "source",
            "receipt_id",
            "quantity",
            "notes",
        }
        with self.session_factory.begin() as session:
            record = session.scalar(
                select(FridgeItemRecord).where(
                    FridgeItemRecord.user_id == self.user_id,
                    FridgeItemRecord.item_id == item_id,
                )
            )
            if record is None:
                raise UserDataNotFoundError(item_id)
            for key, value in patch.items():
                if key in allowed:
                    setattr(record, key, value)
            if "item_name" in patch:
                record.normalized_name = normalize_item_name(
                    str(patch.get("normalized_name") or record.item_name)
                )
            record.updated_at = now_iso()
        return fridge_from_record(record)

    def delete_item(self, item_id: str) -> None:
        with self.session_factory.begin() as session:
            record = session.scalar(
                select(FridgeItemRecord).where(
                    FridgeItemRecord.user_id == self.user_id,
                    FridgeItemRecord.item_id == item_id,
                )
            )
            if record is None:
                raise UserDataNotFoundError(item_id)
            session.delete(record)


class ToolPresetRepository:
    def __init__(self, engine: Engine, user_id: str) -> None:
        initialize_schema(engine)
        self.session_factory = create_session_factory(engine)
        self.user_id = user_id

    def list_presets(self) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            records = session.scalars(
                select(ToolPresetRecord)
                .where(ToolPresetRecord.user_id == self.user_id)
                .order_by(ToolPresetRecord.updated_at.desc())
            ).all()
            return [dict(record.preset_json) for record in records]

    def save_preset(self, payload: dict[str, Any]) -> dict[str, Any]:
        preset_id = str(payload.get("id", "")).strip()
        if not preset_id:
            raise ValueError("id is required")
        timestamp = now_iso()
        clean = {**payload, "id": preset_id, "isBuiltIn": False}
        clean.setdefault("createdAt", timestamp)
        clean["updatedAt"] = timestamp
        with self.session_factory.begin() as session:
            record = session.scalar(
                select(ToolPresetRecord).where(
                    ToolPresetRecord.user_id == self.user_id,
                    ToolPresetRecord.preset_id == preset_id,
                )
            )
            if record is None:
                record = ToolPresetRecord(
                    user_id=self.user_id,
                    preset_id=preset_id,
                    preset_json=clean,
                    created_at=str(clean["createdAt"]),
                    updated_at=timestamp,
                )
                session.add(record)
            else:
                record.preset_json = clean
                record.updated_at = timestamp
        return clean

    def delete_preset(self, preset_id: str) -> None:
        with self.session_factory.begin() as session:
            record = session.scalar(
                select(ToolPresetRecord).where(
                    ToolPresetRecord.user_id == self.user_id,
                    ToolPresetRecord.preset_id == preset_id,
                )
            )
            if record is None:
                raise UserDataNotFoundError(preset_id)
            session.delete(record)


class PreferenceRepository:
    def __init__(self, engine: Engine, user_id: str) -> None:
        initialize_schema(engine)
        self.session_factory = create_session_factory(engine)
        self.user_id = user_id

    def get(self) -> dict[str, Any]:
        with self.session_factory() as session:
            record = session.scalar(
                select(UserPreferenceRecord).where(UserPreferenceRecord.user_id == self.user_id)
            )
            return dict(record.preferences_json) if record else {}

    def update(self, patch: dict[str, Any]) -> dict[str, Any]:
        timestamp = now_iso()
        with self.session_factory.begin() as session:
            record = session.scalar(
                select(UserPreferenceRecord).where(UserPreferenceRecord.user_id == self.user_id)
            )
            if record is None:
                record = UserPreferenceRecord(
                    user_id=self.user_id,
                    preferences_json=dict(patch),
                    created_at=timestamp,
                    updated_at=timestamp,
                )
                session.add(record)
            else:
                record.preferences_json = {**(record.preferences_json or {}), **patch}
                record.updated_at = timestamp
        return dict(record.preferences_json)


class DataPortabilityService:
    def __init__(self, engine: Engine, *, app_mode: str = "server") -> None:
        initialize_schema(engine)
        self.engine = engine
        self.session_factory = create_session_factory(engine)
        self.app_mode = "desktop" if app_mode == "desktop" else "server"

    def _export_entities(self, session: Any, user_id: str) -> dict[str, Any]:
        preference = session.scalar(
            select(UserPreferenceRecord).where(UserPreferenceRecord.user_id == user_id)
        )
        return {
            "eventTypes": [event_type_from_record(item) for item in self._all(session, EventTypeRecord, user_id)],
            "todos": [todo_from_record(item) for item in self._all(session, TodoRecord, user_id)],
            "events": [event_from_record(item) for item in self._all(session, EventRecord, user_id)],
            "planningRuns": [planning_run_from_record(item) for item in self._all(session, PlanningRunRecord, user_id)],
            "goals": [goal_from_record(item) for item in self._all(session, GoalRecord, user_id)],
            "projects": [project_from_record(item) for item in self._all(session, ProjectRecord, user_id)],
            "milestones": [milestone_from_record(item) for item in self._all(session, MilestoneRecord, user_id)],
            "actions": [action_from_record(item) for item in self._all(session, ActionItemRecord, user_id)],
            "progress": [progress_from_record(item) for item in self._all(session, ProgressLogRecord, user_id)],
            "toolRuns": [tool_run_from_record(item) for item in self._all(session, ToolRunRecord, user_id)],
            "fridgeItems": [fridge_from_record(item) for item in self._all(session, FridgeItemRecord, user_id)],
            "toolPresets": [dict(item.preset_json) for item in self._all(session, ToolPresetRecord, user_id)],
            "preferences": dict(preference.preferences_json) if preference else {},
            **{
                key: [personal_record_payload(item) for item in self._all(session, model, user_id)]
                for key, (model, _id_name) in BACKUP_V2_MODELS.items()
            },
        }

    def export(self, user_id: str) -> dict[str, Any]:
        with self.session_factory() as session:
            entities = self._export_entities(session, user_id)
        return {
            "formatVersion": BACKUP_FORMAT_VERSION,
            "exportedAt": now_iso(),
            "entities": entities,
            "checksum": checksum_entities(entities),
        }

    @staticmethod
    def _validate_backup_payload(payload: dict[str, Any]) -> tuple[dict[str, Any], str]:
        if payload.get("formatVersion") not in {1, BACKUP_FORMAT_VERSION}:
            raise BackupValidationError("Unsupported backup formatVersion.")
        entities = payload.get("entities")
        if not isinstance(entities, dict):
            raise BackupValidationError("Backup entities must be an object.")
        checksum = checksum_entities(entities)
        if not payload.get("checksum") or payload.get("checksum") != checksum:
            raise BackupValidationError("Backup checksum does not match its contents.")
        return entities, checksum

    @staticmethod
    def _entity_id(key: str, item: dict[str, Any]) -> str:
        field = BACKUP_ENTITY_IDS[key]
        if key == "toolRuns":
            return str(item.get(field) or item.get("id") or "")
        return str(item.get(field) or "")

    @staticmethod
    def _entity_time(item: dict[str, Any]) -> datetime | None:
        raw = item.get("updatedAt") or item.get("updated_at")
        if not isinstance(raw, str) or not raw.strip():
            return None
        try:
            parsed = datetime.fromisoformat(raw.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    @staticmethod
    def _same_entity(left: Any, right: Any) -> bool:
        return json.dumps(left, ensure_ascii=False, separators=(",", ":"), sort_keys=True) == json.dumps(
            right, ensure_ascii=False, separators=(",", ":"), sort_keys=True
        )

    def _preview_with_session(
        self,
        session: Any,
        user_id: str,
        payload: dict[str, Any],
        mode: str,
    ) -> dict[str, Any]:
        entities, backup_checksum = self._validate_backup_payload(payload)
        if mode not in {"merge", "replace"}:
            raise BackupValidationError("Import mode must be merge or replace.")
        current_entities = self._export_entities(session, user_id)
        relationship_errors: list[str] = []
        try:
            self._validate_relationships(session, user_id, entities, mode)
        except BackupValidationError as error:
            relationship_errors.append(str(error))

        counts: dict[str, dict[str, int]] = {}
        conflicts: list[dict[str, Any]] = []
        ignored_items: list[dict[str, str]] = []
        for key in self._loaders():
            if key == "preferences":
                raw_preferences = entities.get(key, {})
                if not isinstance(raw_preferences, dict):
                    raise BackupValidationError("preferences must be an object.")
                incoming, ignored_keys = self._sanitize_preferences(raw_preferences)
                current = current_entities.get(key, {})
                changed = not self._same_entity(incoming, current)
                counts[key] = {"new": 0, "updated": 0, "unchanged": int(not changed), "conflicts": int(changed)}
                if changed:
                    conflicts.append({
                        "key": "preferences",
                        "entity": key,
                        "id": "preferences",
                        "label": "Preferences",
                        "localUpdatedAt": None,
                        "backupUpdatedAt": None,
                    })
                for ignored_key in ignored_keys:
                    ignored_items.append({"entity": key, "id": ignored_key, "reason": "server-managed-or-unknown"})
                continue

            incoming_items = entities.get(key, [])
            if not isinstance(incoming_items, list):
                raise BackupValidationError(f"{key} must be an array.")
            current_items = current_entities.get(key, [])
            current_map = {
                self._entity_id(key, item): item
                for item in current_items
                if isinstance(item, dict) and self._entity_id(key, item)
            }
            entity_counts = {"new": 0, "updated": 0, "unchanged": 0, "conflicts": 0}
            seen: set[str] = set()
            for index, item in enumerate(incoming_items):
                if not isinstance(item, dict):
                    raise BackupValidationError(f"{key}[{index}] must be an object.")
                external_id = self._entity_id(key, item)
                if not external_id:
                    raise BackupValidationError(f"{key}[{index}] must have a non-empty business ID.")
                if external_id in seen:
                    raise BackupValidationError(f"{key} contains duplicate business ID {external_id}.")
                seen.add(external_id)
                current = current_map.get(external_id)
                if current is None:
                    entity_counts["new"] += 1
                elif self._same_entity(item, current):
                    entity_counts["unchanged"] += 1
                else:
                    incoming_time = self._entity_time(item)
                    current_time = self._entity_time(current)
                    if incoming_time is not None and current_time is not None and incoming_time > current_time:
                        entity_counts["updated"] += 1
                    elif incoming_time is not None and current_time is not None and incoming_time < current_time:
                        entity_counts["unchanged"] += 1
                        ignored_items.append({"entity": key, "id": external_id, "reason": "local-is-newer"})
                    else:
                        entity_counts["conflicts"] += 1
                        conflicts.append({
                            "key": f"{key}:{external_id}",
                            "entity": key,
                            "id": external_id,
                            "label": str(item.get("title") or item.get("label") or item.get("name") or item.get("item_name") or external_id),
                            "localUpdatedAt": current.get("updatedAt") or current.get("updated_at"),
                            "backupUpdatedAt": item.get("updatedAt") or item.get("updated_at"),
                        })
            counts[key] = entity_counts
        return {
            "formatVersion": payload["formatVersion"],
            "backupChecksum": backup_checksum,
            "currentChecksum": checksum_entities(current_entities),
            "counts": counts,
            "conflicts": conflicts,
            "relationshipErrors": relationship_errors,
            "ignoredItems": ignored_items,
            "canImport": not relationship_errors,
        }

    def preview_import(
        self,
        user_id: str,
        payload: dict[str, Any],
        *,
        mode: str = "merge",
    ) -> dict[str, Any]:
        with self.session_factory() as session:
            return self._preview_with_session(session, user_id, payload, mode)

    def import_backup(
        self,
        user_id: str,
        payload: dict[str, Any],
        *,
        mode: str = "merge",
        replace_confirmed: bool = False,
        source: str = "api-backup",
        expected_backup_checksum: str | None = None,
        expected_current_checksum: str | None = None,
        conflict_choices: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        original_entities, checksum = self._validate_backup_payload(payload)
        if mode not in {"merge", "replace"}:
            raise BackupValidationError("Import mode must be merge or replace.")
        if mode == "replace" and not replace_confirmed:
            raise BackupValidationError("Replace import requires explicit confirmation.")

        choices = conflict_choices or {}
        report: dict[str, Any] = {
            "mode": mode,
            "counts": {},
            "skipped": False,
            "replayed": False,
            "ignoredPreferenceKeys": [],
        }
        with self.session_factory.begin() as session:
            for model in PERSONAL_MODELS:
                list(session.scalars(select(model).where(model.user_id == user_id).with_for_update()))
            previous = session.scalar(
                select(MigrationImportRecord).where(
                    MigrationImportRecord.user_id == user_id,
                    MigrationImportRecord.source == source,
                    MigrationImportRecord.checksum == checksum,
                )
            )
            if previous is not None and mode == "merge":
                return {**(previous.report_json or {}), "skipped": True}
            if previous is not None:
                report["replayed"] = True

            preview = self._preview_with_session(session, user_id, payload, mode)
            if expected_backup_checksum is not None and preview["backupChecksum"] != expected_backup_checksum:
                raise ImportPreviewStaleError("The selected backup changed after preview. Preview it again.")
            if expected_current_checksum is not None and preview["currentChecksum"] != expected_current_checksum:
                raise ImportPreviewStaleError("Current data changed after preview. Preview the backup again.")
            if preview["relationshipErrors"]:
                raise BackupValidationError(preview["relationshipErrors"][0])
            conflict_keys = {item["key"] for item in preview["conflicts"]}
            missing_choices = sorted(key for key in conflict_keys if choices.get(key) not in {"local", "backup"})
            if missing_choices:
                raise BackupValidationError(
                    "Every equal-time conflict requires a local or backup choice: " + ", ".join(missing_choices[:10])
                )
            unknown_choices = sorted(key for key in choices if key not in conflict_keys)
            if unknown_choices:
                raise BackupValidationError("Conflict choices are stale or unknown: " + ", ".join(unknown_choices[:10]))

            entities = deepcopy(original_entities)
            current_entities = self._export_entities(session, user_id)
            for conflict in preview["conflicts"]:
                if choices.get(conflict["key"]) != "local":
                    continue
                key = conflict["entity"]
                if key == "preferences":
                    entities["preferences"] = current_entities.get("preferences", {})
                    continue
                external_id = conflict["id"]
                incoming = entities.get(key, [])
                current_item = next(
                    (item for item in current_entities.get(key, []) if self._entity_id(key, item) == external_id),
                    None,
                )
                entities[key] = [item for item in incoming if self._entity_id(key, item) != external_id]
                if mode == "replace" and current_item is not None:
                    entities[key].append(current_item)
            report["preview"] = {
                "backupChecksum": preview["backupChecksum"],
                "currentChecksum": preview["currentChecksum"],
                "counts": preview["counts"],
            }
            self._validate_relationships(session, user_id, entities, mode)
            if mode == "replace":
                for model in PERSONAL_MODELS:
                    session.execute(delete(model).where(model.user_id == user_id))

            loaders = self._loaders()
            for key, loader in loaders.items():
                items = entities.get(key, [] if key != "preferences" else {})
                if key == "preferences":
                    raw_preferences = items if isinstance(items, dict) else {}
                    preferences, ignored = self._sanitize_preferences(raw_preferences)
                    report["ignoredPreferenceKeys"] = ignored
                    count = loader(session, user_id, preferences)
                else:
                    if not isinstance(items, list):
                        raise BackupValidationError(f"{key} must be an array.")
                    count = sum(loader(session, user_id, item) for item in items if isinstance(item, dict))
                report["counts"][key] = count

            if previous is None:
                session.add(MigrationImportRecord(
                    user_id=user_id,
                    source=source,
                    checksum=checksum,
                    report_json=report,
                    imported_at=now_iso(),
                ))
            else:
                previous.report_json = report
                previous.imported_at = now_iso()
        return report

    def _validate_relationships(
        self,
        session: Any,
        user_id: str,
        entities: dict[str, Any],
        mode: str,
    ) -> None:
        def items(key: str) -> list[dict[str, Any]]:
            value = entities.get(key, [])
            return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []

        def identifiers(key: str, id_key: str, model: Any, column: Any) -> set[str]:
            values = {str(item.get(id_key) or item.get("id") or "") for item in items(key)}
            values.discard("")
            if mode == "merge":
                values.update(str(value) for value in session.scalars(select(column).where(model.user_id == user_id)))
            return values

        goals = identifiers("goals", "goal_id", GoalRecord, GoalRecord.goal_id)
        projects = identifiers("projects", "project_id", ProjectRecord, ProjectRecord.project_id)
        milestones = identifiers("milestones", "milestone_id", MilestoneRecord, MilestoneRecord.milestone_id)
        actions = identifiers("actions", "action_id", ActionItemRecord, ActionItemRecord.action_id)
        events = identifiers("events", "id", EventRecord, EventRecord.id)
        threads = identifiers("conversationThreads", "thread_id", ConversationThreadRecord, ConversationThreadRecord.thread_id)
        metrics = identifiers("metricDefinitions", "metric_id", MetricDefinitionRecord, MetricDefinitionRecord.metric_id)
        failures: list[str] = []

        def item_value(item: dict[str, Any], field: str, aliases: tuple[str, ...] = ()) -> str:
            for candidate in (field, *aliases):
                value = str(item.get(candidate) or "")
                if value:
                    return value
            return ""

        def require_reference(
            key: str,
            field: str,
            allowed: set[str],
            *,
            optional: bool = False,
            aliases: tuple[str, ...] = (),
        ) -> None:
            for index, item in enumerate(items(key)):
                value = item_value(item, field, aliases)
                if not value and optional:
                    continue
                if not value or value not in allowed:
                    failures.append(f"{key}[{index}].{field}={value or '<missing>'}")

        def relation_map(key: str, id_field: str, model: Any, fields: tuple[str, ...]) -> dict[str, dict[str, str]]:
            values: dict[str, dict[str, str]] = {}
            if mode == "merge":
                for record in session.scalars(select(model).where(model.user_id == user_id)):
                    values[str(getattr(record, id_field))] = {
                        field: str(getattr(record, field) or "") for field in fields
                    }
            for item in items(key):
                external_id = item_value(item, id_field, ("id",))
                if external_id:
                    values[external_id] = {field: item_value(item, field) for field in fields}
            return values

        project_map = relation_map("projects", "project_id", ProjectRecord, ("goal_id",))
        milestone_map = relation_map("milestones", "milestone_id", MilestoneRecord, ("project_id",))
        action_map = relation_map("actions", "action_id", ActionItemRecord, ("project_id", "milestone_id"))
        thread_map = relation_map("conversationThreads", "thread_id", ConversationThreadRecord, ("project_id", "goal_id"))
        metric_map = relation_map("metricDefinitions", "metric_id", MetricDefinitionRecord, ("project_id",))

        def same_project(
            key: str,
            index: int,
            field: str,
            reference_id: str,
            expected_project: str,
            mapping: dict[str, dict[str, str]],
        ) -> None:
            if reference_id and expected_project and mapping.get(reference_id, {}).get("project_id") != expected_project:
                failures.append(f"{key}[{index}].{field}={reference_id} (project mismatch)")

        def same_goal(key: str, index: int, field: str, goal_id: str, project_id: str) -> None:
            if goal_id and project_id and project_map.get(project_id, {}).get("goal_id") != goal_id:
                failures.append(f"{key}[{index}].{field}={goal_id} (goal mismatch)")

        require_reference("projects", "goal_id", goals)
        require_reference("milestones", "project_id", projects)
        require_reference("actions", "project_id", projects)
        require_reference("actions", "milestone_id", milestones, optional=True)
        require_reference("progress", "project_id", projects)
        require_reference("progress", "goal_id", goals, optional=True)
        require_reference("progress", "action_id", actions, optional=True)
        require_reference("toolRuns", "project_id", projects, optional=True, aliases=("related_project_id",))
        require_reference("toolRuns", "goal_id", goals, optional=True, aliases=("related_goal_id",))
        require_reference("conversationThreads", "project_id", projects, optional=True)
        require_reference("conversationThreads", "goal_id", goals, optional=True)
        require_reference("conversationMessages", "thread_id", threads)
        require_reference("metricDefinitions", "project_id", projects)
        require_reference("metricEntries", "project_id", projects)
        require_reference("metricEntries", "metric_id", metrics)
        for key in ("checkInSchedules", "checkIns", "planVersions", "goalControlPolicies", "planDependencies", "effortEntries"):
            require_reference(key, "project_id", projects)
        require_reference("checkIns", "thread_id", threads, optional=True)
        require_reference("planChangeProposals", "project_id", projects, optional=True)
        require_reference("planChangeProposals", "thread_id", threads, optional=True)
        require_reference("planDependencies", "predecessor_action_id", actions)
        require_reference("planDependencies", "successor_action_id", actions)
        require_reference("effortEntries", "action_id", actions, optional=True)
        require_reference("actionEventLinks", "project_id", projects)
        require_reference("actionEventLinks", "action_id", actions)
        require_reference("actionEventLinks", "event_id", events)

        for index, item in enumerate(items("actions")):
            project_id = item_value(item, "project_id")
            same_project("actions", index, "milestone_id", item_value(item, "milestone_id"), project_id, milestone_map)
        for index, item in enumerate(items("progress")):
            project_id = item_value(item, "project_id")
            same_goal("progress", index, "goal_id", item_value(item, "goal_id"), project_id)
            same_project("progress", index, "action_id", item_value(item, "action_id"), project_id, action_map)
        for index, item in enumerate(items("toolRuns")):
            project_id = item_value(item, "project_id", ("related_project_id",))
            same_goal("toolRuns", index, "goal_id", item_value(item, "goal_id", ("related_goal_id",)), project_id)
        for index, item in enumerate(items("conversationThreads")):
            project_id = item_value(item, "project_id")
            same_goal("conversationThreads", index, "goal_id", item_value(item, "goal_id"), project_id)
        for index, item in enumerate(items("metricEntries")):
            project_id = item_value(item, "project_id")
            same_project("metricEntries", index, "metric_id", item_value(item, "metric_id"), project_id, metric_map)
        for key in ("checkIns", "planChangeProposals"):
            for index, item in enumerate(items(key)):
                project_id = item_value(item, "project_id")
                thread_id = item_value(item, "thread_id")
                same_project(key, index, "thread_id", thread_id, project_id, thread_map)
        for index, item in enumerate(items("planDependencies")):
            project_id = item_value(item, "project_id")
            same_project("planDependencies", index, "predecessor_action_id", item_value(item, "predecessor_action_id"), project_id, action_map)
            same_project("planDependencies", index, "successor_action_id", item_value(item, "successor_action_id"), project_id, action_map)
        for index, item in enumerate(items("effortEntries")):
            same_project("effortEntries", index, "action_id", item_value(item, "action_id"), item_value(item, "project_id"), action_map)
        for index, item in enumerate(items("actionEventLinks")):
            same_project("actionEventLinks", index, "action_id", item_value(item, "action_id"), item_value(item, "project_id"), action_map)
        if failures:
            raise BackupValidationError(
                "Backup relationship validation failed: " + "; ".join(failures[:10])
            )

    def _sanitize_preferences(self, item: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
        allowed = PORTABLE_PREFERENCE_KEYS - (
            SERVER_MANAGED_PREFERENCE_KEYS if self.app_mode == "server" else set()
        )
        clean = {key: value for key, value in item.items() if key in allowed}
        ignored = sorted(key for key in item if key not in allowed)
        usage_mode = clean.get("aiUsageMode")
        if usage_mode is not None and usage_mode not in AI_USAGE_MODES:
            clean.pop("aiUsageMode", None)
            ignored.append("aiUsageMode")
            ignored.sort()
        if self.app_mode == "desktop":
            soft = clean.get("aiMonthlySoftLimit")
            hard = clean.get("aiMonthlyHardLimit")
            if soft is not None or hard is not None:
                try:
                    soft_value = int(soft) if soft is not None else None
                    hard_value = int(hard) if hard is not None else None
                except (TypeError, ValueError) as error:
                    raise BackupValidationError("AI budget limits must be integers.") from error
                if (
                    (soft_value is not None and soft_value <= 0)
                    or (hard_value is not None and hard_value <= 0)
                    or (soft_value is not None and hard_value is not None and soft_value > hard_value)
                ):
                    raise BackupValidationError(
                        "AI budget limits must be positive and the soft limit cannot exceed the hard limit."
                    )
                if soft_value is not None:
                    clean["aiMonthlySoftLimit"] = soft_value
                if hard_value is not None:
                    clean["aiMonthlyHardLimit"] = hard_value
        return clean, ignored

    @staticmethod
    def _all(session: Any, model: Any, user_id: str) -> list[Any]:
        return list(session.scalars(select(model).where(model.user_id == user_id)))

    def _loaders(self) -> dict[str, Any]:
        loaders: dict[str, Any] = {
            "eventTypes": self._load_event_type,
            "todos": self._load_todo,
            "events": self._load_event,
            "planningRuns": self._load_planning_run,
            "goals": self._load_goal,
            "projects": self._load_project,
            "milestones": self._load_milestone,
            "actions": self._load_action,
            "progress": self._load_progress,
            "toolRuns": self._load_tool_run,
            "fridgeItems": self._load_fridge,
            "toolPresets": self._load_preset,
            "preferences": self._load_preferences,
        }
        for entity_key, (model, id_name) in BACKUP_V2_MODELS.items():
            loaders[entity_key] = lambda session, user_id, item, model=model, id_name=id_name: self._load_generic(
                session, user_id, item, model, id_name
            )
        return loaders

    def _load_generic(
        self,
        session: Any,
        user_id: str,
        item: dict[str, Any],
        model: Any,
        id_name: str,
    ) -> int:
        allowed = {column.name for column in model.__table__.columns if column.name not in {"row_id", "user_id"}}
        values = {key: value for key, value in item.items() if key in allowed}
        external_id = str(values.get(id_name, ""))
        return self._upsert(session, model, getattr(model, id_name), external_id, user_id, values)

    @staticmethod
    def _upsert(session: Any, model: Any, id_column: Any, external_id: str, user_id: str, values: dict[str, Any]) -> int:
        if not external_id.strip():
            raise BackupValidationError("Every imported entity must have a non-empty business ID.")
        record = session.scalar(select(model).where(model.user_id == user_id, id_column == external_id))
        if record is None:
            record = model(user_id=user_id, **values)
            session.add(record)
        else:
            current_updated = str(getattr(record, "updated_at", ""))
            next_updated = str(values.get("updated_at", ""))
            if current_updated and next_updated and current_updated > next_updated:
                return 0
            for key, value in values.items():
                setattr(record, key, value)
        return 1

    def _load_event_type(self, session: Any, user_id: str, item: dict[str, Any]) -> int:
        timestamp = now_iso()
        external_id = str(item.get("id", ""))
        return self._upsert(session, EventTypeRecord, EventTypeRecord.id, external_id, user_id, {
            "id": external_id, "label": str(item.get("label", "General")), "color": str(item.get("color", "#047857")),
            "applies_to": str(item.get("appliesTo", "both")), "is_archived": bool(item.get("isArchived", False)),
            "created_at": str(item.get("createdAt", timestamp)), "updated_at": str(item.get("updatedAt", timestamp)),
        })

    def _load_todo(self, session: Any, user_id: str, item: dict[str, Any]) -> int:
        timestamp = now_iso(); external_id = str(item.get("id", ""))
        return self._upsert(session, TodoRecord, TodoRecord.id, external_id, user_id, {
            "id": external_id, "title": str(item.get("title", "")), "notes": item.get("notes"), "status": str(item.get("status", "todo")),
            "event_type_id": str(item.get("eventTypeId", "general")), "due_date": item.get("dueDate"), "linked_event_id": item.get("linkedEventId"),
            "long_project_json": item.get("longProject"), "eta_minutes": int(item.get("etaMinutes", 30)), "energy_needed": str(item.get("energyNeeded", "medium")),
            "priority": str(item.get("priority", "medium")), "created_at": str(item.get("createdAt", timestamp)), "updated_at": str(item.get("updatedAt", timestamp)),
            "completed_at": item.get("completedAt"),
        })

    def _load_event(self, session: Any, user_id: str, item: dict[str, Any]) -> int:
        timestamp = now_iso(); external_id = str(item.get("id", ""))
        return self._upsert(session, EventRecord, EventRecord.id, external_id, user_id, {
            "id": external_id, "title": str(item.get("title", "")), "description": item.get("description"), "display_details": item.get("displayDetails"),
            "start_at": str(item.get("startAt", timestamp)), "end_at": str(item.get("endAt", timestamp)), "all_day": bool(item.get("allDay", False)),
            "color": item.get("color"), "event_type_id": str(item.get("eventTypeId", "general")), "linked_todo_id": item.get("linkedTodoId"),
            "recurrence_rule_json": item.get("recurrenceRule"), "master_id": item.get("masterId"), "exception_for": item.get("exceptionFor"),
            "exception_date": item.get("exceptionDate"), "deleted_occurrences_json": item.get("deletedOccurrences"), "sync_status": str(item.get("syncStatus", "pending")),
            "created_at": str(item.get("createdAt", timestamp)), "updated_at": str(item.get("updatedAt", timestamp)),
        })

    def _load_goal(self, session: Any, user_id: str, item: dict[str, Any]) -> int:
        external_id = str(item.get("goal_id", "")); timestamp = now_iso()
        return self._upsert(session, GoalRecord, GoalRecord.goal_id, external_id, user_id, {"goal_id": external_id, "title": str(item.get("title", "")), "description": str(item.get("description", "")), "status": str(item.get("status", "active")), "metadata_json": item.get("metadata", {}), "created_at": str(item.get("created_at", timestamp)), "updated_at": str(item.get("updated_at", timestamp))})

    def _load_planning_run(self, session: Any, user_id: str, item: dict[str, Any]) -> int:
        external_id = str(item.get("id", "")); timestamp = now_iso()
        return self._upsert(session, PlanningRunRecord, PlanningRunRecord.id, external_id, user_id, {"id": external_id, "summary": str(item.get("summary", "")), "input_json": item.get("input", {}), "output_json": item.get("output", {}), "created_at": str(item.get("createdAt", timestamp))})

    def _load_project(self, session: Any, user_id: str, item: dict[str, Any]) -> int:
        external_id = str(item.get("project_id", "")); timestamp = now_iso()
        return self._upsert(session, ProjectRecord, ProjectRecord.project_id, external_id, user_id, {"project_id": external_id, "goal_id": str(item.get("goal_id", "")), "title": str(item.get("title", "")), "description": str(item.get("description", "")), "status": str(item.get("status", "active")), "metadata_json": item.get("metadata", {}), "created_at": str(item.get("created_at", timestamp)), "updated_at": str(item.get("updated_at", timestamp))})

    def _load_milestone(self, session: Any, user_id: str, item: dict[str, Any]) -> int:
        external_id = str(item.get("milestone_id", "")); timestamp = now_iso()
        return self._upsert(session, MilestoneRecord, MilestoneRecord.milestone_id, external_id, user_id, {"milestone_id": external_id, "project_id": str(item.get("project_id", "")), "title": str(item.get("title", "")), "description": str(item.get("description", "")), "due_date": item.get("due_date"), "status": str(item.get("status", "not_started")), "metadata_json": item.get("metadata", {}), "created_at": str(item.get("created_at", timestamp)), "updated_at": str(item.get("updated_at", timestamp))})

    def _load_action(self, session: Any, user_id: str, item: dict[str, Any]) -> int:
        external_id = str(item.get("action_id", "")); timestamp = now_iso()
        return self._upsert(session, ActionItemRecord, ActionItemRecord.action_id, external_id, user_id, {"action_id": external_id, "project_id": str(item.get("project_id", "")), "milestone_id": item.get("milestone_id"), "title": str(item.get("title", "")), "description": str(item.get("description", "")), "due_date": item.get("due_date"), "status": str(item.get("status", "todo")), "estimated_minutes": max(1, int(item.get("estimated_minutes", 30))), "priority": str(item.get("priority", "medium")), "energy_needed": str(item.get("energy_needed", "medium")), "execution_tier": str(item.get("execution_tier", "standard")), "metadata_json": item.get("metadata", {}), "created_at": str(item.get("created_at", timestamp)), "updated_at": str(item.get("updated_at", timestamp))})

    def _load_progress(self, session: Any, user_id: str, item: dict[str, Any]) -> int:
        external_id = str(item.get("progress_id", "")); timestamp = now_iso()
        return self._upsert(session, ProgressLogRecord, ProgressLogRecord.progress_id, external_id, user_id, {"progress_id": external_id, "project_id": str(item.get("project_id", "")), "goal_id": item.get("goal_id"), "action_id": item.get("action_id"), "log_type": str(item.get("log_type", "update")), "summary": str(item.get("summary", "")), "details": str(item.get("details", "")), "metadata_json": item.get("metadata", {}), "created_at": str(item.get("created_at", timestamp)), "updated_at": str(item.get("updated_at", timestamp))})

    def _load_tool_run(self, session: Any, user_id: str, item: dict[str, Any]) -> int:
        external_id = str(item.get("tool_run_id") or item.get("id") or ""); timestamp = now_iso()
        return self._upsert(session, ToolRunRecord, ToolRunRecord.tool_run_id, external_id, user_id, {"tool_run_id": external_id, "project_id": item.get("related_project_id") or item.get("project_id"), "goal_id": item.get("related_goal_id") or item.get("goal_id"), "tool_name": str(item.get("tool_name", "")), "intent": str(item.get("intent", "")), "input_summary": str(item.get("input_summary", "")), "output_summary": str(item.get("output_summary", "")), "status": str(item.get("status", "success")), "input_json": item.get("input", {}), "output_json": item.get("output", {}), "error": str(item.get("error", "")), "created_at": str(item.get("created_at", timestamp)), "updated_at": str(item.get("updated_at", timestamp))})

    def _load_fridge(self, session: Any, user_id: str, item: dict[str, Any]) -> int:
        external_id = str(item.get("item_id", "")); timestamp = now_iso(); item_name = str(item.get("item_name", ""))
        return self._upsert(session, FridgeItemRecord, FridgeItemRecord.item_id, external_id, user_id, {"item_id": external_id, "item_name": item_name, "normalized_name": str(item.get("normalized_name") or normalize_item_name(item_name)), "category": str(item.get("category", "unknown")), "storage_type": str(item.get("storage_type", "unknown")), "purchase_date": str(item.get("purchase_date", "")), "estimated_expiration_date": item.get("estimated_expiration_date"), "estimated_shelf_life_days": _optional_int(item.get("estimated_shelf_life_days")), "confidence": float(item.get("confidence", 0.5)), "source": str(item.get("source", "manual")), "receipt_id": item.get("receipt_id"), "quantity": item.get("quantity"), "notes": str(item.get("notes", "")), "created_at": str(item.get("created_at", timestamp)), "updated_at": str(item.get("updated_at", timestamp))})

    def _load_preset(self, session: Any, user_id: str, item: dict[str, Any]) -> int:
        external_id = str(item.get("id", "")); timestamp = now_iso(); clean = {**item, "id": external_id, "isBuiltIn": False}
        return self._upsert(session, ToolPresetRecord, ToolPresetRecord.preset_id, external_id, user_id, {"preset_id": external_id, "preset_json": clean, "created_at": str(item.get("createdAt", timestamp)), "updated_at": str(item.get("updatedAt", timestamp))})

    @staticmethod
    def _load_preferences(session: Any, user_id: str, item: dict[str, Any]) -> int:
        timestamp = now_iso(); record = session.scalar(select(UserPreferenceRecord).where(UserPreferenceRecord.user_id == user_id))
        if record is None:
            session.add(UserPreferenceRecord(user_id=user_id, preferences_json=item, created_at=timestamp, updated_at=timestamp))
        else:
            record.preferences_json = item; record.updated_at = timestamp
        return 1


def _optional_str(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _optional_int(value: object) -> int | None:
    if value is None or value == "":
        return None
    return int(value)
