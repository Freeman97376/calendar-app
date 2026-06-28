from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta, timezone as fixed_timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .deepseek_client import (
    DeepSeekClient,
    DeepSeekError,
    DeepSeekInvalidResponseError,
    DeepSeekRateLimitError,
    DeepSeekRequestError,
    DeepSeekTimeoutError,
    MissingDeepSeekAPIKeyError,
)
from .fridge_classifier import classify_item
from .models import (
    ErrorCode,
    OCRResult,
    PipelineStep,
    PipelineTrace,
    ReceiptAnalysisResponse,
    RecoverableError,
    ReminderSuggestion,
    ShelfLifePrediction,
)
from .receipt_ocr import TesseractOCR, should_use_deepseek_for_ocr
from .receipt_parser import extract_candidate_items, normalize_ocr_text
from .shelf_life_cache import ShelfLifeCache
from .shelf_life_predictor import ShelfLifePredictor

ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "application/octet-stream"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024


class ImageValidationError(ValueError):
    code: ErrorCode = "invalid_image"


class FridgePipelineError(RuntimeError):
    def __init__(self, code: ErrorCode, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


class InvalidRequestError(FridgePipelineError):
    def __init__(self, message: str) -> None:
        super().__init__("invalid_request", message, status=400)


def recoverable_error(code: ErrorCode, message: str, stage: str) -> RecoverableError:
    return RecoverableError(code=code, message=message, stage=stage)


def deepseek_error_code(error: DeepSeekError) -> ErrorCode:
    if isinstance(error, MissingDeepSeekAPIKeyError):
        return "deepseek_missing_api_key"
    if isinstance(error, DeepSeekTimeoutError):
        return "deepseek_timeout"
    if isinstance(error, DeepSeekRateLimitError):
        return "deepseek_rate_limit"
    if isinstance(error, DeepSeekInvalidResponseError):
        return "deepseek_malformed_response"
    if isinstance(error, DeepSeekRequestError):
        return "deepseek_request_failed"
    return "deepseek_request_failed"


def resolve_purchase_date(
    purchase_date: date | None,
    timezone: str | None,
    now: datetime | None = None,
) -> tuple[date, RecoverableError | None]:
    if purchase_date is not None:
        return purchase_date, None

    if timezone:
        try:
            zone = ZoneInfo(timezone)
            zoned_now = (now or datetime.now(zone)).astimezone(zone)
            return zoned_now.date(), None
        except ZoneInfoNotFoundError:
            fallback_zone = fallback_timezone(timezone, now or datetime.now(UTC))
            if fallback_zone is not None:
                return (now or datetime.now(UTC)).astimezone(fallback_zone).date(), None
            return date.today(), recoverable_error(
                "invalid_request",
                f"Unknown timezone '{timezone}', defaulted purchase_date to local server date.",
                "date_resolution",
            )

    return date.today(), None


def fallback_timezone(timezone_name: str, now: datetime) -> fixed_timezone | None:
    if timezone_name.upper() == "UTC":
        return fixed_timezone.utc
    if timezone_name != "America/Los_Angeles":
        return None

    utc_now = now.astimezone(UTC) if now.tzinfo else now.replace(tzinfo=UTC)
    year = utc_now.year
    dst_start = _nth_weekday_utc(year, 3, 6, 2, 10)
    dst_end = _nth_weekday_utc(year, 11, 6, 1, 9)
    offset_hours = -7 if dst_start <= utc_now < dst_end else -8
    return fixed_timezone(timedelta(hours=offset_hours))


def _nth_weekday_utc(year: int, month: int, weekday: int, nth: int, hour: int) -> datetime:
    day = datetime(year, month, 1, hour, tzinfo=UTC)
    days_until_weekday = (weekday - day.weekday()) % 7
    return day + timedelta(days=days_until_weekday + (nth - 1) * 7)


def validate_image_upload(filename: str, content_type: str, image_bytes: bytes) -> str:
    extension = Path(filename or "").suffix.lower().lstrip(".")
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise ImageValidationError("Unsupported image extension. Use jpg, jpeg, png, or webp.")
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise ImageValidationError("Unsupported image content type.")
    if not image_bytes:
        raise ImageValidationError("Image upload is empty.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise ImageValidationError("Image upload exceeds 8 MB.")
    if not _has_supported_magic_header(image_bytes):
        raise ImageValidationError("Image bytes do not look like jpg, png, or webp content.")
    return extension


def _has_supported_magic_header(image_bytes: bytes) -> bool:
    return (
        image_bytes.startswith(b"\xff\xd8\xff")
        or image_bytes.startswith(b"\x89PNG\r\n\x1a\n")
        or (len(image_bytes) >= 12 and image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP")
    )


def default_deepseek_client_or_none() -> DeepSeekClient | None:
    try:
        return DeepSeekClient()
    except MissingDeepSeekAPIKeyError:
        return None


class ReceiptAnalyzer:
    def __init__(
        self,
        ocr_engine: object | None = None,
        deepseek_client: object | None = None,
        cache: ShelfLifeCache | None = None,
    ) -> None:
        self.ocr_engine = ocr_engine or TesseractOCR()
        self.deepseek_client = deepseek_client if deepseek_client is not None else default_deepseek_client_or_none()
        self.cache = cache or ShelfLifeCache()

    def analyze(
        self,
        image_bytes: bytes,
        filename: str,
        content_type: str,
        purchase_date: date | None = None,
        timezone: str | None = None,
        create_reminders: bool = False,
    ) -> dict[str, Any]:
        receipt_id = f"receipt_{uuid.uuid4().hex}"
        warnings: list[str] = []
        recoverable_errors: list[RecoverableError] = []
        trace_steps: list[PipelineStep] = []
        parsed_purchase_date, date_error = resolve_purchase_date(purchase_date, timezone)
        if date_error:
            recoverable_errors.append(date_error)
            warnings.append(date_error.message)

        extension = validate_image_upload(filename, content_type, image_bytes)
        trace_steps.append(PipelineStep(stage="validate_image", status="ok", source=extension))

        ocr_result = self.ocr_engine.extract_text(image_bytes, extension)
        normalized_text = normalize_ocr_text(ocr_result.text)
        if ocr_result.source == "local_ocr_unavailable":
            error = recoverable_error("ocr_unavailable", "Local OCR is unavailable; install Tesseract on PATH.", "ocr")
            recoverable_errors.append(error)
            warnings.append(error.message)
        if not normalized_text:
            error = recoverable_error("ocr_empty_result", "Local OCR returned no useful receipt text.", "ocr")
            recoverable_errors.append(error)
            warnings.append(error.message)
        trace_steps.append(
            PipelineStep(
                stage="ocr",
                status="ok" if normalized_text else "recoverable_error",
                source=ocr_result.source,
                confidence=ocr_result.confidence,
                message=None if normalized_text else "No useful OCR text.",
            )
        )

        candidates = extract_candidate_items(normalized_text)
        classifications = [classify_item(candidate) for candidate in candidates]
        candidate_contract = [classification.to_candidate() for classification in classifications]
        trace_steps.append(
            PipelineStep(
                stage="parse_candidates",
                status="ok",
                source="local_parser",
                confidence=ocr_result.confidence,
                message=f"{len(candidates)} candidate items extracted.",
            )
        )

        predictor = ShelfLifePredictor(self.cache, self.deepseek_client)
        item_map: dict[str, ShelfLifePrediction] = {}

        for classification in classifications:
            if not classification.is_fridge_item:
                continue
            prediction, prediction_warnings = predictor.predict(classification, parsed_purchase_date)
            warnings.extend(prediction_warnings)
            item_map[prediction.normalized_name] = prediction
            trace_steps.append(
                PipelineStep(
                    stage="predict_shelf_life",
                    status="ok",
                    source=prediction.source,
                    confidence=prediction.confidence,
                    cache_hit=prediction.cache_hit,
                    message=prediction.notes,
                )
            )

        needs_deepseek = should_use_deepseek_for_ocr(ocr_result) or any(
            classification.confidence < 0.5 for classification in classifications
        )
        if needs_deepseek:
            if self.deepseek_client is None:
                error = recoverable_error(
                    "deepseek_missing_api_key",
                    "DeepSeek fallback skipped because DEEPSEEK_API_KEY is not configured.",
                    "deepseek",
                )
                recoverable_errors.append(error)
                warnings.append(error.message)
                trace_steps.append(PipelineStep(stage="deepseek", status="skipped", source="deepseek", message=error.message))
            elif not normalized_text:
                error = recoverable_error(
                    "ocr_empty_result",
                    "Local OCR produced no useful text. Image-native DeepSeek fallback requires a vision-capable model.",
                    "deepseek",
                )
                recoverable_errors.append(error)
                warnings.append(error.message)
                trace_steps.append(PipelineStep(stage="deepseek", status="skipped", source="deepseek", message=error.message))
            else:
                try:
                    deepseek_items = self.deepseek_client.extract_fridge_items(
                        normalized_text,
                        candidates,
                        parsed_purchase_date,
                    )
                except DeepSeekError as exc:
                    error = recoverable_error(deepseek_error_code(exc), str(exc), "deepseek")
                    recoverable_errors.append(error)
                    warnings.append(error.message)
                    trace_steps.append(
                        PipelineStep(stage="deepseek", status="recoverable_error", source="deepseek", message=error.message)
                    )
                else:
                    for prediction in deepseek_items:
                        self.cache.upsert_prediction(prediction)
                        existing = item_map.get(prediction.normalized_name)
                        if existing is None or prediction.confidence > existing.confidence:
                            item_map[prediction.normalized_name] = prediction
                    trace_steps.append(
                        PipelineStep(
                            stage="deepseek",
                            status="ok",
                            source="deepseek",
                            message=f"{len(deepseek_items)} fridge items returned.",
                        )
                    )

        if not item_map:
            error = recoverable_error("no_fridge_items_detected", "No fridge or freezer items were detected.", "filter")
            recoverable_errors.append(error)
            warnings.append(error.message)

        reminder_suggestions = [
            build_reminder_suggestion(prediction)
            for prediction in item_map.values()
            if prediction.estimated_expiration_date
        ]
        if create_reminders:
            warnings.append(
                "No backend calendar event creation API was found; returning reminder_suggestions for the frontend."
            )

        items = list(item_map.values())
        confidence = calculate_response_confidence(ocr_result, items)
        source = "deepseek" if any(item.source == "deepseek" for item in items) else ocr_result.source
        return ReceiptAnalysisResponse(
            success=True,
            receipt_id=receipt_id,
            purchase_date=parsed_purchase_date.isoformat(),
            timezone=timezone,
            confidence=confidence,
            source=source,
            ocr=OCRResult(normalized_text, ocr_result.source, ocr_result.confidence),
            candidates=candidate_contract,
            items=items,
            reminder_suggestions=reminder_suggestions,
            trace=PipelineTrace(receipt_id=receipt_id, steps=trace_steps),
            warnings=warnings,
            recoverable_errors=recoverable_errors,
        ).to_dict()


def build_reminder_suggestion(prediction: ShelfLifePrediction) -> ReminderSuggestion:
    return ReminderSuggestion(
        title=f"Use before: {prediction.item_name}",
        date=prediction.estimated_expiration_date or prediction.purchase_date,
        description=(
            f"Receipt item: {prediction.item_name}. "
            f"Estimated shelf life: {prediction.estimated_shelf_life_days} days. "
            f"Confidence: {prediction.confidence:.2f}. Source: {prediction.source}."
        ),
    )


def calculate_response_confidence(ocr_result: OCRResult, items: list[ShelfLifePrediction]) -> float:
    if not items:
        return round(ocr_result.confidence * 0.5, 3)
    item_confidence = sum(item.confidence for item in items) / len(items)
    return round((ocr_result.confidence * 0.35) + (item_confidence * 0.65), 3)
