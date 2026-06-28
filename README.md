# Calendar App

React/Vite calendar app with a small Python backend for fridge receipt analysis.

## Fridge Receipt Backend

Receipt analysis endpoint:

```text
POST http://127.0.0.1:8787/api/fridge/receipt/analyze
```

Request type: `multipart/form-data`

Fields:

- `image`: required receipt image file. Supports `jpg`, `jpeg`, `png`, and `webp`.
- `purchase_date`: optional ISO date, defaults to today.
- `timezone`: optional timezone string.
- `create_reminders`: optional `true`/`false`. The current backend does not have an event creation API, so this returns `reminder_suggestions` for the frontend.

### Environment

Add backend-only DeepSeek values to `.env.local` or your shell environment:

```env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
FRIDGE_DATA_DIR=
```

Do not use a `VITE_` prefix for `DEEPSEEK_API_KEY`; this is a backend secret.
`FRIDGE_DATA_DIR` is optional and defaults to `backend/data`.

### Local OCR

The backend tries local OCR first by calling the `tesseract` command. Install Tesseract OCR and make sure `tesseract` is available on PATH.

Windows options:

- Install from the official Tesseract Windows installer.
- Or use a package manager such as Chocolatey/Scoop if already configured.

If Tesseract is unavailable or OCR confidence is too low, the pipeline falls back to DeepSeek when useful OCR text exists. Image-native DeepSeek fallback is documented as a limitation because the default `deepseek-chat` model is text-only.

### Run Locally

In one terminal, run the frontend:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run dev
```

In another terminal, run the backend:

```powershell
python -m backend.server
```

The frontend reads the fridge backend URL from:

```env
VITE_FRIDGE_API_BASE_URL=http://127.0.0.1:8787
```

### Example Request

```powershell
curl.exe -X POST "http://127.0.0.1:8787/api/fridge/receipt/analyze" `
  -F "image=@C:\path\to\receipt.png" `
  -F "purchase_date=2026-06-06" `
  -F "timezone=America/Los_Angeles"
```

### Example Response

```json
{
  "success": true,
  "receipt_id": "receipt_abc123",
  "purchase_date": "2026-06-06",
  "timezone": "America/Los_Angeles",
  "confidence": 0.82,
  "source": "local_ocr",
  "ocr": {
    "text": "ORGANIC MILK 4.99",
    "source": "local_ocr",
    "confidence": 0.78
  },
  "candidates": [
    {
      "item_name": "ORGANIC MILK",
      "normalized_name": "milk",
      "is_fridge_item": true,
      "category": "dairy",
      "storage_type": "fridge",
      "confidence": 0.92,
      "source": "local_parser",
      "reason": "Dairy products usually require refrigeration."
    }
  ],
  "items": [
    {
      "item_name": "ORGANIC MILK",
      "normalized_name": "milk",
      "category": "dairy",
      "storage_type": "fridge",
      "estimated_shelf_life_days": 7,
      "purchase_date": "2026-06-06",
      "estimated_expiration_date": "2026-06-13",
      "confidence": 0.86,
      "source": "local_cache",
      "notes": "exact cache match. Seeded default entry for purchased milk.",
      "cache_hit": true,
      "cache_match_type": "exact",
      "cache_layer": "defaults",
      "metadata": {
        "cache_hit": true,
        "cache_match_type": "exact",
        "cache_layer": "defaults",
        "source": "local_cache",
        "confidence": 0.86
      }
    }
  ],
  "reminder_suggestions": [
    {
      "title": "Use before: ORGANIC MILK",
      "date": "2026-06-13",
      "description": "Receipt item: ORGANIC MILK. Estimated shelf life: 7 days. Confidence: 0.86. Source: local_cache."
    }
  ],
  "trace": {
    "receipt_id": "receipt_abc123",
    "steps": []
  },
  "recoverable_errors": [],
  "warnings": []
}
```

### Inventory API

The fridge inventory is persisted to `fridge_inventory.json` in `FRIDGE_DATA_DIR` or `backend/data`.

```text
GET    http://127.0.0.1:8787/api/fridge/items
POST   http://127.0.0.1:8787/api/fridge/items
PATCH  http://127.0.0.1:8787/api/fridge/items/{item_id}
DELETE http://127.0.0.1:8787/api/fridge/items/{item_id}
```

Create example:

```powershell
curl.exe -X POST "http://127.0.0.1:8787/api/fridge/items" `
  -H "Content-Type: application/json" `
  -d "{\"item_name\":\"Milk\",\"category\":\"dairy\",\"storage_type\":\"fridge\",\"purchase_date\":\"2026-06-06\",\"estimated_expiration_date\":\"2026-06-13\",\"estimated_shelf_life_days\":7,\"confidence\":0.86,\"source\":\"local_cache\"}"
```

Stable error responses use this shape:

```json
{
  "success": false,
  "error": {
    "code": "invalid_image",
    "message": "Unsupported image extension. Use jpg, jpeg, png, or webp.",
    "recoverable": true
  }
}
```

Current error codes include `invalid_image`, `invalid_request`, `ocr_unavailable`, `ocr_empty_result`, `deepseek_timeout`, `deepseek_rate_limit`, `deepseek_request_failed`, `deepseek_malformed_response`, `deepseek_missing_api_key`, `no_fridge_items_detected`, and `inventory_item_not_found`.

### Frontend Flow

Open the app, click `Fridge`, upload a receipt image, and run analysis. The panel can:

- add analyzed fridge/freezer items to backend inventory
- show current backend inventory
- remove inventory items
- create all-day calendar reminder events from `reminder_suggestions`

### Limitations

- OCR quality depends on image clarity and local Tesseract installation.
- Shelf-life predictions are estimates, not food-safety guarantees.
- DeepSeek calls are skipped in tests and should be mocked in automated coverage.
- The current calendar app does not expose a backend event creation API; the backend returns structured expiration data and reminder suggestions for frontend integration.

### Backend Tests

```powershell
python -m unittest discover tests/backend
```
