from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from main import app

from app.api import nutrition as nutrition_api
from app.schemas.meal_scan import MealScanItem, MealScanResult
from app.services import meal_scan_service
from tests.auth_helpers import auth_headers

client = TestClient(app)
USER_ID = uuid4()
JPEG = b"\xff\xd8\xff" + b"0" * 40


class FakeClient:
    def __init__(self, content):
        self.content = content
        self.requests = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.requests.append(kwargs)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=self.content))],
        )

    def with_options(self, **_):
        return self


def test_normalize_drops_invalid_items_and_computes_total():
    result = meal_scan_service.normalize_scan_result({
        "items": [
            {"name": "Chicken breast", "grams": 150, "calories": 247, "protein_g": 46, "carbs_g": 0, "fat_g": 5},
            {"name": "", "grams": 100, "calories": 200},
            {"name": "Rice", "grams": 0, "calories": 130},
            {"name": "Broccoli", "grams": 80, "calories": 28, "protein_g": 2.2, "carbs_g": 5.6, "fat_g": 0.3},
        ],
        "notes": "Estimates from the photo.",
    })

    assert [item.name for item in result.items] == ["Chicken breast", "Broccoli"]
    assert result.total_calories == 275
    assert result.notes == "Estimates from the photo."


def test_normalize_clamps_impossible_energy_density():
    result = meal_scan_service.normalize_scan_result({
        "items": [{"name": "Oil", "grams": 10, "calories": 900, "fat_g": 100}],
    })

    assert result.items[0].calories == 95
    assert result.items[0].fat_g == 10


def test_normalize_rejects_a_photo_without_food():
    with pytest.raises(meal_scan_service.MealScanNoFood):
        meal_scan_service.normalize_scan_result({"items": [], "notes": "No food detected"})


def test_estimate_parses_the_model_json(monkeypatch):
    content = '{"items":[{"name":"Chicken","grams":150,"calories":247,"protein_g":46,"carbs_g":0,"fat_g":5}]}'
    monkeypatch.setattr(meal_scan_service, "get_settings", lambda: SimpleNamespace(
        ai_vision_model="vision-test", ai_vision_api_key="", ai_vision_base_url="",
        ai_api_key="key", ai_base_url="http://provider.test",
    ))
    monkeypatch.setattr(meal_scan_service, "OpenAI", lambda **_: FakeClient(content))

    result = meal_scan_service.estimate_meal_from_image(JPEG, "image/jpeg")

    assert result.items[0].name == "Chicken"
    assert result.total_calories == 247


def test_openrouter_reasoning_is_disabled_for_json(monkeypatch):
    content = '{"items":[{"name":"Chicken","grams":150,"calories":247}]}'
    created = []

    def fake_openai(**_):
        client = FakeClient(content)
        created.append(client)
        return client

    monkeypatch.setattr(meal_scan_service, "get_settings", lambda: SimpleNamespace(
        ai_vision_model="vision-test", ai_vision_api_key="key",
        ai_vision_base_url="https://openrouter.ai/api/v1",
        ai_api_key="", ai_base_url="",
    ))
    monkeypatch.setattr(meal_scan_service, "OpenAI", fake_openai)

    meal_scan_service.estimate_meal_from_image(JPEG, "image/jpeg")

    assert created[0].requests[0]["extra_body"] == {"reasoning": {"enabled": False}}


def test_estimate_requires_a_vision_model(monkeypatch):
    monkeypatch.setattr(meal_scan_service, "get_settings", lambda: SimpleNamespace(
        ai_vision_model="", ai_vision_api_key="", ai_vision_base_url="",
        ai_api_key="key", ai_base_url="http://provider.test",
    ))

    with pytest.raises(meal_scan_service.MealScanUnavailable):
        meal_scan_service.estimate_meal_from_image(JPEG, "image/jpeg")


def test_estimate_rejects_unreadable_model_output(monkeypatch):
    monkeypatch.setattr(meal_scan_service, "get_settings", lambda: SimpleNamespace(
        ai_vision_model="vision-test", ai_vision_api_key="", ai_vision_base_url="",
        ai_api_key="key", ai_base_url="http://provider.test",
    ))
    monkeypatch.setattr(meal_scan_service, "OpenAI", lambda **_: FakeClient("not json"))

    with pytest.raises(meal_scan_service.MealScanFailed):
        meal_scan_service.estimate_meal_from_image(JPEG, "image/jpeg")


def test_scan_endpoint_returns_the_estimate(monkeypatch):
    expected = MealScanResult(
        items=[MealScanItem(name="Chicken", grams=150, calories=247)],
        total_calories=247,
    )
    monkeypatch.setattr(nutrition_api.nutrition_facade, "scan_meal", lambda *_: expected)

    response = client.post(
        "/api/v1/nutrition/scan",
        files={"file": ("meal.jpg", JPEG, "image/jpeg")},
        headers=auth_headers(USER_ID),
    )

    assert response.status_code == 200, response.text
    assert response.json()["items"][0]["name"] == "Chicken"
    assert response.json()["total_calories"] == 247


def test_scan_endpoint_rejects_unsupported_types(monkeypatch):
    response = client.post(
        "/api/v1/nutrition/scan",
        files={"file": ("meal.gif", JPEG, "image/gif")},
        headers=auth_headers(USER_ID),
    )

    assert response.status_code == 415


def test_scan_endpoint_rejects_oversized_photos(monkeypatch):
    monkeypatch.setattr(nutrition_api, "MAX_IMAGE_BYTES", 10)

    response = client.post(
        "/api/v1/nutrition/scan",
        files={"file": ("meal.jpg", JPEG, "image/jpeg")},
        headers=auth_headers(USER_ID),
    )

    assert response.status_code == 413


@pytest.mark.parametrize(
    ("error", "status"),
    [
        (meal_scan_service.MealScanNoFood("No food"), 422),
        (meal_scan_service.MealScanUnavailable("Not configured"), 503),
        (meal_scan_service.MealScanFailed("Provider failed"), 502),
    ],
)
def test_scan_endpoint_maps_errors(monkeypatch, error, status):
    def fail(*_):
        raise error

    monkeypatch.setattr(nutrition_api.nutrition_facade, "scan_meal", fail)

    response = client.post(
        "/api/v1/nutrition/scan",
        files={"file": ("meal.jpg", JPEG, "image/jpeg")},
        headers=auth_headers(USER_ID),
    )

    assert response.status_code == status
