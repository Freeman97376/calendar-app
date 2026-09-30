"""Write-only personal provider secrets. Never include these in preferences or exports."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

from cryptography.fernet import Fernet, InvalidToken
from pydantic import BaseModel, ConfigDict, SecretStr, field_validator
from sqlalchemy import delete

from .auth import AuthError
from .database import UserAISettingRecord, create_session_factory
from .user_transaction import user_write_transaction

DEEPSEEK_URL = "https://api.deepseek.com"
ModelName = Literal["deepseek-chat", "deepseek-reasoner"]


class PersonalAIUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    apiKey: SecretStr | None = None
    routineModel: ModelName | None = None
    planningModel: ModelName | None = None

    @field_validator("apiKey")
    @classmethod
    def valid_key(cls, value):
        if value is None:
            return value
        key = value.get_secret_value().strip()
        if len(key) > 512 or any(ord(char) < 33 or ord(char) > 126 for char in key):
            raise ValueError("Use an API key of at most 512 printable ASCII characters, without internal whitespace.")
        return SecretStr(key)


class PersonalAIStatus(BaseModel):
    success: Literal[True] = True
    editable: bool
    personalKeyConfigured: bool
    keyConfigured: bool
    source: Literal["personal", "server", "none"]
    baseUrl: str
    routineModel: str
    planningModel: str


@dataclass(frozen=True)
class ProviderSettings:
    api_key: str = field(repr=False)
    base_url: str
    routine_model: str
    planning_model: str


def credential_cipher():
    try:
        return Fernet(os.environ.get("CALENDAR_AI_ENCRYPTION_KEY", "").strip().encode("ascii"))
    except (ValueError, TypeError, UnicodeError):
        raise AuthError("ai_settings_unavailable", "Personal AI settings require server credential storage to be configured.", 503) from None


def credential_storage_ready():
    try:
        credential_cipher()
        return True
    except AuthError:
        return False


def server_provider():
    fallback = os.getenv("DEEPSEEK_MODEL", "deepseek-chat").strip() or "deepseek-chat"
    return ProviderSettings(
        os.getenv("DEEPSEEK_API_KEY", "").strip(),
        os.getenv("DEEPSEEK_BASE_URL", DEEPSEEK_URL).rstrip("/"),
        os.getenv("AI_ROUTINE_MODEL", fallback).strip() or fallback,
        os.getenv("AI_PLANNING_MODEL", fallback).strip() or fallback,
    )


class PersonalAIService:
    def __init__(self, engine, user_id):
        self.session_factory = create_session_factory(engine)
        self.user_id = user_id

    def status(self):
        shared = server_provider()
        with self.session_factory() as session:
            row = session.get(UserAISettingRecord, self.user_id)
            return PersonalAIStatus(
                editable=credential_storage_ready(),
                personalKeyConfigured=row is not None,
                keyConfigured=row is not None or bool(shared.api_key),
                source="personal" if row else "server" if shared.api_key else "none",
                baseUrl=DEEPSEEK_URL if row else shared.base_url,
                routineModel=row.routine_model if row else shared.routine_model,
                planningModel=row.planning_model if row else shared.planning_model,
            )

    def save(self, payload):
        cipher = credential_cipher()
        key = payload.apiKey.get_secret_value() if payload.apiKey else ""
        with user_write_transaction(self.session_factory, self.user_id) as session:
            row = session.get(UserAISettingRecord, self.user_id)
            if row is None and not key:
                raise AuthError("ai_key_required", "Enter your API key before saving personal settings.", 422)
            timestamp = datetime.now(timezone.utc).isoformat()
            if row is None:
                row = UserAISettingRecord(user_id=self.user_id, encrypted_api_key="", routine_model="deepseek-chat", planning_model="deepseek-reasoner", created_at=timestamp, updated_at=timestamp)
                session.add(row)
            if key:
                # Bind the ciphertext to the account as well as authenticating it.
                plaintext = json.dumps({"user_id": self.user_id, "api_key": key}).encode("utf-8")
                row.encrypted_api_key = cipher.encrypt(plaintext).decode("ascii")
            if payload.routineModel is not None:
                row.routine_model = payload.routineModel
            if payload.planningModel is not None:
                row.planning_model = payload.planningModel
            row.updated_at = timestamp
        return self.status()

    def remove(self):
        with user_write_transaction(self.session_factory, self.user_id) as session:
            session.execute(delete(UserAISettingRecord).where(UserAISettingRecord.user_id == self.user_id))
        return self.status()

    def resolve(self):
        with self.session_factory() as session:
            row = session.get(UserAISettingRecord, self.user_id)
            if row is None:
                return server_provider()
            cipher = credential_cipher()
            try:
                decoded = json.loads(cipher.decrypt(row.encrypted_api_key.encode("ascii")))
                if decoded.get("user_id") != self.user_id or not isinstance(decoded.get("api_key"), str) or not decoded["api_key"]:
                    raise ValueError("Invalid credential binding")
            except (InvalidToken, ValueError, TypeError, UnicodeError, AttributeError):
                raise AuthError("ai_key_unavailable", "The saved API key could not be read. Replace it in AI API settings.", 503) from None
            return ProviderSettings(decoded["api_key"], DEEPSEEK_URL, row.routine_model, row.planning_model)
