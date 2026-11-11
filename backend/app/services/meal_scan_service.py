"""Turn a meal photo into editable ingredient estimates.

The model only proposes numbers. The API validates and clamps them, the client
shows them for editing, and the existing meal endpoint stores the accepted
version. No scan result is persisted directly.
"""

import base64
import json
import logging
import re
from typing import Any

from openai import (
    APIConnectionError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    NotFoundError,
    OpenAI,
    RateLimitError,
)

from app.core.config import get_settings
from app.schemas.meal_scan import MealScanItem, MealScanResult

logger = logging.getLogger(__name__)

MAX_ITEMS = 12
VISION_TIMEOUT_SECONDS = 60
MAX_KCAL_PER_GRAM = 9.5
NUMBER_PATTERN = re.compile(r"-?\d+(?:[.,]\d+)?")

SCAN_SYSTEM_PROMPT = (
    "You are a nutrition assistant that estimates food from one meal photo. "
    "Use realistic portions and standard nutrition values. Identify each distinct food. "
    "Ignore plates, utensils, packaging and background objects. Return JSON only."
)

SCAN_USER_PROMPT = (
    "Analyze this meal photo and return JSON in exactly this shape: "
    '{"items":[{"name":"Chicken breast","grams":150,"calories":247,"protein_g":46,"carbs_g":0,"fat_g":5}],'
    '"notes":"short optional note"}. '
    "grams is the edible weight. calories, protein_g, carbs_g and fat_g are totals for that weight, "
    "not values per 100 g. Use up to 12 items. If no food is visible, return "
    '{"items":[],"notes":"No food detected"}.'
)


class MealScanUnavailable(RuntimeError):
    """The vision provider is not configured."""


class MealScanFailed(RuntimeError):
    """The provider returned an unusable answer."""


class MealScanNoFood(ValueError):
    """The photo contained no recognizable food."""


def _number(value: Any) -> float:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    match = NUMBER_PATTERN.search(str(value or ""))
    if not match:
        return 0.0
    try:
        return float(match.group(0).replace(",", "."))
    except ValueError:
        return 0.0


def _extract_json(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:]
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end <= start:
        raise MealScanFailed("The AI did not return a meal estimate.")
    try:
        value = json.loads(raw[start:end + 1])
    except (TypeError, ValueError) as err:
        raise MealScanFailed("The AI did not return a meal estimate.") from err
    if not isinstance(value, dict):
        raise MealScanFailed("The AI did not return a meal estimate.")
    return value


def _normalize_item(raw: Any) -> MealScanItem | None:
    if not isinstance(raw, dict):
        return None
    name = str(raw.get("name") or raw.get("food") or raw.get("item") or "").strip()
    grams = _number(raw.get("grams") or raw.get("weight_g") or raw.get("weight"))
    if not name or grams <= 0:
        return None

    grams = min(grams, 5000.0)
    calories = _number(raw.get("calories") or raw.get("kcal") or raw.get("energy"))
    protein = _number(raw.get("protein_g") or raw.get("protein") or raw.get("proteins"))
    carbs = _number(raw.get("carbs_g") or raw.get("carbs") or raw.get("carbohydrates"))
    fat = _number(raw.get("fat_g") or raw.get("fat") or raw.get("fats"))

    if calories <= 0 and (protein or carbs or fat):
        calories = protein * 4 + carbs * 4 + fat * 9

    # No food exceeds this energy density. Clamping catches values that were
    # returned per 100 g despite the prompt.
    calories = min(max(calories, 0.0), grams * MAX_KCAL_PER_GRAM)
    protein = min(max(protein, 0.0), grams)
    carbs = min(max(carbs, 0.0), grams)
    fat = min(max(fat, 0.0), grams)

    return MealScanItem(
        name=name[:120],
        grams=round(grams, 1),
        calories=round(calories, 1),
        protein_g=round(protein, 1),
        carbs_g=round(carbs, 1),
        fat_g=round(fat, 1),
    )


def normalize_scan_result(data: dict[str, Any]) -> MealScanResult:
    raw_items = data.get("items")
    if not isinstance(raw_items, list):
        raw_items = []
    items: list[MealScanItem] = []
    for raw in raw_items:
        item = _normalize_item(raw)
        if item is not None:
            items.append(item)
        if len(items) >= MAX_ITEMS:
            break
    if not items:
        raise MealScanNoFood("No food was detected in that photo. Try a clearer photo.")

    notes = data.get("notes") or data.get("note")
    if not isinstance(notes, str) or not notes.strip():
        notes = None
    else:
        notes = notes.strip()[:300]

    return MealScanResult(
        items=items,
        total_calories=round(sum(item.calories for item in items), 1),
        notes=notes,
    )


def estimate_meal_from_image(image_bytes: bytes, content_type: str) -> MealScanResult:
    settings = get_settings()
    if not settings.ai_vision_model:
        raise MealScanUnavailable(
            "Photo meal scanning is not configured. Set AI_VISION_MODEL to a vision-capable model."
        )
    api_key = settings.ai_vision_api_key or settings.ai_api_key
    if not api_key:
        raise MealScanUnavailable("Photo meal scanning is not configured. Set AI_VISION_API_KEY.")
    base_url = settings.ai_vision_base_url or settings.ai_base_url

    encoded = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{content_type};base64,{encoded}"
    try:
        client = OpenAI(api_key=api_key, base_url=base_url).with_options(
            timeout=VISION_TIMEOUT_SECONDS, max_retries=0,
        )
        request: dict[str, Any] = {
            "model": settings.ai_vision_model,
            "temperature": 0.2,
            "max_tokens": 1200,
            "messages": [
                {"role": "system", "content": SCAN_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": SCAN_USER_PROMPT},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                },
            ],
        }
        if "openrouter.ai" in base_url:
            # Reasoning models can spend the whole token budget thinking and
            # return no JSON. This extraction task wants the answer, not a plan.
            request["extra_body"] = {"reasoning": {"enabled": False}}
        response = client.chat.completions.create(**request)
        content = response.choices[0].message.content or ""
        return normalize_scan_result(_extract_json(content))
    except (MealScanUnavailable, MealScanFailed, MealScanNoFood):
        raise
    except (APIConnectionError, APITimeoutError) as err:
        logger.warning("Could not reach the meal scan provider: %s", err)
        raise MealScanUnavailable(
            "Could not reach the AI provider. Check your network and AI_VISION_BASE_URL."
        ) from err
    except (AuthenticationError, NotFoundError) as err:
        logger.warning("Meal scan provider rejected the credentials or model: %s", err)
        raise MealScanUnavailable(
            "Photo scanning is not configured correctly. Check AI_VISION_MODEL and AI_VISION_API_KEY."
        ) from err
    except RateLimitError as err:
        logger.warning("Meal scan provider rate limit: %s", err)
        raise MealScanFailed("The AI provider is busy right now. Try again in a moment.") from err
    except BadRequestError as err:
        logger.warning("Meal scan provider rejected the request: %s", err)
        raise MealScanFailed(
            "The vision model rejected that photo. Check that AI_VISION_MODEL supports images."
        ) from err
    except Exception as err:
        logger.exception("Meal scan request failed")
        raise MealScanFailed("The AI could not analyze that photo. Try again.") from err
