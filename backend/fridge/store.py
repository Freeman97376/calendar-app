from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any

from .config import fridge_data_dir
from .models import FridgeInventoryItem, StorageType, utc_now_iso
from .receipt_parser import normalize_item_name


class InventoryItemNotFoundError(KeyError):
    pass


class FridgeInventoryStore:
    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path) if path else fridge_data_dir() / "fridge_inventory.json"
        self._data: dict[str, Any] = {"items": []}
        self.load()

    def load(self) -> None:
        if not self.path.exists():
            self._data = {"items": []}
            return
        with self.path.open("r", encoding="utf-8") as file:
            loaded = json.load(file)
        self._data = loaded if isinstance(loaded, dict) else {"items": []}
        if not isinstance(self._data.get("items"), list):
            self._data["items"] = []

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.path.with_suffix(".tmp")
        with tmp_path.open("w", encoding="utf-8") as file:
            json.dump(self._data, file, indent=2, sort_keys=True)
        os.replace(tmp_path, self.path)

    def list_items(self) -> list[dict[str, Any]]:
        return list(self._data["items"])

    def create_item(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utc_now_iso()
        item_name = str(payload.get("item_name", "")).strip()
        if not item_name:
            raise ValueError("item_name is required")

        storage_type = str(payload.get("storage_type", "unknown"))
        if storage_type not in {"fridge", "freezer", "room_temp", "unknown"}:
            storage_type = "unknown"

        item = FridgeInventoryItem(
            item_id=str(payload.get("item_id") or f"fridge_{uuid.uuid4().hex}"),
            item_name=item_name,
            normalized_name=normalize_item_name(str(payload.get("normalized_name") or item_name)),
            category=str(payload.get("category", "unknown")),
            storage_type=storage_type,  # type: ignore[arg-type]
            purchase_date=str(payload.get("purchase_date", "")),
            estimated_expiration_date=_optional_str(payload.get("estimated_expiration_date")),
            estimated_shelf_life_days=_optional_int(payload.get("estimated_shelf_life_days")),
            confidence=float(payload.get("confidence", 0.5)),
            source=str(payload.get("source", "manual")),
            receipt_id=_optional_str(payload.get("receipt_id")),
            quantity=_optional_str(payload.get("quantity")),
            notes=str(payload.get("notes", "")),
            created_at=now,
            updated_at=now,
        ).to_dict()

        self._data["items"].append(item)
        self.save()
        return item

    def update_item(self, item_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        items = self._data["items"]
        for index, item in enumerate(items):
            if item.get("item_id") != item_id:
                continue

            updated = dict(item)
            for key, value in patch.items():
                if key in {"item_id", "created_at"}:
                    continue
                updated[key] = value
            if "item_name" in updated:
                updated["normalized_name"] = normalize_item_name(
                    str(updated.get("normalized_name") or updated["item_name"])
                )
            updated["updated_at"] = utc_now_iso()
            items[index] = updated
            self.save()
            return updated

        raise InventoryItemNotFoundError(item_id)

    def delete_item(self, item_id: str) -> bool:
        items = self._data["items"]
        next_items = [item for item in items if item.get("item_id") != item_id]
        if len(next_items) == len(items):
            raise InventoryItemNotFoundError(item_id)
        self._data["items"] = next_items
        self.save()
        return True


def _optional_str(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _optional_int(value: object) -> int | None:
    if value is None or value == "":
        return None
    return int(value)

