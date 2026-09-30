from __future__ import annotations

import copy
import math
import os
from contextlib import contextmanager
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time as clock_time, timedelta, timezone, tzinfo
from typing import Any, Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.engine import Engine

from .database import (
    AIUsageEventRecord,
    AIUsageMonthlyRecord,
    ActivationFunnelEventRecord,
    ActionEventLinkRecord,
    ActionItemRecord,
    CheckInRecord,
    CheckInScheduleRecord,
    ConversationMessageRecord,
    ConversationThreadRecord,
    EffortEntryRecord,
    GoalControlPolicyRecord,
    GoalRecord,
    MetricDefinitionRecord,
    MetricEntryRecord,
    MilestoneRecord,
    PlanChangeProposalRecord,
    PlanDependencyRecord,
    PlanVersionRecord,
    ProgressLogRecord,
    ProjectRecord,
    UserPreferenceRecord,
    create_database_engine,
    create_session_factory,
    initialize_schema,
)
from .scheduling_rules import DAY_CODES, canonical_day
from .user_transaction import user_write_transaction
from .ai_plan_review import new_review, plan_message


USAGE_MODES = ("economy", "balanced", "quality")
EXECUTION_TIERS = ("minimum", "standard", "stretch")
METRIC_ROLES = ("leading", "lagging")
METRIC_DIRECTIONS = ("increase", "decrease", "range", "maintain")
THREAD_STATUSES = ("draft", "active", "archived")
PROPOSAL_STATUSES = ("pending", "accepted", "rejected")
AI_OPERATION_ALIASES = {"planning": "goal_plan"}
AI_PLANNING_OPERATIONS = frozenset({"goal_plan", "calendar_plan", "activation", "replan", "weekly_review"})
ACTIVATION_FUNNEL_EVENTS = frozenset({
    "tool_creation_request_submitted",
    "template_recommendation_shown",
    "template_recommendation_accepted",
    "clarification_shown",
    "clarification_completed",
    "clarification_skipped",
    "initial_plan_generated",
    "initial_plan_structured_edit",
    "initial_plan_ai_revision",
    "initial_plan_approved",
    "active_tool_created",
    "active_tool_workspace_opened",
    "journey_failed",
})
REPEATABLE_ACTIVATION_FUNNEL_EVENTS = frozenset({
    "initial_plan_structured_edit",
    "initial_plan_ai_revision",
    "journey_failed",
})
ACTIVATION_FUNNEL_STAGES = frozenset({
    "matching",
    "recommendation",
    "clarification",
    "generation",
    "revision",
    "activation",
    "workspace_open",
})
ACTIVATION_FUNNEL_ERROR_CATEGORIES = frozenset({
    "network",
    "provider",
    "validation",
    "conflict",
    "persistence",
    "workspace",
    "unknown",
})
ACTIVATION_FUNNEL_METADATA_KEYS = frozenset({
    "questionCount",
    "skippedCount",
    "editCount",
    "revisionCount",
    "blockingCount",
    "matchedExisting",
})

DEFAULT_REPLAN_THRESHOLDS = {
    "consecutiveOffTrackReviews": 2,
    "criticalMilestoneDelayDays": 7,
    "capacityOverrunPercent": 20,
    "capacityOverrunPeriods": 2,
    "leadingMetricMinimumPercent": 60,
    "metricMissPeriods": 2,
    "consecutiveRequiredActionMisses": 3,
}

# Reasoning planning budgets cover both reasoning tokens and the final JSON.
MODE_LIMITS = {
    "economy": {
        "routine": {"input": 2500, "output": 400},
        "review": {"input": 2500, "output": 400},
        "planning": {"input": 10000, "output": 2000, "reasoningOutput": 8192},
        "route": {"input": 1200, "output": 160},
        "recentMessages": 2,
        "recentCheckIns": 1,
    },
    "balanced": {
        "routine": {"input": 4000, "output": 800},
        "review": {"input": 6000, "output": 1000},
        "planning": {"input": 16000, "output": 3000, "reasoningOutput": 16384},
        "route": {"input": 1500, "output": 200},
        "recentMessages": 6,
        "recentCheckIns": 2,
    },
    "quality": {
        "routine": {"input": 8000, "output": 1200},
        "review": {"input": 10000, "output": 1600},
        "planning": {"input": 24000, "output": 4000, "reasoningOutput": 24576},
        "route": {"input": 2500, "output": 300},
        "recentMessages": 12,
        "recentCheckIns": 4,
    },
}


class GoalControlValidationError(ValueError):
    pass


class GoalControlNotFoundError(KeyError):
    pass


class GoalControlConflictError(RuntimeError):
    pass


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def month_key(value: datetime | None = None) -> str:
    return (value or datetime.now(timezone.utc)).strftime("%Y-%m")


def clean_mode(value: object, fallback: str = "balanced") -> str:
    mode = str(value or "").strip().lower()
    return mode if mode in USAGE_MODES else fallback


def clamp_mode(requested: str, maximum: str) -> str:
    return USAGE_MODES[min(USAGE_MODES.index(clean_mode(requested)), USAGE_MODES.index(clean_mode(maximum)))]


def validated_float(value: object, field: str = 'value') -> float:
    if isinstance(value, bool):
        raise GoalControlValidationError(field + ' must be a finite number.')
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise GoalControlValidationError(field + ' must be a finite number.') from error
    if not math.isfinite(number):
        raise GoalControlValidationError(field + ' must be a finite number.')
    return number


def validated_int(value: object, field: str = 'value') -> int:
    number = validated_float(value, field)
    if not number.is_integer():
        raise GoalControlValidationError(field + ' must be an integer.')
    return int(number)


def optional_float(value: object, field: str = 'value') -> float | None:
    if value is None or value == '':
        return None
    number = validated_float(value, field)
    return number


def require_text(payload: dict[str, Any], key: str, maximum: int = 500) -> str:
    value = str(payload.get(key, "")).strip()
    if not value:
        raise GoalControlValidationError(f"{key} is required.")
    if len(value) > maximum:
        raise GoalControlValidationError(f"{key} is too long.")
    return value


def _strict_object(value: object, field: str, allowed: set[str]) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise GoalControlValidationError(f"{field} must be an object.")
    unknown = set(value) - allowed
    if unknown:
        raise GoalControlValidationError(f"{field} contains unsupported fields: {', '.join(sorted(unknown))}.")
    return value


def _strict_object_list(
    payload: dict[str, Any],
    key: str,
    *,
    minimum: int,
    maximum: int,
    allowed: set[str],
) -> list[dict[str, Any]]:
    value = payload.get(key, [])
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise GoalControlValidationError(f"{key} must contain between {minimum} and {maximum} items.")
    return [_strict_object(item, f"{key}[{index}]", allowed) for index, item in enumerate(value)]


def _bounded_text(value: object, field: str, maximum: int, *, required: bool = False) -> str:
    if value is None and not required:
        return ""
    if not isinstance(value, str):
        raise GoalControlValidationError(f"{field} must be text.")
    cleaned = value.strip()
    if required and not cleaned:
        raise GoalControlValidationError(f"{field} is required.")
    if len(cleaned) > maximum:
        raise GoalControlValidationError(f"{field} is too long.")
    return cleaned


def _activation_date(value: object, field: str) -> None:
    if value in (None, ""):
        return
    text = _bounded_text(value, field, 10, required=True)
    try:
        if date.fromisoformat(text).isoformat() != text:
            raise ValueError(text)
    except ValueError as error:
        raise GoalControlValidationError(f"{field} 必须使用 YYYY-MM-DD。") from error


def validate_activation_plan_payload(payload: dict[str, Any]) -> None:
    allowed_root = {
        "title", "summary", "rollingSummary", "target_date", "goal_id", "project_id",
        "template_id", "template_label", "tool_name", "tool_kind", "adapter_id",
        "activation_form", "activation_journey_id", "source", "tool_features", "route_tags",
        "assumptions", "missing_information", "constraints", "risks", "review_cadence",
        "confidence", "safety_confirmation", "metrics", "milestones", "actions",
        "dependencies", "policy", "implementation_path", "check_in",
    }
    _strict_object(payload, "activation plan", allowed_root)
    require_text(payload, "title", 200)
    require_text(payload, "summary", 2_000)
    _activation_date(payload.get("target_date"), "target_date")
    for key, maximum in (
        ("rollingSummary", 12_000), ("goal_id", 80), ("project_id", 80),
        ("template_id", 80), ("template_label", 120), ("tool_name", 120),
        ("adapter_id", 80), ("activation_journey_id", 80),
    ):
        if key in payload:
            _bounded_text(payload.get(key), key, maximum)
    if payload.get("tool_kind") not in (None, "fitness", "agent-learning"):
        raise GoalControlValidationError("Invalid tool_kind.")
    if payload.get("source") not in (None, "ai-assistant", "template-library"):
        raise GoalControlValidationError("Invalid activation source.")
    if "safety_confirmation" in payload and not isinstance(payload["safety_confirmation"], bool):
        raise GoalControlValidationError("safety_confirmation must be a boolean.")

    activation_form = payload.get("activation_form", {})
    if not isinstance(activation_form, dict) or any(
        not isinstance(key, str) or not isinstance(value, str)
        for key, value in activation_form.items()
    ):
        raise GoalControlValidationError("activation_form must contain text values only.")
    for key, maximum in (("tool_features", 16), ("route_tags", 24)):
        value = payload.get(key, [])
        if not isinstance(value, list) or len(value) > maximum:
            raise GoalControlValidationError(f"{key} must be a bounded list.")
        for index, item in enumerate(value):
            _bounded_text(item, f"{key}[{index}]", 80, required=True)
    for key, maximum, item_maximum in (
        ("assumptions", 8, 500), ("constraints", 12, 500),
    ):
        value = payload.get(key, [])
        if not isinstance(value, list) or len(value) > maximum:
            raise GoalControlValidationError(f"{key} must be a bounded list.")
        for index, item in enumerate(value):
            _bounded_text(item, f"{key}[{index}]", item_maximum, required=True)

    milestones = _strict_object_list(payload, "milestones", minimum=1, maximum=12, allowed={
        "milestone_id", "title", "description", "due_date", "status", "metadata",
    })
    actions = _strict_object_list(payload, "actions", minimum=1, maximum=40, allowed={
        "action_id", "title", "description", "milestone_id", "milestone_title", "due_date",
        "estimated_minutes", "priority", "energy_needed", "execution_tier", "status", "metadata",
    })
    for index, item in enumerate(milestones):
        _bounded_text(item.get("title"), f"milestones[{index}].title", 200, required=True)
        _bounded_text(item.get("description", ""), f"milestones[{index}].description", 1_000)
        _activation_date(item.get("due_date"), f"milestones[{index}].due_date")
        if item.get("status") not in (None, "not_started", "in_progress", "blocked", "done"):
            raise GoalControlValidationError("Invalid milestone status.")
    for index, item in enumerate(actions):
        _bounded_text(item.get("title"), f"actions[{index}].title", 200, required=True)
        _bounded_text(item.get("description", ""), f"actions[{index}].description", 1_000)
        _activation_date(item.get("due_date"), f"actions[{index}].due_date")
        minutes = validated_int(item.get("estimated_minutes", 30), f"actions[{index}].estimated_minutes")
        if not 5 <= minutes <= 10_080:
            raise GoalControlValidationError("Action estimated_minutes must be between 5 and 10080.")
        if item.get("priority", "medium") not in ("high", "medium", "low"):
            raise GoalControlValidationError("Invalid action priority.")
        if item.get("energy_needed", "medium") not in ("high", "medium", "low"):
            raise GoalControlValidationError("Invalid action energy_needed.")
        if item.get("execution_tier", "standard") not in EXECUTION_TIERS:
            raise GoalControlValidationError("Invalid action execution tier.")
        if item.get("status") not in (None, "todo", "in_progress", "blocked", "done", "skipped"):
            raise GoalControlValidationError("Invalid action status.")

    risks = _strict_object_list(payload, "risks", minimum=0, maximum=12, allowed={
        "label", "severity", "mitigation",
    })
    for index, item in enumerate(risks):
        _bounded_text(item.get("label"), f"risks[{index}].label", 300, required=True)
        if item.get("severity", "medium") not in ("low", "medium", "high"):
            raise GoalControlValidationError("Invalid risk severity.")
        _bounded_text(item.get("mitigation", ""), f"risks[{index}].mitigation", 500)
    missing = _strict_object_list(payload, "missing_information", minimum=0, maximum=8, allowed={
        "id", "label", "impact", "blocking",
    })
    for index, item in enumerate(missing):
        _bounded_text(item.get("id"), f"missing_information[{index}].id", 80, required=True)
        _bounded_text(item.get("label"), f"missing_information[{index}].label", 200, required=True)
        _bounded_text(item.get("impact"), f"missing_information[{index}].impact", 500, required=True)
        if not isinstance(item.get("blocking", False), bool):
            raise GoalControlValidationError("missing_information.blocking must be a boolean.")

    _strict_object_list(payload, "metrics", minimum=0, maximum=12, allowed={
        "metric_id", "name", "role", "value_type", "unit", "direction", "baseline_value",
        "target_value", "ideal_value", "acceptable_min", "acceptable_max", "safety_min",
        "safety_max", "target_date", "cadence", "is_required", "is_active", "metadata",
    })
    _strict_object_list(payload, "dependencies", minimum=0, maximum=40, allowed={
        "dependency_id", "predecessor_action_id", "successor_action_id",
        "predecessor_title", "successor_title",
    })
    review = _strict_object(payload.get("review_cadence", {}), "review_cadence", {"frequency", "local_time", "timezone"})
    if review.get("frequency", "weekly") not in ("daily", "weekly", "biweekly", "monthly"):
        raise GoalControlValidationError("Invalid review cadence frequency.")
    confidence = _strict_object(payload.get("confidence", {}), "confidence", {"level", "reasons"})
    if confidence.get("level", "medium") not in ("low", "medium", "high"):
        raise GoalControlValidationError("Invalid confidence level.")
    reasons = confidence.get("reasons", [])
    if not isinstance(reasons, list) or len(reasons) > 8:
        raise GoalControlValidationError("confidence.reasons must be a bounded list.")
    policy = _strict_object(payload.get("policy", {}), "policy", {
        "policy_id", "weekly_capacity_minutes", "buffer_percent", "active_tier", "ai_usage_mode",
        "available_days", "replan_thresholds", "stop_rules", "planning_brief",
    })
    if policy.get("active_tier", "standard") not in EXECUTION_TIERS:
        raise GoalControlValidationError("Invalid execution tier.")
    if policy.get("ai_usage_mode") not in (None, "inherit", *USAGE_MODES):
        raise GoalControlValidationError("Invalid AI usage mode.")


def record_dict(record: Any, mapping: dict[str, str] | None = None) -> dict[str, Any]:
    values: dict[str, Any] = {}
    aliases = mapping or {}
    for column in record.__table__.columns:
        if column.name in {"row_id", "user_id"}:
            continue
        key = aliases.get(column.name, column.name)
        value = getattr(record, column.name)
        if column.name.endswith("_json"):
            key = aliases.get(column.name, column.name.removesuffix("_json"))
        values[key] = copy.deepcopy(value)
    return values


def thread_dict(record: ConversationThreadRecord) -> dict[str, Any]:
    return record_dict(record, {"metadata_json": "metadata"})


def message_dict(record: ConversationMessageRecord) -> dict[str, Any]:
    return record_dict(record, {"structured_json": "structured"})


def activation_event_dict(record: ActivationFunnelEventRecord) -> dict[str, Any]:
    return record_dict(record, {"metadata_json": "metadata"})


def metric_dict(record: MetricDefinitionRecord) -> dict[str, Any]:
    return record_dict(record, {"metadata_json": "metadata"})


def metric_entry_dict(record: MetricEntryRecord) -> dict[str, Any]:
    return record_dict(record)


def policy_dict(record: GoalControlPolicyRecord) -> dict[str, Any]:
    return record_dict(
        record,
        {
            "available_days_json": "available_days",
            "planning_brief_json": "planning_brief",
            "replan_thresholds_json": "replan_thresholds",
            "stop_rules_json": "stop_rules",
        },
    )


def check_in_dict(record: CheckInRecord) -> dict[str, Any]:
    return record_dict(
        record,
        {"questions_json": "questions", "answers_json": "answers", "summary_json": "summary"},
    )


def action_dict(record: ActionItemRecord) -> dict[str, Any]:
    return {
        "action_id": record.action_id,
        "project_id": record.project_id,
        "milestone_id": record.milestone_id,
        "title": record.title,
        "description": record.description,
        "due_date": record.due_date,
        "status": record.status,
        "estimated_minutes": record.estimated_minutes,
        "priority": record.priority,
        "energy_needed": record.energy_needed,
        "execution_tier": record.execution_tier,
        "metadata": copy.deepcopy(record.metadata_json),
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


def milestone_dict(record: MilestoneRecord) -> dict[str, Any]:
    return {
        "milestone_id": record.milestone_id,
        "project_id": record.project_id,
        "title": record.title,
        "description": record.description,
        "due_date": record.due_date,
        "status": record.status,
        "metadata": copy.deepcopy(record.metadata_json),
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


def project_dict(record: ProjectRecord) -> dict[str, Any]:
    return {
        "project_id": record.project_id,
        "goal_id": record.goal_id,
        "title": record.title,
        "description": record.description,
        "status": record.status,
        "metadata": copy.deepcopy(record.metadata_json),
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


def goal_dict(record: GoalRecord) -> dict[str, Any]:
    return {
        "goal_id": record.goal_id,
        "title": record.title,
        "description": record.description,
        "status": record.status,
        "metadata": copy.deepcopy(record.metadata_json),
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


def _validate_question_batch(structured: dict[str, Any]) -> None:
    batch = structured.get("questionBatch")
    if batch is None:
        return
    if not isinstance(batch, list) or not 1 <= len(batch) <= 3:
        raise GoalControlValidationError("questionBatch must contain one to three questions.")
    for question in batch:
        if not isinstance(question, dict) or not str(question.get("prompt", "")).strip():
            raise GoalControlValidationError("Every question needs a prompt.")
        mode = str(question.get("selectionMode", "single"))
        if mode not in {"single", "multi"}:
            raise GoalControlValidationError("selectionMode must be single or multi.")
        choices = question.get("choices", [])
        if not isinstance(choices, list) or not 2 <= len(choices) <= 5:
            raise GoalControlValidationError("Selectable questions need two to five choices.")


@dataclass(frozen=True)
class UsageResolution:
    selected_mode: str
    effective_mode: str
    administrator_maximum_mode: str
    server_default_mode: str
    limits: dict[str, Any]


class GoalControlService:
    def __init__(
        self,
        engine: Engine | None = None,
        user_id: str = "local",
        *,
        db_path: str | os.PathLike[str] | None = None,
        app_mode: str = "desktop",
        client_timezone: str | None = None,
        initialize: bool | None = None,
    ) -> None:
        owns_engine = engine is None
        self.engine = engine or create_database_engine(db_path=db_path)
        if initialize if initialize is not None else owns_engine:
            initialize_schema(self.engine)
        self.session_factory = create_session_factory(self.engine)
        self.user_id = user_id
        self.app_mode = "desktop" if app_mode == "desktop" else "server"
        self.client_timezone = str(client_timezone or "").strip()
        if self.client_timezone:
            self._timezone(self.client_timezone)

    def _project(self, session: Any, project_id: str) -> ProjectRecord:
        record = session.scalar(
            select(ProjectRecord).where(ProjectRecord.user_id == self.user_id, ProjectRecord.project_id == project_id)
        )
        if record is None:
            raise GoalControlNotFoundError(project_id)
        return record

    def _goal(self, session: Any, goal_id: str) -> GoalRecord:
        record = session.scalar(
            select(GoalRecord).where(GoalRecord.user_id == self.user_id, GoalRecord.goal_id == goal_id)
        )
        if record is None:
            raise GoalControlNotFoundError(goal_id)
        return record

    def _thread(self, session: Any, thread_id: str) -> ConversationThreadRecord:
        record = session.scalar(
            select(ConversationThreadRecord).where(
                ConversationThreadRecord.user_id == self.user_id,
                ConversationThreadRecord.thread_id == thread_id,
            )
        )
        if record is None:
            raise GoalControlNotFoundError(thread_id)
        return record

    def list_threads(
        self,
        *,
        project_id: str | None = None,
        include_archived: bool = False,
        kind: str | None = None,
    ) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            query = select(ConversationThreadRecord).where(ConversationThreadRecord.user_id == self.user_id)
            if project_id:
                self._project(session, project_id)
                query = query.where(ConversationThreadRecord.project_id == project_id)
            if not include_archived:
                query = query.where(ConversationThreadRecord.status != "archived")
            if kind:
                query = query.where(ConversationThreadRecord.kind == kind)
            records = session.scalars(query.order_by(ConversationThreadRecord.updated_at.desc())).all()
            return [thread_dict(record) for record in records]

    def create_thread(self, payload: dict[str, Any]) -> dict[str, Any]:
        timestamp = now_iso()
        thread_id = str(payload.get("thread_id") or new_id("thread"))
        kind = str(payload.get("kind") or "goal_draft").strip()[:24]
        if not kind:
            raise GoalControlValidationError("Conversation kind is required.")
        status = str(payload.get("status") or "draft")
        if status not in THREAD_STATUSES:
            raise GoalControlValidationError("Invalid conversation status.")
        project_id = str(payload.get("project_id") or "").strip() or None
        requested_goal_id = str(payload.get("goal_id") or "").strip() or None
        metadata = copy.deepcopy(payload.get("metadata") or {})
        if not isinstance(metadata, dict):
            raise GoalControlValidationError("metadata must be an object.")
        journey_id = str(metadata.get("journeyId") or "").strip()
        with user_write_transaction(self.session_factory, self.user_id) as session:
            existing_thread = session.scalar(select(ConversationThreadRecord).where(ConversationThreadRecord.user_id == self.user_id, ConversationThreadRecord.thread_id == thread_id))
            if existing_thread is not None:
                if existing_thread.kind != kind or existing_thread.title != str(payload.get("title") or "New long-term goal")[:200]:
                    raise GoalControlConflictError("Conversation ID already belongs to different content.")
                return thread_dict(existing_thread)
            if journey_id:
                candidates = session.scalars(
                    select(ConversationThreadRecord).where(
                        ConversationThreadRecord.user_id == self.user_id,
                        ConversationThreadRecord.status == "draft",
                        ConversationThreadRecord.template_id
                        == (str(payload.get("template_id") or "").strip() or None),
                    )
                ).all()
                existing = next(
                    (
                        item
                        for item in candidates
                        if isinstance(item.metadata_json, dict)
                        and str(item.metadata_json.get("journeyId") or "") == journey_id
                    ),
                    None,
                )
                if existing is not None:
                    return thread_dict(existing)
            if project_id:
                project = self._project(session, project_id)
                if requested_goal_id and requested_goal_id != project.goal_id:
                    raise GoalControlValidationError("goal_id conflicts with the selected project's goal.")
                goal_id = project.goal_id
            else:
                goal_id = requested_goal_id
                if goal_id:
                    self._goal(session, goal_id)
            record = ConversationThreadRecord(
                thread_id=thread_id,
                user_id=self.user_id,
                kind=kind,
                title=str(payload.get("title") or "New long-term goal")[:200],
                goal_id=goal_id,
                project_id=project_id,
                template_id=str(payload.get("template_id") or "").strip() or None,
                status=status,
                rolling_summary=str(payload.get("rolling_summary") or ""),
                summary_through_message_id=None,
                metadata_json=metadata,
                created_at=timestamp,
                updated_at=timestamp,
            )
            session.add(record)
        return thread_dict(record)

    def get_thread(self, thread_id: str) -> dict[str, Any]:
        with self.session_factory() as session:
            record = self._thread(session, thread_id)
            messages = session.scalars(
                select(ConversationMessageRecord)
                .where(
                    ConversationMessageRecord.user_id == self.user_id,
                    ConversationMessageRecord.thread_id == thread_id,
                )
                .order_by(ConversationMessageRecord.created_at.asc())
            ).all()
            return {**thread_dict(record), "messages": [message_dict(message) for message in messages]}

    def get_thread_of_kind(self, thread_id: str, kind: str) -> dict[str, Any]:
        value = self.get_thread(thread_id)
        if value["kind"] != kind:
            raise GoalControlNotFoundError(thread_id)
        return value

    def delete_thread(self, thread_id: str, *, kind: str | None = None) -> None:
        with self.session_factory.begin() as session:
            record = self._thread(session, thread_id)
            if kind and record.kind != kind:
                raise GoalControlNotFoundError(thread_id)
            session.delete(record)

    def validate_ai_context(
        self,
        *,
        project_id: str | None,
        thread_id: str | None,
    ) -> None:
        with self.session_factory() as session:
            project = self._project(session, project_id) if project_id else None
            thread = self._thread(session, thread_id) if thread_id else None
            if thread is not None and thread.status == "archived":
                raise GoalControlConflictError("Archived conversations cannot be used as AI context.")
            if project is not None and thread is not None and thread.project_id != project.project_id:
                raise GoalControlValidationError(
                    "thread_id does not belong to the selected project."
                )

    def update_thread(self, thread_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        with self.session_factory.begin() as session:
            record = self._thread(session, thread_id)
            if "project_id" in payload or "goal_id" in payload:
                project_id = (
                    str(payload.get("project_id") or "").strip() or None
                    if "project_id" in payload
                    else record.project_id
                )
                requested_goal_id = (
                    str(payload.get("goal_id") or "").strip() or None
                    if "goal_id" in payload
                    else record.goal_id
                )
                if project_id:
                    project = self._project(session, project_id)
                    if "goal_id" in payload and requested_goal_id != project.goal_id:
                        raise GoalControlValidationError("goal_id conflicts with the selected project's goal.")
                    record.project_id = project_id
                    record.goal_id = project.goal_id
                else:
                    if requested_goal_id:
                        self._goal(session, requested_goal_id)
                    record.project_id = None
                    record.goal_id = requested_goal_id
            if "status" in payload:
                status = str(payload["status"])
                if status not in THREAD_STATUSES:
                    raise GoalControlValidationError("Invalid conversation status.")
                record.status = status
            for source, target, maximum in (
                ("title", "title", 200),
                ("rolling_summary", "rolling_summary", 12000),
                ("summary_through_message_id", "summary_through_message_id", 64),
                ("template_id", "template_id", 80),
            ):
                if source in payload:
                    setattr(record, target, str(payload[source] or "")[:maximum] or None)
            if "metadata" in payload and isinstance(payload["metadata"], dict):
                record.metadata_json = copy.deepcopy(payload["metadata"])
            record.updated_at = now_iso()
        return thread_dict(record)

    def add_message(self, thread_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        role = str(payload.get("role") or "user")
        if role not in {"user", "assistant", "system"}:
            raise GoalControlValidationError("Invalid message role.")
        content = str(payload.get("content") or "").strip()
        structured = copy.deepcopy(payload.get("structured") or {})
        if not content and not structured:
            raise GoalControlValidationError("A message needs content or structured data.")
        if not isinstance(structured, dict):
            raise GoalControlValidationError("structured must be an object.")
        _validate_question_batch(structured)
        summary_update = str(payload.get("summaryUpdate") or "").strip()
        if len(summary_update) > 12000:
            raise GoalControlValidationError("summaryUpdate is too long.")
        timestamp = now_iso()
        with user_write_transaction(self.session_factory, self.user_id) as session:
            thread = self._thread(session, thread_id)
            if thread.kind == "assistant_chat" and thread.status == "archived":
                raise GoalControlConflictError("Archived conversations cannot receive new messages.")
            structured.pop("actionPlanReview", None)
            message_id = str(payload.get("message_id") or new_id("msg"))
            existing = session.scalar(select(ConversationMessageRecord).where(
                ConversationMessageRecord.user_id == self.user_id,
                ConversationMessageRecord.message_id == message_id,
            ))
            if existing is not None:
                saved = copy.deepcopy(existing.structured_json or {})
                saved.pop("actionPlanReview", None)
                if existing.thread_id != thread_id or existing.role != role or existing.content != content or saved != structured:
                    raise GoalControlConflictError("Message ID already belongs to different content.")
                return message_dict(existing)
            if thread.kind == "assistant_chat" and role == "assistant" and isinstance(structured.get("actionPlan"), dict):
                structured["actionPlanReview"] = new_review()
            record = ConversationMessageRecord(
                message_id=message_id,
                user_id=self.user_id,
                thread_id=thread_id,
                role=role,
                content=content,
                structured_json=structured,
                created_at=timestamp,
                updated_at=timestamp,
            )
            session.add(record)
            thread.updated_at = timestamp
            if summary_update:
                thread.rolling_summary = summary_update
                thread.summary_through_message_id = record.message_id
        return message_dict(record)

    def dismiss_ai_action_plan(self, thread_id: str, message_id: str) -> dict[str, Any]:
        with user_write_transaction(self.session_factory, self.user_id) as session:
            try:
                record, _thread, body, review = plan_message(session, self.user_id, {"threadId": thread_id, "messageId": message_id})
            except KeyError as exc:
                raise GoalControlNotFoundError(message_id) from exc
            except ValueError as exc:
                raise GoalControlConflictError(str(exc)) from exc
            review["dismissed"] = True
            body["actionPlanReview"] = review
            record.structured_json = body
            record.updated_at = now_iso()
            return message_dict(record)

    def record_funnel_event(
        self,
        thread_id: str | None,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        event_name = str(payload.get("eventName") or "").strip()
        if event_name not in ACTIVATION_FUNNEL_EVENTS:
            raise GoalControlValidationError("Invalid activation funnel event.")
        journey_id = str(payload.get("journeyId") or "").strip()
        template_id = str(payload.get("templateId") or "").strip()
        source = str(payload.get("source") or "").strip()
        resolved_thread_id = str(thread_id or payload.get("threadId") or "").strip() or None
        project_id = str(payload.get("projectId") or "").strip() or None
        stage = str(payload.get("stage") or "").strip() or None
        error_category = str(payload.get("errorCategory") or "").strip() or None
        metadata_value = copy.deepcopy(payload.get("metadata") or {})
        if not journey_id or len(journey_id) > 80:
            raise GoalControlValidationError("journeyId is required and must be at most 80 characters.")
        if not template_id or len(template_id) > 80:
            raise GoalControlValidationError("templateId is required and must be at most 80 characters.")
        if source not in {"ai-assistant", "template-library"}:
            raise GoalControlValidationError("Invalid activation funnel source.")
        if stage and stage not in ACTIVATION_FUNNEL_STAGES:
            raise GoalControlValidationError("Invalid activation funnel stage.")
        if event_name == "journey_failed":
            if not stage:
                raise GoalControlValidationError("journey_failed requires a bounded stage.")
            error_category = error_category or "unknown"
        if error_category and error_category not in ACTIVATION_FUNNEL_ERROR_CATEGORIES:
            raise GoalControlValidationError("Invalid activation funnel error category.")
        if not isinstance(metadata_value, dict):
            raise GoalControlValidationError("Activation funnel metadata must be an object.")
        unknown_metadata = set(metadata_value) - ACTIVATION_FUNNEL_METADATA_KEYS
        if unknown_metadata:
            raise GoalControlValidationError("Activation funnel metadata contains an unsupported field.")
        metadata: dict[str, bool | int] = {}
        for key, value in metadata_value.items():
            if isinstance(value, bool):
                metadata[key] = value
            elif isinstance(value, int) and 0 <= value <= 10_000:
                metadata[key] = value
            else:
                raise GoalControlValidationError(
                    "Activation funnel metadata values must be bounded booleans or integers."
                )
        dedupe_key = event_name if event_name != "journey_failed" else f"{event_name}:{stage}"
        timestamp = now_iso()

        with self.session_factory.begin() as session:
            if resolved_thread_id:
                self._thread(session, resolved_thread_id)
            if project_id:
                self._project(session, project_id)
            existing = session.scalar(
                select(ActivationFunnelEventRecord).where(
                    ActivationFunnelEventRecord.user_id == self.user_id,
                    ActivationFunnelEventRecord.journey_id == journey_id,
                    ActivationFunnelEventRecord.dedupe_key == dedupe_key,
                )
            )
            if existing is not None:
                if event_name in REPEATABLE_ACTIVATION_FUNNEL_EVENTS:
                    current_metadata = copy.deepcopy(existing.metadata_json or {})
                    current_count = int(current_metadata.get("count") or 1)
                    existing.metadata_json = {
                        **current_metadata,
                        **metadata,
                        "count": min(10_000, current_count + 1),
                    }
                    existing.thread_id = resolved_thread_id or existing.thread_id
                    existing.project_id = project_id or existing.project_id
                    existing.stage = stage or existing.stage
                    existing.error_category = error_category or existing.error_category
                    existing.updated_at = timestamp
                return activation_event_dict(existing)

            values = {
                "event_id": new_id("activation_event"),
                "user_id": self.user_id,
                "journey_id": journey_id,
                "thread_id": resolved_thread_id,
                "project_id": project_id,
                "template_id": template_id,
                "source": source,
                "event_name": event_name,
                "dedupe_key": dedupe_key,
                "stage": stage,
                "error_category": error_category,
                "metadata_json": {
                    **metadata,
                    **({"count": 1} if event_name in REPEATABLE_ACTIVATION_FUNNEL_EVENTS else {}),
                },
                "created_at": timestamp,
                "updated_at": timestamp,
            }
            if self.engine.dialect.name == "sqlite":
                session.execute(
                    sqlite_insert(ActivationFunnelEventRecord)
                    .values(**values)
                    .on_conflict_do_nothing(
                        index_elements=["user_id", "journey_id", "dedupe_key"]
                    )
                )
            elif self.engine.dialect.name == "mysql":
                session.execute(
                    mysql_insert(ActivationFunnelEventRecord).values(**values).prefix_with("IGNORE")
                )
            else:
                session.add(ActivationFunnelEventRecord(**values))
                session.flush()
            record = session.scalar(
                select(ActivationFunnelEventRecord).where(
                    ActivationFunnelEventRecord.user_id == self.user_id,
                    ActivationFunnelEventRecord.journey_id == journey_id,
                    ActivationFunnelEventRecord.dedupe_key == dedupe_key,
                )
            )
            if record is None:
                raise RuntimeError("Activation funnel event could not be persisted.")
        return activation_event_dict(record)

    def activation_funnel_baseline(self, template_id: str | None = None) -> dict[str, Any]:
        with self.session_factory() as session:
            query = select(ActivationFunnelEventRecord).where(
                ActivationFunnelEventRecord.user_id == self.user_id
            )
            if template_id:
                query = query.where(ActivationFunnelEventRecord.template_id == template_id)
            records = session.scalars(query).all()

        def journeys(event_name: str) -> set[str]:
            return {
                record.journey_id
                for record in records
                if record.event_name == event_name
            }

        submitted = journeys("tool_creation_request_submitted")
        recommendations = journeys("template_recommendation_shown")
        accepted = journeys("template_recommendation_accepted")
        opened = journeys("active_tool_workspace_opened")
        event_counts = {
            event_name: sum(1 for record in records if record.event_name == event_name)
            for event_name in sorted(ACTIVATION_FUNNEL_EVENTS)
        }
        failure_counts_by_stage = {
            stage: sum(
                1
                for record in records
                if record.event_name == "journey_failed" and record.stage == stage
            )
            for stage in sorted(ACTIVATION_FUNNEL_STAGES)
        }

        def ratio(numerator: int, denominator: int) -> float | None:
            return round(numerator / denominator, 4) if denominator else None

        return {
            "template_id": template_id,
            "submitted_journeys": len(submitted),
            "recommendation_journeys": len(recommendations),
            "accepted_recommendation_journeys": len(accepted),
            "opened_workspace_journeys": len(opened),
            "event_counts": event_counts,
            "failure_counts_by_stage": failure_counts_by_stage,
            "completion_rate": ratio(len(opened & submitted), len(submitted)),
            "match_coverage": ratio(len(recommendations & submitted), len(submitted)),
            "post_recommendation_completion_rate": ratio(
                len(opened & recommendations), len(recommendations)
            ),
        }


    def list_metrics(self, project_id: str, *, include_entries: bool = True) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            self._project(session, project_id)
            metrics = session.scalars(
                select(MetricDefinitionRecord)
                .where(MetricDefinitionRecord.user_id == self.user_id, MetricDefinitionRecord.project_id == project_id)
                .order_by(MetricDefinitionRecord.created_at.asc())
            ).all()
            result = []
            for metric in metrics:
                item = metric_dict(metric)
                if include_entries:
                    entries = session.scalars(
                        select(MetricEntryRecord)
                        .where(
                            MetricEntryRecord.user_id == self.user_id,
                            MetricEntryRecord.metric_id == metric.metric_id,
                        )
                        .order_by(MetricEntryRecord.observed_at.asc())
                    ).all()
                    item["entries"] = [metric_entry_dict(entry) for entry in entries]
                result.append(item)
            return result

    def create_metric(self, project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        role = str(payload.get("role") or "leading")
        direction = str(payload.get("direction") or "increase")
        if role not in METRIC_ROLES or direction not in METRIC_DIRECTIONS:
            raise GoalControlValidationError("Invalid metric role or direction.")
        timestamp = now_iso()
        with self.session_factory.begin() as session:
            self._project(session, project_id)
            record = MetricDefinitionRecord(
                metric_id=str(payload.get("metric_id") or new_id("metric")),
                user_id=self.user_id,
                project_id=project_id,
                name=require_text(payload, "name", 120),
                role=role,
                value_type=str(payload.get("value_type") or "number"),
                unit=str(payload.get("unit") or "")[:32],
                direction=direction,
                baseline_value=optional_float(payload.get("baseline_value")),
                target_value=optional_float(payload.get("target_value")),
                ideal_value=optional_float(payload.get("ideal_value")),
                acceptable_min=optional_float(payload.get("acceptable_min")),
                acceptable_max=optional_float(payload.get("acceptable_max")),
                safety_min=optional_float(payload.get("safety_min")),
                safety_max=optional_float(payload.get("safety_max")),
                target_date=str(payload.get("target_date") or "")[:10] or None,
                cadence=str(payload.get("cadence") or "weekly")[:24],
                is_required=bool(payload.get("is_required", False)),
                is_active=bool(payload.get("is_active", True)),
                metadata_json=copy.deepcopy(payload.get("metadata") or {}),
                created_at=timestamp,
                updated_at=timestamp,
            )
            session.add(record)
        return metric_dict(record)

    def update_metric(self, metric_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        with self.session_factory.begin() as session:
            record = session.scalar(
                select(MetricDefinitionRecord).where(
                    MetricDefinitionRecord.user_id == self.user_id,
                    MetricDefinitionRecord.metric_id == metric_id,
                )
            )
            if record is None:
                raise GoalControlNotFoundError(metric_id)
            for key in (
                "name", "role", "value_type", "unit", "direction", "target_date", "cadence"
            ):
                if key in payload:
                    setattr(record, key, str(payload[key] or ""))
            for key in (
                "baseline_value", "target_value", "ideal_value", "acceptable_min", "acceptable_max", "safety_min", "safety_max"
            ):
                if key in payload:
                    setattr(record, key, optional_float(payload[key]))
            for key in ("is_required", "is_active"):
                if key in payload:
                    setattr(record, key, bool(payload[key]))
            if record.role not in METRIC_ROLES or record.direction not in METRIC_DIRECTIONS:
                raise GoalControlValidationError("Invalid metric role or direction.")
            if "metadata" in payload:
                record.metadata_json = copy.deepcopy(payload.get("metadata") or {})
            record.updated_at = now_iso()
        return metric_dict(record)

    def add_metric_entry(self, metric_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        confidence = validated_float(payload.get("confidence", 1.0), 'confidence')
        if not 0 <= confidence <= 1:
            raise GoalControlValidationError("confidence must be between 0 and 1.")
        timestamp = now_iso()
        with self.session_factory.begin() as session:
            metric = session.scalar(
                select(MetricDefinitionRecord).where(
                    MetricDefinitionRecord.user_id == self.user_id,
                    MetricDefinitionRecord.metric_id == metric_id,
                )
            )
            if metric is None:
                raise GoalControlNotFoundError(metric_id)
            numeric_value = optional_float(payload.get("numeric_value"), 'numeric_value')
            text_value = str(payload.get("text_value") or "").strip() or None
            if numeric_value is None and text_value is None:
                raise GoalControlValidationError("A metric entry needs numeric_value or text_value.")
            anomaly = bool(payload.get("is_anomaly", False))
            if numeric_value is not None:
                if metric.safety_min is not None and numeric_value < metric.safety_min:
                    anomaly = True
                if metric.safety_max is not None and numeric_value > metric.safety_max:
                    anomaly = True
            record = MetricEntryRecord(
                entry_id=str(payload.get("entry_id") or new_id("metric_entry")),
                user_id=self.user_id,
                project_id=metric.project_id,
                metric_id=metric_id,
                observed_at=str(payload.get("observed_at") or timestamp),
                numeric_value=numeric_value,
                text_value=text_value,
                source=str(payload.get("source") or "manual")[:24],
                confidence=confidence,
                is_anomaly=anomaly,
                anomaly_reason=str(payload.get("anomaly_reason") or "")[:300],
                notes=str(payload.get("notes") or ""),
                created_at=timestamp,
                updated_at=timestamp,
            )
            session.add(record)
        return metric_entry_dict(record)

    def get_policy(self, project_id: str) -> dict[str, Any]:
        with self.session_factory.begin() as session:
            self._project(session, project_id)
            record = session.scalar(
                select(GoalControlPolicyRecord).where(
                    GoalControlPolicyRecord.user_id == self.user_id,
                    GoalControlPolicyRecord.project_id == project_id,
                )
            )
            if record is None:
                record = self._new_policy(project_id, {}, now_iso())
                session.add(record)
            value = policy_dict(record)
        value["usage"] = self.resolve_usage(project_id).__dict__
        return value

    def _new_policy(self, project_id: str, payload: dict[str, Any], timestamp: str) -> GoalControlPolicyRecord:
        tier = str(payload.get("active_tier") or "standard")
        if tier not in EXECUTION_TIERS:
            raise GoalControlValidationError("Invalid execution tier.")
        mode_value = payload.get("ai_usage_mode")
        mode = None if mode_value in {None, "", "inherit"} else clean_mode(mode_value)
        buffer_percent = validated_float(
            payload.get("buffer_percent", 20),
            'buffer_percent',
        )
        if not 0 <= buffer_percent <= 80:
            raise GoalControlValidationError("buffer_percent must be between 0 and 80.")
        return GoalControlPolicyRecord(
            policy_id=str(payload.get("policy_id") or new_id("policy")),
            user_id=self.user_id,
            project_id=project_id,
            weekly_capacity_minutes=max(
                0,
                validated_int(
                    payload.get("weekly_capacity_minutes", 300),
                    'weekly_capacity_minutes',
                ),
            ),
            buffer_percent=buffer_percent,
            active_tier=tier,
            ai_usage_mode=mode,
            available_days_json=copy.deepcopy(payload.get("available_days") or []),
            replan_thresholds_json={**DEFAULT_REPLAN_THRESHOLDS, **copy.deepcopy(payload.get("replan_thresholds") or {})},
            stop_rules_json=copy.deepcopy(payload.get("stop_rules") or []),
            planning_brief_json=copy.deepcopy(payload.get("planning_brief") or {}),
            created_at=timestamp,
            updated_at=timestamp,
        )

    def update_policy(self, project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        timestamp = now_iso()
        with self.session_factory.begin() as session:
            self._project(session, project_id)
            record = session.scalar(
                select(GoalControlPolicyRecord).where(
                    GoalControlPolicyRecord.user_id == self.user_id,
                    GoalControlPolicyRecord.project_id == project_id,
                )
            )
            if record is None:
                record = self._new_policy(project_id, payload, timestamp)
                session.add(record)
            else:
                if "weekly_capacity_minutes" in payload:
                    record.weekly_capacity_minutes = max(
                        0,
                        validated_int(
                            payload["weekly_capacity_minutes"],
                            'weekly_capacity_minutes',
                        ),
                    )
                if "buffer_percent" in payload:
                    value = validated_float(
                        payload["buffer_percent"],
                        'buffer_percent',
                    )
                    if not 0 <= value <= 80:
                        raise GoalControlValidationError("buffer_percent must be between 0 and 80.")
                    record.buffer_percent = value
                if "active_tier" in payload:
                    tier = str(payload["active_tier"])
                    if tier not in EXECUTION_TIERS:
                        raise GoalControlValidationError("Invalid execution tier.")
                    record.active_tier = tier
                if "ai_usage_mode" in payload:
                    value = payload["ai_usage_mode"]
                    record.ai_usage_mode = None if value in {None, "", "inherit"} else clean_mode(value)
                for source, target in (
                    ("available_days", "available_days_json"),
                    ("replan_thresholds", "replan_thresholds_json"),
                    ("stop_rules", "stop_rules_json"),
                    ("planning_brief", "planning_brief_json"),
                ):
                    if source in payload:
                        setattr(record, target, copy.deepcopy(payload[source]))
                record.updated_at = timestamp
            value = policy_dict(record)
        value["usage"] = self.resolve_usage(project_id).__dict__
        return value

    def resolve_usage(self, project_id: str | None = None) -> UsageResolution:
        server_default = clean_mode(os.getenv("AI_DEFAULT_USAGE_MODE", "balanced"))
        maximum = clean_mode(os.getenv("AI_MAX_USAGE_MODE", "balanced"))
        with self.session_factory() as session:
            preferences = session.scalar(
                select(UserPreferenceRecord).where(UserPreferenceRecord.user_id == self.user_id)
            )
            selected = clean_mode((preferences.preferences_json if preferences else {}).get("aiUsageMode"), server_default)
            if project_id:
                self._project(session, project_id)
                policy = session.scalar(
                    select(GoalControlPolicyRecord).where(
                        GoalControlPolicyRecord.user_id == self.user_id,
                        GoalControlPolicyRecord.project_id == project_id,
                    )
                )
                if policy and policy.ai_usage_mode:
                    selected = clean_mode(policy.ai_usage_mode, selected)
        effective = clamp_mode(selected, maximum)
        return UsageResolution(selected, effective, maximum, server_default, copy.deepcopy(MODE_LIMITS[effective]))

    def list_dependencies(self, project_id: str) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            self._project(session, project_id)
            records = session.scalars(
                select(PlanDependencyRecord).where(
                    PlanDependencyRecord.user_id == self.user_id,
                    PlanDependencyRecord.project_id == project_id,
                )
            ).all()
            return [record_dict(record) for record in records]

    def add_dependency(self, project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        predecessor = require_text(payload, "predecessor_action_id", 64)
        successor = require_text(payload, "successor_action_id", 64)
        if predecessor == successor:
            raise GoalControlValidationError("An action cannot depend on itself.")
        timestamp = now_iso()
        with self.session_factory.begin() as session:
            self._project(session, project_id)
            action_ids = set(
                session.scalars(
                    select(ActionItemRecord.action_id).where(
                        ActionItemRecord.user_id == self.user_id,
                        ActionItemRecord.project_id == project_id,
                    )
                )
            )
            if predecessor not in action_ids or successor not in action_ids:
                raise GoalControlNotFoundError("dependency action")
            existing = session.scalars(
                select(PlanDependencyRecord).where(
                    PlanDependencyRecord.user_id == self.user_id,
                    PlanDependencyRecord.project_id == project_id,
                )
            ).all()
            edges = [(item.predecessor_action_id, item.successor_action_id) for item in existing]
            if self._has_path(edges, successor, predecessor):
                raise GoalControlValidationError("This dependency would create a cycle.")
            record = PlanDependencyRecord(
                dependency_id=str(payload.get("dependency_id") or new_id("dependency")),
                user_id=self.user_id,
                project_id=project_id,
                predecessor_action_id=predecessor,
                successor_action_id=successor,
                created_at=timestamp,
                updated_at=timestamp,
            )
            session.add(record)
        return record_dict(record)

    @staticmethod
    def _has_path(edges: Iterable[tuple[str, str]], start: str, target: str) -> bool:
        graph: dict[str, list[str]] = {}
        for left, right in edges:
            graph.setdefault(left, []).append(right)
        stack = [start]
        visited: set[str] = set()
        while stack:
            current = stack.pop()
            if current == target:
                return True
            if current in visited:
                continue
            visited.add(current)
            stack.extend(graph.get(current, []))
        return False

    def delete_dependency(self, dependency_id: str) -> None:
        with self.session_factory.begin() as session:
            record = session.scalar(
                select(PlanDependencyRecord).where(
                    PlanDependencyRecord.user_id == self.user_id,
                    PlanDependencyRecord.dependency_id == dependency_id,
                )
            )
            if record is None:
                raise GoalControlNotFoundError(dependency_id)
            session.delete(record)

    def add_effort(self, project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        minutes = validated_int(payload.get("minutes", 0), 'minutes')
        if minutes <= 0 or minutes > 7 * 24 * 60:
            raise GoalControlValidationError("minutes must be between 1 and 10080.")
        confidence = validated_float(payload.get("confidence", 1.0), 'confidence')
        if not 0 <= confidence <= 1:
            raise GoalControlValidationError("confidence must be between 0 and 1.")
        timestamp = now_iso()
        with self.session_factory.begin() as session:
            self._project(session, project_id)
            action_id = str(payload.get("action_id") or "").strip() or None
            if action_id:
                exists = session.scalar(
                    select(ActionItemRecord).where(
                        ActionItemRecord.user_id == self.user_id,
                        ActionItemRecord.project_id == project_id,
                        ActionItemRecord.action_id == action_id,
                    )
                )
                if not exists:
                    raise GoalControlNotFoundError(action_id)
            record = EffortEntryRecord(
                effort_id=str(payload.get("effort_id") or new_id("effort")),
                user_id=self.user_id,
                project_id=project_id,
                action_id=action_id,
                occurred_on=str(payload.get("occurred_on") or self._user_today(session).isoformat()),
                minutes=minutes,
                source=str(payload.get("source") or "manual")[:24],
                confidence=confidence,
                notes=str(payload.get("notes") or ""),
                created_at=timestamp,
                updated_at=timestamp,
            )
            session.add(record)
        return record_dict(record)

    def list_effort(self, project_id: str) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            self._project(session, project_id)
            records = session.scalars(
                select(EffortEntryRecord)
                .where(EffortEntryRecord.user_id == self.user_id, EffortEntryRecord.project_id == project_id)
                .order_by(EffortEntryRecord.occurred_on.desc())
            ).all()
            return [record_dict(record) for record in records]

    def _critical_path(self, actions: list[ActionItemRecord], dependencies: list[PlanDependencyRecord]) -> dict[str, Any]:
        action_map = {action.action_id: action for action in actions if action.status not in {"done", "skipped"}}
        incoming = {action_id: 0 for action_id in action_map}
        outgoing: dict[str, list[str]] = {action_id: [] for action_id in action_map}
        for dependency in dependencies:
            if dependency.predecessor_action_id in action_map and dependency.successor_action_id in action_map:
                outgoing[dependency.predecessor_action_id].append(dependency.successor_action_id)
                incoming[dependency.successor_action_id] += 1
        queue = [action_id for action_id, count in incoming.items() if count == 0]
        distance = {action_id: max(1, action_map[action_id].estimated_minutes) for action_id in action_map}
        previous: dict[str, str] = {}
        visited = 0
        while queue:
            current = queue.pop(0)
            visited += 1
            for successor in outgoing[current]:
                candidate = distance[current] + max(1, action_map[successor].estimated_minutes)
                if candidate > distance[successor]:
                    distance[successor] = candidate
                    previous[successor] = current
                incoming[successor] -= 1
                if incoming[successor] == 0:
                    queue.append(successor)
        if visited != len(action_map):
            return {"action_ids": [], "total_minutes": 0, "has_cycle": True, "projected_finish": None}
        if not distance:
            return {"action_ids": [], "total_minutes": 0, "has_cycle": False, "projected_finish": None}
        end = max(distance, key=distance.get)
        path = [end]
        while end in previous:
            end = previous[end]
            path.append(end)
        path.reverse()
        return {"action_ids": path, "total_minutes": distance[path[-1]], "has_cycle": False, "projected_finish": None}

    @staticmethod
    def _standard_capacity_usage(actions: list[dict[str, Any]], policy: dict[str, Any]) -> dict[str, Any]:
        weekly_capacity = max(0, int(policy.get("weekly_capacity_minutes", 300)))
        buffer_percent = float(policy.get("buffer_percent", 20))
        available = math.floor(weekly_capacity * (1 - buffer_percent / 100))
        weeks: dict[str, dict[str, Any]] = {}
        standard_minutes = 0
        unscheduled: list[str] = []
        for item in actions:
            if (
                str(item.get("execution_tier") or "standard") not in {"minimum", "standard"}
                or str(item.get("status") or "todo") in {"done", "skipped"}
            ):
                continue
            minutes = max(0, int(item.get("estimated_minutes", 30)))
            standard_minutes += minutes
            due_text = str(item.get("due_date") or "")
            try:
                due = date.fromisoformat(due_text)
            except ValueError:
                unscheduled.append(str(item.get("action_id") or item.get("title") or "action"))
                continue
            week_start = due - timedelta(days=due.weekday())
            key = week_start.isoformat()
            bucket = weeks.setdefault(key, {"planned_minutes": 0, "action_ids": []})
            bucket["planned_minutes"] += minutes
            bucket["action_ids"].append(str(item.get("action_id") or item.get("title") or "action"))
        return {
            "planned_minutes": standard_minutes,
            "available_minutes": available,
            "weekly_capacity_minutes": weekly_capacity,
            "weeks": weeks,
            "unscheduled_action_ids": unscheduled,
        }

    @classmethod
    def _validate_standard_capacity(
        cls,
        actions: list[dict[str, Any]],
        policy: dict[str, Any],
        target_date: str | None = None,
        today_value: date | None = None,
    ) -> None:
        usage = cls._standard_capacity_usage(actions, policy)
        available = usage["available_minutes"]
        if usage["unscheduled_action_ids"]:
            raise GoalControlValidationError(
                "以下 Minimum/Standard 行动缺少有效日期："
                + "、".join(usage["unscheduled_action_ids"][:5])
            )
        try:
            target = date.fromisoformat(target_date) if target_date else None
        except ValueError as error:
            raise GoalControlValidationError("计划日期必须使用 YYYY-MM-DD。") from error
        if target:
            outside = [
                str(item.get("action_id") or item.get("title") or "action")
                for item in actions
                if item.get("due_date") and date.fromisoformat(str(item["due_date"])) > target
            ]
            if outside:
                raise GoalControlValidationError(
                    f"行动日期不能晚于目标日期 {target.isoformat()}："
                    + "、".join(outside[:5])
                )
        today = today_value or date.today()
        configured_days = policy.get("available_days") or []
        if not isinstance(configured_days, (list, tuple, set)):
            configured_days = []
        available_days = {
            value
            for item in configured_days
            if (value := canonical_day(item))
        } or {"sun"}
        days_per_capacity_period = len(available_days)
        required: list[tuple[date, int, str]] = []
        for item in actions:
            if (
                str(item.get("execution_tier") or "standard") not in {"minimum", "standard"}
                or str(item.get("status") or "todo") in {"done", "skipped"}
            ):
                continue
            due = date.fromisoformat(str(item.get("due_date")))
            metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
            is_user_fixed = str(metadata.get("due_date_source") or "") == "user_fixed"
            if due < today:
                if is_user_fixed:
                    raise GoalControlValidationError(
                        f"{item.get('title') or item.get('action_id') or '行动'} 使用了已过去的固定日期 {due.isoformat()}。"
                    )
                due = today + timedelta(days=28)
            required.append((due, max(0, int(item.get("estimated_minutes", 30))), str(item.get("action_id") or item.get("title") or "action")))
        required.sort(key=lambda value: value[0])
        cumulative_minutes = 0
        cumulative_actions: list[str] = []
        for due, minutes, action_id in required:
            cumulative_minutes += minutes
            cumulative_actions.append(action_id)
            span_days = (due - today).days + 1
            full_weeks, remainder = divmod(max(0, span_days), 7)
            executable_days = full_weeks * days_per_capacity_period + sum(
                1
                for offset in range(remainder)
                if DAY_CODES[(today.weekday() + offset) % 7] in available_days
            )
            total_available = math.floor(
                available * executable_days / days_per_capacity_period
            )
            if cumulative_minutes > total_available:
                if executable_days:
                    minimum_weekly = math.ceil(
                        cumulative_minutes
                        * days_per_capacity_period
                        / executable_days
                        / max(0.01, 1 - float(policy.get("buffer_percent", 20)) / 100)
                    )
                    capacity_option = f"每周容量至少需要 {minimum_weekly} 分钟。"
                else:
                    capacity_option = "截止日前没有配置的可执行日，请调整可执行日或期限。"
                raise GoalControlValidationError(
                    f"截至 {due.isoformat()} 的必要行动共需 {cumulative_minutes} 分钟，"
                    f"超过 {executable_days} 个可执行日可用的 {total_available} 分钟；"
                    f"{capacity_option}受影响行动：{'、'.join(cumulative_actions[:5])}。"
                )

    @staticmethod
    def _normalize_system_action_dates(
        actions: list[dict[str, Any]],
        today_value: date,
    ) -> None:
        """Move only expired system-generated required-action dates into a new rolling window."""
        for item in actions:
            if (
                str(item.get("execution_tier") or "standard") not in {"minimum", "standard"}
                or str(item.get("status") or "todo") in {"done", "skipped"}
            ):
                continue
            try:
                due = date.fromisoformat(str(item.get("due_date") or ""))
            except ValueError:
                continue
            metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
            if due >= today_value or str(metadata.get("due_date_source") or "") == "user_fixed":
                continue
            item["due_date"] = (today_value + timedelta(days=28)).isoformat()
            item["metadata"] = {
                **copy.deepcopy(metadata),
                "due_date_source": "system_planned",
                "due_date_flexibility": "flexible",
            }

    @staticmethod
    def _normalize_system_milestone_dates(
        milestones: list[dict[str, Any]],
        today_value: date,
        target_date: str | None,
    ) -> None:
        fallback = date.fromisoformat(target_date) if target_date else today_value + timedelta(days=28)
        for item in milestones:
            try:
                due = date.fromisoformat(str(item.get("due_date") or ""))
            except ValueError:
                continue
            metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
            if due >= today_value or str(metadata.get("due_date_source") or "") == "user_fixed":
                continue
            item["due_date"] = fallback.isoformat()
            item["metadata"] = {
                **copy.deepcopy(metadata),
                "due_date_source": "system_planned",
                "due_date_flexibility": "flexible",
            }

    @staticmethod
    def _validate_action_date_bounds(
        actions: list[dict[str, Any]],
        milestones: list[dict[str, Any]],
        target_date: str | None,
    ) -> None:
        target = date.fromisoformat(target_date) if target_date else None
        milestone_dates = {
            str(item.get("milestone_id") or ""): date.fromisoformat(str(item["due_date"]))
            for item in milestones
            if item.get("milestone_id") and item.get("due_date")
        }
        for item in actions:
            if not item.get("due_date"):
                continue
            due = date.fromisoformat(str(item["due_date"]))
            bound = milestone_dates.get(str(item.get("milestone_id") or "")) or target
            if bound and due > bound:
                raise GoalControlValidationError(
                    f"{item.get('title') or item.get('action_id') or '行动'} 的日期不能晚于"
                    f"所属里程碑或项目目标日期 {bound.isoformat()}。"
                )

    @staticmethod
    def _selected_answer(record: CheckInRecord, question_id: str) -> set[str]:
        selected: set[str] = set()
        for item in record.answers_json or []:
            if not isinstance(item, dict) or str(item.get("question_id") or "") != question_id:
                continue
            selected.update(str(value) for value in item.get("selected", []) if value)
            if item.get("choice_id"):
                selected.add(str(item["choice_id"]))
        return selected

    def _review_assessment(
        self,
        session: Any,
        project_id: str,
        policy: GoalControlPolicyRecord | None = None,
    ) -> dict[str, Any]:
        policy = policy or session.scalar(select(GoalControlPolicyRecord).where(GoalControlPolicyRecord.user_id == self.user_id, GoalControlPolicyRecord.project_id == project_id))
        thresholds = {**DEFAULT_REPLAN_THRESHOLDS, **copy.deepcopy(policy.replan_thresholds_json if policy else {})}
        triggers: list[dict[str, str]] = []
        warnings: list[dict[str, str]] = []
        today = self._project_today(session, project_id)
        reviews = list(session.scalars(
            select(CheckInRecord)
            .where(CheckInRecord.user_id == self.user_id, CheckInRecord.project_id == project_id, CheckInRecord.status == "answered", CheckInRecord.includes_review.is_(True))
            .order_by(CheckInRecord.period_end.desc()).limit(2)
        ))
        required_reviews = int(thresholds["consecutiveOffTrackReviews"])
        if len(reviews) >= required_reviews and all(self._selected_answer(item, "progress") & {"some", "blocked"} for item in reviews[:required_reviews]):
            triggers.append({"key": "off_track_reviews", "label": f"{required_reviews} consecutive reviews reported clear plan deviation."})

        milestone_delay = int(thresholds["criticalMilestoneDelayDays"])
        delayed = list(session.scalars(select(MilestoneRecord).where(
            MilestoneRecord.user_id == self.user_id, MilestoneRecord.project_id == project_id,
            MilestoneRecord.status.not_in(["done", "skipped"]), MilestoneRecord.due_date.is_not(None),
        )))
        if any((today - date.fromisoformat(item.due_date)).days >= milestone_delay for item in delayed if item.due_date):
            triggers.append({"key": "milestone_delay", "label": f"A Milestone is delayed by at least {milestone_delay} days."})

        capacity = policy.weekly_capacity_minutes if policy else 300
        effort = list(session.scalars(select(EffortEntryRecord).where(EffortEntryRecord.user_id == self.user_id, EffortEntryRecord.project_id == project_id)))
        overrun_periods = int(thresholds["capacityOverrunPeriods"])
        overrun_limit = capacity * (1 + float(thresholds["capacityOverrunPercent"]) / 100)
        week_start = today - timedelta(days=today.weekday())
        weekly_totals = [
            sum(item.minutes for item in effort if start.isoformat() <= item.occurred_on <= (start + timedelta(days=6)).isoformat())
            for start in (week_start - timedelta(days=7 * index) for index in range(overrun_periods))
        ]
        if len(weekly_totals) >= overrun_periods and all(value > overrun_limit for value in weekly_totals):
            triggers.append({"key": "capacity_overrun", "label": f"Capacity exceeded its budget by more than {thresholds['capacityOverrunPercent']}% for {overrun_periods} periods."})

        metrics = list(session.scalars(select(MetricDefinitionRecord).where(MetricDefinitionRecord.user_id == self.user_id, MetricDefinitionRecord.project_id == project_id, MetricDefinitionRecord.is_active.is_(True))))
        metric_periods = int(thresholds["metricMissPeriods"])
        for metric in metrics:
            all_entries = list(session.scalars(
                select(MetricEntryRecord)
                .where(MetricEntryRecord.user_id == self.user_id, MetricEntryRecord.metric_id == metric.metric_id)
                .order_by(MetricEntryRecord.observed_at.desc())
            ))
            review_periods = reviews[:metric_periods]
            period_entries = [
                [
                    entry
                    for entry in all_entries
                    if review.period_start <= entry.observed_at[:10] <= review.period_end
                ]
                for review in review_periods
            ]
            if any(
                item.is_anomaly or item.confidence < 0.5
                for entries_in_period in period_entries
                for item in entries_in_period
            ):
                warnings.append({"key": f"confirm_metric:{metric.metric_id}", "label": f"Confirm low-confidence or anomalous {metric.name} data before replanning."})
            values: list[float] = []
            for entries_in_period in period_entries:
                trusted = [
                    float(item.numeric_value)
                    for item in entries_in_period
                    if not item.is_anomaly and item.confidence >= 0.5 and item.numeric_value is not None
                ]
                if trusted:
                    values.append(sum(trusted) / len(trusted))
            if len(values) < metric_periods:
                continue
            if metric.role == "leading":
                if metric.unit.strip().lower() in {"%", "percent", "percentage"}:
                    below = all(value < float(thresholds["leadingMetricMinimumPercent"]) for value in values)
                elif metric.baseline_value is not None and metric.target_value is not None and metric.target_value != metric.baseline_value:
                    progress = [((value - metric.baseline_value) / (metric.target_value - metric.baseline_value)) * 100 for value in values]
                    below = all(value < float(thresholds["leadingMetricMinimumPercent"]) for value in progress)
                else:
                    below = False
                if below:
                    triggers.append({"key": f"leading_metric:{metric.metric_id}", "label": f"{metric.name} stayed below {thresholds['leadingMetricMinimumPercent']}% for {metric_periods} periods."})
            else:
                latest, previous = values[0], values[1]
                outside = (metric.acceptable_min is not None and latest < metric.acceptable_min) or (metric.acceptable_max is not None and latest > metric.acceptable_max)
                stalled = (metric.direction == "increase" and latest <= previous) or (metric.direction == "decrease" and latest >= previous) or (metric.direction == "range" and outside)
                if stalled or outside:
                    triggers.append({"key": f"lagging_metric:{metric.metric_id}", "label": f"{metric.name} has not shown the expected trend for {metric_periods} periods."})

        misses_required = int(thresholds["consecutiveRequiredActionMisses"])
        required_actions = list(session.scalars(
            select(ActionItemRecord).where(
                ActionItemRecord.user_id == self.user_id, ActionItemRecord.project_id == project_id,
                ActionItemRecord.execution_tier == "minimum",
                ActionItemRecord.due_date.is_not(None), ActionItemRecord.due_date < today.isoformat(),
            ).order_by(ActionItemRecord.due_date.desc()).limit(misses_required)
        ))
        if len(required_actions) >= misses_required and all(item.status != "done" for item in required_actions):
            triggers.append({"key": "required_action_misses", "label": f"{misses_required} necessary actions were missed consecutively."})
        return {
            "recommend_replan": bool(triggers),
            "recommend_pause": bool(warnings),
            "triggers": triggers[:3],
            "trigger_count": len(triggers),
            "safety_warnings": warnings[:3],
            "adjustment_question": "Prepare a plan difference proposal?" if triggers else "Keep the current plan?",
        }

    def _health(
        self,
        project: ProjectRecord,
        actions: list[ActionItemRecord],
        milestones: list[MilestoneRecord],
        metrics: list[MetricDefinitionRecord],
        entries: list[MetricEntryRecord],
        policy: GoalControlPolicyRecord | None,
        effort: list[EffortEntryRecord],
        review: dict[str, Any] | None = None,
        last_check_in_at: str | None = None,
        today_value: date | None = None,
    ) -> dict[str, Any]:
        today_value = today_value or date.today()
        factors: list[dict[str, Any]] = []
        completed = sum(action.status == "done" for action in actions)
        completion = round((completed / len(actions)) * 100) if actions else 0
        factors.append({"key": "completion", "label": "Action completion", "value": completion, "severity": "good" if completion >= 60 else "attention"})
        skipped = sum(action.status == "skipped" for action in actions)
        factors.append({"key": "skipped", "label": "Skipped actions", "value": skipped, "severity": "attention" if skipped else "good"})
        unscheduled = sum(not action.due_date and action.status not in {"done", "skipped"} for action in actions)
        factors.append({"key": "unscheduled", "label": "Unscheduled actions", "value": unscheduled, "severity": "attention" if unscheduled else "good"})
        today = today_value.isoformat()
        overdue = sum(bool(item.due_date and item.due_date < today and item.status not in {"done", "skipped"}) for item in milestones)
        factors.append({"key": "milestones", "label": "Overdue milestones", "value": overdue, "severity": "risk" if overdue else "good"})
        anomalies = sum(entry.is_anomaly or entry.confidence < 0.5 for entry in entries)
        factors.append({"key": "dataQuality", "label": "Unconfirmed metric readings", "value": anomalies, "severity": "attention" if anomalies else "good"})
        capacity = policy.weekly_capacity_minutes if policy else 300
        week_start = (today_value - timedelta(days=today_value.weekday())).isoformat()
        used = sum(item.minutes for item in effort if item.occurred_on >= week_start)
        capacity_percent = round((used / capacity) * 100) if capacity else 0
        factors.append({"key": "capacity", "label": "Weekly capacity used", "value": capacity_percent, "severity": "risk" if capacity_percent > 120 else "attention" if capacity_percent > 100 else "good"})
        blocked = sum(action.status == "blocked" for action in actions)
        factors.append({"key": "blockers", "label": "Blocked actions", "value": blocked, "severity": "attention" if blocked else "good"})
        check_in_age = (today_value - date.fromisoformat(last_check_in_at[:10])).days if last_check_in_at else 999
        factors.append({"key": "checkInFreshness", "label": "Days since Check-in", "value": check_in_age, "severity": "attention" if check_in_age > 3 else "good"})
        status = "paused" if project.status == "paused" else "on_track"
        replan_signal_count = int((review or {}).get("trigger_count") or 0)
        factors.append({
            "key": "replanSignals", "label": "Unresolved replan signals",
            "value": replan_signal_count, "severity": "risk" if replan_signal_count else "good",
            "details": copy.deepcopy((review or {}).get("triggers") or []),
        })
        if status != "paused" and (overdue or capacity_percent > 120 or replan_signal_count > 0):
            status = "at_risk"
        elif status != "paused" and (completion < 60 and actions or anomalies or blocked or unscheduled or check_in_age > 3):
            status = "attention"
        return {"status": status, "factors": factors, "confidence": "low" if anomalies else "normal"}

    def dashboard(self, project_id: str) -> dict[str, Any]:
        with self.session_factory.begin() as session:
            project = self._project(session, project_id)
            goal = session.scalar(
                select(GoalRecord).where(GoalRecord.user_id == self.user_id, GoalRecord.goal_id == project.goal_id)
            )
            actions = list(session.scalars(select(ActionItemRecord).where(ActionItemRecord.user_id == self.user_id, ActionItemRecord.project_id == project_id)))
            milestones = list(session.scalars(select(MilestoneRecord).where(MilestoneRecord.user_id == self.user_id, MilestoneRecord.project_id == project_id)))
            metrics = list(session.scalars(select(MetricDefinitionRecord).where(MetricDefinitionRecord.user_id == self.user_id, MetricDefinitionRecord.project_id == project_id)))
            entries = list(session.scalars(select(MetricEntryRecord).where(MetricEntryRecord.user_id == self.user_id, MetricEntryRecord.project_id == project_id)))
            dependencies = list(session.scalars(select(PlanDependencyRecord).where(PlanDependencyRecord.user_id == self.user_id, PlanDependencyRecord.project_id == project_id)))
            effort = list(session.scalars(select(EffortEntryRecord).where(EffortEntryRecord.user_id == self.user_id, EffortEntryRecord.project_id == project_id)))
            policy = session.scalar(select(GoalControlPolicyRecord).where(GoalControlPolicyRecord.user_id == self.user_id, GoalControlPolicyRecord.project_id == project_id))
            if policy is None:
                policy = self._new_policy(project_id, {}, now_iso())
                session.add(policy)
            schedule = session.scalar(select(CheckInScheduleRecord).where(CheckInScheduleRecord.user_id == self.user_id, CheckInScheduleRecord.project_id == project_id))
            pending = session.scalar(
                select(CheckInRecord).where(
                    CheckInRecord.user_id == self.user_id,
                    CheckInRecord.project_id == project_id,
                    CheckInRecord.status == "pending",
                )
            )
            versions = list(session.scalars(select(PlanVersionRecord).where(PlanVersionRecord.user_id == self.user_id, PlanVersionRecord.project_id == project_id).order_by(PlanVersionRecord.version_number.desc())))
            proposals = list(session.scalars(select(PlanChangeProposalRecord).where(PlanChangeProposalRecord.user_id == self.user_id, PlanChangeProposalRecord.project_id == project_id).order_by(PlanChangeProposalRecord.created_at.desc()).limit(20)))
            threads = list(session.scalars(select(ConversationThreadRecord).where(ConversationThreadRecord.user_id == self.user_id, ConversationThreadRecord.project_id == project_id).order_by(ConversationThreadRecord.updated_at.desc())))
            metric_values = []
            for metric in metrics:
                item = metric_dict(metric)
                item["entries"] = [metric_entry_dict(entry) for entry in entries if entry.metric_id == metric.metric_id]
                metric_values.append(item)
            review = self._review_assessment(session, project_id, policy)
            user_today = self._user_today(session)
            critical_path = self._critical_path(actions, dependencies)
            usable_capacity = max(1, math.floor(policy.weekly_capacity_minutes * (1 - policy.buffer_percent / 100)))
            if not critical_path["has_cycle"] and critical_path["total_minutes"]:
                projected_days = max(1, math.ceil(critical_path["total_minutes"] / usable_capacity * 7))
                critical_path["projected_finish"] = (user_today + timedelta(days=projected_days)).isoformat()
            critical_path["usable_weekly_minutes"] = usable_capacity
            milestone_predictions = []
            for milestone in milestones:
                milestone_path = self._critical_path([item for item in actions if item.milestone_id == milestone.milestone_id], dependencies)
                projected_days = math.ceil(milestone_path["total_minutes"] / usable_capacity * 7) if milestone_path["total_minutes"] else 0
                projected_finish = (user_today + timedelta(days=projected_days)).isoformat()
                milestone_predictions.append({
                    "milestone_id": milestone.milestone_id, "projected_finish": projected_finish,
                    "due_date": milestone.due_date, "at_risk": bool(milestone.due_date and projected_finish > milestone.due_date),
                })
            return {
                "project": project_dict(project),
                "goal": goal_dict(goal) if goal else None,
                "actions": [action_dict(item) for item in actions],
                "milestones": [milestone_dict(item) for item in milestones],
                "metrics": metric_values,
                "policy": policy_dict(policy),
                "dependencies": [record_dict(item) for item in dependencies],
                "effort": [record_dict(item) for item in effort],
                "health": self._health(
                    project,
                    actions,
                    milestones,
                    metrics,
                    entries,
                    policy,
                    effort,
                    review,
                    schedule.last_check_in_at if schedule else None,
                    user_today,
                ),
                "critical_path": critical_path,
                "milestone_predictions": milestone_predictions,
                "review": review,
                "pending_check_in": check_in_dict(pending) if pending else None,
                "versions": [record_dict(item, {"snapshot_json": "snapshot", "diff_json": "diff"}) for item in versions],
                "proposals": [record_dict(item, {"proposal_json": "proposal", "diff_json": "diff"}) for item in proposals],
                "threads": [thread_dict(item) for item in threads],
                "usage": self.resolve_usage(project_id).__dict__,
            }

    def _check_in_questions(self, session: Any, project_id: str, period_start: str, period_end: str) -> list[dict[str, Any]]:
        span = (date.fromisoformat(period_end) - date.fromisoformat(period_start)).days + 1
        span_label = "today" if span == 1 else f"the past {span} days"
        questions: list[dict[str, Any]] = [
            {
                "id": "progress",
                "prompt": f"How much of the planned work did you complete over {span_label}?",
                "selectionMode": "single",
                "choices": [
                    {"id": "all", "label": "All"},
                    {"id": "most", "label": "Most"},
                    {"id": "some", "label": "Some"},
                    {"id": "blocked", "label": "Blocked"},
                ],
                "allowCustom": True,
            },
            {
                "id": "effort",
                "prompt": f"Roughly how much time did you invest over {span_label}?",
                "selectionMode": "single",
                "choices": [
                    {"id": "15", "label": "15 min"},
                    {"id": "30", "label": "30 min"},
                    {"id": "60", "label": "1 hour"},
                    {"id": "120", "label": "2+ hours"},
                ],
                "allowCustom": True,
            },
        ]
        metric = session.scalar(
            select(MetricDefinitionRecord)
            .where(
                MetricDefinitionRecord.user_id == self.user_id,
                MetricDefinitionRecord.project_id == project_id,
                MetricDefinitionRecord.is_active.is_(True),
            )
            .order_by(MetricDefinitionRecord.is_required.desc(), MetricDefinitionRecord.created_at.asc())
        )
        if metric:
            questions.append(
                {
                    "id": f"metric:{metric.metric_id}",
                    "prompt": f"Do you have a new {metric.name} measurement?",
                    "selectionMode": "single",
                    "choices": [
                        {"id": "record", "label": "Record value"},
                        {"id": "unchanged", "label": "About the same"},
                        {"id": "unavailable", "label": "Not measured"},
                    ],
                    "allowCustom": True,
                }
            )
        return questions[:3]

    @staticmethod
    def _timezone(name: str) -> tzinfo:
        if name.upper() in {"UTC", "ETC/UTC"}:
            return timezone.utc
        try:
            return ZoneInfo(name)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise GoalControlValidationError(f"Unknown IANA timezone: {name}") from error

    def _user_timezone(self, session: Any) -> tuple[str, tzinfo]:
        preferences = session.scalar(
            select(UserPreferenceRecord).where(UserPreferenceRecord.user_id == self.user_id)
        )
        override = str(
            (preferences.preferences_json if preferences else {}).get("timezoneOverride") or ""
        ).strip()
        name = override or self.client_timezone or "UTC"
        return name, self._timezone(name)

    def _user_now(self, session: Any) -> datetime:
        _name, zone = self._user_timezone(session)
        return datetime.now(zone)

    def _user_today(self, session: Any) -> date:
        return self._user_now(session).date()

    def _project_today(self, session: Any, project_id: str) -> date:
        self._project(session, project_id)
        return self._user_today(session)

    @classmethod
    def _check_in_due_at(cls, local_day: date, local_time: str, timezone_name: str) -> str:
        zone = cls._timezone(timezone_name)
        try:
            local_clock = clock_time.fromisoformat(local_time)
        except ValueError as error:
            raise GoalControlValidationError("Check-in local_time must use HH:MM.") from error
        value = datetime.combine(local_day, local_clock, tzinfo=zone).astimezone(timezone.utc)
        return value.isoformat().replace("+00:00", "Z")

    @contextmanager
    def _serialized_write_transaction(self) -> Any:
        """Serialize Check-in read/create decisions across database connections."""

        session = self.session_factory()
        try:
            if self.engine.dialect.name == "sqlite":
                session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            else:
                session.begin()
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def ensure_check_ins(self, today_value: str | None = None) -> list[dict[str, Any]]:
        explicit_today = date.fromisoformat(today_value) if today_value else None
        timestamp = now_iso()
        with self._serialized_write_transaction() as session:
            projects = session.scalars(
                select(ProjectRecord).where(ProjectRecord.user_id == self.user_id, ProjectRecord.status == "active").with_for_update()
            ).all()
            created_or_pending: list[CheckInRecord] = []
            for project in projects:
                if (project.metadata_json or {}).get("toolCategory") not in {"active-tool", "enabled-tool"}:
                    continue
                schedule = session.scalar(
                    select(CheckInScheduleRecord).where(
                        CheckInScheduleRecord.user_id == self.user_id,
                        CheckInScheduleRecord.project_id == project.project_id,
                    )
                )
                if schedule is None:
                    timezone_name, _zone = self._user_timezone(session)
                    schedule = CheckInScheduleRecord(
                        schedule_id=new_id("checkin_schedule"),
                        user_id=self.user_id,
                        project_id=project.project_id,
                        local_time="20:00",
                        timezone=timezone_name,
                        enabled=True,
                        review_interval_days=7,
                        last_check_in_at=None,
                        last_review_at=None,
                        created_at=timestamp,
                        updated_at=timestamp,
                    )
                    session.add(schedule)
                if not schedule.enabled:
                    continue
                today = explicit_today or self._user_today(session)
                pending = session.scalar(
                    select(CheckInRecord).where(
                        CheckInRecord.user_id == self.user_id,
                        CheckInRecord.project_id == project.project_id,
                        CheckInRecord.status == "pending",
                    )
                    .order_by(CheckInRecord.period_end.asc(), CheckInRecord.created_at.asc())
                )
                if pending:
                    created_or_pending.append(pending)
                    continue
                last_answered = session.scalar(
                    select(CheckInRecord)
                    .where(
                        CheckInRecord.user_id == self.user_id,
                        CheckInRecord.project_id == project.project_id,
                        CheckInRecord.status.in_(["answered", "skipped"]),
                    )
                    .order_by(CheckInRecord.period_end.desc())
                )
                start = today if not last_answered else date.fromisoformat(last_answered.period_end) + timedelta(days=1)
                if start > today:
                    continue
                last_review = date.fromisoformat(schedule.last_review_at[:10]) if schedule.last_review_at else None
                includes_review = last_review is None or (today - last_review).days >= schedule.review_interval_days
                thread = session.scalar(
                    select(ConversationThreadRecord)
                    .where(
                        ConversationThreadRecord.user_id == self.user_id,
                        ConversationThreadRecord.project_id == project.project_id,
                        ConversationThreadRecord.status == "active",
                    )
                    .order_by(ConversationThreadRecord.updated_at.desc())
                )
                values = {
                    "check_in_id": new_id("checkin"),
                    "user_id": self.user_id,
                    "project_id": project.project_id,
                    "thread_id": thread.thread_id if thread else None,
                    "period_start": start.isoformat(),
                    "period_end": today.isoformat(),
                    "due_at": self._check_in_due_at(today, schedule.local_time, schedule.timezone),
                    "status": "pending",
                    "includes_review": includes_review,
                    "questions_json": self._check_in_questions(session, project.project_id, start.isoformat(), today.isoformat()),
                    "answers_json": [],
                    "summary_json": {},
                    "answered_at": None,
                    "skipped_at": None,
                    "created_at": timestamp,
                    "updated_at": timestamp,
                }
                if self.engine.dialect.name == "mysql":
                    session.execute(mysql_insert(CheckInRecord).values(**values).prefix_with("IGNORE"))
                else:
                    session.execute(
                        sqlite_insert(CheckInRecord)
                        .values(**values)
                        .on_conflict_do_nothing(
                            index_elements=["user_id", "project_id", "period_end"]
                        )
                    )
                record = session.scalar(
                    select(CheckInRecord).where(
                        CheckInRecord.user_id == self.user_id,
                        CheckInRecord.project_id == project.project_id,
                        CheckInRecord.period_end == today.isoformat(),
                    )
                )
                if record is not None and record.status == "pending":
                    created_or_pending.append(record)
            return [check_in_dict(record) for record in created_or_pending]

    def list_pending_check_ins(self) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            records = session.scalars(
                select(CheckInRecord)
                .where(CheckInRecord.user_id == self.user_id, CheckInRecord.status == "pending")
                .order_by(CheckInRecord.due_at.asc())
            ).all()
            projects = {
                item.project_id: item
                for item in session.scalars(select(ProjectRecord).where(ProjectRecord.user_id == self.user_id)).all()
            }
            return [
                {**check_in_dict(record), "project_title": projects.get(record.project_id).title if projects.get(record.project_id) else ""}
                for record in records
            ]

    def answer_check_in(self, check_in_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        answers = payload.get("answers") or []
        if isinstance(answers, dict):
            answers = [
                {"question_id": question_id, **(value if isinstance(value, dict) else {"custom": str(value)})}
                for question_id, value in answers.items()
            ]
        if not isinstance(answers, list):
            raise GoalControlValidationError("answers must be a list.")
        timestamp = now_iso()
        with self.session_factory.begin() as session:
            record = session.scalar(
                select(CheckInRecord).where(CheckInRecord.user_id == self.user_id, CheckInRecord.check_in_id == check_in_id)
            )
            if record is None:
                raise GoalControlNotFoundError(check_in_id)
            if record.status != "pending":
                raise GoalControlConflictError("This check-in is already closed.")
            project = self._project(session, record.project_id)
            question_map = {
                str(question.get("id") or ""): question
                for question in record.questions_json or []
                if isinstance(question, dict) and question.get("id")
            }
            seen_questions: set[str] = set()
            for item in answers:
                if not isinstance(item, dict):
                    raise GoalControlValidationError("Each answer must be an object.")
                question_id = str(item.get("question_id") or "")
                question = question_map.get(question_id)
                if question is None or question_id in seen_questions:
                    raise GoalControlValidationError(f"Unknown or duplicate Check-in question: {question_id}")
                seen_questions.add(question_id)
                selected = item.get("selected") or ([] if not item.get("choice_id") else [item.get("choice_id")])
                if not isinstance(selected, list) or len(selected) > 5 or any(not isinstance(value, str) for value in selected):
                    raise GoalControlValidationError(f"Invalid selected choices for {question_id}.")
                allowed_choices = {
                    str(choice.get("id"))
                    for choice in question.get("choices") or []
                    if isinstance(choice, dict) and choice.get("id")
                }
                if any(value not in allowed_choices for value in selected):
                    raise GoalControlValidationError(f"Unknown selected choice for {question_id}.")
                if question.get("selectionMode") == "single" and len(selected) > 1:
                    raise GoalControlValidationError(f"{question_id} accepts one choice.")
                custom = str(item.get("customText") or item.get("custom") or "")
                if custom and not question.get("allowCustom"):
                    raise GoalControlValidationError(f"{question_id} does not accept a custom answer.")
                if len(custom) > 500:
                    raise GoalControlValidationError(f"Custom answer for {question_id} is too long.")
                if not selected and not custom.strip():
                    raise GoalControlValidationError(f"Check-in question {question_id} requires an answer.")
            missing_questions = sorted(set(question_map) - seen_questions)
            if missing_questions:
                raise GoalControlValidationError(
                    f"Every Check-in question requires an answer. Missing: {', '.join(missing_questions)}"
                )
            record.answers_json = copy.deepcopy(answers)
            record.status = "answered"
            record.answered_at = timestamp
            record.updated_at = timestamp
            effort_minutes = int(payload.get("effort_minutes") or 0)
            if effort_minutes < 0 or effort_minutes > 10_080:
                raise GoalControlValidationError("effort_minutes must be between 0 and 10080.")
            if effort_minutes > 0:
                session.add(
                    EffortEntryRecord(
                        effort_id=new_id("effort"), user_id=self.user_id, project_id=record.project_id,
                        action_id=None, occurred_on=record.period_end, minutes=effort_minutes, source="check_in",
                        confidence=1.0, notes="Recorded from daily check-in.", created_at=timestamp, updated_at=timestamp,
                    )
                )
            for metric_value in payload.get("metric_values") or []:
                if not isinstance(metric_value, dict):
                    raise GoalControlValidationError("Each metric value must be an object.")
                metric_id = str(metric_value.get("metric_id") or "")
                metric = session.scalar(
                    select(MetricDefinitionRecord).where(
                        MetricDefinitionRecord.user_id == self.user_id,
                        MetricDefinitionRecord.project_id == record.project_id,
                        MetricDefinitionRecord.metric_id == metric_id,
                    )
                )
                if metric is None:
                    raise GoalControlNotFoundError(metric_id)
                value = optional_float(metric_value.get("value"))
                anomaly = bool(metric_value.get("is_anomaly", False))
                if value is not None and ((metric.safety_min is not None and value < metric.safety_min) or (metric.safety_max is not None and value > metric.safety_max)):
                    anomaly = True
                confidence = float(metric_value.get("confidence", 1.0))
                if confidence < 0 or confidence > 1:
                    raise GoalControlValidationError("Metric confidence must be between 0 and 1.")
                session.add(
                    MetricEntryRecord(
                        entry_id=new_id("metric_entry"), user_id=self.user_id, project_id=record.project_id,
                        metric_id=metric_id, observed_at=timestamp, numeric_value=value, text_value=None,
                        source="check_in", confidence=confidence, is_anomaly=anomaly,
                        anomaly_reason=str(metric_value.get("anomaly_reason") or ""), notes=str(metric_value.get("notes") or ""),
                        created_at=timestamp, updated_at=timestamp,
                    )
                )
            selected = []
            for item in answers:
                if not isinstance(item, dict):
                    continue
                selected.extend(str(value) for value in item.get("selected", []) if value)
                if item.get("choice_id"):
                    selected.append(str(item["choice_id"]))
                if item.get("custom"):
                    selected.append(str(item["custom"]))
            session.flush()
            assessment = self._review_assessment(session, record.project_id) if record.includes_review else None
            summary = {
                "headline": "Check-in recorded.",
                "highlights": [value for value in selected if value][:3],
                "review": record.includes_review,
                "review_assessment": assessment,
                "adjustment_question": (
                    {
                        "prompt": assessment["adjustment_question"] if assessment else "Keep the current plan?",
                        "choices": ["keep", "adjust", "reduce", "custom"],
                    }
                    if record.includes_review else None
                ),
                "requires_ai_summary": self.resolve_usage(record.project_id).effective_mode != "economy",
            }
            record.summary_json = summary
            schedule = session.scalar(
                select(CheckInScheduleRecord).where(
                    CheckInScheduleRecord.user_id == self.user_id,
                    CheckInScheduleRecord.project_id == record.project_id,
                )
            )
            if schedule:
                schedule.last_check_in_at = timestamp
                if record.includes_review:
                    schedule.last_review_at = timestamp
                schedule.updated_at = timestamp
            session.add(
                ProgressLogRecord(
                    progress_id=new_id("progress"), user_id=self.user_id, project_id=record.project_id,
                    goal_id=project.goal_id, action_id=None, log_type="review" if record.includes_review else "update",
                    summary="Daily check-in recorded", details=str(summary["highlights"]),
                    metadata_json={"checkInId": check_in_id}, created_at=timestamp, updated_at=timestamp,
                )
            )
            if record.thread_id:
                session.add(
                    ConversationMessageRecord(
                        message_id=new_id("msg"), user_id=self.user_id, thread_id=record.thread_id, role="user",
                        content="Submitted daily check-in.", structured_json={"checkInId": check_in_id, "answers": copy.deepcopy(answers)},
                        created_at=timestamp, updated_at=timestamp,
                    )
                )
        return check_in_dict(record)

    def skip_check_in(self, check_in_id: str) -> dict[str, Any]:
        timestamp = now_iso()
        with self.session_factory.begin() as session:
            record = session.scalar(select(CheckInRecord).where(CheckInRecord.user_id == self.user_id, CheckInRecord.check_in_id == check_in_id))
            if record is None:
                raise GoalControlNotFoundError(check_in_id)
            if record.status != "pending":
                raise GoalControlConflictError("This check-in is already closed.")
            record.status = "skipped"
            record.skipped_at = timestamp
            record.updated_at = timestamp
        return check_in_dict(record)

    def _snapshot(self, session: Any, project_id: str) -> dict[str, Any]:
        project = self._project(session, project_id)
        milestones = session.scalars(select(MilestoneRecord).where(MilestoneRecord.user_id == self.user_id, MilestoneRecord.project_id == project_id)).all()
        actions = session.scalars(select(ActionItemRecord).where(ActionItemRecord.user_id == self.user_id, ActionItemRecord.project_id == project_id)).all()
        policy = session.scalar(select(GoalControlPolicyRecord).where(GoalControlPolicyRecord.user_id == self.user_id, GoalControlPolicyRecord.project_id == project_id))
        metrics = session.scalars(select(MetricDefinitionRecord).where(MetricDefinitionRecord.user_id == self.user_id, MetricDefinitionRecord.project_id == project_id)).all()
        dependencies = session.scalars(select(PlanDependencyRecord).where(PlanDependencyRecord.user_id == self.user_id, PlanDependencyRecord.project_id == project_id)).all()
        return {
            "project": project_dict(project),
            "milestones": [milestone_dict(item) for item in milestones],
            "actions": [action_dict(item) for item in actions],
            "policy": policy_dict(policy) if policy else None,
            "metrics": [metric_dict(item) for item in metrics],
            "dependencies": [record_dict(item) for item in dependencies],
        }

    def _create_version_in_session(
        self,
        session: Any,
        project_id: str,
        *,
        source: str,
        summary: str,
        status: str = "confirmed",
        snapshot: dict[str, Any] | None = None,
        diff: list[dict[str, Any]] | None = None,
        pinned: bool = False,
        milestone_id: str | None = None,
    ) -> PlanVersionRecord:
        current_number = session.scalar(
            select(func.max(PlanVersionRecord.version_number)).where(
                PlanVersionRecord.user_id == self.user_id,
                PlanVersionRecord.project_id == project_id,
            )
        ) or 0
        timestamp = now_iso()
        record = PlanVersionRecord(
            version_id=new_id("version"), user_id=self.user_id, project_id=project_id,
            version_number=int(current_number) + 1, source=source, status=status,
            is_pinned=pinned, milestone_id=milestone_id, snapshot_json=copy.deepcopy(snapshot or self._snapshot(session, project_id)),
            diff_json=copy.deepcopy(diff or []), summary=summary[:500], created_at=timestamp, updated_at=timestamp,
        )
        session.add(record)
        session.flush()
        self._enforce_version_retention(session, project_id)
        return record

    def _enforce_version_retention(self, session: Any, project_id: str) -> None:
        records = list(session.scalars(
            select(PlanVersionRecord)
            .where(
                PlanVersionRecord.user_id == self.user_id,
                PlanVersionRecord.project_id == project_id,
                PlanVersionRecord.is_pinned.is_(False),
                PlanVersionRecord.milestone_id.is_(None),
            )
            .order_by(PlanVersionRecord.version_number.desc())
        ))
        confirmed = [record for record in records if record.status == "confirmed"]
        drafts = [record for record in records if record.status == "draft"]
        for record in confirmed[20:]:
            record.snapshot_json = {}
            record.status = "summary"
        for record in drafts[10:]:
            session.delete(record)

    def create_version(self, project_id: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        values = payload or {}
        with self.session_factory.begin() as session:
            self._project(session, project_id)
            source = str(values.get("source") or "manual")
            latest = session.scalar(
                select(PlanVersionRecord)
                .where(PlanVersionRecord.user_id == self.user_id, PlanVersionRecord.project_id == project_id)
                .order_by(PlanVersionRecord.version_number.desc())
            )
            coalesce = False
            if source == "manual" and latest and latest.source == "manual" and latest.status == "confirmed" and not latest.is_pinned and not latest.milestone_id:
                created_at = datetime.fromisoformat(latest.created_at.replace("Z", "+00:00"))
                coalesce = datetime.now(timezone.utc) - created_at <= timedelta(minutes=5)
            if coalesce and latest:
                latest.snapshot_json = self._snapshot(session, project_id)
                latest.diff_json = copy.deepcopy([*(latest.diff_json or []), *(values.get("diff") or [])])
                latest.summary = str(values.get("summary") or latest.summary or "Plan updated.")[:500]
                latest.updated_at = now_iso()
                record = latest
            else:
                record = self._create_version_in_session(
                    session, project_id, source=source,
                    summary=str(values.get("summary") or "Plan updated."), status=str(values.get("status") or "confirmed"),
                    diff=values.get("diff") or [], pinned=bool(values.get("is_pinned", False)),
                    milestone_id=str(values.get("milestone_id") or "") or None,
                )
        return record_dict(record, {"snapshot_json": "snapshot", "diff_json": "diff"})

    def list_versions(self, project_id: str) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            self._project(session, project_id)
            records = session.scalars(
                select(PlanVersionRecord)
                .where(PlanVersionRecord.user_id == self.user_id, PlanVersionRecord.project_id == project_id)
                .order_by(PlanVersionRecord.version_number.desc())
            ).all()
            return [record_dict(item, {"snapshot_json": "snapshot", "diff_json": "diff"}) for item in records]

    def set_version_pinned(self, version_id: str, pinned: bool) -> dict[str, Any]:
        with self.session_factory.begin() as session:
            record = session.scalar(select(PlanVersionRecord).where(PlanVersionRecord.user_id == self.user_id, PlanVersionRecord.version_id == version_id))
            if record is None:
                raise GoalControlNotFoundError(version_id)
            record.is_pinned = pinned
            record.updated_at = now_iso()
        return record_dict(record, {"snapshot_json": "snapshot", "diff_json": "diff"})

    def rollback_version(self, version_id: str) -> dict[str, Any]:
        with self.session_factory.begin() as session:
            record = session.scalar(select(PlanVersionRecord).where(PlanVersionRecord.user_id == self.user_id, PlanVersionRecord.version_id == version_id))
            if record is None:
                raise GoalControlNotFoundError(version_id)
            if not record.snapshot_json:
                raise GoalControlConflictError("This compacted version no longer has a rollback snapshot.")
            self._apply_snapshot(session, record.project_id, record.snapshot_json)
            restored = self._create_version_in_session(
                session, record.project_id, source="rollback",
                summary=f"Restored plan version {record.version_number}.",
                diff=[{"operation": "rollback", "from_version_id": version_id}],
            )
        return record_dict(restored, {"snapshot_json": "snapshot", "diff_json": "diff"})

    def _apply_snapshot(self, session: Any, project_id: str, snapshot: dict[str, Any]) -> None:
        snapshot = copy.deepcopy(snapshot)
        project = self._project(session, project_id)
        policy_value = snapshot.get("policy") or {}
        snapshot_actions = list(snapshot.get("actions") or [])
        snapshot_milestones = list(snapshot.get("milestones") or [])
        user_today = self._user_today(session)
        project_value = snapshot.get("project") or {}
        project_metadata = (
            project_value.get("metadata")
            if isinstance(project_value.get("metadata"), dict)
            else {}
        )
        snapshot_target = str(project_metadata.get("targetDate") or "")[:10] or None
        self._normalize_system_milestone_dates(
            snapshot_milestones, user_today, snapshot_target
        )
        self._normalize_system_action_dates(snapshot_actions, user_today)
        snapshot["actions"] = snapshot_actions
        snapshot["milestones"] = snapshot_milestones
        self._validate_action_date_bounds(
            snapshot_actions,
            snapshot_milestones,
            snapshot_target,
        )
        self._validate_standard_capacity(snapshot_actions, policy_value, today_value=user_today)
        action_ids = {str(item.get("action_id")) for item in snapshot.get("actions") or []}
        edges: list[tuple[str, str]] = []
        for value in snapshot.get("dependencies") or []:
            predecessor = str(value.get("predecessor_action_id") or "")
            successor = str(value.get("successor_action_id") or "")
            if not predecessor or not successor or predecessor == successor or predecessor not in action_ids or successor not in action_ids or self._has_path(edges, successor, predecessor):
                raise GoalControlValidationError("Plan snapshot contains an invalid or cyclic dependency.")
            edges.append((predecessor, successor))
        project_value = snapshot.get("project") or {}
        for source, target in (("title", "title"), ("description", "description"), ("status", "status")):
            if source in project_value:
                setattr(project, target, project_value[source])
        if "metadata" in project_value:
            project.metadata_json = copy.deepcopy(project_value["metadata"])
        project.updated_at = now_iso()
        session.execute(delete(PlanDependencyRecord).where(PlanDependencyRecord.user_id == self.user_id, PlanDependencyRecord.project_id == project_id))
        existing_actions = {
            value.action_id: value
            for value in session.scalars(
                select(ActionItemRecord).where(
                    ActionItemRecord.user_id == self.user_id,
                    ActionItemRecord.project_id == project_id,
                )
            )
        }
        existing_milestones = {
            value.milestone_id: value
            for value in session.scalars(
                select(MilestoneRecord).where(
                    MilestoneRecord.user_id == self.user_id,
                    MilestoneRecord.project_id == project_id,
                )
            )
        }
        milestone_ids = {str(value.get("milestone_id") or "") for value in snapshot.get("milestones") or []}
        if "" in milestone_ids or "" in action_ids:
            raise GoalControlValidationError("Plan snapshot contains an entity without a business ID.")
        removed_action_ids = set(existing_actions) - action_ids
        removed_milestone_ids = set(existing_milestones) - milestone_ids
        if removed_action_ids:
            session.execute(
                update(ProgressLogRecord)
                .where(
                    ProgressLogRecord.user_id == self.user_id,
                    ProgressLogRecord.project_id == project_id,
                    ProgressLogRecord.action_id.in_(removed_action_ids),
                )
                .values(action_id=None)
            )
            session.execute(
                update(EffortEntryRecord)
                .where(
                    EffortEntryRecord.user_id == self.user_id,
                    EffortEntryRecord.project_id == project_id,
                    EffortEntryRecord.action_id.in_(removed_action_ids),
                )
                .values(action_id=None)
            )
            session.execute(
                delete(ActionEventLinkRecord).where(
                    ActionEventLinkRecord.user_id == self.user_id,
                    ActionEventLinkRecord.project_id == project_id,
                    ActionEventLinkRecord.action_id.in_(removed_action_ids),
                )
            )
            session.execute(
                delete(ActionItemRecord).where(
                    ActionItemRecord.user_id == self.user_id,
                    ActionItemRecord.project_id == project_id,
                    ActionItemRecord.action_id.in_(removed_action_ids),
                )
            )
        if removed_milestone_ids:
            session.execute(
                update(ActionItemRecord)
                .where(
                    ActionItemRecord.user_id == self.user_id,
                    ActionItemRecord.project_id == project_id,
                    ActionItemRecord.milestone_id.in_(removed_milestone_ids),
                )
                .values(milestone_id=None)
            )
            session.execute(
                delete(MilestoneRecord).where(
                    MilestoneRecord.user_id == self.user_id,
                    MilestoneRecord.project_id == project_id,
                    MilestoneRecord.milestone_id.in_(removed_milestone_ids),
                )
            )
        session.flush()
        timestamp = now_iso()
        for value in snapshot.get("milestones") or []:
            milestone_id = str(value["milestone_id"])
            record = existing_milestones.get(milestone_id)
            if record is None:
                record = MilestoneRecord(
                    milestone_id=milestone_id,
                    user_id=self.user_id,
                    project_id=project_id,
                    created_at=value.get("created_at", timestamp),
                    updated_at=timestamp,
                )
                session.add(record)
            record.title = require_text(value, "title", 200)
            record.description = str(value.get("description") or "")
            record.due_date = str(value.get("due_date") or "")[:10] or None
            record.status = str(value.get("status") or "not_started")
            record.metadata_json = copy.deepcopy(value.get("metadata") or {})
            record.updated_at = timestamp
        session.flush()
        for value in snapshot.get("actions") or []:
            action_id = str(value["action_id"])
            milestone_id = str(value.get("milestone_id") or "") or None
            if milestone_id and milestone_id not in milestone_ids:
                raise GoalControlValidationError(f"Action {action_id} references a missing milestone.")
            record = existing_actions.get(action_id)
            if record is None:
                record = ActionItemRecord(
                    action_id=action_id,
                    user_id=self.user_id,
                    project_id=project_id,
                    created_at=value.get("created_at", timestamp),
                    updated_at=timestamp,
                )
                session.add(record)
            record.milestone_id = milestone_id
            record.title = require_text(value, "title", 200)
            record.description = str(value.get("description") or "")
            record.due_date = str(value.get("due_date") or "")[:10] or None
            record.status = str(value.get("status") or "todo")
            record.estimated_minutes = max(1, int(value.get("estimated_minutes", 30)))
            record.priority = str(value.get("priority") or "medium")
            record.energy_needed = str(value.get("energy_needed") or "medium")
            record.execution_tier = str(value.get("execution_tier") or "standard")
            record.metadata_json = copy.deepcopy(value.get("metadata") or {})
            record.updated_at = timestamp
        session.flush()
        # Metrics and their observations are historical evidence. A plan rollback
        # must not remove or rewrite either collection.
        for value in snapshot.get("dependencies") or []:
            session.add(PlanDependencyRecord(
                dependency_id=value.get("dependency_id") or new_id("dependency"), user_id=self.user_id,
                project_id=project_id, predecessor_action_id=value["predecessor_action_id"], successor_action_id=value["successor_action_id"],
                created_at=timestamp, updated_at=timestamp,
            ))
        if policy_value:
            existing_policy = session.scalar(select(GoalControlPolicyRecord).where(GoalControlPolicyRecord.user_id == self.user_id, GoalControlPolicyRecord.project_id == project_id))
            if existing_policy:
                session.delete(existing_policy)
                session.flush()
            session.add(self._new_policy(project_id, policy_value, timestamp))

    def _add_metric_record(self, session: Any, project_id: str, value: dict[str, Any], timestamp: str) -> MetricDefinitionRecord:
        record = MetricDefinitionRecord(
            metric_id=str(value.get("metric_id") or new_id("metric")), user_id=self.user_id, project_id=project_id,
            name=require_text(value, "name", 120), role=str(value.get("role") or "leading"),
            value_type=str(value.get("value_type") or "number"), unit=str(value.get("unit") or "")[:32],
            direction=str(value.get("direction") or "increase"), baseline_value=optional_float(value.get("baseline_value")),
            target_value=optional_float(value.get("target_value")), ideal_value=optional_float(value.get("ideal_value")),
            acceptable_min=optional_float(value.get("acceptable_min")), acceptable_max=optional_float(value.get("acceptable_max")),
            safety_min=optional_float(value.get("safety_min")), safety_max=optional_float(value.get("safety_max")),
            target_date=str(value.get("target_date") or "")[:10] or None, cadence=str(value.get("cadence") or "weekly"),
            is_required=bool(value.get("is_required", False)), is_active=bool(value.get("is_active", True)),
            metadata_json=copy.deepcopy(value.get("metadata") or {}), created_at=timestamp, updated_at=timestamp,
        )
        session.add(record)
        return record

    def activate_thread(self, thread_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        validate_activation_plan_payload(payload)
        timestamp = now_iso()
        title = require_text(payload, "title", 200)
        summary = str(payload.get("summary") or title)
        goal_id = str(payload.get("goal_id") or new_id("goal"))
        project_id = str(payload.get("project_id") or new_id("project"))
        template_id = str(payload.get("template_id") or "goal-planner")
        if template_id == "fitness-ai" and payload.get("safety_confirmation") is not True:
            raise GoalControlValidationError("Fitness safety constraints require explicit confirmation.")
        template_label = str(payload.get("template_label") or "Goal Planner")
        tool_name = str(payload.get("tool_name") or "Goal Planner")
        tool_kind = payload.get("tool_kind")
        milestones_input = copy.deepcopy(payload.get("milestones") or [])
        actions_input = copy.deepcopy(payload.get("actions") or [])
        policy_input = payload.get("policy") or {}
        target_date = str(payload.get("target_date") or "")[:10] or None
        with self.session_factory() as session:
            activation_today = self._user_today(session)
        self._normalize_system_milestone_dates(
            milestones_input, activation_today, target_date
        )
        self._normalize_system_action_dates(actions_input, activation_today)
        self._validate_action_date_bounds(
            list(actions_input), list(milestones_input), target_date
        )
        self._validate_standard_capacity(
            list(actions_input), policy_input, target_date, today_value=activation_today
        )
        implementation_path = payload.get("implementation_path") or [
            {"id": f"path-{index + 1}", "order": index + 1, "title": item.get("title", f"Milestone {index + 1}"), "description": item.get("description", "")}
            for index, item in enumerate(milestones_input)
        ]
        metadata = {
            "toolCategory": "active-tool", "instanceAlias": title, "parentTemplateId": template_id,
            "parentTemplateLabel": template_label, "parentTemplateToolName": tool_name, "templateId": template_id,
            "sourceToolId": template_id, "toolName": tool_name, "toolKind": tool_kind,
            "adapterId": payload.get("adapter_id") or "ai-progress", "activationSummary": summary,
            "activationForm": copy.deepcopy(payload.get("activation_form") or {}), "routeTags": copy.deepcopy(payload.get("route_tags") or []),
            "toolFeatures": copy.deepcopy(payload.get("tool_features") or []), "routingEnabled": True,
            "roadmapFormatVersion": 1, "implementationPath": implementation_path, "longTermGoalLabel": title,
            "targetDate": target_date,
            "activationJourneyId": str(payload.get("activation_journey_id") or "")[:80] or None,
            "activationSource": str(payload.get("source") or "")[:32] or None,
            "assumptions": copy.deepcopy(payload.get("assumptions") or []),
            "constraints": copy.deepcopy(payload.get("constraints") or []),
            "risks": copy.deepcopy(payload.get("risks") or []),
            "reviewCadence": copy.deepcopy(payload.get("review_cadence") or {}),
            "confidence": copy.deepcopy(payload.get("confidence") or {}),
            "missingInformation": copy.deepcopy(payload.get("missing_information") or []),
        }
        with self.session_factory.begin() as session:
            thread = self._thread(session, thread_id)
            if thread.status != "draft":
                if (
                    thread.status == "active"
                    and thread.goal_id
                    and thread.project_id
                ):
                    goal = self._goal(session, thread.goal_id)
                    project = self._project(session, thread.project_id)
                    version = session.scalar(
                        select(PlanVersionRecord)
                        .where(
                            PlanVersionRecord.user_id == self.user_id,
                            PlanVersionRecord.project_id == thread.project_id,
                        )
                        .order_by(PlanVersionRecord.version_number.desc())
                    )
                    if version is None:
                        raise GoalControlConflictError("The activated plan version is missing.")
                    return {
                        "goal": goal_dict(goal), "project": project_dict(project),
                        "thread": thread_dict(thread),
                        "version": record_dict(version, {"snapshot_json": "snapshot", "diff_json": "diff"}),
                    }
                raise GoalControlConflictError("Only a draft conversation can be activated.")
            goal = GoalRecord(
                goal_id=goal_id, user_id=self.user_id, title=title, description=summary, status="active",
                metadata_json=copy.deepcopy(metadata), created_at=timestamp, updated_at=timestamp,
            )
            project = ProjectRecord(
                project_id=project_id, user_id=self.user_id, goal_id=goal_id, title=title, description=summary,
                status="active", metadata_json=copy.deepcopy(metadata), created_at=timestamp, updated_at=timestamp,
            )
            session.add(goal)
            session.flush()
            session.add(project)
            session.flush()
            milestone_ids: dict[str, str] = {}
            for item in milestones_input:
                milestone_id = str(item.get("milestone_id") or new_id("milestone"))
                milestone_ids[str(item.get("title") or "").lower()] = milestone_id
                session.add(MilestoneRecord(
                    milestone_id=milestone_id, user_id=self.user_id, project_id=project_id,
                    title=require_text(item, "title", 200), description=str(item.get("description") or ""),
                    due_date=str(item.get("due_date") or "")[:10] or None, status=str(item.get("status") or "not_started"),
                    metadata_json=copy.deepcopy(item.get("metadata") or {}), created_at=timestamp, updated_at=timestamp,
                ))
            session.flush()
            action_ids: dict[str, str] = {}
            action_due_dates: dict[str, date] = {}
            for item in actions_input:
                action_id = str(item.get("action_id") or new_id("action"))
                action_ids[str(item.get("title") or "").lower()] = action_id
                milestone_id = str(item.get("milestone_id") or "") or milestone_ids.get(str(item.get("milestone_title") or "").lower())
                tier = str(item.get("execution_tier") or "standard")
                if tier not in EXECUTION_TIERS:
                    raise GoalControlValidationError("Invalid action execution tier.")
                due_date = str(item.get("due_date") or "")[:10] or None
                if due_date:
                    action_due_dates[action_id] = date.fromisoformat(due_date)
                session.add(ActionItemRecord(
                    action_id=action_id, user_id=self.user_id, project_id=project_id, milestone_id=milestone_id,
                    title=require_text(item, "title", 200), description=str(item.get("description") or ""),
                    due_date=due_date, status=str(item.get("status") or "todo"),
                    estimated_minutes=max(1, int(item.get("estimated_minutes", 30))), priority=str(item.get("priority") or "medium"),
                    energy_needed=str(item.get("energy_needed") or "medium"), execution_tier=tier,
                    metadata_json=copy.deepcopy(item.get("metadata") or {}), created_at=timestamp, updated_at=timestamp,
                ))
            session.flush()
            policy = self._new_policy(project_id, payload.get("policy") or {}, timestamp)
            session.add(policy)
            for metric in payload.get("metrics") or []:
                self._add_metric_record(session, project_id, metric, timestamp)
            dependencies: list[tuple[str, str]] = []
            for item in payload.get("dependencies") or []:
                predecessor = str(item.get("predecessor_action_id") or action_ids.get(str(item.get("predecessor_title") or "").lower()) or "")
                successor = str(item.get("successor_action_id") or action_ids.get(str(item.get("successor_title") or "").lower()) or "")
                if not predecessor or not successor or predecessor == successor or self._has_path(dependencies, successor, predecessor):
                    raise GoalControlValidationError("Invalid or cyclic dependency in activation plan.")
                if action_due_dates.get(predecessor) and action_due_dates.get(successor) and action_due_dates[predecessor] > action_due_dates[successor]:
                    raise GoalControlValidationError(
                        f"Dependency date order is invalid: {predecessor} is due after {successor}."
                    )
                dependencies.append((predecessor, successor))
                session.add(PlanDependencyRecord(
                    dependency_id=new_id("dependency"), user_id=self.user_id, project_id=project_id,
                    predecessor_action_id=predecessor, successor_action_id=successor,
                    created_at=timestamp, updated_at=timestamp,
                ))
            schedule_value = payload.get("check_in") or {}
            if not isinstance(schedule_value, dict):
                raise GoalControlValidationError("check_in must be an object.")
            schedule_value = copy.deepcopy(schedule_value)
            review_cadence = payload.get("review_cadence") or {}
            if not isinstance(review_cadence, dict):
                raise GoalControlValidationError("review_cadence must be an object.")
            review_intervals = {"daily": 1, "weekly": 7, "biweekly": 14, "monthly": 30}
            review_frequency = str(review_cadence.get("frequency") or "weekly")
            if review_frequency not in review_intervals:
                raise GoalControlValidationError("Invalid review cadence frequency.")
            schedule_value.setdefault("review_interval_days", review_intervals[review_frequency])
            schedule_value.setdefault("local_time", review_cadence.get("local_time") or "20:00")
            preferences = session.scalar(
                select(UserPreferenceRecord).where(UserPreferenceRecord.user_id == self.user_id)
            )
            preference_timezone = str((preferences.preferences_json if preferences else {}).get("timezoneOverride") or "")
            schedule_timezone = str(schedule_value.get("timezone") or preference_timezone or "UTC")
            self._timezone(schedule_timezone)
            local_time = str(schedule_value.get("local_time") or "20:00")
            try:
                clock_time.fromisoformat(local_time)
            except ValueError as error:
                raise GoalControlValidationError("Check-in local_time must use HH:MM.") from error
            session.add(CheckInScheduleRecord(
                schedule_id=new_id("checkin_schedule"), user_id=self.user_id, project_id=project_id,
                local_time=local_time, timezone=schedule_timezone,
                enabled=bool(schedule_value.get("enabled", True)), review_interval_days=int(schedule_value.get("review_interval_days", 7)),
                last_check_in_at=None, last_review_at=None, created_at=timestamp, updated_at=timestamp,
            ))
            thread.status = "active"
            thread.kind = "active_goal"
            thread.goal_id = goal_id
            thread.project_id = project_id
            thread.template_id = template_id
            thread.title = title
            thread.updated_at = timestamp
            session.flush()
            version = self._create_version_in_session(session, project_id, source="activation", summary="Initial plan confirmed.", pinned=True)
        return {"goal": goal_dict(goal), "project": project_dict(project), "thread": thread_dict(thread), "version": record_dict(version, {"snapshot_json": "snapshot", "diff_json": "diff"})}

    def create_proposal(self, payload: dict[str, Any]) -> dict[str, Any]:
        timestamp = now_iso()
        project_id = str(payload.get("project_id") or "").strip() or None
        thread_id = str(payload.get("thread_id") or "").strip() or None
        with self.session_factory.begin() as session:
            if project_id:
                self._project(session, project_id)
            if thread_id:
                self._thread(session, thread_id)
            proposal_value = copy.deepcopy(payload.get("proposal") or {})
            proposed_snapshot = proposal_value.get("snapshot") if isinstance(proposal_value, dict) else None
            if project_id and isinstance(proposed_snapshot, dict):
                current_snapshot = self._snapshot(session, project_id)
                current_usage = self._standard_capacity_usage(list(current_snapshot.get("actions") or []), current_snapshot.get("policy") or {})
                proposed_usage = self._standard_capacity_usage(list(proposed_snapshot.get("actions") or []), proposed_snapshot.get("policy") or {})
                proposal_value["capacityImpact"] = {
                    "before_minutes": current_usage["planned_minutes"], "after_minutes": proposed_usage["planned_minutes"],
                    "available_minutes": proposed_usage["available_minutes"],
                }
                proposal_value["calendarImpact"] = {"draft_count": len(proposal_value.get("calendarEvents") or []), "auto_apply": False}
            record = PlanChangeProposalRecord(
                proposal_id=str(payload.get("proposal_id") or new_id("proposal")), user_id=self.user_id,
                project_id=project_id, thread_id=thread_id, proposal_type=str(payload.get("proposal_type") or "plan_change"),
                base_version_id=str(payload.get("base_version_id") or "") or None, status="pending",
                proposal_json=proposal_value, diff_json=copy.deepcopy(payload.get("diff") or []),
                reason=str(payload.get("reason") or ""), resolved_at=None, created_at=timestamp, updated_at=timestamp,
            )
            session.add(record)
        return record_dict(record, {"proposal_json": "proposal", "diff_json": "diff"})

    def resolve_proposal(
        self,
        proposal_id: str,
        accept: bool,
        accepted_diff_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        with self.session_factory.begin() as session:
            record = session.scalar(select(PlanChangeProposalRecord).where(PlanChangeProposalRecord.user_id == self.user_id, PlanChangeProposalRecord.proposal_id == proposal_id))
            if record is None:
                raise GoalControlNotFoundError(proposal_id)
            if record.status != "pending":
                raise GoalControlConflictError("This proposal is already resolved.")
            if accept and record.project_id:
                project = self._project(session, record.project_id)
                latest = session.scalar(
                    select(PlanVersionRecord)
                    .where(PlanVersionRecord.user_id == self.user_id, PlanVersionRecord.project_id == record.project_id)
                    .order_by(PlanVersionRecord.version_number.desc())
                )
                if record.base_version_id and (latest is None or latest.version_id != record.base_version_id):
                    raise GoalControlConflictError("The plan changed after this proposal was generated.")
                snapshot = record.proposal_json.get("snapshot") if isinstance(record.proposal_json, dict) else None
                selected_diff = list(record.diff_json or [])
                if accepted_diff_ids is not None:
                    accepted = {str(value) for value in accepted_diff_ids}
                    selected_diff = [item for item in selected_diff if str(item.get("id")) in accepted]
                    snapshot = self._snapshot_with_selected_diffs(session, record.project_id, selected_diff)
                if snapshot:
                    self._apply_snapshot(session, record.project_id, snapshot)
                proposal_value = record.proposal_json if isinstance(record.proposal_json, dict) else {}
                progress_value = proposal_value.get("progressLog")
                if isinstance(progress_value, dict) and str(progress_value.get("summary") or "").strip():
                    session.add(ProgressLogRecord(
                        progress_id=new_id("progress"), user_id=self.user_id, project_id=record.project_id,
                        goal_id=project.goal_id, action_id=None, log_type=str(progress_value.get("logType") or "tool_result"),
                        summary=str(progress_value.get("summary"))[:500], details=str(progress_value.get("details") or ""),
                        metadata_json={"proposalId": proposal_id}, created_at=now_iso(), updated_at=now_iso(),
                    ))
                self._create_version_in_session(session, record.project_id, source="ai", summary=record.reason or "AI plan proposal accepted.", diff=selected_diff)
            record.status = "accepted" if accept else "rejected"
            record.resolved_at = now_iso()
            record.updated_at = record.resolved_at
        return record_dict(record, {"proposal_json": "proposal", "diff_json": "diff"})

    def _snapshot_with_selected_diffs(
        self,
        session: Any,
        project_id: str,
        selected_diff: list[dict[str, Any]],
    ) -> dict[str, Any]:
        snapshot = self._snapshot(session, project_id)
        collections = {"milestone": ("milestones", "milestone_id"), "action": ("actions", "action_id")}
        for item in selected_diff:
            entity = str(item.get("entity") or "")
            if entity not in collections:
                continue
            collection_name, id_key = collections[entity]
            values = list(snapshot.get(collection_name) or [])
            external_id = str(item.get("external_id") or (item.get("after") or {}).get(id_key) or "")
            values = [value for value in values if str(value.get(id_key)) != external_id]
            if item.get("operation") != "delete" and isinstance(item.get("after"), dict):
                values.append(copy.deepcopy(item["after"]))
            snapshot[collection_name] = values
        milestone_ids = {str(item.get("milestone_id")) for item in snapshot.get("milestones") or []}
        for action in snapshot.get("actions") or []:
            if action.get("milestone_id") and str(action["milestone_id"]) not in milestone_ids:
                action["milestone_id"] = None
        return snapshot

    def usage_summary(self, project_id: str | None = None) -> dict[str, Any]:
        resolution = self.resolve_usage(project_id)
        with self.session_factory() as session:
            current = self._user_now(session)
            current_month = month_key(current)
            monthly = session.scalar(
                select(AIUsageMonthlyRecord).where(
                    AIUsageMonthlyRecord.user_id == self.user_id,
                    AIUsageMonthlyRecord.month_key == current_month,
                )
            )
            preferences = session.scalar(select(UserPreferenceRecord).where(UserPreferenceRecord.user_id == self.user_id))
            prefs = preferences.preferences_json if preferences else {}
        if self.app_mode == "desktop":
            soft = int(prefs.get("aiMonthlySoftLimit") or os.getenv("AI_MONTHLY_SOFT_LIMIT", "1500000"))
            hard = int(prefs.get("aiMonthlyHardLimit") or os.getenv("AI_MONTHLY_HARD_LIMIT", "2000000"))
        else:
            soft = int(os.getenv("AI_MONTHLY_SOFT_LIMIT", "1500000"))
            hard = int(os.getenv("AI_MONTHLY_HARD_LIMIT", "2000000"))
        values = {
            "routine_input_tokens": monthly.routine_input_tokens if monthly else 0,
            "routine_output_tokens": monthly.routine_output_tokens if monthly else 0,
            "planning_input_tokens": monthly.planning_input_tokens if monthly else 0,
            "planning_output_tokens": monthly.planning_output_tokens if monthly else 0,
            "request_count": monthly.request_count if monthly else 0,
        }
        total = sum(value for key, value in values.items() if key.endswith("_tokens"))
        reset_local = datetime(
            current.year + (1 if current.month == 12 else 0),
            1 if current.month == 12 else current.month + 1,
            1,
            tzinfo=current.tzinfo,
        )
        reset_at = reset_local.astimezone(timezone.utc)
        return {
            **values,
            "total_tokens": total,
            "soft_limit": soft,
            "hard_limit": hard,
            "percent_used": round((total / hard) * 100, 1) if hard else 0,
            "degraded": bool(hard and total >= hard),
            "warning": bool(soft and total >= soft),
            "month": current_month,
            "reset_at": reset_at.isoformat().replace("+00:00", "Z"),
            "selected_mode": resolution.selected_mode,
            "effective_mode": resolution.effective_mode,
            "administrator_maximum_mode": resolution.administrator_maximum_mode,
            "server_default_mode": resolution.server_default_mode,
            "limits": resolution.limits,
        }

    def _increment_monthly_usage(
        self,
        session: Any,
        *,
        current_month: str,
        kind: str,
        input_tokens: int,
        output_tokens: int,
        timestamp: str,
    ) -> None:
        routine_input = input_tokens if kind == "routine" else 0
        routine_output = output_tokens if kind == "routine" else 0
        planning_input = input_tokens if kind == "planning" else 0
        planning_output = output_tokens if kind == "planning" else 0
        values = {
            "user_id": self.user_id,
            "month_key": current_month,
            "routine_input_tokens": routine_input,
            "routine_output_tokens": routine_output,
            "planning_input_tokens": planning_input,
            "planning_output_tokens": planning_output,
            "request_count": 1,
            "updated_at": timestamp,
        }
        columns = AIUsageMonthlyRecord.__table__.c
        updates = {
            "routine_input_tokens": columns.routine_input_tokens + routine_input,
            "routine_output_tokens": columns.routine_output_tokens + routine_output,
            "planning_input_tokens": columns.planning_input_tokens + planning_input,
            "planning_output_tokens": columns.planning_output_tokens + planning_output,
            "request_count": columns.request_count + 1,
            "updated_at": timestamp,
        }
        if self.engine.dialect.name == "sqlite":
            statement = sqlite_insert(AIUsageMonthlyRecord).values(**values).on_conflict_do_update(
                index_elements=["user_id", "month_key"],
                set_=updates,
            )
        elif self.engine.dialect.name == "mysql":
            statement = mysql_insert(AIUsageMonthlyRecord).values(**values).on_duplicate_key_update(
                **updates
            )
        else:  # pragma: no cover - supported runtime databases are SQLite and MySQL
            raise RuntimeError(f"Unsupported AI usage database: {self.engine.dialect.name}")
        session.execute(statement)

    def record_usage(
        self,
        *,
        operation: str,
        model: str,
        usage_mode: str,
        input_tokens: int,
        output_tokens: int,
        status: str = "success",
        estimated: bool = False,
        project_id: str | None = None,
        thread_id: str | None = None,
    ) -> None:
        timestamp = now_iso()
        normalized_operation = AI_OPERATION_ALIASES.get(operation, operation)
        kind = "planning" if normalized_operation in AI_PLANNING_OPERATIONS else "routine"
        clean_input_tokens = max(0, input_tokens)
        clean_output_tokens = max(0, output_tokens)
        with self.session_factory.begin() as session:
            current = self._user_now(session)
            current_month = month_key(current)
            event_cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat().replace("+00:00", "Z")
            monthly_cutoff = (current.date().replace(day=1) - timedelta(days=400)).strftime("%Y-%m")
            session.execute(
                delete(AIUsageEventRecord).where(
                    AIUsageEventRecord.user_id == self.user_id,
                    AIUsageEventRecord.created_at < event_cutoff,
                )
            )
            session.execute(
                delete(AIUsageMonthlyRecord).where(
                    AIUsageMonthlyRecord.user_id == self.user_id,
                    AIUsageMonthlyRecord.month_key < monthly_cutoff,
                )
            )
            if project_id:
                self._project(session, project_id)
            if thread_id:
                self._thread(session, thread_id)
            session.add(AIUsageEventRecord(
                usage_event_id=new_id("ai_usage"), user_id=self.user_id, project_id=project_id, thread_id=thread_id,
                operation=normalized_operation[:32], model=model[:120], usage_mode=clean_mode(usage_mode),
                input_tokens=clean_input_tokens, output_tokens=clean_output_tokens, status=status[:24],
                estimated=estimated, created_at=timestamp,
            ))
            self._increment_monthly_usage(
                session,
                current_month=current_month,
                kind=kind,
                input_tokens=clean_input_tokens,
                output_tokens=clean_output_tokens,
                timestamp=timestamp,
            )
