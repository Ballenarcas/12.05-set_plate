from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.schemas.settings import UserSettingsUpdate
from app.schemas.workout_log import WorkoutLogCreate
from app.services import calorie_adjustment_service, nutrition_service, settings_service, workout_service
from main import app
from tests.auth_helpers import auth_headers

client = TestClient(app)
NOW = datetime.now(timezone.utc)
ONE_SET = [{"set_number": 1, "weight_kg": 50, "reps": 8, "is_completed": True}]
EXERCISES = [{"exercise_id": "0025", "sets": ONE_SET}]
PROFILE = {"age": 30, "weight": 80.0, "height": 180, "gender": "Male", "objective": "Maintenance"}


class Query:
    def __init__(self, database, table):
        self.database, self.table_name, self.written = database, table, None

    def __getattr__(self, _):
        return lambda *_args, **_kwargs: self

    def insert(self, record):
        self.written = record
        self.database.writes.append((self.table_name, "insert", record))
        return self

    def update(self, record):
        self.written = record
        self.database.writes.append((self.table_name, "update", record))
        return self

    def execute(self):
        return SimpleNamespace(data=self.database.answer(self.table_name, self.written))


class Database:
    def __init__(self, rows=None, update_rows=None):
        self.rows, self.update_rows, self.writes = rows or {}, update_rows or {}, []

    def table(self, name):
        return Query(self, name)

    def answer(self, table, written):
        if written is None:
            return self.rows.get(table, [])
        if table in self.update_rows:
            return self.update_rows[table]
        return [{"id": "saved", **written}] if isinstance(written, dict) else written


def _workout(**changes):
    return WorkoutLogCreate(**{"name": "Push", "duration_seconds": 60, "started_at": NOW, "completed_at": NOW, "exercises": EXERCISES, **changes})


def test_review_waits_for_a_full_week_of_new_data():
    assert calorie_adjustment_service.REVIEW_COOLDOWN_DAYS == calorie_adjustment_service.EVALUATION_DAYS


def test_an_out_of_date_proposal_does_not_replace_the_goal():
    adjustment_id, user_id = uuid4(), uuid4()
    row = {"id": str(adjustment_id), "status": "pending", "previous_goal": 2500, "proposed_goal": 2300}
    database = Database(
        rows={"ai_calorie_adjustments": [row], "users": [{"calorie_goal": 2000}]},
        update_rows={"users": [], "ai_calorie_adjustments": [{**row, "status": "rejected"}]},
    )
    result = calorie_adjustment_service.decide_adjustment(user_id, adjustment_id, "accepted", database)
    assert result["status"] == "rejected"
    assert result["calorie_goal"] == 2000


def _save_profile(saved_row):
    database = Database(rows={"users": [saved_row]}, update_rows={"users": [{"id": "saved"}]})
    with patch.object(settings_service, "get_supabase", return_value=database):
        settings_service.update_user_settings_db("user", UserSettingsUpdate(**PROFILE))
    return next(record for table, action, record in database.writes if action == "update")


def test_saving_an_unchanged_profile_keeps_the_goal():
    assert "calorie_goal" not in _save_profile(PROFILE)


def test_changing_body_data_recalculates_the_goal():
    assert "calorie_goal" in _save_profile({**PROFILE, "weight": 90.0})


@pytest.mark.parametrize("change", [{"age": 5000}, {"weight": 999999}, {"height": 10}, {"objective": "x" * 51}])
def test_profile_values_have_the_same_limits_as_sign_up(change):
    with pytest.raises(ValidationError):
        UserSettingsUpdate(**{**PROFILE, **change})


@pytest.mark.parametrize("change", [
    {"exercises": []},
    {"started_at": NOW, "completed_at": NOW - timedelta(minutes=1)},
    {"started_at": NOW + timedelta(days=3), "completed_at": NOW + timedelta(days=3)},
    {"started_at": datetime(2010, 1, 1, tzinfo=timezone.utc)},
    {"exercises": [{"exercise_id": "0025", "sets": [{**ONE_SET[0], "weight_kg": 999999}]}]},
])
def test_impossible_workouts_are_rejected(change):
    with pytest.raises(ValidationError):
        _workout(**change)


def test_repeating_a_save_returns_the_first_workout():
    saved_id = uuid4()
    database = Database(rows={"workouts": [{"id": str(saved_id)}]})
    with patch.object(workout_service, "get_supabase", return_value=database):
        response = workout_service.save_workout_log(uuid4(), _workout())
    assert response.id == saved_id
    assert database.writes == []


def test_a_workout_cannot_link_to_someone_elses_routine():
    database = Database(rows={"routines": []})
    with patch.object(workout_service, "get_supabase", return_value=database), \
            patch.object(workout_service, "resolve_exercise_log_id", return_value=str(uuid4())), \
            patch.object(workout_service, "WorkoutLogResponse", lambda **values: values):
        workout_service.save_workout_log(uuid4(), _workout(routine_id=uuid4()))
    workout = next(record for table, action, record in database.writes if table == "workouts")
    assert workout["routine_id"] is None


def test_zero_calories_stay_zero():
    database = Database()
    with patch.object(nutrition_service, "get_supabase", return_value=database):
        meal = nutrition_service.create_user_meal(nutrition_service.MealCreateRequest(user_id=str(uuid4()), name="Water", calories=0, quantity_g=250))
    assert meal.item_calories == 0


def test_a_token_with_a_foreign_character_is_a_401():
    response = client.get("/api/v1/routines", headers={"Authorization": f"Bearer {uuid4()}.9999999999.\u00e9".encode("latin-1")})
    assert response.status_code == 401


def test_a_meal_id_that_is_not_a_uuid_is_a_422():
    assert client.delete("/api/v1/nutrition/meals/not-an-id", headers=auth_headers(uuid4())).status_code == 422


def test_routine_errors_do_not_reveal_database_text():
    class Broken(Database):
        def answer(self, table, written):
            if table == "routine_exercises" and written is not None:
                raise RuntimeError("secret database detail")
            return super().answer(table, written)

    exercise_id = str(uuid4())
    database = Broken(rows={"exercises": [{"id": exercise_id, "name": "Bench"}]})
    with patch.object(workout_service, "get_supabase", return_value=database), \
            patch.object(workout_service, "resolve_exercise_log_id", return_value=exercise_id):
        response = client.post(
            "/api/v1/routines",
            json={"name": "Push", "exercises": [{"exercise_id": exercise_id, "target_sets": 3, "target_reps": 10}]},
            headers=auth_headers(uuid4()),
        )
    assert response.status_code == 502
    assert "secret" not in response.text
