from __future__ import annotations

import hashlib
import os
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from sqlalchemy import delete, select
from sqlalchemy.engine import Engine

from .database import (
    AuthThrottleRecord,
    EventTypeRecord,
    LOCAL_USER_ID,
    SessionRecord,
    UserPreferenceRecord,
    UserRecord,
    create_session_factory,
    initialize_schema,
)


USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,50}$")
PASSWORD_MIN_LENGTH = 12
MAX_FAILURES = 5
LOCK_MINUTES = 15
SESSION_DAYS = 7


class AuthError(ValueError):
    def __init__(self, code: str, message: str, status: int = 400, *, retry_after: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.status = status
        self.retry_after = retry_after


@dataclass(frozen=True)
class Principal:
    user_id: str
    username: str
    role: str
    csrf_token: str = ""
    session_id: str = ""


@dataclass(frozen=True)
class LoginResult:
    principal: Principal
    session_token: str
    csrf_token: str
    expires_at: str


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_iso(value: datetime | None = None) -> str:
    return (value or utc_now()).isoformat().replace("+00:00", "Z")


def parse_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def public_user(user: UserRecord) -> dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "isActive": bool(user.is_active),
        "lastLoginAt": user.last_login_at,
        "createdAt": user.created_at,
        "updatedAt": user.updated_at,
    }


class AuthService:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine
        initialize_schema(engine)
        self.session_factory = create_session_factory(engine)
        self.password_hasher = PasswordHasher()
        self._dummy_password_hash = self.password_hasher.hash("calendar-dummy-password")

    def normalize_username(self, username: str) -> str:
        normalized = username.strip().lower()
        if not USERNAME_RE.fullmatch(normalized):
            raise AuthError(
                "invalid_username",
                "Username must be 3-50 characters using lowercase letters, numbers, dot, underscore, or hyphen.",
            )
        return normalized

    def validate_password(self, password: str) -> None:
        if len(password) < PASSWORD_MIN_LENGTH:
            raise AuthError(
                "weak_password",
                f"Password must contain at least {PASSWORD_MIN_LENGTH} characters.",
            )
        if len(password) > 256:
            raise AuthError("invalid_password", "Password is too long.")

    def create_user(self, username: str, password: str, *, admin: bool = False) -> dict[str, Any]:
        normalized = self.normalize_username(username)
        self.validate_password(password)
        now = utc_iso()
        with self.session_factory.begin() as session:
            existing = session.scalar(select(UserRecord).where(UserRecord.username == normalized))
            if existing is not None:
                raise AuthError("username_exists", "Username already exists.", 409)
            user = UserRecord(
                id=str(uuid.uuid4()),
                username=normalized,
                password_hash=self.password_hasher.hash(password),
                role="admin" if admin else "user",
                is_active=True,
                failed_login_count=0,
                created_at=now,
                updated_at=now,
            )
            session.add(user)
            session.add(
                UserPreferenceRecord(
                    user_id=user.id,
                    preferences_json={},
                    created_at=now,
                    updated_at=now,
                )
            )
            session.add(
                EventTypeRecord(
                    id="general",
                    user_id=user.id,
                    label="General",
                    color="#047857",
                    applies_to="both",
                    is_archived=False,
                    created_at=now,
                    updated_at=now,
                )
            )
        return public_user(user)

    def ensure_desktop_user(self) -> dict[str, Any]:
        now = utc_iso()
        with self.session_factory.begin() as session:
            user = session.get(UserRecord, LOCAL_USER_ID)
            if user is None:
                user = UserRecord(
                    id=LOCAL_USER_ID,
                    username="local",
                    password_hash="",
                    role="admin",
                    is_active=True,
                    failed_login_count=0,
                    created_at=now,
                    updated_at=now,
                )
                session.add(user)
                session.add(
                    UserPreferenceRecord(
                        user_id=LOCAL_USER_ID,
                        preferences_json={},
                        created_at=now,
                        updated_at=now,
                    )
                )
                session.add(
                    EventTypeRecord(
                        id="general",
                        user_id=LOCAL_USER_ID,
                        label="General",
                        color="#047857",
                        applies_to="both",
                        is_archived=False,
                        created_at=now,
                        updated_at=now,
                    )
                )
        return public_user(user)

    def login(self, username: str, password: str, *, client_ip: str = "unknown") -> LoginResult:
        normalized = username.strip().lower()
        self._enforce_login_rate_limit(client_ip, normalized)
        now = utc_now()
        with self.session_factory() as session:
            user = session.scalar(select(UserRecord).where(UserRecord.username == normalized))
            if user is None:
                self._dummy_verify(password)
                raise AuthError("invalid_credentials", "Invalid username or password.", 401)
            if not user.is_active:
                raise AuthError("account_disabled", "Account is disabled.", 403)
            locked_until = parse_utc(user.locked_until)
            if locked_until and locked_until > now:
                raise AuthError("account_locked", "Account is temporarily locked.", 423)

            try:
                verified = self.password_hasher.verify(user.password_hash, password)
            except (VerifyMismatchError, InvalidHashError):
                verified = False
            if not verified:
                user.failed_login_count += 1
                if user.failed_login_count >= MAX_FAILURES:
                    user.locked_until = utc_iso(now + timedelta(minutes=LOCK_MINUTES))
                    user.failed_login_count = 0
                user.updated_at = utc_iso(now)
                session.commit()
                raise AuthError("invalid_credentials", "Invalid username or password.", 401)

            if self.password_hasher.check_needs_rehash(user.password_hash):
                user.password_hash = self.password_hasher.hash(password)
            user.failed_login_count = 0
            user.locked_until = None
            user.last_login_at = utc_iso(now)
            user.updated_at = utc_iso(now)

            raw_token = secrets.token_urlsafe(48)
            csrf_token = secrets.token_urlsafe(32)
            session_id = str(uuid.uuid4())
            expires_at = utc_iso(now + timedelta(days=SESSION_DAYS))
            session.add(
                SessionRecord(
                    id=session_id,
                    user_id=user.id,
                    token_hash=hash_secret(raw_token),
                    csrf_hash=hash_secret(csrf_token),
                    expires_at=expires_at,
                    created_at=utc_iso(now),
                    last_seen_at=utc_iso(now),
                )
            )
            principal = Principal(user.id, user.username, user.role, csrf_token, session_id)
            session.execute(
                delete(AuthThrottleRecord).where(
                    AuthThrottleRecord.scope == "username",
                    AuthThrottleRecord.key_hash == hash_secret(normalized),
                )
            )
            session.commit()
        return LoginResult(principal, raw_token, csrf_token, expires_at)

    def authenticate(self, raw_token: str, csrf_token: str = "") -> Principal:
        if not raw_token:
            raise AuthError("authentication_required", "Authentication is required.", 401)
        now = utc_now()
        with self.session_factory.begin() as session:
            record = session.scalar(
                select(SessionRecord).where(
                    SessionRecord.token_hash == hash_secret(raw_token),
                    SessionRecord.revoked_at.is_(None),
                )
            )
            if record is None or (parse_utc(record.expires_at) or now) <= now:
                raise AuthError("invalid_session", "Session is invalid or expired.", 401)
            user = session.get(UserRecord, record.user_id)
            if user is None or not user.is_active:
                raise AuthError("account_disabled", "Account is disabled.", 403)
            record.last_seen_at = utc_iso(now)
            return Principal(user.id, user.username, user.role, csrf_token, record.id)

    def validate_csrf(self, session_id: str, csrf_token: str) -> None:
        if not csrf_token:
            raise AuthError("csrf_required", "CSRF token is required.", 403)
        with self.session_factory() as session:
            record = session.get(SessionRecord, session_id)
            if record is None or not secrets.compare_digest(record.csrf_hash, hash_secret(csrf_token)):
                raise AuthError("csrf_invalid", "CSRF token is invalid.", 403)

    def logout(self, raw_token: str) -> None:
        if not raw_token:
            return
        with self.session_factory.begin() as session:
            record = session.scalar(
                select(SessionRecord).where(SessionRecord.token_hash == hash_secret(raw_token))
            )
            if record is not None and record.revoked_at is None:
                record.revoked_at = utc_iso()

    def list_users(self) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            users = session.scalars(
                select(UserRecord)
                .where(UserRecord.id != LOCAL_USER_ID)
                .order_by(UserRecord.username.asc())
            ).all()
            return [public_user(user) for user in users]

    def get_user_by_username(self, username: str) -> UserRecord:
        normalized = username.strip().lower()
        with self.session_factory() as session:
            user = session.scalar(select(UserRecord).where(UserRecord.username == normalized))
            if user is None:
                raise AuthError("user_not_found", "User not found.", 404)
            session.expunge(user)
            return user

    def set_password(self, username: str, password: str) -> None:
        self.validate_password(password)
        normalized = username.strip().lower()
        with self.session_factory.begin() as session:
            user = session.scalar(select(UserRecord).where(UserRecord.username == normalized))
            if user is None:
                raise AuthError("user_not_found", "User not found.", 404)
            user.password_hash = self.password_hasher.hash(password)
            user.updated_at = utc_iso()
            session.execute(delete(SessionRecord).where(SessionRecord.user_id == user.id))

    def set_active(self, username: str, active: bool) -> None:
        normalized = username.strip().lower()
        with self.session_factory.begin() as session:
            user = session.scalar(select(UserRecord).where(UserRecord.username == normalized))
            if user is None:
                raise AuthError("user_not_found", "User not found.", 404)
            user.is_active = active
            user.updated_at = utc_iso()
            if not active:
                session.execute(delete(SessionRecord).where(SessionRecord.user_id == user.id))

    def unlock(self, username: str) -> None:
        normalized = username.strip().lower()
        with self.session_factory.begin() as session:
            user = session.scalar(select(UserRecord).where(UserRecord.username == normalized))
            if user is None:
                raise AuthError("user_not_found", "User not found.", 404)
            user.failed_login_count = 0
            user.locked_until = None
            user.updated_at = utc_iso()

    def _dummy_verify(self, password: str) -> None:
        try:
            self.password_hasher.verify(self._dummy_password_hash, password)
        except (VerifyMismatchError, InvalidHashError):
            pass

    def _enforce_login_rate_limit(self, client_ip: str, normalized_username: str) -> None:
        now = utc_now()
        window_seconds = max(60, int(os.getenv("AUTH_LOGIN_WINDOW_SECONDS", "900")))
        limits = {
            "ip": max(1, int(os.getenv("AUTH_LOGIN_IP_MAX_ATTEMPTS", "30"))),
            "username": max(1, int(os.getenv("AUTH_LOGIN_USERNAME_MAX_ATTEMPTS", "10"))),
        }
        keys = {"ip": client_ip.strip() or "unknown", "username": normalized_username[:256]}
        rate_error: AuthError | None = None
        with self.session_factory.begin() as session:
            for scope, raw_key in keys.items():
                key_hash = hash_secret(raw_key)
                record = session.scalar(
                    select(AuthThrottleRecord).where(
                        AuthThrottleRecord.scope == scope,
                        AuthThrottleRecord.key_hash == key_hash,
                    )
                )
                if record is None:
                    record = AuthThrottleRecord(
                        scope=scope,
                        key_hash=key_hash,
                        attempts=0,
                        window_started_at=utc_iso(now),
                        blocked_until=None,
                        updated_at=utc_iso(now),
                    )
                    session.add(record)
                blocked_until = parse_utc(record.blocked_until)
                if blocked_until and blocked_until > now:
                    retry_after = max(1, int((blocked_until - now).total_seconds()))
                    rate_error = AuthError(
                        "login_rate_limited",
                        "Too many sign-in attempts. Try again later.",
                        429,
                        retry_after=retry_after,
                    )
                    break
                window_started = parse_utc(record.window_started_at) or now
                if window_started <= now - timedelta(seconds=window_seconds):
                    record.attempts = 0
                    record.window_started_at = utc_iso(now)
                    record.blocked_until = None
                record.attempts += 1
                record.updated_at = utc_iso(now)
                if record.attempts > limits[scope]:
                    record.blocked_until = utc_iso(now + timedelta(seconds=window_seconds))
                    rate_error = AuthError(
                        "login_rate_limited",
                        "Too many sign-in attempts. Try again later.",
                        429,
                        retry_after=window_seconds,
                    )
                    break
        if rate_error is not None:
            raise rate_error
