from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import workouts as workouts_api
from main import app

client = TestClient(app)

WORKOUT_PAYLOAD = {
    "name": "Push day",
    "duration_seconds": 900,
    "user_goal": "Hypertrophy",
    "exercises": [{
        "exercise_id": "bench",
        "name": "Bench press",
        "sets": [{"set_number": 1, "weight_kg": 80, "reps": 8, "is_completed": True}],
    }],
}


def patch_suggestions(monkeypatch, suggestions):
    async def suggest(_payload):
        return suggestions

    monkeypatch.setattr(workouts_api.workout_facade, "suggest_adjustment", suggest)


def test_adjustment_requires_a_user_id():
    response = client.post("/api/v1/workouts/adjust", json=WORKOUT_PAYLOAD)
    assert response.status_code == 422


def test_adjustment_returns_the_model_suggestions(monkeypatch):
    patch_suggestions(monkeypatch, [
        {"action": "drop_set", "exercise_id": "bench", "reason": "Fatigue on set one."},
    ])

    response = client.post(
        f"/api/v1/workouts/adjust?user_id={uuid4()}",
        json=WORKOUT_PAYLOAD,
    )

    assert response.status_code == 200
    assert response.json() == {"suggestions": [{
        "exercise_id": "bench",
        "action": "drop_set",
        "reason": "Fatigue on set one.",
        "new_weight_kg": None,
        "new_reps": None,
    }]}


def test_adjustment_reports_an_empty_result(monkeypatch):
    patch_suggestions(monkeypatch, [])

    response = client.post(
        f"/api/v1/workouts/adjust?user_id={uuid4()}",
        json=WORKOUT_PAYLOAD,
    )

    assert response.status_code == 200
    assert response.json() == {"suggestions": []}


def test_adjustment_throttles_repeated_requests(monkeypatch):
    patch_suggestions(monkeypatch, [])
    user_id = uuid4()

    first = client.post(f"/api/v1/workouts/adjust?user_id={user_id}", json=WORKOUT_PAYLOAD)
    second = client.post(f"/api/v1/workouts/adjust?user_id={user_id}", json=WORKOUT_PAYLOAD)

    assert first.status_code == 200
    assert second.status_code == 429
    assert "wait" in second.json()["detail"].lower()


def test_adjustment_rejects_a_workout_without_exercises(monkeypatch):
    patch_suggestions(monkeypatch, [])

    response = client.post(
        f"/api/v1/workouts/adjust?user_id={uuid4()}",
        json={**WORKOUT_PAYLOAD, "exercises": []},
    )

    assert response.status_code == 422


@pytest.fixture(autouse=True)
def clear_cooldown():
    workouts_api._last_adjustment_request.clear()
    yield
    workouts_api._last_adjustment_request.clear()
