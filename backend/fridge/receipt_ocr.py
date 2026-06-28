from __future__ import annotations

import shutil
import subprocess
import uuid
from pathlib import Path

from .models import OCRResult

OCR_SCRATCH_DIR = Path(__file__).resolve().parents[2] / "scratch" / "fridge-ocr"


class TesseractOCR:
    def __init__(self, executable: str = "tesseract", timeout_seconds: float = 20.0) -> None:
        self.executable = executable
        self.timeout_seconds = timeout_seconds

    def extract_text(self, image_bytes: bytes, extension: str) -> OCRResult:
        if shutil.which(self.executable) is None:
            return OCRResult(text="", source="local_ocr_unavailable", confidence=0.0)

        OCR_SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
        image_path = OCR_SCRATCH_DIR / f"{uuid.uuid4().hex}.{extension.lstrip('.')}"
        image_path.write_bytes(image_bytes)
        try:
            completed = subprocess.run(
                [self.executable, str(image_path), "stdout", "--psm", "6"],
                capture_output=True,
                check=False,
                text=True,
                timeout=self.timeout_seconds,
            )
        except (subprocess.TimeoutExpired, OSError):
            return OCRResult(text="", source="local_ocr_failed", confidence=0.0)
        finally:
            image_path.unlink(missing_ok=True)

        if completed.returncode != 0:
            return OCRResult(text="", source="local_ocr_failed", confidence=0.0)

        text = completed.stdout.strip()
        return OCRResult(text=text, source="local_ocr", confidence=estimate_ocr_confidence(text))


def estimate_ocr_confidence(text: str) -> float:
    cleaned = text.strip()
    if not cleaned:
        return 0.0

    alpha_count = sum(1 for char in cleaned if char.isalpha())
    line_count = len([line for line in cleaned.splitlines() if line.strip()])
    price_like_count = cleaned.count(".")
    score = 0.2
    if len(cleaned) >= 40:
        score += 0.25
    if alpha_count >= 20:
        score += 0.25
    if line_count >= 3:
        score += 0.15
    if price_like_count >= 1:
        score += 0.1
    return max(0.0, min(0.95, score))


def should_use_deepseek_for_ocr(ocr_result: OCRResult, min_confidence: float = 0.45, min_chars: int = 30) -> bool:
    useful_chars = sum(1 for char in ocr_result.text if char.isalnum())
    return ocr_result.confidence < min_confidence or useful_chars < min_chars
