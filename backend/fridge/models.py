from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Literal

StorageType = Literal["fridge", "freezer", "room_temp", "unknown"]
PredictionSource = Literal["local_cache", "local_rule", "deepseek", "unknown"]
ErrorCode = Literal[
    'ai_monthly_hard_limit',
    "invalid_image",
    "invalid_request",
    "ocr_unavailable",
    "ocr_empty_result",
    "deepseek_missing_api_key",
    "deepseek_timeout",
    "deepseek_rate_limit",
    "deepseek_request_failed",
    "deepseek_malformed_response",
    "no_fridge_items_detected",
    "inventory_item_not_found",
]


@dataclass(frozen=True)
class RecoverableError:
    code: ErrorCode
    message: str
    stage: str
    recoverable: bool = True

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class OCRResult:
    text: str
    source: str
    confidence: float

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class FridgeClassification:
    item_name: str
    normalized_name: str
    is_fridge_item: bool
    category: str
    storage_type: StorageType
    confidence: float
    reason: str
    default_shelf_life_days: int | None = None

    def to_candidate(self, source: str = "local_parser") -> "FridgeItemCandidate":
        return FridgeItemCandidate(
            item_name=self.item_name,
            normalized_name=self.normalized_name,
            is_fridge_item=self.is_fridge_item,
            category=self.category,
            storage_type=self.storage_type,
            confidence=self.confidence,
            source=source,
            reason=self.reason,
        )


@dataclass(frozen=True)
class FridgeItemCandidate:
    item_name: str
    normalized_name: str
    is_fridge_item: bool
    category: str
    storage_type: StorageType
    confidence: float
    source: str
    reason: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class ShelfLifePredictionMetadata:
    cache_hit: bool
    cache_match_type: str | None
    cache_layer: str | None
    source: PredictionSource
    confidence: float

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class ShelfLifePrediction:
    item_name: str
    normalized_name: str
    category: str
    storage_type: StorageType
    estimated_shelf_life_days: int | None
    purchase_date: str
    estimated_expiration_date: str | None
    confidence: float
    source: PredictionSource
    notes: str
    cache_hit: bool = False
    cache_match_type: str | None = None
    cache_layer: str | None = None

    def to_dict(self) -> dict[str, object]:
        payload = asdict(self)
        payload["metadata"] = ShelfLifePredictionMetadata(
            cache_hit=self.cache_hit,
            cache_match_type=self.cache_match_type,
            cache_layer=self.cache_layer,
            source=self.source,
            confidence=self.confidence,
        ).to_dict()
        return payload


@dataclass(frozen=True)
class ReminderSuggestion:
    title: str
    date: str
    description: str
    item_id: str | None = None

    def to_dict(self) -> dict[str, object]:
        return {key: value for key, value in asdict(self).items() if value is not None}


@dataclass(frozen=True)
class PipelineStep:
    stage: str
    status: str
    source: str | None = None
    confidence: float | None = None
    message: str | None = None
    cache_hit: bool | None = None

    def to_dict(self) -> dict[str, object]:
        return {key: value for key, value in asdict(self).items() if value is not None}


@dataclass(frozen=True)
class PipelineTrace:
    receipt_id: str
    steps: list[PipelineStep] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        return {"receipt_id": self.receipt_id, "steps": [step.to_dict() for step in self.steps]}


@dataclass(frozen=True)
class ReceiptAnalysisResponse:
    success: bool
    receipt_id: str
    purchase_date: str
    timezone: str | None
    confidence: float
    source: str
    ocr: OCRResult
    candidates: list[FridgeItemCandidate]
    items: list[ShelfLifePrediction]
    reminder_suggestions: list[ReminderSuggestion]
    trace: PipelineTrace
    warnings: list[str]
    recoverable_errors: list[RecoverableError]

    def to_dict(self) -> dict[str, object]:
        return {
            "success": self.success,
            "receipt_id": self.receipt_id,
            "purchase_date": self.purchase_date,
            "timezone": self.timezone,
            "confidence": self.confidence,
            "source": self.source,
            "ocr": self.ocr.to_dict(),
            "candidates": [candidate.to_dict() for candidate in self.candidates],
            "items": [item.to_dict() for item in self.items],
            "reminder_suggestions": [suggestion.to_dict() for suggestion in self.reminder_suggestions],
            "trace": self.trace.to_dict(),
            "warnings": self.warnings,
            "recoverable_errors": [error.to_dict() for error in self.recoverable_errors],
        }


@dataclass(frozen=True)
class FridgeInventoryItem:
    item_id: str
    item_name: str
    normalized_name: str
    category: str
    storage_type: StorageType
    purchase_date: str
    estimated_expiration_date: str | None
    estimated_shelf_life_days: int | None
    confidence: float
    source: str
    receipt_id: str | None = None
    quantity: str | None = None
    notes: str = ""
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def expiration_date_for(purchase_date: date, shelf_life_days: int | None) -> str | None:
    if shelf_life_days is None:
        return None
    return (purchase_date + timedelta(days=shelf_life_days)).isoformat()


def utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
