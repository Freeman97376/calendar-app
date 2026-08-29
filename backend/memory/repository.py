from __future__ import annotations

from pathlib import Path
from typing import Any, TypeVar

from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from ..database import (
    ActionItemRecord,
    GoalRecord,
    MilestoneRecord,
    ProgressLogRecord,
    ProjectRecord,
    ToolRunRecord,
    create_database_engine,
    create_session_factory,
    initialize_schema,
)


class MemoryRowNotFoundError(KeyError):
    pass


MemoryRecord = TypeVar(
    "MemoryRecord",
    GoalRecord,
    ProjectRecord,
    MilestoneRecord,
    ActionItemRecord,
    ProgressLogRecord,
    ToolRunRecord,
)


def goal_from_record(record: GoalRecord) -> dict[str, Any]:
    return {
        "goal_id": record.goal_id,
        "title": record.title,
        "description": record.description,
        "status": record.status,
        "metadata": record.metadata_json or {},
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


def project_from_record(record: ProjectRecord) -> dict[str, Any]:
    return {
        "project_id": record.project_id,
        "goal_id": record.goal_id,
        "title": record.title,
        "description": record.description,
        "status": record.status,
        "metadata": record.metadata_json or {},
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


def milestone_from_record(record: MilestoneRecord) -> dict[str, Any]:
    return {
        "milestone_id": record.milestone_id,
        "project_id": record.project_id,
        "title": record.title,
        "description": record.description,
        "due_date": record.due_date,
        "status": record.status,
        "metadata": record.metadata_json or {},
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


def action_from_record(record: ActionItemRecord) -> dict[str, Any]:
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
        "metadata": record.metadata_json or {},
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


def progress_from_record(record: ProgressLogRecord) -> dict[str, Any]:
    return {
        "progress_id": record.progress_id,
        "project_id": record.project_id,
        "goal_id": record.goal_id,
        "action_id": record.action_id,
        "log_type": record.log_type,
        "summary": record.summary,
        "details": record.details,
        "metadata": record.metadata_json or {},
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


def tool_run_from_record(record: ToolRunRecord) -> dict[str, Any]:
    return {
        "id": record.tool_run_id,
        "tool_run_id": record.tool_run_id,
        "tool_name": record.tool_name,
        "intent": record.intent,
        "input_summary": record.input_summary,
        "output_summary": record.output_summary,
        "status": record.status,
        "related_project_id": record.project_id,
        "related_goal_id": record.goal_id,
        "project_id": record.project_id,
        "goal_id": record.goal_id,
        "input": record.input_json or {},
        "output": record.output_json or {},
        "error": record.error,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


class MemoryRepository:
    def __init__(
        self,
        db_path: Path | str | None = None,
        *,
        engine: Engine | None = None,
        initialize: bool | None = None,
        user_id: str = "local",
    ) -> None:
        owns_engine = engine is None
        self.engine = engine or create_database_engine(db_path=db_path)
        if initialize if initialize is not None else owns_engine:
            initialize_schema(self.engine)
        self.session_factory = create_session_factory(self.engine)
        self.user_id = user_id

    def list_goals(self) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            records = session.scalars(
                select(GoalRecord)
                .where(GoalRecord.user_id == self.user_id)
                .order_by(GoalRecord.created_at.desc(), GoalRecord.title.asc())
            ).all()
            return [goal_from_record(record) for record in records]

    def get_goal(self, goal_id: str) -> dict[str, Any]:
        with self.session_factory() as session:
            return goal_from_record(self._required(session, GoalRecord, GoalRecord.goal_id, goal_id, "goal"))

    def create_goal(self, goal: dict[str, Any]) -> dict[str, Any]:
        record = GoalRecord(
            user_id=self.user_id,
            goal_id=goal["goal_id"],
            title=goal["title"],
            description=goal["description"],
            status=goal["status"],
            metadata_json=goal.get("metadata", {}),
            created_at=goal["created_at"],
            updated_at=goal["updated_at"],
        )
        self._add(record)
        return goal_from_record(record)

    def create_goal_project(
        self,
        goal: dict[str, Any],
        project: dict[str, Any],
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        goal_record = GoalRecord(
            user_id=self.user_id,
            goal_id=goal["goal_id"],
            title=goal["title"],
            description=goal["description"],
            status=goal["status"],
            metadata_json=goal.get("metadata", {}),
            created_at=goal["created_at"],
            updated_at=goal["updated_at"],
        )
        project_record = ProjectRecord(
            user_id=self.user_id,
            project_id=project["project_id"],
            goal_id=goal["goal_id"],
            title=project["title"],
            description=project["description"],
            status=project["status"],
            metadata_json=project.get("metadata", {}),
            created_at=project["created_at"],
            updated_at=project["updated_at"],
        )
        with self.session_factory.begin() as session:
            session.add(goal_record)
            session.flush()
            session.add(project_record)
            session.flush()
        return goal_from_record(goal_record), project_from_record(project_record)

    def update_goal(self, goal_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        with self.session_factory.begin() as session:
            record = self._required(session, GoalRecord, GoalRecord.goal_id, goal_id, "goal")
            self._patch(record, patch)
        return goal_from_record(record)

    def list_projects(self) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            records = session.scalars(
                select(ProjectRecord)
                .where(ProjectRecord.user_id == self.user_id)
                .order_by(ProjectRecord.created_at.desc(), ProjectRecord.title.asc())
            ).all()
            return [project_from_record(record) for record in records]

    def get_project(self, project_id: str) -> dict[str, Any]:
        with self.session_factory() as session:
            return project_from_record(
                self._required(session, ProjectRecord, ProjectRecord.project_id, project_id, "project")
            )

    def create_project(self, project: dict[str, Any]) -> dict[str, Any]:
        record = ProjectRecord(
            user_id=self.user_id,
            project_id=project["project_id"],
            goal_id=project["goal_id"],
            title=project["title"],
            description=project["description"],
            status=project["status"],
            metadata_json=project.get("metadata", {}),
            created_at=project["created_at"],
            updated_at=project["updated_at"],
        )
        self._add(record)
        return project_from_record(record)

    def update_project(self, project_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        with self.session_factory.begin() as session:
            record = self._required(session, ProjectRecord, ProjectRecord.project_id, project_id, "project")
            self._patch(record, patch)
        return project_from_record(record)

    def list_milestones(self, project_id: str) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            records = session.scalars(
                select(MilestoneRecord)
                .where(MilestoneRecord.user_id == self.user_id, MilestoneRecord.project_id == project_id)
                .order_by(MilestoneRecord.created_at.desc(), MilestoneRecord.title.asc())
            ).all()
            return [milestone_from_record(record) for record in records]

    def get_milestone(self, milestone_id: str) -> dict[str, Any]:
        with self.session_factory() as session:
            return milestone_from_record(
                self._required(
                    session,
                    MilestoneRecord,
                    MilestoneRecord.milestone_id,
                    milestone_id,
                    "milestone",
                )
            )

    def create_milestone(self, milestone: dict[str, Any]) -> dict[str, Any]:
        record = MilestoneRecord(
            user_id=self.user_id,
            milestone_id=milestone["milestone_id"],
            project_id=milestone["project_id"],
            title=milestone["title"],
            description=milestone["description"],
            due_date=milestone.get("due_date"),
            status=milestone["status"],
            metadata_json=milestone.get("metadata", {}),
            created_at=milestone["created_at"],
            updated_at=milestone["updated_at"],
        )
        self._add(record)
        return milestone_from_record(record)

    def update_milestone(self, milestone_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        with self.session_factory.begin() as session:
            record = self._required(
                session,
                MilestoneRecord,
                MilestoneRecord.milestone_id,
                milestone_id,
                "milestone",
            )
            self._patch(record, patch)
        return milestone_from_record(record)

    def list_actions(self, project_id: str) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            records = session.scalars(
                select(ActionItemRecord)
                .where(ActionItemRecord.user_id == self.user_id, ActionItemRecord.project_id == project_id)
                .order_by(ActionItemRecord.created_at.desc(), ActionItemRecord.title.asc())
            ).all()
            return [action_from_record(record) for record in records]

    def get_action(self, action_id: str) -> dict[str, Any]:
        with self.session_factory() as session:
            return action_from_record(
                self._required(session, ActionItemRecord, ActionItemRecord.action_id, action_id, "action item")
            )

    def create_action(self, action: dict[str, Any]) -> dict[str, Any]:
        record = ActionItemRecord(
            user_id=self.user_id,
            action_id=action["action_id"],
            project_id=action["project_id"],
            milestone_id=action.get("milestone_id"),
            title=action["title"],
            description=action["description"],
            due_date=action.get("due_date"),
            status=action["status"],
            estimated_minutes=max(1, int(action.get("estimated_minutes", 30))),
            priority=str(action.get("priority") or "medium"),
            energy_needed=str(action.get("energy_needed") or "medium"),
            execution_tier=str(action.get("execution_tier") or "standard"),
            metadata_json=action.get("metadata", {}),
            created_at=action["created_at"],
            updated_at=action["updated_at"],
        )
        self._add(record)
        return action_from_record(record)

    def update_action(self, action_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        with self.session_factory.begin() as session:
            record = self._required(session, ActionItemRecord, ActionItemRecord.action_id, action_id, "action item")
            self._patch(record, patch)
        return action_from_record(record)

    def list_progress(self, project_id: str) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            records = session.scalars(
                select(ProgressLogRecord)
                .where(ProgressLogRecord.user_id == self.user_id, ProgressLogRecord.project_id == project_id)
                .order_by(ProgressLogRecord.created_at.desc())
            ).all()
            return [progress_from_record(record) for record in records]

    def create_progress(self, progress: dict[str, Any]) -> dict[str, Any]:
        record = ProgressLogRecord(
            user_id=self.user_id,
            progress_id=progress["progress_id"],
            project_id=progress["project_id"],
            goal_id=progress.get("goal_id"),
            action_id=progress.get("action_id"),
            log_type=progress["log_type"],
            summary=progress["summary"],
            details=progress["details"],
            metadata_json=progress.get("metadata", {}),
            created_at=progress["created_at"],
            updated_at=progress["updated_at"],
        )
        self._add(record)
        return progress_from_record(record)

    def create_tool_run(self, tool_run: dict[str, Any]) -> dict[str, Any]:
        record = ToolRunRecord(
            user_id=self.user_id,
            tool_run_id=tool_run["tool_run_id"],
            project_id=tool_run.get("project_id"),
            goal_id=tool_run.get("goal_id"),
            tool_name=tool_run["tool_name"],
            intent=tool_run["intent"],
            input_summary=tool_run["input_summary"],
            output_summary=tool_run["output_summary"],
            status=tool_run["status"],
            input_json=tool_run.get("input", {}),
            output_json=tool_run.get("output", {}),
            error=tool_run.get("error", ""),
            created_at=tool_run["created_at"],
            updated_at=tool_run["updated_at"],
        )
        self._add(record)
        return tool_run_from_record(record)

    def list_tool_runs(self, project_id: str | None = None) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            statement = select(ToolRunRecord).where(ToolRunRecord.user_id == self.user_id)
            if project_id:
                statement = statement.where(ToolRunRecord.project_id == project_id)
            records = session.scalars(statement.order_by(ToolRunRecord.created_at.desc()).limit(50)).all()
            return [tool_run_from_record(record) for record in records]

    def get_tool_run(self, tool_run_id: str) -> dict[str, Any]:
        with self.session_factory() as session:
            return tool_run_from_record(
                self._required(session, ToolRunRecord, ToolRunRecord.tool_run_id, tool_run_id, "tool run")
            )

    def search(self, query: str) -> list[dict[str, Any]]:
        needle = query.lower()
        results: list[dict[str, Any]] = []
        with self.session_factory() as session:
            sources: list[tuple[str, list[Any], Any]] = [
                ("goal", list(session.scalars(select(GoalRecord).where(GoalRecord.user_id == self.user_id))), goal_from_record),
                ("project", list(session.scalars(select(ProjectRecord).where(ProjectRecord.user_id == self.user_id))), project_from_record),
                ("milestone", list(session.scalars(select(MilestoneRecord).where(MilestoneRecord.user_id == self.user_id))), milestone_from_record),
                ("action_item", list(session.scalars(select(ActionItemRecord).where(ActionItemRecord.user_id == self.user_id))), action_from_record),
                ("progress_log", list(session.scalars(select(ProgressLogRecord).where(ProgressLogRecord.user_id == self.user_id))), progress_from_record),
                ("tool_run", list(session.scalars(select(ToolRunRecord).where(ToolRunRecord.user_id == self.user_id))), tool_run_from_record),
            ]
            for entity_type, records, converter in sources:
                for record in records:
                    item = converter(record)
                    searchable = " ".join(
                        str(item.get(key, ""))
                        for key in ("title", "description", "summary", "details", "tool_name", "intent", "output_summary")
                    ).lower()
                    if needle not in searchable:
                        continue
                    item_id = next(
                        (str(item[key]) for key in ("goal_id", "project_id", "milestone_id", "action_id", "progress_id", "tool_run_id") if item.get(key)),
                        "",
                    )
                    results.append(
                        {
                            "entity_type": entity_type,
                            "item_id": item_id,
                            "project_id": item.get("project_id") or item.get("related_project_id"),
                            "goal_id": item.get("goal_id") or item.get("related_goal_id"),
                            "title": item.get("title") or item.get("summary") or item.get("tool_name") or "",
                            "description": item.get("description") or item.get("details") or item.get("output_summary") or "",
                            "status": item.get("status") or item.get("log_type") or "",
                            "updated_at": item.get("updated_at") or item.get("created_at") or "",
                        }
                    )
        return sorted(results, key=lambda item: item["updated_at"], reverse=True)[:50]

    def _add(self, record: Any) -> None:
        with self.session_factory.begin() as session:
            session.add(record)

    @staticmethod
    def _patch(record: Any, patch: dict[str, Any]) -> None:
        for key, value in patch.items():
            column = "metadata_json" if key == "metadata" else key
            if hasattr(record, column):
                setattr(record, column, value)

    def _required(
        self,
        session: Session,
        model: type[MemoryRecord],
        id_column: Any,
        external_id: str,
        label: str,
    ) -> MemoryRecord:
        record = session.scalar(
            select(model).where(model.user_id == self.user_id, id_column == external_id)
        )
        if record is None:
            raise MemoryRowNotFoundError(f"{label} not found: {external_id}")
        return record
