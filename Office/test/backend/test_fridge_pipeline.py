from __future__ import annotations

import json
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import patch

from backend.fridge.deepseek_client import DeepSeekInvalidResponseError, parse_deepseek_items_response
from backend.fridge.fridge_classifier import classify_item
from backend.fridge.models import FridgeClassification, OCRResult, ShelfLifePrediction, expiration_date_for
from backend.fridge.pipeline import (
    ImageValidationError,
    ReceiptAnalyzer,
    build_reminder_suggestion,
    resolve_purchase_date,
    validate_image_upload,
)
from backend.fridge.receipt_ocr import should_use_deepseek_for_ocr
from backend.fridge.receipt_parser import extract_candidate_items
from backend.fridge.shelf_life_cache import ShelfLifeCache
from backend.fridge.shelf_life_predictor import ShelfLifePredictor
from backend.fridge.store import FridgeInventoryStore, InventoryItemNotFoundError
from backend.server import parse_multipart_form

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"fake image bytes"


class FakeOCR:
    def __init__(self, result: OCRResult) -> None:
        self.result = result

    def extract_text(self, image_bytes: bytes, extension: str) -> OCRResult:
        return self.result


class FakeDeepSeek:
    def __init__(self, predictions: list[ShelfLifePrediction] | None = None) -> None:
        self.predictions = predictions or []
        self.calls: list[tuple[str, list[str], date]] = []

    def extract_fridge_items(
        self,
        receipt_text: str,
        candidate_items: list[str],
        purchase_date: date,
    ) -> list[ShelfLifePrediction]:
        self.calls.append((receipt_text, candidate_items, purchase_date))
        return self.predictions


class RaisingDeepSeek:
    def extract_fridge_items(
        self,
        receipt_text: str,
        candidate_items: list[str],
        purchase_date: date,
    ) -> list[ShelfLifePrediction]:
        raise DeepSeekInvalidResponseError("DeepSeek returned malformed JSON")


def prediction(item_name: str, purchase_date: date, days: int = 6) -> ShelfLifePrediction:
    return ShelfLifePrediction(
        item_name=item_name,
        normalized_name=item_name.lower(),
        category="dairy",
        storage_type="fridge",
        estimated_shelf_life_days=days,
        purchase_date=purchase_date.isoformat(),
        estimated_expiration_date=expiration_date_for(purchase_date, days),
        confidence=0.77,
        source="deepseek",
        notes="Mocked DeepSeek estimate.",
    )


class FridgePipelineTests(unittest.TestCase):
    def test_image_upload_validation_accepts_common_image(self) -> None:
        extension = validate_image_upload("receipt.png", "image/png", PNG_BYTES)

        self.assertEqual(extension, "png")

    def test_image_upload_validation_rejects_unsupported_file(self) -> None:
        with self.assertRaises(ImageValidationError):
            validate_image_upload("receipt.txt", "text/plain", b"hello")

    def test_multipart_form_parser_extracts_image_and_fields(self) -> None:
        boundary = "receipt-boundary"
        body = (
            b"--receipt-boundary\r\n"
            b'Content-Disposition: form-data; name="purchase_date"\r\n\r\n'
            b"2026-06-06\r\n"
            b"--receipt-boundary\r\n"
            b'Content-Disposition: form-data; name="image"; filename="receipt.png"\r\n'
            b"Content-Type: image/png\r\n\r\n"
            + PNG_BYTES
            + b"\r\n--receipt-boundary--\r\n"
        )

        fields = parse_multipart_form(f"multipart/form-data; boundary={boundary}", body)

        self.assertEqual(fields["purchase_date"]["content"], b"2026-06-06")
        self.assertEqual(fields["image"]["filename"], "receipt.png")
        self.assertEqual(fields["image"]["content"], PNG_BYTES)

    def test_ocr_fallback_decision_uses_confidence_and_text_volume(self) -> None:
        self.assertTrue(should_use_deepseek_for_ocr(OCRResult("MILK", "local_ocr", 0.2)))
        self.assertFalse(
            should_use_deepseek_for_ocr(
                OCRResult("MILK 4.99\nEGGS 3.99\nYOGURT 5.49\nBLUEBERRIES 4.29", "local_ocr", 0.78)
            )
        )

    def test_receipt_parser_and_classifier_filter_fridge_items(self) -> None:
        candidates = extract_candidate_items(
            "\n".join(
                [
                    "ORGANIC MILK 4.99",
                    "PAPER TOWELS 12.99",
                    "LARGE EGGS 3.49",
                    "TOTAL 21.47",
                ]
            )
        )
        fridge_items = [candidate for candidate in candidates if classify_item(candidate).is_fridge_item]

        self.assertEqual(fridge_items, ["ORGANIC MILK", "LARGE EGGS"])

    def test_shelf_life_cache_exact_and_fuzzy_hits(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            cache_path = Path(tmp_dir) / "cache.json"
            cache = ShelfLifeCache(cache_path)
            cache.upsert_prediction(prediction("milk", date(2026, 6, 6), days=7))
            cache.upsert_prediction(prediction("strawberry yogurt", date(2026, 6, 6), days=10))

            exact = cache.get("milk")
            fuzzy = cache.get("strawbery yogurt")

            self.assertIsNotNone(exact)
            self.assertIsNotNone(fuzzy)
            self.assertEqual(exact[1], "exact")  # type: ignore[index]
            self.assertEqual(fuzzy[1], "fuzzy")  # type: ignore[index]

    def test_shelf_life_cache_save_uses_atomic_replace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            cache_path = Path(tmp_dir) / "cache.json"
            cache = ShelfLifeCache(cache_path)

            with patch("backend.fridge.shelf_life_cache.os.replace") as replace:
                cache.upsert_prediction(prediction("milk", date(2026, 6, 6), days=7))

            replace.assert_called_once()
            tmp_arg, final_arg = replace.call_args.args
            self.assertEqual(Path(tmp_arg), cache_path.with_suffix(".tmp"))
            self.assertEqual(Path(final_arg), cache_path)

    def test_defaults_load_before_runtime_and_deepseek_writes_runtime_only(self) -> None:
        purchase_date = date(2026, 6, 6)
        with tempfile.TemporaryDirectory() as tmp_dir:
            defaults_path = Path(tmp_dir) / "defaults.json"
            runtime_path = Path(tmp_dir) / "runtime.json"
            defaults_path.write_text(
                '{"items":{"milk":{"category":"dairy","storage_type":"fridge",'
                '"estimated_shelf_life_days":7,"confidence":0.86,"notes":"default milk"}}}',
                encoding="utf-8",
            )
            cache = ShelfLifeCache(runtime_path, defaults_path)

            default_hit = cache.get("milk")
            cache.upsert_prediction(prediction("Chilled Dip", purchase_date, days=5))

            self.assertIsNotNone(default_hit)
            self.assertEqual(default_hit[2], "defaults")  # type: ignore[index]
            self.assertIn("chilled dip", runtime_path.read_text(encoding="utf-8"))
            self.assertNotIn("chilled dip", defaults_path.read_text(encoding="utf-8"))

    def test_disabled_runtime_cache_ignores_existing_entries_and_never_writes(self) -> None:
        purchase_date = date(2026, 6, 6)
        with tempfile.TemporaryDirectory() as tmp_dir:
            defaults_path = Path(tmp_dir) / 'defaults.json'
            runtime_path = Path(tmp_dir) / 'runtime.json'
            defaults_path.write_text(
                json.dumps(
                    {
                        'items': {
                            'milk': {
                                'category': 'dairy',
                                'storage_type': 'fridge',
                                'estimated_shelf_life_days': 7,
                                'confidence': 0.86,
                                'notes': 'static default',
                            }
                        }
                    }
                ),
                encoding='utf-8',
            )
            original_runtime = {
                'items': {
                    'private tofu': {
                        'category': 'private',
                        'storage_type': 'fridge',
                        'estimated_shelf_life_days': 5,
                        'confidence': 0.99,
                        'notes': 'Alice membership 1234',
                    }
                }
            }
            runtime_path.write_text(json.dumps(original_runtime), encoding='utf-8')
            cache = ShelfLifeCache(runtime_path, defaults_path, runtime_enabled=False)

            self.assertIsNone(cache.get('Private Tofu'))
            self.assertIsNotNone(cache.get('Milk'))
            cache.upsert_prediction(prediction('Private Tofu', purchase_date, days=4))
            self.assertEqual(json.loads(runtime_path.read_text(encoding='utf-8')), original_runtime)

    def test_cache_hit_avoids_deepseek_call(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            defaults_path = Path(tmp_dir) / "defaults.json"
            runtime_path = Path(tmp_dir) / "runtime.json"
            defaults_path.write_text(
                '{"items":{"milk":{"category":"dairy","storage_type":"fridge",'
                '"estimated_shelf_life_days":7,"confidence":0.86,"notes":"default milk"}}}',
                encoding="utf-8",
            )
            fake_deepseek = FakeDeepSeek([prediction("Organic Milk", date(2026, 6, 6), days=7)])
            analyzer = ReceiptAnalyzer(
                ocr_engine=FakeOCR(OCRResult("ORGANIC MILK 4.99\nFRESH MILK 2.99\nTHANK YOU", "local_ocr", 0.9)),
                deepseek_client=fake_deepseek,
                cache=ShelfLifeCache(runtime_path, defaults_path),
            )

            response = analyzer.analyze(PNG_BYTES, "receipt.png", "image/png", purchase_date=date(2026, 6, 6))

            self.assertEqual(fake_deepseek.calls, [])
            self.assertTrue(response["items"][0]["cache_hit"])
            self.assertEqual(response["items"][0]["cache_layer"], "defaults")

    def test_cache_miss_uses_deepseek_and_saves_result(self) -> None:
        purchase_date = date(2026, 6, 6)
        with tempfile.TemporaryDirectory() as tmp_dir:
            cache = ShelfLifeCache(Path(tmp_dir) / "cache.json")
            fake_deepseek = FakeDeepSeek([prediction("Chilled Dip", purchase_date, days=5)])
            predictor = ShelfLifePredictor(cache, fake_deepseek)
            classification = FridgeClassification(
                item_name="Chilled Dip",
                normalized_name="chilled dip",
                is_fridge_item=True,
                category="unknown",
                storage_type="unknown",
                confidence=0.45,
                reason="Ambiguous chilled item.",
            )

            result, warnings = predictor.predict(classification, purchase_date)

            self.assertEqual(warnings, [])
            self.assertEqual(result.source, "deepseek")
            self.assertEqual(len(fake_deepseek.calls), 1)
            self.assertIsNotNone(cache.get("Chilled Dip"))

    def test_malformed_deepseek_json_raises_validation_error(self) -> None:
        with self.assertRaises(DeepSeekInvalidResponseError):
            parse_deepseek_items_response("not json", date(2026, 6, 6))

    def test_malformed_deepseek_response_is_structured_recoverable_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            analyzer = ReceiptAnalyzer(
                ocr_engine=FakeOCR(OCRResult("M1LK 4.99", "local_ocr", 0.2)),
                deepseek_client=RaisingDeepSeek(),
                cache=ShelfLifeCache(Path(tmp_dir) / "cache.json"),
            )

            response = analyzer.analyze(PNG_BYTES, "receipt.png", "image/png", purchase_date=date(2026, 6, 6))

            self.assertIn(
                "deepseek_malformed_response",
                [error["code"] for error in response["recoverable_errors"]],
            )

    def test_timezone_sensitive_reminder_date_calculation(self) -> None:
        purchase_date, error = resolve_purchase_date(
            None,
            "America/Los_Angeles",
            now=datetime(2026, 6, 7, 1, 0, tzinfo=timezone.utc),
        )
        suggestion = build_reminder_suggestion(prediction("milk", purchase_date, days=7))

        self.assertIsNone(error)
        self.assertEqual(purchase_date.isoformat(), "2026-06-06")
        self.assertEqual(suggestion.date, "2026-06-13")

    def test_analyzer_uses_deepseek_when_local_ocr_is_low_confidence(self) -> None:
        purchase_date = date(2026, 6, 6)
        fake_deepseek = FakeDeepSeek([prediction("Organic Milk", purchase_date, days=7)])
        with tempfile.TemporaryDirectory() as tmp_dir:
            analyzer = ReceiptAnalyzer(
                ocr_engine=FakeOCR(OCRResult("M1LK 4.99", "local_ocr", 0.2)),
                deepseek_client=fake_deepseek,
                cache=ShelfLifeCache(Path(tmp_dir) / "cache.json"),
            )

            response = analyzer.analyze(PNG_BYTES, "receipt.png", "image/png", purchase_date=purchase_date)

            self.assertTrue(response["success"])
            self.assertEqual(len(fake_deepseek.calls), 1)
            self.assertEqual(response["items"][0]["item_name"], "Organic Milk")

    def test_inventory_crud(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = FridgeInventoryStore(Path(tmp_dir) / "inventory.json")

            created = store.create_item(
                {
                    "item_name": "Milk",
                    "category": "dairy",
                    "storage_type": "fridge",
                    "purchase_date": "2026-06-06",
                    "estimated_expiration_date": "2026-06-13",
                    "estimated_shelf_life_days": 7,
                    "confidence": 0.86,
                    "source": "local_cache",
                }
            )
            updated = store.update_item(created["item_id"], {"quantity": "half gallon"})

            self.assertEqual(len(store.list_items()), 1)
            self.assertEqual(updated["quantity"], "half gallon")
            self.assertTrue(store.delete_item(created["item_id"]))
            self.assertEqual(store.list_items(), [])
            with self.assertRaises(InventoryItemNotFoundError):
                store.delete_item(created["item_id"])


if __name__ == "__main__":
    unittest.main()
