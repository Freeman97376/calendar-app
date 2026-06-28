from __future__ import annotations

import json
import os
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date
from typing import Any

from .models import ShelfLifePrediction, StorageType, expiration_date_for
from .receipt_parser import normalize_item_name

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"


class DeepSeekError(RuntimeError):
    pass


class MissingDeepSeekAPIKeyError(DeepSeekError):
    pass


class DeepSeekTimeoutError(DeepSeekError):
    pass


class DeepSeekRateLimitError(DeepSeekError):
    pass


class DeepSeekInvalidResponseError(DeepSeekError):
    pass


class DeepSeekRequestError(DeepSeekError):
    pass


@dataclass(frozen=True)
class DeepSeekConfig:
    api_key: str
    base_url: str = DEFAULT_BASE_URL
    model: str = DEFAULT_MODEL
    timeout_seconds: float = 30.0

    @classmethod
    def from_env(cls) -> "DeepSeekConfig":
        api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
        if not api_key:
            raise MissingDeepSeekAPIKeyError("DEEPSEEK_API_KEY is not configured")
        return cls(
            api_key=api_key,
            base_url=os.getenv("DEEPSEEK_BASE_URL", DEFAULT_BASE_URL).rstrip("/"),
            model=os.getenv("DEEPSEEK_MODEL", DEFAULT_MODEL),
        )


SYSTEM_PROMPT = """You extract refrigerated grocery items from OCR text.
Return strict JSON only. Do not wrap JSON in markdown.
Do not invent items that are not present in the receipt text.
Filter out non-food, shelf-stable, cleaning, toiletry, and household goods.
Mark uncertain items with low confidence.
Estimate shelf life from the purchase date for fridge/freezer storage."""


def build_deepseek_prompt(receipt_text: str, candidate_items: list[str], purchase_date: date) -> str:
    return "\n".join(
        [
            "Analyze this grocery receipt OCR text.",
            f"Purchase date: {purchase_date.isoformat()}",
            "Candidate local parser items:",
            json.dumps(candidate_items, ensure_ascii=True),
            "OCR text:",
            receipt_text,
            "Return JSON with this exact shape:",
            json.dumps(
                {
                    "items": [
                        {
                            "item_name": "Organic Milk",
                            "normalized_name": "milk",
                            "category": "dairy",
                            "storage_type": "fridge",
                            "estimated_shelf_life_days": 7,
                            "confidence": 0.82,
                            "notes": "Reason for estimate.",
                        }
                    ]
                },
                ensure_ascii=True,
            ),
        ]
    )


def _strip_json_wrappers(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = [line for line in stripped.splitlines() if not line.strip().startswith("```")]
        return "\n".join(lines).strip()
    return stripped


def parse_deepseek_items_response(content: str, purchase_date: date) -> list[ShelfLifePrediction]:
    try:
        payload = json.loads(_strip_json_wrappers(content))
    except json.JSONDecodeError as exc:
        raise DeepSeekInvalidResponseError("DeepSeek returned malformed JSON") from exc

    raw_items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(raw_items, list):
        raise DeepSeekInvalidResponseError("DeepSeek JSON must include an items array")

    predictions: list[ShelfLifePrediction] = []
    for index, item in enumerate(raw_items):
        if not isinstance(item, dict):
            raise DeepSeekInvalidResponseError(f"DeepSeek item {index} is not an object")

        item_name = str(item.get("item_name", "")).strip()
        normalized_name = normalize_item_name(str(item.get("normalized_name") or item_name))
        category = str(item.get("category", "unknown")).strip() or "unknown"
        storage_type = str(item.get("storage_type", "unknown")).strip()
        if storage_type not in {"fridge", "freezer", "room_temp", "unknown"}:
            storage_type = "unknown"

        raw_days = item.get("estimated_shelf_life_days")
        shelf_life_days = int(raw_days) if isinstance(raw_days, int | float) and raw_days >= 0 else None
        confidence = float(item.get("confidence", 0.4))
        notes = str(item.get("notes", "")).strip()

        if not item_name or not normalized_name:
            raise DeepSeekInvalidResponseError(f"DeepSeek item {index} is missing an item name")

        predictions.append(
            ShelfLifePrediction(
                item_name=item_name,
                normalized_name=normalized_name,
                category=category,
                storage_type=storage_type,  # type: ignore[arg-type]
                estimated_shelf_life_days=shelf_life_days,
                purchase_date=purchase_date.isoformat(),
                estimated_expiration_date=expiration_date_for(purchase_date, shelf_life_days),
                confidence=max(0.0, min(1.0, confidence)),
                source="deepseek",
                notes=notes or "DeepSeek shelf-life estimate from receipt OCR text.",
            )
        )

    return predictions


class DeepSeekClient:
    def __init__(self, config: DeepSeekConfig | None = None) -> None:
        self.config = config or DeepSeekConfig.from_env()

    def extract_fridge_items(
        self,
        receipt_text: str,
        candidate_items: list[str],
        purchase_date: date,
    ) -> list[ShelfLifePrediction]:
        prompt = build_deepseek_prompt(receipt_text, candidate_items, purchase_date)
        payload = {
            "model": self.config.model,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        }
        response = self._post_json("/v1/chat/completions", payload)
        try:
            content = response["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise DeepSeekInvalidResponseError("DeepSeek response missing message content") from exc
        return parse_deepseek_items_response(str(content), purchase_date)

    def _post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.config.base_url.rstrip('/')}{path}"
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as response:
                raw_body = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                raise DeepSeekRateLimitError("DeepSeek rate limit reached") from exc
            raise DeepSeekRequestError(f"DeepSeek request failed with status {exc.code}") from exc
        except (TimeoutError, socket.timeout) as exc:
            raise DeepSeekTimeoutError("DeepSeek request timed out") from exc
        except urllib.error.URLError as exc:
            raise DeepSeekRequestError(f"DeepSeek request failed: {exc.reason}") from exc

        try:
            parsed = json.loads(raw_body)
        except json.JSONDecodeError as exc:
            raise DeepSeekInvalidResponseError("DeepSeek HTTP response was not JSON") from exc
        if not isinstance(parsed, dict):
            raise DeepSeekInvalidResponseError("DeepSeek HTTP response JSON was not an object")
        return parsed

