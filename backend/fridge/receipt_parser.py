from __future__ import annotations

import re

PRICE_RE = re.compile(r"(?<!\w)[-$]?\d+[.,]\d{2}\b")
QUANTITY_RE = re.compile(r"\b\d+\s*(?:x|@)\s*\d+[.,]\d{2}\b", re.IGNORECASE)
SKU_RE = re.compile(r"\b(?:sku|upc|item|auth|ref)[:#]?\s*[a-z0-9-]+\b", re.IGNORECASE)
MULTISPACE_RE = re.compile(r"\s+")
NON_ITEM_LINE_RE = re.compile(
    r"\b("
    r"total|subtotal|tax|balance|change|cash|visa|mastercard|amex|debit|credit|"
    r"receipt|transaction|store|member|coupon|discount|savings|thank you|"
    r"cashier|terminal|approval|date|time|qty|quantity"
    r")\b",
    re.IGNORECASE,
)


def normalize_item_name(value: str) -> str:
    lowered = value.lower()
    lowered = re.sub(r"[^a-z0-9\s&/-]", " ", lowered)
    lowered = re.sub(r"\b(?:organic|org|fresh|whole|lowfat|low-fat|large|small|medium)\b", " ", lowered)
    return MULTISPACE_RE.sub(" ", lowered).strip()


def normalize_ocr_text(text: str) -> str:
    lines = [MULTISPACE_RE.sub(" ", line).strip() for line in text.replace("\r", "\n").split("\n")]
    return "\n".join(line for line in lines if line)


def extract_candidate_items(text: str) -> list[str]:
    normalized_text = normalize_ocr_text(text)
    candidates: list[str] = []
    seen: set[str] = set()

    for raw_line in normalized_text.split("\n"):
        if NON_ITEM_LINE_RE.search(raw_line):
            continue

        line = SKU_RE.sub(" ", raw_line)
        line = QUANTITY_RE.sub(" ", line)
        line = PRICE_RE.sub(" ", line)
        line = re.sub(r"\b\d{4,}\b", " ", line)
        line = re.sub(r"^[*\-\s\d]+", " ", line)
        line = MULTISPACE_RE.sub(" ", line).strip(" -")

        if len(line) < 3 or not re.search(r"[a-zA-Z]", line):
            continue

        normalized_name = normalize_item_name(line)
        if len(normalized_name) < 3 or normalized_name in seen:
            continue

        seen.add(normalized_name)
        candidates.append(line)

    return candidates

