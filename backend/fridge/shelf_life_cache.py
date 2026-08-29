from __future__ import annotations

import json
import os
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from .config import fridge_data_dir
from .models import ShelfLifePrediction
from .receipt_parser import normalize_item_name

DEFAULT_DEFAULTS_PATH = fridge_data_dir() / "shelf_life_defaults.json"
DEFAULT_CACHE_PATH = fridge_data_dir() / "shelf_life_cache.json"


class ShelfLifeCache:
    def __init__(
        self,
        runtime_path: Path | str | None = None,
        defaults_path: Path | str | None = None,
        *,
        runtime_enabled: bool = True,
    ) -> None:
        self.runtime_path = Path(runtime_path) if runtime_path else fridge_data_dir() / "shelf_life_cache.json"
        self.defaults_path = Path(defaults_path) if defaults_path else fridge_data_dir() / "shelf_life_defaults.json"
        self.runtime_enabled = runtime_enabled
        self.path = self.runtime_path
        self._defaults: dict[str, Any] = {"items": {}}
        self._runtime: dict[str, Any] = {"items": {}}
        self._data: dict[str, Any] = {"items": {}}
        self.load()

    def load(self) -> None:
        self._defaults = self._load_json(self.defaults_path)
        self._runtime = self._load_json(self.runtime_path) if self.runtime_enabled else {'items': {}}
        merged_items = {
            **self._defaults.get("items", {}),
            **self._runtime.get("items", {}),
        }
        self._data = {"items": merged_items}

    def save(self) -> None:
        if not self.runtime_enabled:
            return
        self.runtime_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.runtime_path.with_suffix(".tmp")
        with tmp_path.open("w", encoding="utf-8") as file:
            json.dump(self._runtime, file, indent=2, sort_keys=True)
        os.replace(tmp_path, self.runtime_path)

    def _load_json(self, path: Path) -> dict[str, Any]:
        if not path.exists():
            return {"items": {}}
        with path.open("r", encoding="utf-8") as file:
            loaded = json.load(file)
        data = loaded if isinstance(loaded, dict) else {"items": {}}
        data.setdefault("items", {})
        return data

    def get(self, item_name: str) -> tuple[dict[str, Any], str, str] | None:
        normalized = normalize_item_name(item_name)
        items = self._data.get("items", {})
        if normalized in items:
            return items[normalized], "exact", self._cache_layer_for(normalized)

        best_key = ""
        best_score = 0.0
        for key in items:
            score = SequenceMatcher(None, normalized, key).ratio()
            if score > best_score:
                best_key = key
                best_score = score

        if best_key and best_score >= 0.84:
            return items[best_key], "fuzzy", self._cache_layer_for(best_key)

        return None

    def _cache_layer_for(self, normalized_name: str) -> str:
        if normalized_name in self._runtime.get("items", {}):
            return "runtime"
        if normalized_name in self._defaults.get("items", {}):
            return "defaults"
        return "unknown"

    def upsert_prediction(self, prediction: ShelfLifePrediction) -> None:
        if not self.runtime_enabled or prediction.estimated_shelf_life_days is None:
            return

        normalized = normalize_item_name(prediction.normalized_name or prediction.item_name)
        self._runtime.setdefault("items", {})[normalized] = {
            "category": prediction.category,
            "storage_type": prediction.storage_type,
            "estimated_shelf_life_days": prediction.estimated_shelf_life_days,
            "confidence": prediction.confidence,
            "notes": prediction.notes,
            "source": prediction.source,
        }
        self._data.setdefault("items", {})[normalized] = self._runtime["items"][normalized]
        self.save()
