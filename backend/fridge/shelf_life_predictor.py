from __future__ import annotations

from datetime import date

from .deepseek_client import DeepSeekError
from .models import FridgeClassification, ShelfLifePrediction, expiration_date_for
from .shelf_life_cache import ShelfLifeCache


class ShelfLifePredictor:
    def __init__(self, cache: ShelfLifeCache, deepseek_client: object | None = None) -> None:
        self.cache = cache
        self.deepseek_client = deepseek_client

    def predict(
        self,
        classification: FridgeClassification,
        purchase_date: date,
    ) -> tuple[ShelfLifePrediction, list[str]]:
        warnings: list[str] = []
        cache_hit = self.cache.get(classification.normalized_name)
        if cache_hit:
            cached, match_type, cache_layer = cache_hit
            days = int(cached.get("estimated_shelf_life_days"))
            prediction = ShelfLifePrediction(
                item_name=classification.item_name,
                normalized_name=classification.normalized_name,
                category=str(cached.get("category", classification.category)),
                storage_type=str(cached.get("storage_type", classification.storage_type)),  # type: ignore[arg-type]
                estimated_shelf_life_days=days,
                purchase_date=purchase_date.isoformat(),
                estimated_expiration_date=expiration_date_for(purchase_date, days),
                confidence=float(cached.get("confidence", classification.confidence)),
                source="local_cache",
                notes=f"{match_type} cache match. {cached.get('notes', '')}".strip(),
                cache_hit=True,
                cache_match_type=match_type,
                cache_layer=cache_layer,
            )
            return prediction, warnings

        if classification.default_shelf_life_days is not None:
            days = classification.default_shelf_life_days
            return (
                ShelfLifePrediction(
                    item_name=classification.item_name,
                    normalized_name=classification.normalized_name,
                    category=classification.category,
                    storage_type=classification.storage_type,
                    estimated_shelf_life_days=days,
                    purchase_date=purchase_date.isoformat(),
                    estimated_expiration_date=expiration_date_for(purchase_date, days),
                    confidence=classification.confidence,
                    source="local_rule",
                    notes=classification.reason,
                    cache_hit=False,
                ),
                warnings,
            )

        if self.deepseek_client is not None:
            try:
                predictions = self.deepseek_client.extract_fridge_items(
                    classification.item_name,
                    [classification.item_name],
                    purchase_date,
                )
            except DeepSeekError as exc:
                warnings.append(str(exc))
            else:
                if predictions:
                    prediction = predictions[0]
                    self.cache.upsert_prediction(prediction)
                    return prediction, warnings

        return (
            ShelfLifePrediction(
                item_name=classification.item_name,
                normalized_name=classification.normalized_name,
                category=classification.category,
                storage_type="unknown",
                estimated_shelf_life_days=None,
                purchase_date=purchase_date.isoformat(),
                estimated_expiration_date=None,
                confidence=0.2,
                source="unknown",
                notes="Shelf life needs user confirmation.",
            ),
            warnings,
        )
