from __future__ import annotations

import argparse
import ctypes
import ipaddress
import json
import os
import re
import secrets
import socket
import sys
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Annotated, Any, Literal
from urllib.parse import urlparse

import httpx
import uvicorn
from fastapi import Body, Cookie, Depends, FastAPI, File, Form, Header, Query, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
from sqlalchemy.engine import Engine

from .auth import AuthError, AuthService, Principal
from .calendar import CalendarRepository
from .calendar.repository import CalendarReferenceError, CalendarRowNotFoundError
from .database import (
    LOCAL_USER_ID,
    create_database_engine,
    database_url,
    lock_runtime_schema,
    require_migration_head,
    require_schema_fingerprint,
)
from .desktop_migration import DesktopMigrationError, prepare_desktop_database
from .fridge.config import fridge_data_dir, load_env_files
from .fridge.deepseek_client import (
    DEFAULT_BASE_URL as DEEPSEEK_DEFAULT_BASE_URL,
    DEFAULT_MODEL as DEEPSEEK_DEFAULT_MODEL,
    SYSTEM_PROMPT as FRIDGE_SYSTEM_PROMPT,
    DeepSeekBudgetExceededError,
    DeepSeekClient,
    DeepSeekConfig,
    DeepSeekError,
    DeepSeekInvalidResponseError,
    DeepSeekRateLimitError,
    DeepSeekTimeoutError,
    build_deepseek_prompt,
)
from .fridge.pipeline import FridgePipelineError, ImageValidationError, InvalidRequestError, ReceiptAnalyzer
from .goal_control import (
    AI_OPERATION_ALIASES,
    AI_PLANNING_OPERATIONS,
    GoalControlService,
    USAGE_MODES,
    clean_mode,
)
from .goal_control_api import install_goal_control_routes, usage_capabilities
from .memory import LongTermMemoryService, MemoryNotFoundError, MemoryValidationError
from .server_paths import PROJECT_ROOT, application_data_dir, project_env_paths
from .update_backup import PreUpdateBackupError, create_pre_update_backup
from .user_data import (
    BackupValidationError,
    DataPortabilityService,
    FridgeRepository,
    ImportPreviewStaleError,
    PreferenceRepository,
    ToolPresetRepository,
    UserDataNotFoundError,
)


SESSION_COOKIE = "calendar_session"
CSRF_COOKIE = "calendar_csrf"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
AI_OPERATIONS = {
    "routine",
    "route",
    "calendar_plan",
    "goal_plan",
    "activation",
    "review",
    "weekly_review",
    "replan",
}


class MultipartParseError(ValueError):
    pass


class StrictDto(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginPayload(StrictDto):
    username: str = Field(min_length=1, max_length=256)
    password: str = Field(min_length=1, max_length=256)


class RecurrenceEndNever(StrictDto):
    type: Literal["never"]


class RecurrenceEndDate(StrictDto):
    type: Literal["date"]
    until: datetime


class RecurrenceEndCount(StrictDto):
    type: Literal["count"]
    occurrences: int = Field(ge=1, le=10_000)


RecurrenceEndCondition = Annotated[
    RecurrenceEndNever | RecurrenceEndDate | RecurrenceEndCount,
    Field(discriminator="type"),
]


class RecurrenceRulePayload(StrictDto):
    frequency: Literal["daily", "weekly", "monthly", "custom"]
    interval: int = Field(default=1, ge=1, le=365)
    daysOfWeek: list[Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]] | None = Field(
        default=None,
        max_length=7,
    )
    dayOfMonth: int | None = Field(default=None, ge=1, le=31)
    endCondition: RecurrenceEndCondition = Field(default_factory=lambda: RecurrenceEndNever(type="never"))

    @model_validator(mode="after")
    def validate_weekdays(self) -> "RecurrenceRulePayload":
        if self.frequency in {"weekly", "custom"} and not self.daysOfWeek:
            raise ValueError("Weekly and custom recurrence require at least one weekday.")
        return self


class EventCreatePayload(StrictDto):
    id: str | None = Field(default=None, min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10_000)
    displayDetails: str | None = Field(default=None, max_length=2_000)
    startAt: datetime
    endAt: datetime
    allDay: bool = False
    color: str | None = Field(default=None, max_length=32)
    eventTypeId: str = Field(default="general", min_length=1, max_length=64)
    linkedTodoId: str | None = Field(default=None, min_length=1, max_length=64)
    recurrenceRule: RecurrenceRulePayload | None = None
    masterId: str | None = Field(default=None, min_length=1, max_length=64)
    exceptionFor: str | None = Field(default=None, min_length=1, max_length=64)
    exceptionDate: date | None = None
    deletedOccurrences: list[str] | None = Field(default=None, max_length=500)
    syncStatus: Literal["synced", "pending", "conflict"] = "pending"
    createdAt: datetime | None = None
    updatedAt: datetime | None = None

    @model_validator(mode="after")
    def validate_time_range(self) -> "EventCreatePayload":
        if self.startAt.tzinfo is None or self.endAt.tzinfo is None:
            raise ValueError("Event timestamps must include a timezone offset.")
        if self.endAt <= self.startAt:
            raise ValueError("Event end time must be after start time.")
        return self


class EventUpdatePayload(StrictDto):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10_000)
    displayDetails: str | None = Field(default=None, max_length=2_000)
    startAt: datetime | None = None
    endAt: datetime | None = None
    allDay: bool | None = None
    color: str | None = Field(default=None, max_length=32)
    eventTypeId: str | None = Field(default=None, min_length=1, max_length=64)
    linkedTodoId: str | None = Field(default=None, min_length=1, max_length=64)
    recurrenceRule: RecurrenceRulePayload | None = None
    masterId: str | None = Field(default=None, min_length=1, max_length=64)
    exceptionFor: str | None = Field(default=None, min_length=1, max_length=64)
    exceptionDate: date | None = None
    deletedOccurrences: list[str] | None = Field(default=None, max_length=500)
    syncStatus: Literal["synced", "pending", "conflict"] | None = None
    updatedAt: datetime | None = None

    @model_validator(mode="after")
    def reject_null_required_fields(self) -> "EventUpdatePayload":
        required = {"title", "startAt", "endAt", "allDay", "eventTypeId", "syncStatus", "updatedAt"}
        for field_name in required:
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null.")
        return self


class TodoLongProjectPayload(StrictDto):
    memoryGoalId: str = Field(min_length=1, max_length=64)
    memoryProjectId: str = Field(min_length=1, max_length=64)
    sourceToolId: str | None = Field(default=None, min_length=1, max_length=64)


class MemoryGoalCreatePayload(StrictDto):
    title: str = Field(min_length=1, max_length=200, strict=True)
    description: str | None = Field(default=None, max_length=10_000, strict=True)
    status: Literal["active", "paused", "completed", "archived"] = "active"
    metadata: dict[str, Any] = Field(default_factory=dict)


class MemoryProjectForGoalCreatePayload(StrictDto):
    title: str = Field(min_length=1, max_length=200, strict=True)
    description: str | None = Field(default=None, max_length=10_000, strict=True)
    status: Literal["active", "paused", "completed"] = "active"
    metadata: dict[str, Any] = Field(default_factory=dict)


class MemoryGoalProjectCreatePayload(StrictDto):
    goal: MemoryGoalCreatePayload
    project: MemoryProjectForGoalCreatePayload


class TodoCreatePayload(StrictDto):
    id: str | None = Field(default=None, min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=10_000)
    status: Literal["todo", "doing", "done"] = "todo"
    eventTypeId: str = Field(default="general", min_length=1, max_length=64)
    dueDate: date | None = None
    linkedEventId: str | None = Field(default=None, min_length=1, max_length=64)
    longProject: TodoLongProjectPayload | None = None
    etaMinutes: int = Field(default=30, ge=5, le=480)
    energyNeeded: Literal["high", "medium", "low"] = "medium"
    priority: Literal["high", "medium", "low"] = "medium"
    createdAt: datetime | None = None
    updatedAt: datetime | None = None
    completedAt: datetime | None = None


class TodoUpdatePayload(StrictDto):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=10_000)
    status: Literal["todo", "doing", "done"] | None = None
    eventTypeId: str | None = Field(default=None, min_length=1, max_length=64)
    dueDate: date | None = None
    linkedEventId: str | None = Field(default=None, min_length=1, max_length=64)
    longProject: TodoLongProjectPayload | None = None
    etaMinutes: int | None = Field(default=None, ge=5, le=480)
    energyNeeded: Literal["high", "medium", "low"] | None = None
    priority: Literal["high", "medium", "low"] | None = None
    updatedAt: datetime | None = None
    completedAt: datetime | None = None

    @model_validator(mode="after")
    def reject_null_required_fields(self) -> "TodoUpdatePayload":
        required = {"title", "status", "eventTypeId", "etaMinutes", "energyNeeded", "priority", "updatedAt"}
        for field_name in required:
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null.")
        return self


class EventTypeCreatePayload(StrictDto):
    id: str = Field(min_length=1, max_length=64, strict=True)
    label: str = Field(min_length=1, max_length=40, strict=True)
    color: str = Field(min_length=1, max_length=32, strict=True)
    appliesTo: Literal["calendar", "todo", "both"] = "both"
    isArchived: bool = Field(default=False, strict=True)
    createdAt: datetime | None = None
    updatedAt: datetime | None = None


class EventTypeUpdatePayload(StrictDto):
    label: str | None = Field(default=None, min_length=1, max_length=40, strict=True)
    color: str | None = Field(default=None, min_length=1, max_length=32, strict=True)
    appliesTo: Literal["calendar", "todo", "both"] | None = None
    isArchived: bool | None = Field(default=None, strict=True)

    @model_validator(mode="after")
    def reject_explicit_nulls(self) -> "EventTypeUpdatePayload":
        for field_name in self.model_fields_set:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null.")
        return self


class SnapshotEventPayload(EventCreatePayload):
    id: str = Field(min_length=1, max_length=64, strict=True)


class SnapshotTodoPayload(TodoCreatePayload):
    id: str = Field(min_length=1, max_length=64, strict=True)


class LocalCalendarSnapshotPayload(StrictDto):
    eventTypes: list[EventTypeCreatePayload] = Field(default_factory=list, max_length=10_000)
    todos: list[SnapshotTodoPayload] = Field(default_factory=list, max_length=100_000)
    events: list[SnapshotEventPayload] = Field(default_factory=list, max_length=100_000)

    @model_validator(mode="after")
    def reject_duplicate_ids(self) -> "LocalCalendarSnapshotPayload":
        for field_name in ("eventTypes", "todos", "events"):
            values = getattr(self, field_name)
            identifiers = [item.id for item in values]
            if len(identifiers) != len(set(identifiers)):
                raise ValueError(f"{field_name} must not contain duplicate ids.")
        return self


class FridgePredictionMetadataPayload(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

    cache_hit: bool
    cache_match_type: str | None = Field(default=None, min_length=1, max_length=80)
    cache_layer: str | None = Field(default=None, min_length=1, max_length=80)
    source: str = Field(min_length=1, max_length=80)
    confidence: float = Field(ge=0, le=1)


class FridgeItemCreatePayload(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

    item_id: str | None = Field(default=None, min_length=1, max_length=64)
    item_name: str = Field(min_length=1, max_length=200)
    normalized_name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str = Field(default='unknown', min_length=1, max_length=80)
    storage_type: Literal['fridge', 'freezer', 'room_temp', 'unknown'] = 'unknown'
    purchase_date: str | None = Field(default=None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    estimated_expiration_date: str | None = Field(default=None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    estimated_shelf_life_days: int | None = Field(default=None, ge=0, le=36_500)
    confidence: float = Field(default=0.5, ge=0, le=1)
    source: str = Field(default='manual', min_length=1, max_length=80)
    receipt_id: str | None = Field(default=None, min_length=1, max_length=64)
    quantity: str | None = Field(default=None, min_length=1, max_length=80)
    notes: str = Field(default='', max_length=10_000)
    cache_hit: bool = False
    cache_match_type: str | None = Field(default=None, min_length=1, max_length=80)
    cache_layer: str | None = Field(default=None, min_length=1, max_length=80)
    metadata: FridgePredictionMetadataPayload | None = None

    @field_validator('item_name', 'normalized_name', 'category', 'source')
    @classmethod
    def strip_nonempty_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        clean = value.strip()
        if not clean:
            raise ValueError('value must contain non-whitespace characters.')
        return clean

    @field_validator('purchase_date', 'estimated_expiration_date')
    @classmethod
    def validate_iso_date(cls, value: str | None) -> str | None:
        if value is not None:
            date.fromisoformat(value)
        return value


class FridgeItemUpdatePayload(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)

    item_name: str | None = Field(default=None, min_length=1, max_length=200)
    normalized_name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, min_length=1, max_length=80)
    storage_type: Literal['fridge', 'freezer', 'room_temp', 'unknown'] | None = None
    purchase_date: str | None = Field(default=None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    estimated_expiration_date: str | None = Field(default=None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    estimated_shelf_life_days: int | None = Field(default=None, ge=0, le=36_500)
    confidence: float | None = Field(default=None, ge=0, le=1)
    source: str | None = Field(default=None, min_length=1, max_length=80)
    receipt_id: str | None = Field(default=None, min_length=1, max_length=64)
    quantity: str | None = Field(default=None, min_length=1, max_length=80)
    notes: str | None = Field(default=None, max_length=10_000)

    @field_validator('item_name', 'normalized_name', 'category', 'source')
    @classmethod
    def strip_nonempty_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        clean = value.strip()
        if not clean:
            raise ValueError('value must contain non-whitespace characters.')
        return clean

    @field_validator('purchase_date', 'estimated_expiration_date')
    @classmethod
    def validate_iso_date(cls, value: str | None) -> str | None:
        if value is not None:
            date.fromisoformat(value)
        return value

    @model_validator(mode='after')
    def reject_empty_or_null_required_patch(self) -> 'FridgeItemUpdatePayload':
        if not self.model_fields_set:
            raise ValueError('At least one fridge item field must be provided.')
        nullable = {
            'estimated_expiration_date',
            'estimated_shelf_life_days',
            'receipt_id',
            'quantity',
        }
        for field_name in self.model_fields_set - nullable:
            if getattr(self, field_name) is None:
                raise ValueError(f'{field_name} cannot be null.')
        return self


class PreferenceUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    confirmEnabledToolRouting: bool | None = None
    defaultEventColor: str | None = Field(default=None, min_length=1, max_length=32)
    defaultEventEndTime: str | None = Field(
        default=None,
        pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$",
    )
    defaultEventStartTime: str | None = Field(
        default=None,
        pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$",
    )
    defaultEventTypeId: str | None = Field(default=None, min_length=1, max_length=64)
    defaultTodoEventTypeId: str | None = Field(default=None, min_length=1, max_length=64)
    defaultTodoPriority: Literal["high", "medium", "low"] | None = None
    language: Literal["en", "zh"] | None = None
    aiUsageMode: Literal["economy", "balanced", "quality"] | None = None
    aiMonthlySoftLimit: int | None = Field(default=None, ge=1, le=2_147_483_647)
    aiMonthlyHardLimit: int | None = Field(default=None, ge=1, le=2_147_483_647)
    layoutPanelPosition: Literal["left", "right", "top", "bottom"] | None = None
    layoutPanelSizePercent: int | None = Field(default=None, ge=15, le=40)
    timezoneOverride: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def reject_explicit_nulls(self) -> "PreferenceUpdatePayload":
        for field_name in self.model_fields_set:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null.")
        return self


class ToolPresetLlmOptionsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    model: str | None = Field(default=None, max_length=200)
    provider: Literal["global", "api", "local"] = "global"


class ToolPresetFieldOptionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    label: str = Field(min_length=1, max_length=80)
    value: str = Field(min_length=1, max_length=120)

    @field_validator("label", "value")
    @classmethod
    def strip_nonempty_text(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("value must contain non-whitespace characters.")
        return clean


class ToolPresetFieldPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    defaultValue: str | None = Field(default=None, max_length=10_000)
    id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=80)
    options: list[ToolPresetFieldOptionPayload] | None = Field(default=None, max_length=100)
    placeholder: str | None = Field(default=None, max_length=160)
    required: bool = False
    type: Literal["text", "textarea", "date", "time", "number", "select"] = "text"

    @field_validator("id", "label")
    @classmethod
    def strip_nonempty_text(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("value must contain non-whitespace characters.")
        return clean


class ToolPresetCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    createdAt: datetime | None = None
    defaultLlmOptions: ToolPresetLlmOptionsPayload = Field(
        default_factory=ToolPresetLlmOptionsPayload,
    )
    description: str = Field(min_length=1, max_length=500)
    fields: list[ToolPresetFieldPayload] = Field(min_length=1, max_length=20)
    id: str = Field(min_length=1, max_length=80)
    isBuiltIn: bool = False
    label: str = Field(min_length=1, max_length=80)
    outputSchemaKey: Literal["calendar_event_drafts"] = "calendar_event_drafts"
    prompt: str = Field(min_length=1, max_length=4_000)
    updatedAt: datetime | None = None

    @field_validator("description", "id", "label", "prompt")
    @classmethod
    def strip_nonempty_text(cls, value: str) -> str:
        clean = value.strip()
        if not clean:
            raise ValueError("value must contain non-whitespace characters.")
        return clean


class ToolPresetUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    defaultLlmOptions: ToolPresetLlmOptionsPayload | None = None
    description: str | None = Field(default=None, min_length=1, max_length=500)
    fields: list[ToolPresetFieldPayload] | None = Field(default=None, min_length=1, max_length=20)
    label: str | None = Field(default=None, min_length=1, max_length=80)
    outputSchemaKey: Literal["calendar_event_drafts"] | None = None
    prompt: str | None = Field(default=None, min_length=1, max_length=4_000)
    updatedAt: datetime | None = None

    @field_validator("description", "label", "prompt")
    @classmethod
    def strip_nonempty_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        clean = value.strip()
        if not clean:
            raise ValueError("value must contain non-whitespace characters.")
        return clean

    @model_validator(mode="after")
    def reject_empty_or_null_patch(self) -> "ToolPresetUpdatePayload":
        if not self.model_fields_set:
            raise ValueError("At least one tool preset field must be provided.")
        for field_name in self.model_fields_set:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null.")
        return self


class ImportPreviewPayload(StrictDto):
    backup: dict[str, Any]
    mode: Literal["merge", "replace"] = "merge"


class ImportPayload(StrictDto):
    backup: dict[str, Any]
    mode: Literal["merge", "replace"] = "merge"
    replaceConfirmed: bool = False
    source: str = Field(default="api-backup", min_length=1, max_length=120)
    expectedBackupChecksum: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    currentDataChecksum: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    conflictChoices: dict[str, Literal["local", "backup"]] = Field(default_factory=dict)


class PreUpdateBackupPayload(StrictDto):
    fromVersion: str = Field(min_length=1, max_length=40)
    toVersion: str = Field(min_length=1, max_length=40)


@dataclass(frozen=True)
class RequestLimits:
    login: int
    json: int
    ai: int
    backup: int
    receipt_file: int
    multipart: int

    def for_path(self, path: str) -> tuple[int, str]:
        if path == "/api/auth/login":
            return self.login, "login_request_too_large"
        if path == "/api/ai/chat/completions":
            return self.ai, "ai_request_too_large"
        if path in {"/api/data/import", "/api/data/import/preview"}:
            return self.backup, "backup_request_too_large"
        if path == "/api/fridge/receipt/analyze":
            return self.multipart, "multipart_request_too_large"
        return self.json, "request_too_large"


def _request_limit_env(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a positive byte count.") from exc
    if value <= 0 or value > 128 * 1024 * 1024:
        raise RuntimeError(f"{name} must be between 1 and 134217728 bytes.")
    return value


def configured_request_limits() -> RequestLimits:
    limits = RequestLimits(
        login=_request_limit_env("CALENDAR_LOGIN_MAX_REQUEST_BYTES", 16 * 1024),
        json=_request_limit_env("CALENDAR_JSON_MAX_REQUEST_BYTES", 1024 * 1024),
        ai=_request_limit_env("AI_MAX_REQUEST_BYTES", 256 * 1024),
        backup=_request_limit_env("CALENDAR_BACKUP_MAX_REQUEST_BYTES", 25 * 1024 * 1024),
        receipt_file=_request_limit_env("CALENDAR_RECEIPT_MAX_FILE_BYTES", 8 * 1024 * 1024),
        multipart=_request_limit_env("CALENDAR_MULTIPART_MAX_REQUEST_BYTES", 10 * 1024 * 1024),
    )
    if limits.receipt_file > limits.multipart:
        raise RuntimeError("CALENDAR_RECEIPT_MAX_FILE_BYTES cannot exceed CALENDAR_MULTIPART_MAX_REQUEST_BYTES.")
    return limits


class RequestBodyLimitMiddleware:
    def __init__(self, app: Any, *, limits: RequestLimits) -> None:
        self.app = app
        self.limits = limits

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http" or scope.get("method") in SAFE_METHODS:
            await self.app(scope, receive, send)
            return
        limit, code = self.limits.for_path(str(scope.get("path") or ""))
        headers = {key.lower(): value for key, value in scope.get("headers") or []}
        content_length = headers.get(b"content-length")
        if content_length:
            try:
                declared = int(content_length.decode("ascii"))
            except (UnicodeDecodeError, ValueError):
                await error_response("content_length_invalid", "Content-Length must be a valid byte count.", 400)(
                    scope, receive, send
                )
                return
            if declared < 0:
                await error_response("content_length_invalid", "Content-Length must be a valid byte count.", 400)(
                    scope, receive, send
                )
                return
            if declared > limit:
                await error_response(code, "Request body is too large.", 413, details={"maxBytes": limit})(
                    scope, receive, send
                )
                return

        messages: list[dict[str, Any]] = []
        received = 0
        while True:
            message = await receive()
            messages.append(message)
            if message.get("type") == "http.request":
                received += len(message.get("body") or b"")
                if received > limit:
                    await error_response(code, "Request body is too large.", 413, details={"maxBytes": limit})(
                        scope, receive, send
                    )
                    return
                if not message.get("more_body", False):
                    break
            elif message.get("type") == "http.disconnect":
                break

        position = 0
        async def replay_receive() -> dict[str, Any]:
            nonlocal position
            if position >= len(messages):
                return {"type": "http.disconnect"}
            message = messages[position]
            position += 1
            return message

        await self.app(scope, replay_receive, send)


@dataclass
class ServerState:
    mode: str
    engine: Engine
    auth: AuthService
    analyzer: ReceiptAnalyzer
    request_limits: RequestLimits
    launch_token: str = ""
    ai_requests: dict[str, deque[float]] = field(default_factory=lambda: defaultdict(deque))


class MeteredReceiptDeepSeekClient:
    '''Apply the shared per-user AI policy to each actual Fridge provider call.'''

    def __init__(self, client: object, state: ServerState, control: GoalControlService) -> None:
        self.client = client
        self.state = state
        self.control = control

    def extract_fridge_items(
        self,
        receipt_text: str,
        candidate_items: list[str],
        purchase_date: date,
    ) -> list[Any]:
        usage = self.control.usage_summary()
        if usage['degraded']:
            raise DeepSeekBudgetExceededError(
                'The monthly AI hard limit has been reached. Local receipt analysis remains available.'
            )
        try:
            enforce_ai_limit(self.state, self.control.user_id)
        except AuthError as exc:
            if exc.code == 'ai_rate_limited':
                raise DeepSeekRateLimitError(str(exc)) from exc
            raise

        prompt = build_deepseek_prompt(receipt_text, candidate_items, purchase_date)
        estimated_input_tokens = max(1, (len(FRIDGE_SYSTEM_PROMPT) + len(prompt)) // 4)
        try:
            predictions = self.client.extract_fridge_items(  # type: ignore[attr-defined]
                receipt_text,
                candidate_items,
                purchase_date,
            )
        except DeepSeekError as exc:
            if isinstance(exc, DeepSeekTimeoutError):
                status = 'upstream_timeout'
            elif isinstance(exc, DeepSeekRateLimitError):
                status = 'upstream_rate_limit'
            elif isinstance(exc, DeepSeekInvalidResponseError):
                status = 'upstream_invalid'
            else:
                status = 'upstream_error'
            self._record(usage, estimated_input_tokens, 0, status)
            raise
        except Exception:
            self._record(usage, estimated_input_tokens, 0, 'upstream_error')
            raise

        estimated_output_tokens = max(
            1,
            len(
                json.dumps(
                    [
                        prediction.to_dict() if hasattr(prediction, 'to_dict') else str(prediction)
                        for prediction in predictions
                    ],
                    ensure_ascii=False,
                )
            )
            // 4,
        )
        self._record(usage, estimated_input_tokens, estimated_output_tokens, 'success')
        return predictions

    def _record(
        self,
        usage: dict[str, Any],
        input_tokens: int,
        output_tokens: int,
        status: str,
    ) -> None:
        config = getattr(self.client, 'config', None)
        model = str(getattr(config, 'model', '') or os.getenv('DEEPSEEK_MODEL', DEEPSEEK_DEFAULT_MODEL))
        self.control.record_usage(
            operation='receipt_analysis',
            model=model,
            usage_mode=str(usage['effective_mode']),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            status=status,
            estimated=True,
        )


def parse_multipart_form(content_type: str, body: bytes) -> dict[str, dict[str, Any]]:
    """Compatibility parser retained for focused unit tests and legacy callers."""
    boundary_match = re.search(r"boundary=([^;]+)", content_type)
    if not boundary_match:
        raise MultipartParseError("Missing multipart boundary.")
    boundary = boundary_match.group(1).strip('"').encode("utf-8")
    fields: dict[str, dict[str, Any]] = {}
    for raw_part in body.split(b"--" + boundary):
        part = raw_part.strip()
        if not part or part == b"--":
            continue
        if part.endswith(b"--"):
            part = part[:-2].strip()
        header_block, separator, content = part.partition(b"\r\n\r\n")
        if not separator:
            continue
        header_map: dict[str, str] = {}
        for header in header_block.decode("utf-8", errors="replace").split("\r\n"):
            if ":" in header:
                key, value = header.split(":", 1)
                header_map[key.lower()] = value.strip()
        disposition = header_map.get("content-disposition", "")
        name_match = re.search(r'name="([^"]+)"', disposition)
        if not name_match:
            continue
        filename_match = re.search(r'filename="([^"]*)"', disposition)
        fields[name_match.group(1)] = {
            "filename": filename_match.group(1) if filename_match else "",
            "content_type": header_map.get("content-type", ""),
            "content": content.rstrip(b"\r\n"),
        }
    return fields


def app_mode(explicit: str | None = None) -> str:
    value = (explicit or os.getenv("CALENDAR_APP_MODE", "desktop")).strip().lower()
    if value not in {"server", "desktop"}:
        raise ValueError("CALENDAR_APP_MODE must be server or desktop")
    return value


def create_app(
    *,
    mode: str | None = None,
    configured_database_url: str | None = None,
    launch_token: str | None = None,
) -> FastAPI:
    request_limits = configured_request_limits()
    resolved_mode = app_mode(mode)
    if resolved_mode == "desktop":
        resolved_database_url = configured_database_url or os.getenv("CALENDAR_DATABASE_URL", "").strip()
        if not resolved_database_url:
            data_dir = application_data_dir()
            data_dir.mkdir(parents=True, exist_ok=True)
            resolved_database_url = database_url(db_path=data_dir / "calendar_app.sqlite3")
        prepare_desktop_database(resolved_database_url)
        engine = create_database_engine(resolved_database_url)
    else:
        engine = create_database_engine(configured_database_url)
    if resolved_mode == 'server' and engine.dialect.name not in {'mysql', 'sqlite'}:
        engine.dispose()
        raise RuntimeError('Server mode requires a mysql+pymysql CALENDAR_DATABASE_URL.')
    if (
        resolved_mode == 'server'
        and engine.dialect.name != 'mysql'
        and configured_database_url is None
    ):
        engine.dispose()
        raise RuntimeError(
            'Server mode requires a mysql+pymysql CALENDAR_DATABASE_URL. '
            'SQLite tests must pass configured_database_url explicitly.'
        )
    if (
        resolved_mode == "server"
        and engine.dialect.name != "mysql"
        and os.getenv("CALENDAR_ALLOW_SERVER_SQLITE", "").lower() not in {"1", "true", "yes"}
    ):
        raise RuntimeError("Server mode requires a mysql+pymysql CALENDAR_DATABASE_URL.")
    if resolved_mode == "server":
        require_migration_head(engine)
    require_schema_fingerprint(engine)
    lock_runtime_schema(engine)
    auth = AuthService(engine, initialize=False)
    if resolved_mode == "desktop":
        auth.ensure_desktop_user()
    state = ServerState(
        mode=resolved_mode,
        engine=engine,
        auth=auth,
        analyzer=build_receipt_analyzer(resolved_mode),
        request_limits=request_limits,
        launch_token=launch_token or os.getenv("CALENDAR_DESKTOP_LAUNCH_TOKEN", "").strip(),
    )

    api = FastAPI(title="Calendar App API", version="1.0.0", docs_url=None, redoc_url=None)
    api.state.calendar = state
    default_origins = "http://127.0.0.1:5173,http://localhost:5173" if resolved_mode == "desktop" else ""
    allowed_origins = [
        origin.strip()
        for origin in os.getenv("CALENDAR_ALLOWED_ORIGINS", default_origins).split(",")
        if origin.strip()
    ]
    if resolved_mode == "desktop":
        allowed_origins.extend(["http://tauri.localhost", "https://tauri.localhost", "tauri://localhost"])
    api.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        # ApiAIService uses an OpenAI-compatible Authorization header. In
        # desktop mode it contains only the non-secret proxy marker, while the
        # real provider key stays in Windows Credential Manager/backend env.
        allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "X-Desktop-Token", "X-Client-Timezone"],
    )
    api.add_middleware(RequestBodyLimitMiddleware, limits=state.request_limits)

    @api.exception_handler(RequestValidationError)
    async def _request_validation_error(
        _request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        field_errors: dict[str, list[str]] = {}
        for issue in exc.errors():
            location = ".".join(str(part) for part in issue.get("loc", ()) if part != "body")
            field_errors.setdefault(location or "request", []).append(str(issue.get("msg") or "Invalid value."))
        return error_response(
            "validation_error",
            "Request validation failed.",
            422,
            retryable=False,
            field_errors=field_errors,
        )
    api.add_exception_handler(ValidationError, _request_validation_error)

    @api.exception_handler(AuthError)
    async def _auth_error(_request: Request, exc: AuthError) -> JSONResponse:
        response = error_response(
            exc.code,
            str(exc),
            exc.status,
            retry_after_seconds=exc.retry_after,
        )
        if exc.retry_after:
            response.headers["Retry-After"] = str(exc.retry_after)
        return response

    @api.exception_handler(CalendarRowNotFoundError)
    async def _calendar_not_found(_request: Request, exc: CalendarRowNotFoundError) -> JSONResponse:
        return error_response("calendar_item_not_found", clean_key_error(exc), 404)

    @api.exception_handler(CalendarReferenceError)
    async def _calendar_reference_error(_request: Request, exc: CalendarReferenceError) -> JSONResponse:
        return error_response(
            "validation_error",
            "Calendar relationship validation failed.",
            422,
            retryable=False,
            field_errors={"reference": [str(exc)]},
        )

    @api.exception_handler(MemoryNotFoundError)
    async def _memory_not_found(_request: Request, exc: MemoryNotFoundError) -> JSONResponse:
        return error_response("memory_not_found", clean_key_error(exc), 404)

    @api.exception_handler(UserDataNotFoundError)
    async def _user_data_not_found(_request: Request, exc: UserDataNotFoundError) -> JSONResponse:
        return error_response("item_not_found", clean_key_error(exc), 404)

    async def _memory_validation_error(
        _request: Request,
        exc: MemoryValidationError,
    ) -> JSONResponse:
        return error_response("invalid_request", str(exc), 422)

    async def _validation_error(_request: Request, exc: Exception) -> JSONResponse:
        return error_response("invalid_request", str(exc), 400)

    api.add_exception_handler(MemoryValidationError, _memory_validation_error)
    api.add_exception_handler(BackupValidationError, _validation_error)
    api.add_exception_handler(PreUpdateBackupError, _validation_error)

    @api.exception_handler(ImportPreviewStaleError)
    async def _import_preview_stale(_request: Request, exc: ImportPreviewStaleError) -> JSONResponse:
        return error_response("import_preview_stale", str(exc), 409, retryable=True)

    async def _fridge_error(_request: Request, exc: Exception) -> JSONResponse:
        code = getattr(exc, "code", "invalid_request")
        status = int(getattr(exc, "status", 400))
        return error_response(code, str(exc), status)

    api.add_exception_handler(InvalidRequestError, _fridge_error)
    api.add_exception_handler(ImageValidationError, _fridge_error)
    api.add_exception_handler(FridgePipelineError, _fridge_error)

    def current_principal(
        request: Request,
        calendar_session: str = Cookie(default="", alias=SESSION_COOKIE),
        calendar_csrf: str = Cookie(default="", alias=CSRF_COOKIE),
        x_desktop_token: str = Header(default="", alias="X-Desktop-Token"),
    ) -> Principal:
        client_timezone = request.headers.get("X-Client-Timezone", "").strip()
        if state.mode == "desktop":
            if state.launch_token and not constant_time_equal(x_desktop_token, state.launch_token):
                raise AuthError("invalid_desktop_token", "Desktop launch token is invalid.", 401)
            return Principal(LOCAL_USER_ID, "local", "admin", state.launch_token, "desktop", client_timezone)
        principal = state.auth.authenticate(calendar_session, calendar_csrf)
        if request.method not in SAFE_METHODS:
            csrf_header = request.headers.get("X-CSRF-Token", "")
            state.auth.validate_csrf(principal.session_id, csrf_header)
        return Principal(
            principal.user_id,
            principal.username,
            principal.role,
            calendar_csrf,
            principal.session_id,
            client_timezone,
        )

    def optional_principal(
        request: Request,
        calendar_session: str = Cookie(default="", alias=SESSION_COOKIE),
        calendar_csrf: str = Cookie(default="", alias=CSRF_COOKIE),
        x_desktop_token: str = Header(default="", alias="X-Desktop-Token"),
    ) -> Principal | None:
        if state.mode == "desktop":
            return current_principal(request, calendar_session, calendar_csrf, x_desktop_token)
        try:
            return current_principal(request, calendar_session, calendar_csrf, x_desktop_token)
        except AuthError:
            return None

    @api.get("/api/health")
    def health() -> dict[str, Any]:
        return {"success": True, "status": "ok", "mode": state.mode, "database": state.engine.dialect.name}

    @api.get("/api/bootstrap")
    def bootstrap(principal: Principal | None = Depends(optional_principal)) -> dict[str, Any]:
        preferences = PreferenceRepository(state.engine, principal.user_id).get() if principal else {}
        ai_usage = usage_capabilities(state.mode)
        return {
            "success": True,
            "mode": state.mode,
            "authRequired": state.mode == "server",
            "user": principal_payload(principal) if principal else None,
            "csrfToken": principal.csrf_token if principal else "",
            "preferences": preferences,
            "capabilities": {
                "registration": False,
                "serverManagedAI": True,
                "dataPortability": True,
                "backendConfigEditable": state.mode == "desktop",
                "aiUsage": ai_usage,
                "aiUsageModes": ai_usage["allowedModes"],
                "aiDefaultUsageMode": ai_usage["defaultMode"],
                "aiMaximumUsageMode": ai_usage["maximumMode"],
                "aiBudgetEditable": ai_usage["budgetEditable"],
            },
        }

    @api.post("/api/auth/login")
    def login(payload: LoginPayload, response: Response, request: Request) -> dict[str, Any]:
        if state.mode != "server":
            raise AuthError("login_not_required", "Desktop mode does not require login.", 400)
        result = state.auth.login(payload.username, payload.password, client_ip=login_client_ip(request))
        secure = cookie_secure(state.mode)
        response.set_cookie(
            SESSION_COOKIE,
            result.session_token,
            httponly=True,
            secure=secure,
            samesite="lax",
            max_age=7 * 24 * 60 * 60,
            path="/",
        )
        response.set_cookie(
            CSRF_COOKIE,
            result.csrf_token,
            httponly=False,
            secure=secure,
            samesite="lax",
            max_age=7 * 24 * 60 * 60,
            path="/",
        )
        return {
            "success": True,
            "user": principal_payload(result.principal),
            "csrfToken": result.csrf_token,
            "expiresAt": result.expires_at,
        }

    @api.get("/api/auth/me")
    def me(principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "user": principal_payload(principal), "csrfToken": principal.csrf_token}

    @api.post("/api/auth/logout")
    def logout(
        response: Response,
        principal: Principal = Depends(current_principal),
        calendar_session: str = Cookie(default="", alias=SESSION_COOKIE),
    ) -> dict[str, Any]:
        if state.mode == "server":
            state.auth.logout(calendar_session)
        response.delete_cookie(SESSION_COOKIE, path="/")
        response.delete_cookie(CSRF_COOKIE, path="/")
        return {"success": True, "loggedOut": True, "userId": principal.user_id}

    @api.get("/api/config")
    def config_status(_principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return backend_config_status(state.mode)

    @api.patch("/api/config")
    def config_update(
        payload: dict[str, Any] = Body(default_factory=dict),
        _principal: Principal = Depends(current_principal),
    ) -> dict[str, Any]:
        if state.mode != "desktop":
            raise AuthError("server_config_read_only", "Server configuration is managed by environment variables.", 403)
        updates: dict[str, str] = {}
        analyzer_needs_refresh = False
        api_key = str(payload.get("deepseek_api_key", "")).strip()
        if api_key:
            set_local_ai_key(api_key)
            analyzer_needs_refresh = True
        for payload_key, env_key in {
            "deepseek_base_url": "DEEPSEEK_BASE_URL",
            "deepseek_model": "DEEPSEEK_MODEL",
            "fridge_data_dir": "FRIDGE_DATA_DIR",
        }.items():
            if payload_key in payload:
                updates[env_key] = str(payload.get(payload_key, "")).strip()
        if updates:
            update_env_file(application_data_dir() / ".env.local", updates)
            os.environ.update({key: value for key, value in updates.items() if value})
            analyzer_needs_refresh = True
        if analyzer_needs_refresh:
            state.analyzer = build_receipt_analyzer(state.mode)
        return backend_config_status(state.mode)

    @api.get("/api/calendar/todos")
    def list_todos(principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "todos": CalendarRepository(engine=state.engine).list_todos(principal.user_id)}

    @api.post("/api/calendar/todos")
    def create_todo(payload: TodoCreatePayload, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {
            "success": True,
            "todo": CalendarRepository(engine=state.engine).create_todo(
                payload.model_dump(mode="json", exclude_none=True),
                principal.user_id,
            ),
        }

    @api.patch("/api/calendar/todos/{todo_id}")
    def update_todo(todo_id: str, payload: TodoUpdatePayload, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        changes = payload.model_dump(mode="json", exclude_unset=True)
        return {
            "success": True,
            "todo": CalendarRepository(engine=state.engine).update_todo(todo_id, changes, principal.user_id),
        }

    @api.delete("/api/calendar/todos/{todo_id}")
    def delete_todo(todo_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        CalendarRepository(engine=state.engine).delete_todo(todo_id, principal.user_id)
        return {"success": True, "deleted": True, "todoId": todo_id}

    @api.get("/api/calendar/events")
    def list_events(
        start: str = Query(...),
        end: str = Query(...),
        principal: Principal = Depends(current_principal),
    ) -> dict[str, Any]:
        return {"success": True, "events": CalendarRepository(engine=state.engine).list_events(start, end, principal.user_id)}

    @api.post("/api/calendar/events")
    def create_event(payload: EventCreatePayload, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {
            "success": True,
            "event": CalendarRepository(engine=state.engine).create_event(
                payload.model_dump(mode="json", exclude_none=True),
                principal.user_id,
            ),
        }

    @api.patch("/api/calendar/events/{event_id}")
    def update_event(event_id: str, payload: EventUpdatePayload, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        repository = CalendarRepository(engine=state.engine)
        changes = payload.model_dump(mode="json", exclude_unset=True)
        EventCreatePayload.model_validate(
            {
                **repository.get_event(event_id, principal.user_id),
                **changes,
            }
        )
        return {
            "success": True,
            "event": repository.update_event(event_id, changes, principal.user_id),
        }

    @api.delete("/api/calendar/events/{event_id}")
    def delete_event(event_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        CalendarRepository(engine=state.engine).delete_event(event_id, principal.user_id)
        return {"success": True, "deleted": True, "eventId": event_id}

    @api.get("/api/calendar/event-types")
    def list_event_types(principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "eventTypes": CalendarRepository(engine=state.engine).list_event_types(principal.user_id)}

    @api.post("/api/calendar/event-types")
    def create_event_type(payload: EventTypeCreatePayload, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {
            "success": True,
            "eventType": CalendarRepository(engine=state.engine).upsert_event_type(
                payload.model_dump(mode="json", exclude_none=True),
                principal.user_id,
            ),
        }

    @api.patch("/api/calendar/event-types/{event_type_id}")
    def update_event_type(event_type_id: str, payload: EventTypeUpdatePayload, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {
            "success": True,
            "eventType": CalendarRepository(engine=state.engine).upsert_event_type(
                {
                    **payload.model_dump(mode="json", exclude_unset=True),
                    "id": event_type_id,
                },
                principal.user_id,
                create_missing=False,
            ),
        }

    @api.post("/api/calendar/import/local-snapshot")
    def import_calendar(payload: LocalCalendarSnapshotPayload, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {
            "success": True,
            "imported": CalendarRepository(engine=state.engine).import_local_snapshot(
                payload.model_dump(mode="json", exclude_none=True),
                principal.user_id,
            ),
        }

    def memory(principal: Principal) -> LongTermMemoryService:
        return LongTermMemoryService(engine=state.engine, user_id=principal.user_id)

    @api.get("/api/memory/goals")
    def list_goals(principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "goals": memory(principal).list_goals()}

    @api.post("/api/memory/goals")
    def create_goal(payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "goal": memory(principal).create_goal(payload)}

    @api.post("/api/memory/goal-projects")
    def create_goal_project(
        payload: MemoryGoalProjectCreatePayload,
        principal: Principal = Depends(current_principal),
    ) -> dict[str, Any]:
        created = memory(principal).create_goal_project(
            payload.model_dump(mode="python", exclude_none=True)
        )
        return {"success": True, **created}

    @api.patch("/api/memory/goals/{goal_id}")
    def update_goal(goal_id: str, payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "goal": memory(principal).update_goal(goal_id, payload)}

    @api.get("/api/memory/projects")
    def list_projects(principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "projects": memory(principal).list_projects()}

    @api.post("/api/memory/projects")
    def create_project(payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "project": memory(principal).create_project(payload)}

    @api.get("/api/memory/projects/{project_id}")
    def get_project(project_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "project": memory(principal).get_project(project_id)}

    @api.patch("/api/memory/projects/{project_id}")
    def update_project(project_id: str, payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "project": memory(principal).update_project(project_id, payload)}

    @api.get("/api/memory/projects/{project_id}/milestones")
    def list_milestones(project_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "milestones": memory(principal).list_milestones(project_id)}

    @api.post("/api/memory/milestones")
    def create_milestone(payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "milestone": memory(principal).create_milestone(payload)}

    @api.patch("/api/memory/milestones/{milestone_id}")
    def update_milestone(milestone_id: str, payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "milestone": memory(principal).update_milestone(milestone_id, payload)}

    @api.get("/api/memory/projects/{project_id}/actions")
    def list_actions(project_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "actions": memory(principal).list_actions(project_id)}

    @api.post("/api/memory/actions")
    def create_action(payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "action": memory(principal).create_action(payload)}

    @api.patch("/api/memory/actions/{action_id}")
    def update_action(action_id: str, payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "action": memory(principal).update_action(action_id, payload)}

    @api.get("/api/memory/projects/{project_id}/progress")
    def list_progress(project_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "progress": memory(principal).list_progress(project_id)}

    @api.post("/api/memory/progress")
    def create_progress(payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "progress": memory(principal).create_progress(payload)}

    @api.get("/api/memory/tool-runs")
    def list_tool_runs(principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "tool_runs": memory(principal).list_tool_runs()}

    @api.post("/api/memory/tool-runs")
    def create_tool_run(payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "tool_run": memory(principal).create_tool_run(payload)}

    @api.get("/api/memory/projects/{project_id}/tool-runs")
    def list_project_tool_runs(project_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "tool_runs": memory(principal).list_project_tool_runs(project_id)}

    @api.get("/api/memory/search")
    def search_memory(q: str = Query(default=""), principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "results": memory(principal).search(q)}

    @api.post("/api/fridge/receipt/analyze")
    async def analyze_receipt(
        image: UploadFile = File(...),
        purchase_date: str | None = Form(default=None),
        timezone: str | None = Form(default=None),
        principal: Principal = Depends(current_principal),
    ) -> Any:
        content = bytearray()
        try:
            while True:
                chunk = await image.read(64 * 1024)
                if not chunk:
                    break
                if len(content) + len(chunk) > state.request_limits.receipt_file:
                    return error_response(
                        "receipt_file_too_large",
                        "Receipt image is too large.",
                        413,
                        details={"maxBytes": state.request_limits.receipt_file},
                    )
                content.extend(chunk)
        finally:
            await image.close()
        parsed_date = None
        if purchase_date:
            try:
                parsed_date = date.fromisoformat(purchase_date)
            except ValueError as exc:
                raise InvalidRequestError("purchase_date must be an ISO date string") from exc
        control = GoalControlService(
            engine=state.engine,
            user_id=principal.user_id,
            app_mode=state.mode,
            client_timezone=timezone or principal.client_timezone,
        )
        with control.session_factory() as session:
            effective_timezone, _zone = control._user_timezone(session)
        provider_client = state.analyzer.deepseek_client
        metered_client = (
            MeteredReceiptDeepSeekClient(provider_client, state, control)
            if provider_client is not None
            else None
        )
        return state.analyzer.analyze(
            bytes(content),
            image.filename or "receipt",
            image.content_type or "application/octet-stream",
            purchase_date=parsed_date,
            timezone=effective_timezone,
            deepseek_client=metered_client,
        )

    @api.get("/api/fridge/items")
    def list_fridge_items(principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "items": FridgeRepository(state.engine, principal.user_id).list_items()}

    @api.post("/api/fridge/items")
    def create_fridge_item(
        payload: FridgeItemCreatePayload,
        principal: Principal = Depends(current_principal),
    ) -> dict[str, Any]:
        payload = payload.model_dump(
            mode='json',
            exclude_none=True,
            exclude={'cache_hit', 'cache_match_type', 'cache_layer', 'metadata'},
        )
        return {"success": True, "item": FridgeRepository(state.engine, principal.user_id).create_item(payload)}

    @api.patch("/api/fridge/items/{item_id}")
    def update_fridge_item(
        item_id: str,
        payload: FridgeItemUpdatePayload,
        principal: Principal = Depends(current_principal),
    ) -> dict[str, Any]:
        payload = payload.model_dump(mode='json', exclude_unset=True)
        return {"success": True, "item": FridgeRepository(state.engine, principal.user_id).update_item(item_id, payload)}

    @api.delete("/api/fridge/items/{item_id}")
    def delete_fridge_item(item_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        FridgeRepository(state.engine, principal.user_id).delete_item(item_id)
        return {"success": True, "deleted": True, "item_id": item_id}

    @api.get("/api/me/preferences")
    def get_preferences(principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "preferences": PreferenceRepository(state.engine, principal.user_id).get()}

    @api.patch("/api/me/preferences")
    def update_preferences(payload: PreferenceUpdatePayload, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        clean = payload.model_dump(exclude_unset=True)
        timezone_override = str(clean.get("timezoneOverride") or "").strip()
        if timezone_override:
            GoalControlService._timezone(timezone_override)
            clean["timezoneOverride"] = timezone_override
        if "aiUsageMode" in clean:
            requested_mode = clean["aiUsageMode"]
            maximum_mode = clean_mode(os.getenv("AI_MAX_USAGE_MODE", "balanced"))
            if USAGE_MODES.index(requested_mode) > USAGE_MODES.index(maximum_mode):
                raise AuthError("ai_usage_mode_not_allowed", "The requested AI usage mode exceeds the administrator maximum.", 403)
        budget_keys = {"aiMonthlySoftLimit", "aiMonthlyHardLimit"}
        if state.mode != "desktop" and any(key in clean for key in budget_keys):
            raise AuthError("ai_budget_read_only", "AI budgets are managed by the server administrator.", 403)
        if state.mode == "desktop" and any(key in clean for key in budget_keys):
            current = PreferenceRepository(state.engine, principal.user_id).get()
            soft = int(clean.get("aiMonthlySoftLimit", current.get("aiMonthlySoftLimit", os.getenv("AI_MONTHLY_SOFT_LIMIT", "1500000"))))
            hard = int(clean.get("aiMonthlyHardLimit", current.get("aiMonthlyHardLimit", os.getenv("AI_MONTHLY_HARD_LIMIT", "2000000"))))
            if soft <= 0 or hard <= 0 or soft > hard:
                raise MemoryValidationError("AI budget limits must be positive and the soft limit cannot exceed the hard limit.")
        return {"success": True, "preferences": PreferenceRepository(state.engine, principal.user_id).update(clean)}

    @api.get("/api/tool-presets")
    def list_presets(principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {"success": True, "presets": ToolPresetRepository(state.engine, principal.user_id).list_presets()}

    @api.post("/api/tool-presets")
    def save_preset(
        payload: ToolPresetCreatePayload,
        principal: Principal = Depends(current_principal),
    ) -> dict[str, Any]:
        clean = payload.model_dump(mode="json", exclude_none=True)
        return {
            "success": True,
            "preset": ToolPresetRepository(state.engine, principal.user_id).save_preset(clean),
        }

    @api.patch("/api/tool-presets/{preset_id}")
    def update_preset(
        preset_id: str,
        payload: ToolPresetUpdatePayload,
        principal: Principal = Depends(current_principal),
    ) -> dict[str, Any]:
        clean = payload.model_dump(mode="json", exclude_unset=True)
        return {
            "success": True,
            "preset": ToolPresetRepository(state.engine, principal.user_id).update_preset(
                preset_id,
                clean,
            ),
        }

    @api.delete("/api/tool-presets/{preset_id}")
    def delete_preset(preset_id: str, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        ToolPresetRepository(state.engine, principal.user_id).delete_preset(preset_id)
        return {"success": True, "deleted": True, "presetId": preset_id}

    @api.get("/api/data/export")
    def export_data(principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        return {
            "success": True,
            "backup": DataPortabilityService(state.engine, app_mode=state.mode).export(principal.user_id),
        }

    @api.post("/api/data/import/preview")
    def preview_import_data(
        payload: ImportPreviewPayload,
        principal: Principal = Depends(current_principal),
    ) -> dict[str, Any]:
        preview = DataPortabilityService(state.engine, app_mode=state.mode).preview_import(
            principal.user_id, payload.backup, mode=payload.mode
        )
        return {"success": True, "preview": preview}

    @api.post("/api/data/import")
    def import_data(payload: ImportPayload, principal: Principal = Depends(current_principal)) -> dict[str, Any]:
        report = DataPortabilityService(state.engine, app_mode=state.mode).import_backup(
            principal.user_id,
            payload.backup,
            mode=payload.mode,
            replace_confirmed=payload.replaceConfirmed,
            source=payload.source,
            expected_backup_checksum=payload.expectedBackupChecksum,
            expected_current_checksum=payload.currentDataChecksum,
            conflict_choices=payload.conflictChoices,
        )
        return {"success": True, "report": report}

    @api.post("/api/data/pre-update-backup")
    def pre_update_backup(
        payload: PreUpdateBackupPayload,
        _principal: Principal = Depends(current_principal),
    ) -> dict[str, Any]:
        if state.mode != "desktop":
            raise AuthError(
                "desktop_only_operation",
                "Pre-update backups are managed by the local desktop app.",
                403,
            )
        backup = create_pre_update_backup(
            state.engine,
            from_version=payload.fromVersion,
            to_version=payload.toVersion,
        )
        return {"success": True, "backup": backup}

    install_goal_control_routes(
        api,
        engine=state.engine,
        app_mode=state.mode,
        current_principal=current_principal,
    )

    @api.post("/api/ai/chat/completions")
    async def proxy_ai(payload: dict[str, Any], principal: Principal = Depends(current_principal)) -> Response:
        enforce_ai_limit(state, principal.user_id)
        api_key = local_ai_key() if state.mode == "desktop" else os.getenv("DEEPSEEK_API_KEY", "").strip()
        if not api_key:
            return error_response("deepseek_missing_api_key", "AI API key is not configured.", 503)
        base_url = os.getenv("DEEPSEEK_BASE_URL", DEEPSEEK_DEFAULT_BASE_URL).rstrip("/")
        requested_operation = str(payload.pop("_calendarOperation", "routine")).strip().lower()[:32]
        operation = AI_OPERATION_ALIASES.get(requested_operation, requested_operation)
        if operation not in AI_OPERATIONS:
            return error_response(
                "ai_operation_invalid",
                "The requested AI operation is not supported.",
                422,
                retryable=False,
            )
        context_ids: dict[str, str | None] = {}
        for field_name in ("_calendarProjectId", "_calendarThreadId"):
            if field_name not in payload:
                context_ids[field_name] = None
                continue
            raw_context_id = payload.pop(field_name)
            if not isinstance(raw_context_id, str) or len(raw_context_id) > 64:
                return error_response(
                    "ai_context_id_invalid",
                    f"{field_name} must be a string of at most 64 characters.",
                    422,
                    retryable=False,
                    field_errors={field_name: ["Must be a string of at most 64 characters."]},
                )
            context_ids[field_name] = raw_context_id.strip() or None
        project_id = context_ids["_calendarProjectId"]
        thread_id = context_ids["_calendarThreadId"]
        control = GoalControlService(
            engine=state.engine,
            user_id=principal.user_id,
            app_mode=state.mode,
            client_timezone=principal.client_timezone,
        )
        usage = control.usage_summary(project_id)
        if usage["degraded"]:
            return error_response("ai_monthly_hard_limit", "The monthly AI hard limit has been reached. Rule-based planning remains available.", 429)
        limit_kind = "planning" if operation in AI_PLANNING_OPERATIONS else "review" if operation == "review" else "route" if operation == "route" else "routine"
        operation_limits = usage["limits"][limit_kind]
        estimated_input_tokens = max(1, len(json.dumps(payload, ensure_ascii=False)) // 4)
        if estimated_input_tokens > int(operation_limits["input"]):
            return error_response("ai_context_limit", "The compressed AI context exceeds the active usage mode limit.", 413)
        fallback_model = os.getenv("DEEPSEEK_MODEL", DEEPSEEK_DEFAULT_MODEL)
        model_env = "AI_PLANNING_MODEL" if operation in AI_PLANNING_OPERATIONS else "AI_ROUTINE_MODEL"
        allowed_model = os.getenv(model_env, fallback_model).strip() or fallback_model
        requested_output = payload.get("max_tokens", operation_limits["output"])
        if (
            isinstance(requested_output, bool)
            or not isinstance(requested_output, int)
            or requested_output <= 0
        ):
            return error_response(
                "ai_max_tokens_invalid",
                "max_tokens must be a positive integer.",
                422,
                retryable=False,
                field_errors={"max_tokens": ["Must be a positive integer."]},
            )
        clean_payload = {
            **{key: value for key, value in payload.items() if not key.startswith("_calendar")},
            "model": allowed_model,
            "max_tokens": min(max(1, requested_output), int(operation_limits["output"])),
        }
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                upstream = await client.post(
                    f"{base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json=clean_payload,
                )
        except httpx.TimeoutException:
            control.record_usage(
                operation=operation,
                model=allowed_model,
                usage_mode=usage["effective_mode"],
                input_tokens=estimated_input_tokens,
                output_tokens=0,
                status="upstream_timeout",
                estimated=True,
                project_id=project_id,
                thread_id=thread_id,
            )
            return error_response(
                "ai_upstream_timeout",
                "The AI provider timed out. Try again shortly or check the configured provider endpoint.",
                504,
            )
        except httpx.RequestError:
            control.record_usage(
                operation=operation,
                model=allowed_model,
                usage_mode=usage["effective_mode"],
                input_tokens=estimated_input_tokens,
                output_tokens=0,
                status="upstream_unreachable",
                estimated=True,
                project_id=project_id,
                thread_id=thread_id,
            )
            return error_response(
                "ai_upstream_unreachable",
                "The Calendar API could not reach the AI provider. Check the server network and AI endpoint configuration.",
                502,
            )
        content_type = upstream.headers.get("content-type", "").lower()
        upstream_payload: dict[str, Any] | None = None
        if upstream.content and "json" in content_type:
            try:
                parsed_upstream = upstream.json()
                if isinstance(parsed_upstream, dict):
                    upstream_payload = parsed_upstream
            except ValueError:
                upstream_payload = None
        upstream_usage = upstream_payload.get("usage", {}) if upstream_payload else {}
        choices = upstream_payload.get("choices") if upstream_payload else None
        first_choice = choices[0] if isinstance(choices, list) and choices and isinstance(choices[0], dict) else None
        finish_reason = str(first_choice.get("finish_reason") or "") if first_choice else ""
        valid_envelope = bool(
            first_choice
            and isinstance(first_choice.get("message"), dict)
            and isinstance(first_choice["message"].get("content"), str)
        )
        response_status = "success" if upstream.is_success and valid_envelope else "upstream_error"
        if finish_reason == "length":
            response_status = "output_truncated"
        control.record_usage(
            operation=operation,
            model=allowed_model,
            usage_mode=usage["effective_mode"],
            input_tokens=int(upstream_usage.get("prompt_tokens") or estimated_input_tokens),
            output_tokens=int(upstream_usage.get("completion_tokens") or 0),
            status=response_status,
            estimated=not bool(upstream_usage),
            project_id=project_id,
            thread_id=thread_id,
        )
        if not upstream.is_success:
            return error_response(
                "ai_upstream_error",
                "The AI provider rejected the request. Check the provider configuration or try again later.",
                502,
                retryable=True,
            )
        if upstream_payload is None or not valid_envelope:
            return error_response(
                "ai_upstream_invalid_response",
                "The AI provider returned a response that was not valid JSON.",
                502,
                retryable=True,
            )
        if finish_reason == "length":
            return error_response(
                "ai_output_truncated",
                "The AI response reached the active output limit before completing its JSON. Shorten the request or explicitly regenerate it.",
                422,
                retryable=True,
                details={"operation": operation, "outputLimit": clean_payload["max_tokens"]},
            )
        return JSONResponse(content=upstream_payload, status_code=upstream.status_code)

    return api


def principal_payload(principal: Principal | None) -> dict[str, Any] | None:
    if principal is None:
        return None
    return {"id": principal.user_id, "username": principal.username, "role": principal.role}


def error_response(
    code: str,
    message: str,
    status: int,
    *,
    retryable: bool | None = None,
    details: dict[str, Any] | None = None,
    field_errors: dict[str, list[str]] | None = None,
    retry_after_seconds: int | None = None,
) -> JSONResponse:
    error = {
        "code": code,
        "message": message,
        "recoverable": status < 500,
        "retryable": status < 500 if retryable is None else retryable,
    }
    if details:
        error["details"] = details
    if field_errors:
        error["fieldErrors"] = field_errors
    if retry_after_seconds is not None:
        error["retryAfterSeconds"] = max(0, retry_after_seconds)
    return JSONResponse(
        status_code=status,
        content={
            "success": False,
            "error": error,
        },
    )


def clean_key_error(exc: Exception) -> str:
    return str(exc).strip("'")


def constant_time_equal(first: str, second: str) -> bool:
    import secrets

    return bool(first and second and secrets.compare_digest(first, second))


def cookie_secure(mode: str | None = None) -> bool:
    explicit = os.getenv("CALENDAR_COOKIE_SECURE", "").strip().lower()
    if explicit:
        return explicit in {"1", "true", "yes"}
    return app_mode(mode) == "server"


def login_client_ip(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    trusted = {
        value.strip()
        for value in os.getenv("AUTH_TRUSTED_PROXIES", "").split(",")
        if value.strip()
    }
    candidate = peer
    if peer in trusted:
        forwarded = request.headers.get("X-Forwarded-For", "").split(",", 1)[0].strip()
        if forwarded:
            candidate = forwarded
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return "unknown"


def backend_config_status(mode: str) -> dict[str, Any]:
    return {
        "success": True,
        "deepseek": {
            "configured": bool(local_ai_key() if mode == "desktop" else os.getenv("DEEPSEEK_API_KEY", "").strip()),
            "base_url": os.getenv("DEEPSEEK_BASE_URL", DEEPSEEK_DEFAULT_BASE_URL),
            "model": os.getenv("DEEPSEEK_MODEL", DEEPSEEK_DEFAULT_MODEL),
        },
        "fridge": {"data_dir": str(fridge_data_dir()) if mode == "desktop" else "server-managed"},
    }


def update_env_file(path: Path, updates: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    remaining = dict(updates)
    next_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            next_lines.append(line)
            continue
        key, _value = line.split("=", 1)
        normalized_key = key.strip()
        if normalized_key in remaining:
            next_lines.append(f"{normalized_key}={remaining.pop(normalized_key)}")
        else:
            next_lines.append(line)
    for key, value in remaining.items():
        next_lines.append(f"{key}={value}")
    path.write_text("\n".join(next_lines).rstrip() + "\n", encoding="utf-8")


def local_ai_key() -> str:
    try:
        import keyring

        return keyring.get_password("CalendarApp", "deepseek-api-key") or os.getenv("DEEPSEEK_API_KEY", "").strip()
    except Exception:
        return os.getenv("DEEPSEEK_API_KEY", "").strip()


def set_local_ai_key(value: str) -> None:
    try:
        import keyring

        keyring.set_password("CalendarApp", "deepseek-api-key", value)
    except Exception as exc:
        raise InvalidRequestError(f"Unable to save API key in Windows Credential Manager: {exc}") from exc


def build_receipt_analyzer(mode: str) -> ReceiptAnalyzer:
    if mode != 'desktop':
        return ReceiptAnalyzer(runtime_cache_enabled=False)
    api_key = local_ai_key()
    if not api_key:
        return ReceiptAnalyzer(runtime_cache_enabled=True)
    return ReceiptAnalyzer(
        deepseek_client=DeepSeekClient(
            DeepSeekConfig(
                api_key=api_key,
                base_url=os.getenv('DEEPSEEK_BASE_URL', DEEPSEEK_DEFAULT_BASE_URL).rstrip('/'),
                model=os.getenv('DEEPSEEK_MODEL', DEEPSEEK_DEFAULT_MODEL),
            )
        ),
        runtime_cache_enabled=True,
    )


def enforce_ai_limit(state: ServerState, user_id: str) -> None:
    limit = int(os.getenv("AI_REQUESTS_PER_MINUTE", "30"))
    now = time.monotonic()
    bucket = state.ai_requests[user_id]
    while bucket and bucket[0] < now - 60:
        bucket.popleft()
    if len(bucket) >= limit:
        raise AuthError("ai_rate_limited", "AI request limit exceeded. Try again shortly.", 429)
    bucket.append(now)


def available_port(requested: int) -> int:
    if requested:
        return requested
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def process_is_running(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        kernel32 = ctypes.windll.kernel32
        kernel32.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
        kernel32.OpenProcess.restype = ctypes.c_void_p
        kernel32.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
        kernel32.WaitForSingleObject.restype = ctypes.c_ulong
        kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
        handle = kernel32.OpenProcess(0x00100000, False, pid)
        if not handle:
            return False
        try:
            return kernel32.WaitForSingleObject(handle, 0) == 0x00000102
        finally:
            kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ValueError):
        return False


def exit_when_parent_stops(parent_pid: int) -> None:
    while process_is_running(parent_pid):
        time.sleep(0.5)
    os._exit(0)


def run(
    host: str = "127.0.0.1",
    port: int = 8787,
    *,
    mode: str | None = None,
    launch_token: str = "",
    sidecar: bool = False,
) -> None:
    load_env_files(*project_env_paths(), PROJECT_ROOT / ".env")
    resolved_mode = app_mode(mode)
    if resolved_mode == "desktop" and host not in {"127.0.0.1", "localhost"}:
        raise RuntimeError("Desktop mode may only bind to a loopback host.")
    if sidecar and resolved_mode != "desktop":
        raise RuntimeError("Sidecar mode is only available in desktop mode.")
    if sidecar:
        launch_token = secrets.token_urlsafe(48)
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(("127.0.0.1", port))
        listener.listen(2048)
        actual_port = int(listener.getsockname()[1])
        try:
            api = create_app(mode=resolved_mode, launch_token=launch_token)
        except DesktopMigrationError as error:
            listener.close()
            print(
                "CALENDAR_BACKEND_RECOVERY="
                + json.dumps(error.recovery_payload(), separators=(",", ":")),
                flush=True,
            )
            return
        print(
            "CALENDAR_BACKEND_READY="
            + json.dumps({"port": actual_port, "launchToken": launch_token}, separators=(",", ":")),
            flush=True,
        )
        config = uvicorn.Config(
            api,
            log_level=os.getenv("CALENDAR_LOG_LEVEL", "warning"),
            log_config=None,
            access_log=False,
        )
        uvicorn.Server(config).run(sockets=[listener])
        return
    actual_port = available_port(port)
    api = create_app(mode=resolved_mode, launch_token=launch_token)
    windowed = sys.stdout is None or sys.stderr is None
    if not windowed:
        print(f"CALENDAR_BACKEND_READY={actual_port}", flush=True)
    uvicorn.run(
        api,
        host=host,
        port=actual_port,
        log_level=os.getenv("CALENDAR_LOG_LEVEL", "info"),
        log_config=None if windowed else uvicorn.config.LOGGING_CONFIG,
        access_log=not windowed,
    )


def cli_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the Calendar App API.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--mode", choices=["server", "desktop"], default=None)
    parser.add_argument("--launch-token", default="")
    parser.add_argument("--sidecar", action="store_true")
    parser.add_argument("--parent-pid", type=int, default=0)
    parser.add_argument("--data-dir", default="")
    parser.add_argument("--tesseract-dir", default="")
    return parser


def main(argv: list[str] | None = None) -> None:
    args = cli_parser().parse_args(argv)
    if args.data_dir:
        os.environ["CALENDAR_DATA_DIR"] = args.data_dir
        os.environ["FRIDGE_DATA_DIR"] = args.data_dir
    if args.tesseract_dir:
        tesseract_dir = Path(args.tesseract_dir).resolve()
        os.environ["CALENDAR_TESSERACT_EXE"] = str(tesseract_dir / "tesseract.exe")
        os.environ["TESSDATA_PREFIX"] = str(tesseract_dir / "tessdata")
    if args.mode:
        os.environ["CALENDAR_APP_MODE"] = args.mode
    if args.parent_pid:
        threading.Thread(
            target=exit_when_parent_stops,
            args=(args.parent_pid,),
            daemon=True,
            name="calendar-parent-watchdog",
        ).start()
    run(args.host, args.port, mode=args.mode, launch_token=args.launch_token, sidecar=args.sidecar)


if __name__ == "__main__":
    main()
