from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from typing import Any

from sqlalchemy import inspect, select

from .auth import utc_iso
from .database import (
    ActionEventLinkRecord,
    ActionItemRecord,
    CheckInRecord,
    CheckInScheduleRecord,
    ConversationMessageRecord,
    ConversationThreadRecord,
    DataIntegrityQuarantineRecord,
    EffortEntryRecord,
    EventRecord,
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
    ToolRunRecord,
    create_database_engine,
    create_session_factory,
)


@dataclass(frozen=True)
class Reference:
    field: str
    parent_model: Any
    parent_field: str
    optional: bool = False


@dataclass(frozen=True)
class Relation:
    model: Any
    external_id_field: str
    references: tuple[Reference, ...]


RELATIONS = (
    Relation(ProjectRecord, "project_id", (Reference("goal_id", GoalRecord, "goal_id"),)),
    Relation(MilestoneRecord, "milestone_id", (Reference("project_id", ProjectRecord, "project_id"),)),
    Relation(ActionItemRecord, "action_id", (Reference("project_id", ProjectRecord, "project_id"), Reference("milestone_id", MilestoneRecord, "milestone_id", True))),
    Relation(ProgressLogRecord, "progress_id", (Reference("project_id", ProjectRecord, "project_id"), Reference("goal_id", GoalRecord, "goal_id", True), Reference("action_id", ActionItemRecord, "action_id", True))),
    Relation(ToolRunRecord, "tool_run_id", (Reference("project_id", ProjectRecord, "project_id", True), Reference("goal_id", GoalRecord, "goal_id", True))),
    Relation(ConversationThreadRecord, "thread_id", (Reference("project_id", ProjectRecord, "project_id", True), Reference("goal_id", GoalRecord, "goal_id", True))),
    Relation(ConversationMessageRecord, "message_id", (Reference("thread_id", ConversationThreadRecord, "thread_id"),)),
    Relation(MetricDefinitionRecord, "metric_id", (Reference("project_id", ProjectRecord, "project_id"),)),
    Relation(MetricEntryRecord, "entry_id", (Reference("project_id", ProjectRecord, "project_id"), Reference("metric_id", MetricDefinitionRecord, "metric_id"))),
    Relation(CheckInScheduleRecord, "schedule_id", (Reference("project_id", ProjectRecord, "project_id"),)),
    Relation(CheckInRecord, "check_in_id", (Reference("project_id", ProjectRecord, "project_id"), Reference("thread_id", ConversationThreadRecord, "thread_id", True))),
    Relation(PlanChangeProposalRecord, "proposal_id", (Reference("project_id", ProjectRecord, "project_id", True), Reference("thread_id", ConversationThreadRecord, "thread_id", True))),
    Relation(GoalControlPolicyRecord, "policy_id", (Reference("project_id", ProjectRecord, "project_id"),)),
    Relation(PlanVersionRecord, "version_id", (Reference("project_id", ProjectRecord, "project_id"),)),
    Relation(PlanDependencyRecord, "dependency_id", (Reference("project_id", ProjectRecord, "project_id"), Reference("predecessor_action_id", ActionItemRecord, "action_id"), Reference("successor_action_id", ActionItemRecord, "action_id"))),
    Relation(EffortEntryRecord, "effort_id", (Reference("project_id", ProjectRecord, "project_id"), Reference("action_id", ActionItemRecord, "action_id", True))),
    Relation(ActionEventLinkRecord, "link_id", (Reference("project_id", ProjectRecord, "project_id"), Reference("action_id", ActionItemRecord, "action_id"), Reference("event_id", EventRecord, "id"))),
)


def record_payload(record: Any) -> dict[str, Any]:
    return {column.name: getattr(record, column.name) for column in record.__table__.columns}


def collect_issues(session: Any) -> list[tuple[Relation, Any, str]]:
    parent_keys: dict[tuple[Any, str], set[tuple[str, str]]] = {}
    for relation in RELATIONS:
        for reference in relation.references:
            key = (reference.parent_model, reference.parent_field)
            if key not in parent_keys:
                parent_keys[key] = {
                    (str(record.user_id), str(getattr(record, reference.parent_field)))
                    for record in session.scalars(select(reference.parent_model))
                }
    issues: list[tuple[Relation, Any, str]] = []
    for relation in RELATIONS:
        for record in session.scalars(select(relation.model)):
            for reference in relation.references:
                value = getattr(record, reference.field)
                if value is None and reference.optional:
                    continue
                if value is None or (str(record.user_id), str(value)) not in parent_keys[(reference.parent_model, reference.parent_field)]:
                    issues.append((relation, record, f"missing {reference.parent_model.__tablename__}.{reference.parent_field} for {reference.field}={value}"))
                    break
    return issues


def audit(database_url: str | None, repair: bool) -> dict[str, Any]:
    engine = create_database_engine(database_url)
    required_tables = {"data_integrity_quarantine", *(relation.model.__tablename__ for relation in RELATIONS)}
    missing_tables = sorted(required_tables - set(inspect(engine).get_table_names()))
    if missing_tables:
        engine.dispose()
        raise RuntimeError(
            "Integrity audit requires migration 20260715_0006 before the relational constraints migration; "
            f"missing tables: {', '.join(missing_tables)}"
        )
    factory = create_session_factory(engine)
    archived = 0
    details: list[dict[str, str]] = []
    remaining_issue_count = 0
    while True:
        with factory.begin() as session:
            issues = collect_issues(session)
            remaining_issue_count = len(issues)
            for relation, record, reason in issues:
                details.append({
                    "table": relation.model.__tablename__,
                    "externalId": str(getattr(record, relation.external_id_field)),
                    "userId": str(record.user_id),
                    "reason": reason,
                })
                if repair:
                    session.add(DataIntegrityQuarantineRecord(
                        user_id=str(record.user_id),
                        source_table=relation.model.__tablename__,
                        external_id=str(getattr(record, relation.external_id_field)),
                        reason=reason,
                        payload_json=record_payload(record),
                        quarantined_at=utc_iso(),
                    ))
                    session.delete(record)
                    archived += 1
        if not repair or not issues:
            break
    engine.dispose()
    return {
        "valid": remaining_issue_count == 0,
        "issueCount": len(details),
        "remainingIssueCount": remaining_issue_count,
        "archivedCount": archived,
        "issues": details,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit user-scoped business relationships before Alembic constraints are applied.")
    parser.add_argument("--database-url", default=None)
    parser.add_argument("--archive-and-repair", action="store_true")
    args = parser.parse_args()
    report = audit(args.database_url, args.archive_and_repair)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["issueCount"] and not args.archive_and_repair:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
