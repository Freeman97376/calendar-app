from __future__ import annotations

import os
from typing import Any, Callable

from fastapi import Body, Depends, FastAPI, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .auth import Principal
from .goal_control import (
    MODE_LIMITS,
    USAGE_MODES,
    GoalControlConflictError,
    GoalControlNotFoundError,
    GoalControlService,
    GoalControlValidationError,
    clean_mode,
)


class CheckInMetricValuePayload(BaseModel):
    metric_id: str
    value: float | None = None
    confidence: float = Field(default=1.0, ge=0, le=1)
    is_anomaly: bool = False
    anomaly_reason: str = Field(default="", max_length=500)
    notes: str = Field(default="", max_length=1000)


class CheckInAnswerPayload(BaseModel):
    answers: dict[str, Any] | list[dict[str, Any]] = Field(default_factory=dict)
    effort_minutes: int = Field(default=0, ge=0, le=10_080)
    metric_values: list[CheckInMetricValuePayload] = Field(default_factory=list, max_length=10)


def usage_capabilities(mode: str) -> dict[str, Any]:
    default_mode = clean_mode(os.getenv("AI_DEFAULT_USAGE_MODE", "balanced"))
    maximum_mode = clean_mode(os.getenv("AI_MAX_USAGE_MODE", "balanced"))
    maximum_index = USAGE_MODES.index(maximum_mode)
    return {
        "allowedModes": list(USAGE_MODES[: maximum_index + 1]),
        "defaultMode": default_mode,
        "maximumMode": maximum_mode,
        "budgetEditable": mode == "desktop",
        "softLimit": int(os.getenv("AI_MONTHLY_SOFT_LIMIT", "1500000")),
        "hardLimit": int(os.getenv("AI_MONTHLY_HARD_LIMIT", "2000000")),
        "modes": {key: value for key, value in MODE_LIMITS.items()},
    }


def install_goal_control_routes(
    api: FastAPI,
    *,
    engine: Any,
    app_mode: str,
    current_principal: Callable[..., Principal],
) -> None:
    def control(principal: Principal) -> GoalControlService:
        return GoalControlService(engine=engine, user_id=principal.user_id, app_mode=app_mode)

    async def validation_error(_request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"success": False, "error": {"code": "goal_control_invalid", "message": str(exc), "recoverable": True}},
        )

    async def not_found_error(_request: Request, exc: GoalControlNotFoundError) -> JSONResponse:
        return JSONResponse(
            status_code=404,
            content={"success": False, "error": {"code": "goal_control_not_found", "message": str(exc).strip("'"), "recoverable": True}},
        )

    async def conflict_error(_request: Request, exc: GoalControlConflictError) -> JSONResponse:
        return JSONResponse(
            status_code=409,
            content={"success": False, "error": {"code": "goal_control_conflict", "message": str(exc), "recoverable": True}},
        )

    api.add_exception_handler(GoalControlValidationError, validation_error)
    api.add_exception_handler(GoalControlNotFoundError, not_found_error)
    api.add_exception_handler(GoalControlConflictError, conflict_error)

    @api.get("/api/goal-conversations")
    def list_goal_conversations(
        project_id: str | None = Query(default=None),
        include_archived: bool = Query(default=False),
        principal: Principal = Depends(current_principal),
    ) -> dict[str, Any]:
        return {"success": True, "threads": control(principal).list_threads(project_id=project_id, include_archived=include_archived)}

    @api.post("/api/goal-conversations")
    def create_goal_conversation(
        payload: dict[str, Any] = Body(default_factory=dict),
        principal: Principal = Depends(current_principal),
    ) -> dict[str, Any]:
        return {"success": True, "thread": control(principal).create_thread(payload)}

    @api.get("/api/goal-conversations/{thread_id}")
    def get_goal_conversation(thread_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        value = control(principal).get_thread(thread_id)
        messages = value.pop("messages", [])
        return {"success": True, "thread": value, "messages": messages}

    @api.patch("/api/goal-conversations/{thread_id}")
    def update_goal_conversation(
        thread_id: str,
        payload: dict[str, Any],
        principal: Principal = Depends(current_principal),
    ) -> dict[str, Any]:
        return {"success": True, "thread": control(principal).update_thread(thread_id, payload)}

    @api.post("/api/goal-conversations/{thread_id}/messages")
    def add_goal_message(
        thread_id: str,
        payload: dict[str, Any],
        principal: Principal = Depends(current_principal),
    ) -> dict[str, Any]:
        return {"success": True, "message": control(principal).add_message(thread_id, payload)}

    @api.post("/api/goal-conversations/{thread_id}/activate")
    def activate_goal_conversation(
        thread_id: str,
        payload: dict[str, Any],
        principal: Principal = Depends(current_principal),
    ) -> dict[str, Any]:
        return {"success": True, **control(principal).activate_thread(thread_id, payload)}

    @api.get("/api/memory/projects/{project_id}/dashboard")
    def goal_dashboard(project_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "dashboard": control(principal).dashboard(project_id)}

    @api.get("/api/memory/projects/{project_id}/metrics")
    def list_metrics(project_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "metrics": control(principal).list_metrics(project_id)}

    @api.post("/api/memory/projects/{project_id}/metrics")
    def create_metric(
        project_id: str,
        payload: dict[str, Any],
        principal: Principal = Depends(current_principal),
    ) -> dict[str, Any]:
        return {"success": True, "metric": control(principal).create_metric(project_id, payload)}

    @api.patch("/api/metrics/{metric_id}")
    def update_metric(metric_id: str, payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "metric": control(principal).update_metric(metric_id, payload)}

    @api.post("/api/metrics/{metric_id}/entries")
    def add_metric_entry(metric_id: str, payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "entry": control(principal).add_metric_entry(metric_id, payload)}

    @api.get("/api/memory/projects/{project_id}/control-policy")
    def get_control_policy(project_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "policy": control(principal).get_policy(project_id)}

    @api.patch("/api/memory/projects/{project_id}/control-policy")
    def update_control_policy(
        project_id: str,
        payload: dict[str, Any],
        principal: Principal = Depends(current_principal),
    ) -> dict[str, Any]:
        return {"success": True, "policy": control(principal).update_policy(project_id, payload)}

    @api.get("/api/memory/projects/{project_id}/dependencies")
    def list_dependencies(project_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "dependencies": control(principal).list_dependencies(project_id)}

    @api.post("/api/memory/projects/{project_id}/dependencies")
    def add_dependency(project_id: str, payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "dependency": control(principal).add_dependency(project_id, payload)}

    @api.delete("/api/dependencies/{dependency_id}")
    def delete_dependency(dependency_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        control(principal).delete_dependency(dependency_id)
        return {"success": True, "deleted": True, "dependencyId": dependency_id}

    @api.get("/api/memory/projects/{project_id}/effort")
    def list_effort(project_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "effort": control(principal).list_effort(project_id)}

    @api.post("/api/memory/projects/{project_id}/effort")
    def add_effort(project_id: str, payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "effort": control(principal).add_effort(project_id, payload)}

    @api.get("/api/memory/projects/{project_id}/plan-versions")
    def list_versions(project_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "versions": control(principal).list_versions(project_id)}

    @api.post("/api/memory/projects/{project_id}/plan-versions")
    def create_version(project_id: str, payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "version": control(principal).create_version(project_id, payload)}

    @api.patch("/api/plan-versions/{version_id}")
    def pin_version(version_id: str, payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "version": control(principal).set_version_pinned(version_id, bool(payload.get("pinned", False)))}

    @api.post("/api/plan-versions/{version_id}/rollback")
    def rollback_version(version_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "version": control(principal).rollback_version(version_id)}

    @api.post("/api/plan-change-proposals")
    def create_proposal(payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "proposal": control(principal).create_proposal(payload)}

    @api.post("/api/plan-change-proposals/{proposal_id}/resolve")
    def resolve_proposal(proposal_id: str, payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        accepted_diff_ids = payload.get("accepted_diff_ids")
        if accepted_diff_ids is not None and not isinstance(accepted_diff_ids, list):
            raise GoalControlValidationError("accepted_diff_ids must be an array.")
        return {"success": True, "proposal": control(principal).resolve_proposal(
            proposal_id,
            bool(payload.get("accept", False)),
            [str(value) for value in accepted_diff_ids] if accepted_diff_ids is not None else None,
        )}

    @api.post("/api/check-ins/ensure")
    def ensure_check_ins(principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "checkIns": control(principal).ensure_check_ins()}

    @api.get("/api/check-ins/pending")
    def pending_check_ins(principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "checkIns": control(principal).list_pending_check_ins()}

    @api.post("/api/check-ins/{check_in_id}/answer")
    def answer_check_in(check_in_id: str, payload: CheckInAnswerPayload, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, **control(principal).answer_check_in(check_in_id, payload.model_dump())}

    @api.post("/api/check-ins/{check_in_id}/skip")
    def skip_check_in(check_in_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "checkIn": control(principal).skip_check_in(check_in_id)}

    @api.get("/api/me/ai-usage")
    def ai_usage(project_id: str | None = Query(default=None), principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "usage": control(principal).usage_summary(project_id)}
