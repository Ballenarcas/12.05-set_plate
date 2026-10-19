from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

USER_ID = "11111111-1111-1111-1111-111111111111"

WINDOW = {
    "today_start": "2026-10-16",
    "today_end": "2026-10-17",
}

MEAL_TODAY = {
    "id": "m1",
    "user_id": USER_ID,
    "name": "Chicken bowl",
    "calories": 500,
    "proteins": 30.0,
    "carbs": 60.0,
    "fats": 20.0,
    "consumed_at": "2026-10-16T12:00:00+00:00",
}


def _supabase_with(user: dict, meals: list[dict], workouts: list[dict]) -> MagicMock:
    users_mock = MagicMock()
    users_mock.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(data=user)

    meals_mock = MagicMock()
    meals_chain = meals_mock.select.return_value.eq.return_value.gte.return_value.lt.return_value.order.return_value
    meals_chain.execute.return_value = MagicMock(data=meals)

    workouts_mock = MagicMock()
    workouts_chain = workouts_mock.select.return_value.eq.return_value.not_.is_.return_value.gte.return_value.lt.return_value
    workouts_chain.execute.return_value = MagicMock(data=workouts)

    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {"users": users_mock, "meals": meals_mock, "workouts": workouts_mock}[name]
    supabase._meals_mock = meals_mock
    supabase._workouts_mock = workouts_mock
    return supabase


def _get_today(supabase: MagicMock) -> dict:
    with patch("app.services.nutrition_service.get_supabase", return_value=supabase), patch(
        "app.services.workout_service.get_supabase", return_value=supabase
    ):
        response = client.get(f"/api/v1/nutrition/today", params={"user_id": USER_ID, **WINDOW})
    assert response.status_code == 200
    return response.json()


def _user_row() -> dict:
    return {
        "id": USER_ID,
        "calorie_goal": 2200,
        "weight": 75,
        "height": 178,
        "age": 30,
        "gender": "male",
        "objective": "hypertrophy",
    }


def test_today_balance_rests_on_saved_goal_and_window():
    supabase = _supabase_with(_user_row(), [MEAL_TODAY], [])
    data = _get_today(supabase)

    assert data["daily_goal"] == 2200
    assert data["workout_adjustment_calories"] == 0
    assert data["adjusted_daily_goal"] == 2200
    assert data["consumed_calories"] == 500
    assert data["remaining_calories"] == 1700
    assert data["target_proteins_g"] == 120.0
    assert data["remaining_proteins_g"] == 90.0
    assert data["target_fats_g"] == 61.1
    assert data["remaining_fats_g"] == 41.1
    assert data["target_carbs_g"] == 292.5
    assert data["remaining_carbs_g"] == 232.5


def test_today_window_queries_carry_local_day_bounds():
    supabase = _supabase_with(_user_row(), [MEAL_TODAY], [])
    _get_today(supabase)

    gte_calls = [call for call in supabase._meals_mock.mock_calls if call[0].endswith(".gte")]
    lt_calls = [call for call in supabase._meals_mock.mock_calls if call[0].endswith(".lt")]
    assert gte_calls[0][1] == ("consumed_at", "2026-10-16T00:00:00")
    assert lt_calls[0][1] == ("consumed_at", "2026-10-17T00:00:00")


def test_today_adds_workout_estimate_to_target():
    workout = {"start_time": "2026-10-16T10:00:00Z", "end_time": "2026-10-16T11:00:00Z"}
    supabase = _supabase_with(_user_row(), [MEAL_TODAY], [workout])
    data = _get_today(supabase)

    assert data["workout_adjustment_calories"] == 375
    assert data["adjusted_daily_goal"] == 2575
    assert data["remaining_calories"] == 2075
    assert data["target_proteins_g"] == 120.0
    assert data["target_fats_g"] == 71.5
    assert data["target_carbs_g"] == 362.9


def test_today_clamps_remaining_at_zero():
    huge_meal = {**MEAL_TODAY, "calories": 4000, "proteins": 500.0, "carbs": 900.0, "fats": 300.0}
    supabase = _supabase_with(_user_row(), [huge_meal], [])
    data = _get_today(supabase)

    assert data["remaining_calories"] == 0
    assert data["remaining_proteins_g"] == 0.0
    assert data["remaining_carbs_g"] == 0.0
    assert data["remaining_fats_g"] == 0.0
    assert data["calories_progress_percentage"] == 100
