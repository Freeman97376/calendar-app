from __future__ import annotations

import copy
import hashlib
import json
import math
import uuid
from calendar import monthrange
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import delete, inspect as sqlalchemy_inspect, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from .calendar.repository import CalendarRepository, event_from_record, new_id, now_iso
from .database import (
    ActionEventLinkRecord, ActionItemRecord, CalendarActionBatchRecord, EventRecord,
    GoalControlPolicyRecord, PlanDependencyRecord, PlanVersionRecord, ProjectRecord,
    ScheduleProposalRecord, UserPreferenceRecord, create_session_factory,
)
from .scheduling_rules import DAY_CODES, canonical_day
from .user_transaction import user_write_transaction


class SchedulingValidationError(ValueError):
    pass


class SchedulingConflictError(RuntimeError):
    def __init__(self, message: str, latest: dict[str, Any] | None = None):
        super().__init__(message)
        self.latest = latest


class SchedulingNotFoundError(KeyError):
    pass


class SchedulingStaleError(SchedulingConflictError):
    def __init__(self, latest: dict[str, Any]) -> None:
        super().__init__("排程已过期，因为计划或日历已经发生变化。请审核最新提案。")
        self.latest = latest


@dataclass(frozen=True)
class FreeSlot:
    start: datetime
    end: datetime


TIER_ORDER = {"minimum": 0, "standard": 1, "stretch": 2}
PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def _proposal_dict(record: ScheduleProposalRecord, *, replayed: bool = False) -> dict[str, Any]:
    return {
        "proposalId": record.proposal_id, "status": record.status,
        "inputFingerprint": record.input_fingerprint,
        "proposal": copy.deepcopy(record.proposal_json or {}),
        "resolvedAt": record.resolved_at, "createdAt": record.created_at,
        "updatedAt": record.updated_at, "replayed": replayed,
    }


def _parse_clock(value: object) -> time:
    try:
        return time.fromisoformat(str(value))
    except ValueError as exc:
        raise SchedulingValidationError("工作时段必须使用 HH:MM。") from exc


def _parse_datetime(value: object) -> datetime:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise SchedulingValidationError("日历事件时间必须是有效的 ISO 日期时间。") from exc
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _parse_date(value: object) -> date | None:
    try:
        return date.fromisoformat(str(value or "").strip())
    except ValueError:
        return None


def _week_key(value: datetime, tz: ZoneInfo) -> str:
    local = value.astimezone(tz).date()
    return (local - timedelta(days=local.weekday())).isoformat()


def _split_minutes(total: int, minimum: int, maximum: int) -> list[int]:
    if total <= minimum:
        return [total]
    count = max(1, math.ceil(total / maximum))
    while count > 1 and total // count < minimum:
        count -= 1
    base, remainder = divmod(total, count)
    return [base + (1 if index < remainder else 0) for index in range(count)]


def _subtract_busy(slot: FreeSlot, busy: list[FreeSlot]) -> list[FreeSlot]:
    output = [slot]
    for occupied in busy:
        next_output: list[FreeSlot] = []
        for candidate in output:
            if occupied.end <= candidate.start or occupied.start >= candidate.end:
                next_output.append(candidate)
            else:
                if occupied.start > candidate.start:
                    next_output.append(FreeSlot(candidate.start, min(occupied.start, candidate.end)))
                if occupied.end < candidate.end:
                    next_output.append(FreeSlot(max(occupied.end, candidate.start), candidate.end))
        output = next_output
    return [item for item in output if item.end > item.start]


class GlobalSchedulingService:
    def __init__(self, engine: Engine, user_id: str, *, client_timezone: str | None = None) -> None:
        self.engine = engine
        self.user_id = user_id
        self.client_timezone = str(client_timezone or "").strip()
        self.session_factory = create_session_factory(engine)

    def current(self) -> dict[str, Any] | None:
        with self.session_factory() as session:
            record = session.scalar(
                select(ScheduleProposalRecord)
                .where(ScheduleProposalRecord.user_id == self.user_id)
                .order_by(ScheduleProposalRecord.created_at.desc(), ScheduleProposalRecord.row_id.desc())
            )
            return _proposal_dict(record) if record else None

    def recompute(self, *, reason: str = "manual", project_patch: dict[str, Any] | None = None) -> dict[str, Any]:
        with user_write_transaction(self.session_factory, self.user_id) as session:
            return self._recompute(session, reason=reason, project_patch=project_patch)

    def _recompute(self, session: Session, *, reason: str, project_patch: dict[str, Any] | None = None) -> dict[str, Any]:
        timestamp = now_iso()
        previous = list(session.scalars(select(ScheduleProposalRecord).where(
            ScheduleProposalRecord.user_id == self.user_id,
            ScheduleProposalRecord.status.in_(["pending", "blocked"]),
        ).order_by(ScheduleProposalRecord.created_at.desc(), ScheduleProposalRecord.row_id.desc())))
        pending_edit = next((item for item in previous if (item.proposal_json or {}).get("planChange")), None)
        if pending_edit:
            carried = pending_edit.proposal_json["planChange"]
            original = {"projectId": carried["projectId"], "baseVersionId": carried.get("baseVersionId"), "changes": copy.deepcopy(carried["projectPatch"])}
            if project_patch is not None:
                if project_patch == original:
                    return _proposal_dict(pending_edit)
                raise SchedulingConflictError("请先接受或放弃现有工具修改，再开始下一次编辑。", _proposal_dict(pending_edit))
            project_patch = original
        snapshot = self._input_snapshot(session)
        fingerprint = self._fingerprint(snapshot)
        simulated = self._clone_snapshot(snapshot)
        conflict = None
        project = None
        if project_patch:
            project_id = str(project_patch.get("projectId") or "")
            project = next((item for item in snapshot["projects"] if item.project_id == project_id), None)
            if project is None and not pending_edit:
                raise SchedulingValidationError("只能为已实例化工具创建计划变更提案。")
            latest = session.scalar(select(PlanVersionRecord).where(
                PlanVersionRecord.user_id == self.user_id, PlanVersionRecord.project_id == project_id,
            ).order_by(PlanVersionRecord.version_number.desc()))
            base = project_patch.get("baseVersionId")
            if project is None or (base and (latest is None or latest.version_id != base)):
                conflict = {"code": "plan_version_changed", "message": "工具计划版本已经变化。原修改已保留，请放弃后重新编辑。"}
            else:
                self._overlay_project_patch(simulated, project_patch)
        proposal_value, status = self._build_proposal(simulated, reason)
        if project_patch:
            proposal_value["planChange"] = {
                "projectId": project_id, "projectTitle": project.title if project else "已删除工具",
                "baseVersionId": project_patch.get("baseVersionId"),
                "projectPatch": copy.deepcopy(project_patch.get("changes") or {}),
            }
        if conflict:
            status = "blocked"
            proposal_value["conflicts"] = [conflict]
            proposal_value["changes"] = []
            proposal_value["actionDateChanges"] = []
        for item in previous:
            item.status = "superseded"
            item.resolved_at = timestamp
            item.updated_at = timestamp
        record = ScheduleProposalRecord(
            proposal_id=new_id("schedule"), user_id=self.user_id, status=status,
            input_fingerprint=fingerprint, proposal_json=proposal_value,
            resolved_at=None, created_at=timestamp, updated_at=timestamp,
        )
        session.add(record)
        session.flush()
        return _proposal_dict(record)

    def resolve(self, proposal_id: str, decision: str, input_fingerprint: str) -> dict[str, Any]:
        if decision not in {"accept", "reject"}:
            raise SchedulingValidationError("排程提案只能接受或拒绝。")
        stale = None
        with user_write_transaction(self.session_factory, self.user_id) as session:
            record = self._proposal(session, proposal_id, lock=True)
            if record.status in {"accepted", "rejected"}:
                if record.status != ("accepted" if decision == "accept" else "rejected"):
                    raise SchedulingConflictError("该排程提案已经以不同决定处理。")
                return _proposal_dict(record, replayed=True)
            if record.status != "pending" and not (record.status == "blocked" and decision == "reject"):
                raise SchedulingConflictError("该排程提案当前不可应用。")
            if input_fingerprint != record.input_fingerprint:
                raise SchedulingConflictError("排程提案指纹不匹配。")
            if decision == "reject":
                record.status = "rejected"
            elif self._fingerprint(self._input_snapshot(session, lock=True)) != record.input_fingerprint or self._version_changed(session, record):
                # Keep the old pending edit visible to the internal recompute in this same transaction.
                stale = self._recompute(session, reason="stale_refresh")
            else:
                self._apply_proposal(session, record)
                record.status = "accepted"
            if stale is None:
                record.resolved_at = now_iso()
                record.updated_at = record.resolved_at
            result = _proposal_dict(record)
        if stale is not None:
            raise SchedulingStaleError(stale)
        return result

    def _version_changed(self, session: Session, record: ScheduleProposalRecord) -> bool:
        change = (record.proposal_json or {}).get("planChange") or {}
        base = change.get("baseVersionId")
        if not base:
            return False
        latest = session.scalar(select(PlanVersionRecord).where(
            PlanVersionRecord.user_id == self.user_id, PlanVersionRecord.project_id == change.get("projectId"),
        ).order_by(PlanVersionRecord.version_number.desc()))
        return latest is None or latest.version_id != base

    def _proposal(self, session: Session, proposal_id: str, *, lock: bool = False) -> ScheduleProposalRecord:
        query = select(ScheduleProposalRecord).where(
            ScheduleProposalRecord.user_id == self.user_id,
            ScheduleProposalRecord.proposal_id == proposal_id,
        )
        record = session.scalar(query.with_for_update() if lock else query)
        if record is None:
            raise SchedulingNotFoundError(proposal_id)
        return record

    def _timezone(self, preferences: dict[str, Any]) -> ZoneInfo:
        name = str(preferences.get("timezoneOverride") or self.client_timezone or "UTC").strip() or "UTC"
        try:
            return ZoneInfo(name)
        except ZoneInfoNotFoundError as exc:
            raise SchedulingValidationError(f"未知时区：{name}") from exc

    def _input_snapshot(self, session: Session, *, lock: bool = False) -> dict[str, Any]:
        preference_query = select(UserPreferenceRecord).where(UserPreferenceRecord.user_id == self.user_id)
        projects_query = select(ProjectRecord).where(
            ProjectRecord.user_id == self.user_id,
        ).order_by(ProjectRecord.created_at.asc(), ProjectRecord.row_id.asc())
        events_query = select(EventRecord).where(
            EventRecord.user_id == self.user_id
        ).order_by(EventRecord.created_at.asc(), EventRecord.row_id.asc())
        actions_query = select(ActionItemRecord).where(
            ActionItemRecord.user_id == self.user_id
        ).order_by(ActionItemRecord.created_at.asc(), ActionItemRecord.row_id.asc())
        policies_query = select(GoalControlPolicyRecord).where(
            GoalControlPolicyRecord.user_id == self.user_id
        ).order_by(GoalControlPolicyRecord.created_at.asc(), GoalControlPolicyRecord.row_id.asc())
        dependencies_query = select(PlanDependencyRecord).where(
            PlanDependencyRecord.user_id == self.user_id
        ).order_by(PlanDependencyRecord.created_at.asc(), PlanDependencyRecord.row_id.asc())
        links_query = select(ActionEventLinkRecord).where(
            ActionEventLinkRecord.user_id == self.user_id
        ).order_by(ActionEventLinkRecord.created_at.asc(), ActionEventLinkRecord.row_id.asc())
        if lock:
            preference_query = preference_query.with_for_update()
            projects_query = projects_query.with_for_update()
            events_query = events_query.with_for_update()
            actions_query = actions_query.with_for_update()
            policies_query = policies_query.with_for_update()
            dependencies_query = dependencies_query.with_for_update()
            links_query = links_query.with_for_update()
        preference = session.scalar(preference_query)
        preferences = copy.deepcopy(preference.preferences_json or {}) if preference else {}
        projects = [item for item in session.scalars(projects_query) if (item.metadata_json or {}).get("toolCategory") == "active-tool"]
        project_ids = {item.project_id for item in projects} or {"__none__"}
        actions = list(session.scalars(actions_query.where(ActionItemRecord.project_id.in_(project_ids))))
        policies = list(session.scalars(policies_query.where(GoalControlPolicyRecord.project_id.in_(project_ids))))
        dependencies = list(session.scalars(dependencies_query.where(PlanDependencyRecord.project_id.in_(project_ids))))
        links = list(session.scalars(links_query))
        events = list(session.scalars(events_query))
        return {"preferences": preferences, "projects": projects, "actions": actions, "policies": policies, "dependencies": dependencies, "links": links, "events": events}

    @staticmethod
    def _clone_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
        def clone_record(item: Any) -> SimpleNamespace:
            return SimpleNamespace(**{
                attribute.key: copy.deepcopy(getattr(item, attribute.key))
                for attribute in sqlalchemy_inspect(item).mapper.column_attrs
            })

        return {
            "preferences": copy.deepcopy(snapshot["preferences"]),
            "projects": [clone_record(item) for item in snapshot["projects"]],
            "actions": [clone_record(item) for item in snapshot["actions"]],
            "policies": [clone_record(item) for item in snapshot["policies"]],
            "dependencies": [clone_record(item) for item in snapshot["dependencies"]],
            "links": [clone_record(item) for item in snapshot["links"]],
            "events": [clone_record(item) for item in snapshot["events"]],
        }

    def _overlay_project_patch(
        self,
        snapshot: dict[str, Any],
        project_patch: dict[str, Any],
        *,
        session: Session | None = None,
        timestamp: str | None = None,
    ) -> None:
        project_id = str(project_patch.get("projectId") or "")
        project = next((item for item in snapshot["projects"] if item.project_id == project_id), None)
        if project is None:
            raise SchedulingValidationError("计划变更对应的已激活工具已不存在。")
        changes = project_patch.get("changes") if isinstance(project_patch.get("changes"), dict) else {}
        for source, target in (
            ("title", "title"),
            ("description", "description"),
            ("status", "status"),
        ):
            if source in changes:
                setattr(project, target, str(changes[source]))
        if "metadata" in changes and isinstance(changes["metadata"], dict):
            project.metadata_json = copy.deepcopy(changes["metadata"])
        if timestamp:
            project.updated_at = timestamp

        policy_patch = changes.get("policy") if isinstance(changes.get("policy"), dict) else None
        if policy_patch:
            policy = next((item for item in snapshot["policies"] if item.project_id == project_id), None)
            if policy is None:
                raise SchedulingValidationError("该工具缺少排程策略，不能编辑容量。")
            for source, target in (
                ("weeklyCapacityMinutes", "weekly_capacity_minutes"),
                ("bufferPercent", "buffer_percent"),
                ("availableDays", "available_days_json"),
            ):
                if source in policy_patch:
                    setattr(policy, target, copy.deepcopy(policy_patch[source]))
            if timestamp:
                policy.updated_at = timestamp

        action_map = {
            item.action_id: item for item in snapshot["actions"] if item.project_id == project_id
        }
        for action_patch in changes.get("actions") or []:
            action_id = str(action_patch.get("actionId") or "")
            action = action_map.get(action_id)
            if action is None:
                raise SchedulingValidationError(f"计划变更引用了不存在的行动：{action_id}")
            for source, target in (
                ("title", "title"),
                ("description", "description"),
                ("dueDate", "due_date"),
                ("estimatedMinutes", "estimated_minutes"),
                ("executionTier", "execution_tier"),
                ("priority", "priority"),
            ):
                if source in action_patch:
                    value = action_patch[source]
                    if source == "dueDate" and value is not None and _parse_date(value) is None:
                        raise SchedulingValidationError(f"{action.title} 的日期必须使用 YYYY-MM-DD。")
                    if source == "dueDate" and value != action.due_date:
                        metadata = copy.deepcopy(action.metadata_json or {})
                        if value:
                            metadata.update({
                                "due_date_source": "user_fixed",
                                "due_date_flexibility": "fixed",
                            })
                        else:
                            metadata.pop("due_date_source", None)
                            metadata.pop("due_date_flexibility", None)
                        action.metadata_json = metadata
                    setattr(action, target, copy.deepcopy(value))
            if timestamp:
                action.updated_at = timestamp

        dependency_patches = changes.get("dependencies")
        if isinstance(dependency_patches, list):
            valid_action_ids = set(action_map)
            seen_edges: set[tuple[str, str]] = set()
            dependencies: list[PlanDependencyRecord] = []
            for dependency_patch in dependency_patches:
                predecessor = str(dependency_patch.get("predecessorActionId") or "")
                successor = str(dependency_patch.get("successorActionId") or "")
                edge = (predecessor, successor)
                if (
                    not predecessor
                    or not successor
                    or predecessor == successor
                    or predecessor not in valid_action_ids
                    or successor not in valid_action_ids
                    or edge in seen_edges
                ):
                    raise SchedulingValidationError("行动依赖必须引用两个不同且存在的行动。")
                seen_edges.add(edge)
                dependencies.append(PlanDependencyRecord(
                    dependency_id=new_id("dependency"),
                    user_id=self.user_id,
                    project_id=project_id,
                    predecessor_action_id=predecessor,
                    successor_action_id=successor,
                    dependency_type="finish_to_start",
                    metadata_json={},
                    created_at=timestamp or now_iso(),
                    updated_at=timestamp or now_iso(),
                ))
            snapshot["dependencies"] = [
                item for item in snapshot["dependencies"] if item.project_id != project_id
            ] + dependencies
            if session is not None:
                session.execute(delete(PlanDependencyRecord).where(
                    PlanDependencyRecord.user_id == self.user_id,
                    PlanDependencyRecord.project_id == project_id,
                ))
                session.add_all(dependencies)

    def _fingerprint(self, snapshot: dict[str, Any]) -> str:
        value = {
            "preferences": {"timezoneOverride": snapshot["preferences"].get("timezoneOverride"), "scheduling": snapshot["preferences"].get("scheduling")},
            "projects": [[x.project_id, x.status, x.updated_at] for x in sorted(snapshot["projects"], key=lambda x: x.project_id)],
            "actions": [[x.action_id, x.project_id, x.due_date, x.status, x.estimated_minutes, x.priority, x.execution_tier, x.metadata_json, x.updated_at] for x in sorted(snapshot["actions"], key=lambda x: x.action_id)],
            "policies": [[x.project_id, x.weekly_capacity_minutes, x.buffer_percent, x.available_days_json, x.updated_at] for x in sorted(snapshot["policies"], key=lambda x: x.project_id)],
            "dependencies": [[x.predecessor_action_id, x.successor_action_id, x.updated_at] for x in sorted(snapshot["dependencies"], key=lambda x: x.dependency_id)],
            "events": [[x.id, x.start_at, x.end_at, x.recurrence_rule_json, x.updated_at] for x in sorted(snapshot["events"], key=lambda x: x.id)],
            "links": [[x.link_id, x.project_id, x.action_id, x.event_id, x.managed_by, x.proposal_id] for x in sorted(snapshot["links"], key=lambda x: x.link_id)],
        }
        canonical = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def _build_proposal(self, snapshot: dict[str, Any], reason: str) -> tuple[dict[str, Any], str]:
        preferences = snapshot["preferences"]
        scheduling = preferences.get("scheduling") if isinstance(preferences.get("scheduling"), dict) else {}
        windows = scheduling.get("workWindows") if isinstance(scheduling, dict) else []
        if not scheduling.get("setupCompleted") or not isinstance(windows, list) or not windows:
            return ({
                "kind": "setup_required", "reason": reason,
                "message": "请先设置每周可用于工具行动的工作时段，再生成全局排程。",
                "changes": [], "conflicts": [], "toolImpacts": [],
                "capacityBorrowing": [], "unscheduled": [], "autoApply": False,
            }, "blocked")
        tz = self._timezone(preferences)
        now_local = datetime.now(tz)
        today = now_local.date()
        minimum = int(scheduling.get("minBlockMinutes", 30))
        maximum = int(scheduling.get("maxBlockMinutes", 120))
        if minimum < 5 or maximum < minimum or maximum > 480:
            raise SchedulingValidationError("排程时间块必须满足 5 <= 最小时间 <= 最大时间 <= 480 分钟。")
        projects = {item.project_id: item for item in snapshot["projects"]}
        active_project_ids = {
            project_id for project_id, project in projects.items() if project.status == "active"
        }
        active_actions = [
            item
            for item in snapshot["actions"]
            if item.project_id in active_project_ids
            and item.execution_tier in {"minimum", "standard"}
            and item.status not in {"done", "skipped"}
        ]
        policies = {item.project_id: item for item in snapshot["policies"]}
        horizon_dates = [value for item in active_actions if (value := _parse_date(item.due_date))]
        horizon_end = max(horizon_dates or [today + timedelta(days=28)], default=today + timedelta(days=28))
        horizon_end = max(horizon_end, today + timedelta(days=28))
        start_at = now_local
        # Keep the actual deadline strict, but inspect twelve additional weeks so a
        # blocked proposal can report a real earliest-feasible alternative.
        end_at = datetime.combine(
            horizon_end + timedelta(days=1 + 12 * 7),
            time.min,
            tzinfo=tz,
        )
        managed_links = [item for item in snapshot["links"] if item.managed_by == "global_scheduler"]
        managed_event_ids = {item.event_id for item in managed_links}
        fixed_events = [item for item in snapshot["events"] if item.id not in managed_event_ids or _parse_datetime(item.end_at).astimezone(tz) <= start_at]
        busy = self._busy_intervals(fixed_events, start_at, end_at, tz)
        free = self._free_slots(windows, start_at, end_at, tz, busy)
        ordered, cycle = self._ordered_actions(active_actions, snapshot["dependencies"])
        conflicts: list[dict[str, Any]] = []
        if cycle:
            conflicts.append({"code": "dependency_cycle", "message": "行动依赖存在循环，无法生成全局排程。", "actionTitles": [item.title for item in active_actions]})
        scheduled: dict[str, list[FreeSlot]] = {}
        finish_by_action: dict[str, datetime] = {}
        usage: dict[tuple[str, str], int] = defaultdict(int)
        predecessors: dict[str, list[str]] = defaultdict(list)
        for dependency in snapshot["dependencies"]:
            predecessors[dependency.successor_action_id].append(dependency.predecessor_action_id)
        date_changes: list[dict[str, Any]] = []
        for action in ordered if not cycle else []:
            metadata = action.metadata_json or {}
            due = _parse_date(action.due_date)
            flexible = str(metadata.get("due_date_source") or "") == "system_planned" or str(metadata.get("due_date_flexibility") or "") == "flexible"
            if due is None:
                conflicts.append({"code": "missing_due_date", "message": f"{action.title} 缺少有效截止日期。", "actionTitles": [action.title]})
                continue
            if due < today:
                if not flexible:
                    conflicts.append({"code": "fixed_past_date", "message": f"{action.title} 使用了已过去的固定日期 {due.isoformat()}。", "actionTitles": [action.title]})
                    continue
                due = today + timedelta(days=28)
                date_changes.append({"projectId": action.project_id, "actionId": action.action_id, "dueDate": due.isoformat(), "reason": "系统生成日期已过期，已移动到新的滚动四周窗口。"})
            predecessor_finishes = [finish_by_action.get(value) for value in predecessors[action.action_id]]
            if any(value is None for value in predecessor_finishes):
                conflicts.append({"code": "dependency_unscheduled", "message": f"{action.title} 的前置行动尚未排入日历。", "actionTitles": [action.title]})
                continue
            earliest = max([start_at, *[value for value in predecessor_finishes if value is not None]])
            deadline = datetime.combine(due + timedelta(days=1), time.min, tzinfo=tz)
            policy = policies.get(action.project_id)
            allowed_days = {value for item in (policy.available_days_json if policy else []) if (value := canonical_day(item))}
            if not allowed_days:
                allowed_days = {"sun"}
            soft_capacity = math.floor(max(0, int(policy.weekly_capacity_minutes if policy else 300)) * (1 - float(policy.buffer_percent if policy else 20) / 100))
            action_slots: list[FreeSlot] = []
            free_before, usage_before = list(free), dict(usage)
            action_earliest = earliest
            blocks = _split_minutes(max(5, int(action.estimated_minutes)), minimum, maximum)
            failed = False
            for block_minutes in blocks:
                selected_index = self._select_slot(free, block_minutes, earliest, deadline, allowed_days, action.project_id, soft_capacity, usage, tz)
                if selected_index is None:
                    failed = True
                    break
                slot = free[selected_index]
                block_start = max(slot.start, earliest)
                block_end = block_start + timedelta(minutes=block_minutes)
                action_slots.append(FreeSlot(block_start, block_end))
                usage[(action.project_id, _week_key(block_start, tz))] += block_minutes
                free = free[:selected_index] + ([FreeSlot(slot.start, block_start)] if slot.start < block_start else []) + ([FreeSlot(block_end, slot.end)] if block_end < slot.end else []) + free[selected_index + 1:]
                free.sort(key=lambda value: value.start)
                earliest = block_end
            if failed:
                free, usage = free_before, defaultdict(int, usage_before)
                earliest_finish = self._simulate_finish(
                    free_before,
                    blocks,
                    action_earliest,
                    end_at,
                    allowed_days,
                    tz,
                )
                available_weeks = max(
                    1,
                    ((due - today).days // 7) + 1,
                )
                raw_capacity_factor = max(
                    0.01,
                    1 - float(policy.buffer_percent if policy else 20) / 100,
                )
                minimum_weekly = math.ceil(
                    int(action.estimated_minutes) / available_weeks / raw_capacity_factor
                )
                stretch_candidates = [
                    item.title
                    for item in active_actions
                    if item.project_id == action.project_id
                    and item.priority == "low"
                    and item.execution_tier == "standard"
                ]
                conflicts.append({
                    "code": "global_capacity_conflict",
                    "message": f"{action.title} 无法在 {due.isoformat()} 前找到足够的无冲突时间。",
                    "actionTitles": [action.title],
                    "requiredMinutes": int(action.estimated_minutes),
                    "earliestFeasibleDate": (
                        earliest_finish.astimezone(tz).date().isoformat()
                        if earliest_finish
                        else None
                    ),
                    "minimumWeeklyCapacityMinutes": minimum_weekly,
                    "stretchCandidates": stretch_candidates,
                    "options": [
                        "采用最早可行的新期限",
                        "提高到计算出的最低周容量",
                        "将列出的低优先级行动改为 Stretch",
                        "手动调整日期或工作时段",
                    ],
                })
                continue
            scheduled[action.action_id] = action_slots
            finish_by_action[action.action_id] = action_slots[-1].end
        capacity_borrowing: list[dict[str, Any]] = []
        for (project_id, week), minutes in sorted(usage.items()):
            policy = policies.get(project_id)
            soft = math.floor(max(0, int(policy.weekly_capacity_minutes if policy else 300)) * (1 - float(policy.buffer_percent if policy else 20) / 100))
            if minutes > soft:
                capacity_borrowing.append({"projectId": project_id, "projectTitle": projects[project_id].title if project_id in projects else project_id, "week": week, "scheduledMinutes": minutes, "softLimitMinutes": soft, "borrowedMinutes": minutes - soft})
        changes = self._event_changes(snapshot, scheduled, start_at)
        unscheduled = [{"projectId": item.project_id, "actionId": item.action_id, "title": item.title} for item in active_actions if item.action_id not in scheduled]
        tool_impacts = []
        for project_id, project in sorted(projects.items()):
            tool_actions = [item for item in active_actions if item.project_id == project_id]
            tool_impacts.append({
                "projectId": project_id, "projectTitle": project.title,
                "actionCount": len(tool_actions),
                "scheduledMinutes": sum(int((slot.end - slot.start).total_seconds() // 60) for item in tool_actions for slot in scheduled.get(item.action_id, [])),
                "unscheduledCount": sum(item.action_id not in scheduled for item in tool_actions),
            })
        proposal = {
            "kind": "global_schedule", "reason": reason,
            "message": f"已生成 {len(changes)} 项日历变更。" if not conflicts else "当前计划无法完整排入可用时间，请先处理下列冲突。",
            "changes": changes, "actionDateChanges": date_changes,
            "conflicts": conflicts, "toolImpacts": tool_impacts,
            "capacityBorrowing": capacity_borrowing, "unscheduled": unscheduled,
            "timezone": str(tz), "autoApply": False,
        }
        return proposal, "blocked" if conflicts else "pending"

    def _ordered_actions(self, actions: list[ActionItemRecord], dependencies: list[PlanDependencyRecord]) -> tuple[list[ActionItemRecord], bool]:
        action_map = {item.action_id: item for item in actions}
        incoming = {item.action_id: 0 for item in actions}
        outgoing: dict[str, list[str]] = defaultdict(list)
        stable = {item.action_id: index for index, item in enumerate(actions)}
        for item in dependencies:
            if item.predecessor_action_id in action_map and item.successor_action_id in action_map:
                outgoing[item.predecessor_action_id].append(item.successor_action_id)
                incoming[item.successor_action_id] += 1
        def key(action_id: str) -> tuple[Any, ...]:
            item = action_map[action_id]
            return (item.due_date or "9999-12-31", TIER_ORDER.get(item.execution_tier, 1), PRIORITY_ORDER.get(item.priority, 1), stable[action_id])
        ready = sorted((value for value, count in incoming.items() if count == 0), key=key)
        output: list[ActionItemRecord] = []
        while ready:
            current = ready.pop(0)
            output.append(action_map[current])
            for successor in outgoing[current]:
                incoming[successor] -= 1
                if incoming[successor] == 0:
                    ready.append(successor)
                    ready.sort(key=key)
        return output, len(output) != len(actions)

    @staticmethod
    def _select_slot(free: list[FreeSlot], minutes: int, earliest: datetime, deadline: datetime, allowed_days: set[str], project_id: str, soft_capacity: int, usage: dict[tuple[str, str], int], tz: ZoneInfo) -> int | None:
        feasible: list[int] = []
        preferred: list[int] = []
        duration = timedelta(minutes=minutes)
        for index, slot in enumerate(free):
            start = max(slot.start, earliest)
            if start + duration > slot.end or start + duration > deadline:
                continue
            if allowed_days and DAY_CODES[start.astimezone(tz).weekday()] not in allowed_days:
                continue
            feasible.append(index)
            if usage.get((project_id, _week_key(start, tz)), 0) + minutes <= soft_capacity:
                preferred.append(index)
        return (preferred or feasible or [None])[0]

    @staticmethod
    def _simulate_finish(
        free: list[FreeSlot],
        blocks: list[int],
        earliest: datetime,
        end_at: datetime,
        allowed_days: set[str],
        tz: ZoneInfo,
    ) -> datetime | None:
        remaining = list(free)
        cursor = earliest
        finish: datetime | None = None
        for minutes in blocks:
            duration = timedelta(minutes=minutes)
            selected: int | None = None
            for index, slot in enumerate(remaining):
                start = max(slot.start, cursor)
                if start + duration > slot.end or start + duration > end_at:
                    continue
                if DAY_CODES[start.astimezone(tz).weekday()] not in allowed_days:
                    continue
                selected = index
                break
            if selected is None:
                return None
            slot = remaining[selected]
            block_start = max(slot.start, cursor)
            finish = block_start + duration
            remaining = (
                remaining[:selected]
                + ([FreeSlot(slot.start, block_start)] if slot.start < block_start else [])
                + ([FreeSlot(finish, slot.end)] if finish < slot.end else [])
                + remaining[selected + 1:]
            )
            remaining.sort(key=lambda value: value.start)
            cursor = finish
        return finish

    def _free_slots(
        self,
        windows: list[dict[str, Any]],
        start_at: datetime,
        end_at: datetime,
        tz: ZoneInfo,
        busy: list[FreeSlot],
    ) -> list[FreeSlot]:
        by_day: dict[str, list[tuple[time, time]]] = defaultdict(list)
        for window in windows:
            if not isinstance(window, dict):
                continue
            day = canonical_day(window.get("day"))
            if day is None:
                continue
            start_clock = _parse_clock(window.get("start"))
            end_clock = _parse_clock(window.get("end"))
            if end_clock <= start_clock:
                raise SchedulingValidationError("工作时段结束时间必须晚于开始时间。")
            by_day[day].append((start_clock, end_clock))
        output: list[FreeSlot] = []
        cursor = start_at.astimezone(tz).date()
        final_day = (end_at.astimezone(tz) - timedelta(microseconds=1)).date()
        while cursor <= final_day:
            day = DAY_CODES[cursor.weekday()]
            for start_clock, end_clock in sorted(by_day.get(day, [])):
                base = FreeSlot(
                    max(datetime.combine(cursor, start_clock, tzinfo=tz), start_at),
                    min(datetime.combine(cursor, end_clock, tzinfo=tz), end_at),
                )
                if base.end <= base.start:
                    continue
                output.extend(_subtract_busy(base, busy))
            cursor += timedelta(days=1)
        output.sort(key=lambda value: value.start)
        return output

    def _busy_intervals(
        self,
        events: list[EventRecord],
        start_at: datetime,
        end_at: datetime,
        tz: ZoneInfo,
    ) -> list[FreeSlot]:
        output: list[FreeSlot] = []
        for event in events:
            event_start = _parse_datetime(event.start_at).astimezone(tz)
            event_end = _parse_datetime(event.end_at).astimezone(tz)
            if event_end <= event_start:
                continue
            if event.recurrence_rule_json and not event.master_id and not event.exception_for:
                output.extend(self._recurring_intervals(event, event_start, event_end, start_at, end_at, tz))
            elif event_end > start_at and event_start < end_at:
                output.append(FreeSlot(max(event_start, start_at), min(event_end, end_at)))
        output.sort(key=lambda value: value.start)
        return output

    def _recurring_intervals(
        self,
        event: EventRecord,
        base_start: datetime,
        base_end: datetime,
        start_at: datetime,
        end_at: datetime,
        tz: ZoneInfo,
    ) -> list[FreeSlot]:
        rule = event.recurrence_rule_json or {}
        frequency = str(rule.get("frequency") or "daily")
        interval = max(1, int(rule.get("interval") or 1))
        weekdays = {canonical_day(value) for value in (rule.get("daysOfWeek") or [])}
        weekdays.discard(None)
        day_of_month = int(rule.get("dayOfMonth") or base_start.day)
        end_condition = rule.get("endCondition") if isinstance(rule.get("endCondition"), dict) else {"type": "never"}
        until = _parse_datetime(end_condition.get("until")).astimezone(tz) if end_condition.get("type") == "date" and end_condition.get("until") else None
        count_limit = int(end_condition.get("occurrences") or 0) if end_condition.get("type") == "count" else 0
        duration = base_end - base_start
        deleted = set(event.deleted_occurrences_json or [])
        base_date = base_start.date()
        cursor = base_date
        final_date = (end_at - timedelta(microseconds=1)).date()
        output: list[FreeSlot] = []
        occurrence_index = 0
        while cursor <= final_date:
            delta_days = (cursor - base_date).days
            week_delta = (cursor - (base_date - timedelta(days=base_date.weekday()))).days // 7
            month_delta = (cursor.year - base_date.year) * 12 + cursor.month - base_date.month
            matches = False
            if cursor >= base_date:
                if frequency == "daily":
                    matches = delta_days % interval == 0
                elif frequency in {"weekly", "custom"}:
                    selected = weekdays or {DAY_CODES[base_date.weekday()]}
                    matches = week_delta % interval == 0 and DAY_CODES[cursor.weekday()] in selected
                elif frequency == "monthly":
                    expected_day = min(day_of_month, monthrange(cursor.year, cursor.month)[1])
                    matches = month_delta % interval == 0 and cursor.day == expected_day
            if matches:
                occurrence_index += 1
                occurrence_start = datetime.combine(cursor, base_start.timetz().replace(tzinfo=None), tzinfo=tz)
                occurrence_end = occurrence_start + duration
                occurrence_key = cursor.isoformat()
                if count_limit and occurrence_index > count_limit:
                    break
                if until and occurrence_start > until:
                    break
                if occurrence_key not in deleted and occurrence_end > start_at and occurrence_start < end_at:
                    output.append(FreeSlot(max(occurrence_start, start_at), min(occurrence_end, end_at)))
            cursor += timedelta(days=1)
        return output

    def _event_changes(
        self,
        snapshot: dict[str, Any],
        scheduled: dict[str, list[FreeSlot]],
        start_at: datetime,
    ) -> list[dict[str, Any]]:
        events = {item.id: item for item in snapshot["events"]}
        actions = {item.action_id: item for item in snapshot["actions"]}
        existing: dict[str, list[tuple[ActionEventLinkRecord, EventRecord]]] = defaultdict(list)
        for link in snapshot["links"]:
            event = events.get(link.event_id)
            if link.managed_by != "global_scheduler" or event is None:
                continue
            if _parse_datetime(event.end_at) <= start_at:
                continue
            existing[link.action_id].append((link, event))
        for values in existing.values():
            values.sort(key=lambda value: (value[1].start_at, value[1].id))

        changes: list[dict[str, Any]] = []
        action_ids = sorted(set(existing) | set(scheduled))
        for action_id in action_ids:
            action = actions.get(action_id)
            if action is None:
                continue
            old = existing.get(action_id, [])
            new = scheduled.get(action_id, [])
            shared = min(len(old), len(new))
            for index in range(shared):
                link, event = old[index]
                slot = new[index]
                start_value = slot.start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
                end_value = slot.end.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
                title = f"{action.title}"
                if (
                    _parse_datetime(event.start_at) == slot.start.astimezone(timezone.utc)
                    and _parse_datetime(event.end_at) == slot.end.astimezone(timezone.utc)
                    and event.title == title
                ):
                    continue
                changes.append({
                    "operation": "update", "eventId": event.id,
                    "projectId": action.project_id, "actionId": action.action_id,
                    "event": {
                        "title": title, "description": "由全局工具排程器管理；修改计划或日历后会重新生成提案。",
                        "displayDetails": f"工具行动 · {action.execution_tier}",
                        "startAt": start_value, "endAt": end_value,
                        "allDay": False, "eventTypeId": event.event_type_id or "general", "syncStatus": "pending",
                    },
                    "linkId": link.link_id,
                })
            for slot in new[shared:]:
                event_id = new_id("event")
                changes.append({
                    "operation": "create", "eventId": event_id,
                    "projectId": action.project_id, "actionId": action.action_id,
                    "event": {
                        "id": event_id, "title": action.title,
                        "description": "由全局工具排程器管理；修改计划或日历后会重新生成提案。",
                        "displayDetails": f"工具行动 · {action.execution_tier}",
                        "startAt": slot.start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
                        "endAt": slot.end.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
                        "allDay": False, "eventTypeId": "general", "syncStatus": "pending",
                    },
                })
            for link, event in old[shared:]:
                changes.append({
                    "operation": "delete", "eventId": event.id,
                    "projectId": action.project_id, "actionId": action.action_id,
                    "linkId": link.link_id,
                })
        return changes

    def _apply_proposal(self, session: Session, record: ScheduleProposalRecord) -> None:
        proposal = copy.deepcopy(record.proposal_json or {})
        if proposal.get("kind") != "global_schedule" or proposal.get("conflicts"):
            raise SchedulingConflictError("该排程提案包含未解决冲突，不能写入日历。")
        timestamp = now_iso()
        calendar = CalendarRepository(engine=self.engine, initialize=False)
        result: dict[str, Any] = {"createdEventIds": [], "updatedEventIds": [], "deletedEventIds": [], "events": []}
        version_project_id: str | None = None

        plan_change = proposal.get("planChange") if isinstance(proposal.get("planChange"), dict) else None
        if plan_change:
            project_id = str(plan_change.get("projectId") or "")
            project = session.scalar(select(ProjectRecord).where(
                ProjectRecord.user_id == self.user_id,
                ProjectRecord.project_id == project_id,
            ).with_for_update())
            if project is None or (project.metadata_json or {}).get("toolCategory") != "active-tool":
                raise SchedulingConflictError("计划变更对应的已激活工具已不存在。")
            base_version_id = str(plan_change.get("baseVersionId") or "")
            if base_version_id:
                latest = session.scalar(select(PlanVersionRecord).where(
                    PlanVersionRecord.user_id == self.user_id,
                    PlanVersionRecord.project_id == project_id,
                ).order_by(PlanVersionRecord.version_number.desc()))
                if latest is None or latest.version_id != base_version_id:
                    raise SchedulingConflictError("工具计划版本已经变化，请重新生成提案。")
            patch = {
                "projectId": project_id,
                "changes": copy.deepcopy(plan_change.get("projectPatch") or {}),
            }
            self._overlay_project_patch(
                self._input_snapshot(session), patch, session=session, timestamp=timestamp
            )
            version_project_id = project_id
            result["updatedProjectId"] = project_id

        for item in proposal.get("actionDateChanges", []):
            action = session.scalar(select(ActionItemRecord).where(
                ActionItemRecord.user_id == self.user_id,
                ActionItemRecord.project_id == str(item.get("projectId") or ""),
                ActionItemRecord.action_id == str(item.get("actionId") or ""),
            ).with_for_update())
            if action is None:
                raise SchedulingConflictError("排程引用的行动已不存在，请重新计算。")
            due_date = str(item.get("dueDate") or "")
            if _parse_date(due_date) is None:
                raise SchedulingValidationError("系统行动日期必须使用 YYYY-MM-DD。")
            action.due_date = due_date
            metadata = copy.deepcopy(action.metadata_json or {})
            metadata.update({"due_date_source": "system_planned", "due_date_flexibility": "flexible"})
            action.metadata_json = metadata
            action.updated_at = timestamp

        for change in proposal.get("changes", []):
            operation = str(change.get("operation") or "")
            event_id = str(change.get("eventId") or "")
            project_id = str(change.get("projectId") or "")
            action_id = str(change.get("actionId") or "")
            if operation == "create":
                payload = copy.deepcopy(change.get("event") or {})
                payload["id"] = event_id
                event_record = calendar._create_event_in_session(session, payload, self.user_id)
                # The link has a database-level foreign key to the new event, but
                # these records do not have an ORM relationship that can infer the
                # insert order. Flush only the parent event while retaining the
                # surrounding proposal transaction so any later failure rolls the
                # entire acceptance back.
                session.flush([event_record])
                session.add(ActionEventLinkRecord(
                    link_id=new_id("action-event"), user_id=self.user_id,
                    project_id=project_id, action_id=action_id, event_id=event_id,
                    managed_by="global_scheduler", proposal_id=record.proposal_id,
                    created_at=timestamp,
                ))
                result["createdEventIds"].append(event_id)
                result["events"].append(event_from_record(event_record))
                continue

            link = session.scalar(select(ActionEventLinkRecord).where(
                ActionEventLinkRecord.user_id == self.user_id,
                ActionEventLinkRecord.event_id == event_id,
                ActionEventLinkRecord.project_id == project_id,
                ActionEventLinkRecord.action_id == action_id,
                ActionEventLinkRecord.managed_by == "global_scheduler",
            ).with_for_update())
            if link is None:
                raise SchedulingConflictError("提案试图修改非排程器管理的日历事件，操作已阻止。")
            event = session.scalar(select(EventRecord).where(
                EventRecord.user_id == self.user_id,
                EventRecord.id == event_id,
            ).with_for_update())
            if event is None:
                raise SchedulingConflictError("排程引用的日历事件已不存在，请重新计算。")
            if _parse_datetime(event.end_at) <= datetime.now(timezone.utc):
                raise SchedulingConflictError("历史排程事件不能修改或删除。")
            if operation == "update":
                event_record = calendar._update_event_in_session(session, event_id, copy.deepcopy(change.get("event") or {}), self.user_id)
                link.proposal_id = record.proposal_id
                result["updatedEventIds"].append(event_id)
                result["events"].append(event_from_record(event_record))
            elif operation == "delete":
                session.delete(link)
                session.flush()
                calendar._delete_event_in_session(session, event_id, self.user_id)
                result["deletedEventIds"].append(event_id)
            else:
                raise SchedulingValidationError("排程提案包含未知的日历操作。")

        if version_project_id:
            from .goal_control import GoalControlService
            GoalControlService(
                engine=self.engine,
                user_id=self.user_id,
                app_mode="server" if self.engine.dialect.name == "mysql" else "desktop",
            )._create_version_in_session(
                session, version_project_id, source="manual",
                summary="Accepted active-tool edit with global schedule impact.",
                diff=[{"operation": "update", "entity": "project", "external_id": version_project_id}],
            )

        batch_payload = {
            "proposalId": record.proposal_id,
            "inputFingerprint": record.input_fingerprint,
            "changes": proposal.get("changes", []),
            "actionDateChanges": proposal.get("actionDateChanges", []),
        }
        payload_hash = hashlib.sha256(json.dumps(
            batch_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str,
        ).encode("utf-8")).hexdigest()
        session.add(CalendarActionBatchRecord(
            batch_id=new_id("calendar-batch"), user_id=self.user_id,
            idempotency_key=f"global-schedule:{record.proposal_id}",
            source="global-schedule-proposal", payload_hash=payload_hash,
            project_id=None, tool_run_id=None, status="committed",
            result_json=result, created_at=timestamp, updated_at=timestamp,
        ))
        proposal["applyResult"] = result
        record.proposal_json = proposal
