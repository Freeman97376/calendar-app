from __future__ import annotations

from dataclasses import dataclass

from .receipt_parser import normalize_item_name
from .models import FridgeClassification, StorageType


@dataclass(frozen=True)
class FridgeRule:
    keywords: tuple[str, ...]
    category: str
    storage_type: StorageType
    shelf_life_days: int
    confidence: float
    reason: str


EXCLUDED_KEYWORDS = (
    "paper towel",
    "toilet paper",
    "detergent",
    "shampoo",
    "soap",
    "plastic bag",
    "foil",
    "cleaner",
    "bleach",
    "toothpaste",
    "canned",
    "can ",
    "dry pasta",
    "pasta",
    "rice",
    "chips",
    "soda",
    "candy",
    "cookies",
    "cereal",
)

FRIDGE_RULES = (
    FridgeRule(("milk", "kefir"), "dairy", "fridge", 7, 0.92, "Dairy products usually require refrigeration."),
    FridgeRule(("yogurt", "yoghurt"), "dairy", "fridge", 10, 0.9, "Yogurt is normally refrigerated."),
    FridgeRule(("cheese", "mozzarella", "cheddar", "brie", "feta"), "dairy", "fridge", 14, 0.88, "Cheese is normally refrigerated after purchase."),
    FridgeRule(("egg", "eggs"), "eggs", "fridge", 21, 0.9, "Eggs are commonly refrigerated in US households."),
    FridgeRule(("chicken", "beef", "pork", "turkey", "steak", "ground meat", "bacon", "sausage"), "meat", "fridge", 3, 0.9, "Fresh meat has a short refrigerated shelf life."),
    FridgeRule(("salmon", "fish", "shrimp", "cod", "tuna fillet", "seafood"), "seafood", "fridge", 2, 0.9, "Fresh seafood has a short refrigerated shelf life."),
    FridgeRule(("tofu", "tempeh"), "plant_protein", "fridge", 7, 0.86, "Tofu and tempeh are usually refrigerated."),
    FridgeRule(("lettuce", "spinach", "kale", "arugula", "spring mix", "greens"), "leafy_greens", "fridge", 5, 0.86, "Leafy greens usually require refrigeration."),
    FridgeRule(("berry", "berries", "strawberry", "blueberry", "raspberry", "blackberry"), "berries", "fridge", 5, 0.86, "Berries are usually refrigerated and spoil quickly."),
    FridgeRule(("broccoli", "carrot", "celery", "cauliflower", "pepper", "cucumber", "zucchini", "mushroom"), "fresh_vegetable", "fridge", 7, 0.78, "Fresh vegetables are commonly refrigerated."),
    FridgeRule(("apple", "grape", "orange", "melon", "pear", "peach", "plum"), "fresh_fruit", "fridge", 10, 0.64, "Many fresh fruits can be refrigerated to extend shelf life."),
    FridgeRule(("deli", "prepared", "rotisserie", "cooked", "salad bar"), "prepared_food", "fridge", 4, 0.82, "Prepared foods should be refrigerated and used quickly."),
    FridgeRule(("frozen", "ice cream", "froz"), "frozen_food", "freezer", 90, 0.9, "Frozen foods should be stored in the freezer."),
)


def classify_item(item_name: str) -> FridgeClassification:
    normalized = normalize_item_name(item_name)

    if any(keyword in normalized for keyword in EXCLUDED_KEYWORDS):
        return FridgeClassification(
            item_name=item_name,
            normalized_name=normalized,
            is_fridge_item=False,
            category="non_food_or_shelf_stable",
            storage_type="room_temp",
            confidence=0.88,
            reason="Matched a common non-fridge or shelf-stable receipt item.",
        )

    for rule in FRIDGE_RULES:
        if any(keyword in normalized for keyword in rule.keywords):
            return FridgeClassification(
                item_name=item_name,
                normalized_name=normalized,
                is_fridge_item=True,
                category=rule.category,
                storage_type=rule.storage_type,
                confidence=rule.confidence,
                reason=rule.reason,
                default_shelf_life_days=rule.shelf_life_days,
            )

    return FridgeClassification(
        item_name=item_name,
        normalized_name=normalized,
        is_fridge_item=False,
        category="unknown",
        storage_type="unknown",
        confidence=0.25,
        reason="No local fridge rule matched; DeepSeek can review it if fallback is available.",
    )

