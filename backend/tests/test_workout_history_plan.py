from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest

from app.schemas.workout_log import WorkoutLogCreate
from app.services import workout_adjustment_service as service
from app.services import workout_service
from app.services.workout_program import objective_guidance
from tests.test_workout_adjustment_service import FakeDatabase

NOW = datetime.now(timezone.utc)
GUIDANCE = objective_guidance("Hypertrophy")


def _workout(name, days_ago, finished=True):
    started = NOW - timedelta(days=days_ago)
    return {"id": str(uuid4()), "name": name, "start_time": started.isoformat(),
            "end_time": started.isoformat() if finished else None}


def _sets(workout, group, exercises=5, sets=3, reps=8, weight=60):
    return [
        {"workout_id": workout["id"], "exercise_id": f"{group}-{index}", "set_number": number, "reps": reps,
         "weight": weight, "is_done": True, "exercises": {"name": f"{group} {index}", "muscle_group": group}}
        for index in range(exercises) for number in range(1, sets + 1)
    ]


def _sessions(workouts, sets, blocked=frozenset()):
    return service.history_sessions(workouts, sets, set(blocked), GUIDANCE, NOW)


def _plan_writes(database):
    return next(row for table, row in database.writes if table == "workout_plans")


def _database(workouts, sets):
    database = FakeDatabase()
    database.rows["routines"] = []
    database.rows["workouts"] = workouts
    database.rows["workout_sets"] = sets
    return database


def _model(monkeypatch, reply):
    prompts = []

    async def recommend(prompt, _schema):
        prompts.append(prompt)
        return reply

    monkeypatch.setattr(service, "_request_json", recommend)
    return prompts


@pytest.fixture(autouse=True)
def full_session_minimum(monkeypatch):
    monkeypatch.setattr(service, "MIN_PLAN_EXERCISES", 5)


def test_the_muscles_that_rested_longest_come_first():
    legs, chest = _workout("Legs", 13), _workout("Chest", 5)
    assert [row["name"] for row in _sessions([chest, legs], _sets(legs, "Legs") + _sets(chest, "Chest"))] == ["Legs", "Chest"]


def test_a_split_rotates_to_the_oldest_of_two_equal_sessions():
    newer, older = _workout("Lower B", 13), _workout("Lower A", 16)
    assert _sessions([newer, older], _sets(newer, "Legs") + _sets(older, "Legs"))[0]["name"] == "Lower A"


def test_a_short_session_is_not_offered_but_still_counts_as_training():
    short, upper, lower = _workout("Quick", 3), _workout("Upper", 14), _workout("Lower", 13)
    sets = _sets(short, "Chest", exercises=2) + _sets(upper, "Chest") + _sets(lower, "Legs")
    assert [row["name"] for row in _sessions([short, upper, lower], sets)] == ["Lower", "Upper"]


def test_recently_trained_muscles_and_unfinished_workouts_are_left_out():
    done, open_workout = _workout("Chest", 5), _workout("Legs", 6, finished=False)
    sets = _sets(done, "Chest") + _sets(open_workout, "Legs")
    assert _sessions([done, open_workout], sets, {"Chest"}) == []


def test_a_repeated_name_keeps_its_latest_session():
    latest, old = _workout("Upper", 5), _workout("Upper", 12)
    sets = _sets(latest, "Chest", weight=80) + _sets(old, "Chest", weight=70)
    sessions = _sessions([old, latest], sets)
    assert len(sessions) == 1
    assert sessions[0]["exercises"][0]["previous_weight_kg"] == 80


def test_targets_come_from_what_was_done_inside_the_goal():
    workout = _workout("Upper", 5)
    exercise = _sessions([workout], _sets(workout, "Chest", sets=6, reps=20))[0]["exercises"][0]
    assert exercise["target_sets"] == GUIDANCE["max_sets"]
    assert exercise["target_reps"] == GUIDANCE["max_reps"]


def test_a_past_session_keeps_the_order_it_was_trained_in():
    workout = _workout("Lower", 5)
    sets = [{**row, "exercise_order": 4 - int(row["exercise_id"][-1])} for row in _sets(workout, "Legs")]
    exercises = _sessions([workout], sets)[0]["exercises"]
    assert [row["exercise_id"] for row in exercises] == ["Legs-4", "Legs-3", "Legs-2", "Legs-1", "Legs-0"]


def test_saving_a_workout_stores_the_exercise_order(monkeypatch):
    database = FakeDatabase()
    database.rows["workout_sets"] = []
    database.rows["workouts"] = []
    monkeypatch.setattr(workout_service, "get_supabase", lambda **_: database)
    monkeypatch.setattr(workout_service, "resolve_exercise_log_id", lambda exercise_id: exercise_id)
    one_set = [{"set_number": 1, "weight_kg": 50, "reps": 8, "is_completed": True}]

    workout_service.save_workout_log(uuid4(), WorkoutLogCreate(
        name="Upper", duration_seconds=60, started_at=NOW, completed_at=NOW,
        exercises=[{"exercise_id": "bench", "sets": one_set}, {"exercise_id": "row", "sets": one_set}],
    ))

    assert [(row["exercise_id"], row["exercise_order"]) for row in database.rows["workout_sets"]] == [("bench", 0), ("row", 1)]


def test_workout_history_shows_exercises_in_training_order(monkeypatch):
    class Rows:
        def __init__(self, data):
            self.data = data

        def __getattr__(self, _):
            return self

        def __call__(self, *_args, **_kwargs):
            return self

    moment = NOW.isoformat()
    bench, curl = str(uuid4()), str(uuid4())
    sets = [
        {"exercise_id": exercise, "exercise_order": order, "set_number": 1, "reps": 8, "weight": 50, "is_done": True}
        for exercise, order in ((curl, 1), (bench, 0))
    ]
    row = {"id": str(uuid4()), "name": "Upper", "start_time": moment, "end_time": moment, "workout_sets": sets}
    monkeypatch.setattr(workout_service, "get_supabase", lambda **_: Rows([row]))

    entry = workout_service.list_workout_history(uuid4()).items[0]

    assert [str(exercise.exercise_id) for exercise in entry.exercises] == [bench, curl]


@pytest.mark.asyncio
async def test_a_short_saved_routine_is_ignored_for_past_sessions(monkeypatch):
    workout = _workout("Lower A", 10)
    database = _database([workout], _sets(workout, "Legs"))
    database.rows["routines"] = [{"id": database.routine_id, "name": "hola"}]
    prompts = _model(monkeypatch, {
        "routine_id": workout["id"], "workout_name": "Ignored", "rest_day": False, "adjusted": False,
        "reasoning": "", "exercises": [],
    })

    await service.plan_daily_workout(UUID(database.rows["users"][0]["id"]), database)

    plan = _plan_writes(database)
    assert "hola" not in prompts[0]
    assert plan["title"] == "Lower A"
    assert plan["routine_id"] is None  # a workout id must never be saved as a routine
    assert [(row["sets"], row["reps"], row["previous_weight_kg"]) for row in plan["exercises"]] == [(3, 8, 60.0)] * 5
    assert plan["ai_adjusted"] is True
    assert plan["ai_reasoning"].startswith("Based on your Lower A session")


@pytest.mark.asyncio
async def test_the_model_can_ease_a_past_session_but_never_raise_it(monkeypatch):
    workout = _workout("Lower A", 10)
    database = _database([workout], _sets(workout, "Legs"))
    _model(monkeypatch, {
        "routine_id": "not-an-option", "workout_name": "x", "rest_day": False, "adjusted": True, "reasoning": "Eased.",
        "exercises": [{"exercise_id": "Legs-0", "sets": 9, "reps": 30}, {"exercise_id": "Legs-1", "sets": 2, "reps": 6}],
    })

    await service.plan_daily_workout(UUID(database.rows["users"][0]["id"]), database)

    plan = _plan_writes(database)
    assert [(row["sets"], row["reps"]) for row in plan["exercises"][:3]] == [(3, 8), (2, 6), (3, 8)]
    assert plan["ai_reasoning"].endswith("Eased.")


@pytest.mark.asyncio
async def test_a_rest_day_needs_a_measured_deficit_when_the_muscles_are_recovered(monkeypatch):
    workout = _workout("Lower A", 10)
    database = _database([workout], _sets(workout, "Legs"))
    database.rows["meals"] = [{"calories": 900, "consumed_at": NOW.isoformat()}]
    prompts = _model(monkeypatch, {
        "routine_id": None, "workout_name": "Rest day", "rest_day": True, "adjusted": True,
        "reasoning": "You are in a deficit.", "exercises": [],
    })

    await service.plan_daily_workout(UUID(database.rows["users"][0]["id"]), database)

    plan = _plan_writes(database)
    assert '"last_48_hours_intake": null' in prompts[0]
    assert plan["is_rest_day"] is False
    assert plan["title"] == "Lower A"
    assert len(plan["exercises"]) == 5
    assert "deficit" not in plan["ai_reasoning"]


@pytest.mark.asyncio
async def test_without_history_the_generic_plan_still_runs(monkeypatch):
    database = _database([], [])
    prompts = _model(monkeypatch, {
        "routine_id": None, "workout_name": "Rest day", "rest_day": True, "adjusted": True,
        "reasoning": "Recover.", "exercises": [],
    })

    await service.plan_daily_workout(UUID(database.rows["users"][0]["id"]), database)

    assert '"available_routines": []' in prompts[0]


@pytest.mark.asyncio
@pytest.mark.parametrize(("hours_ago", "status"), [(12, "severe_deficit"), (30, "unknown")])
async def test_a_day_without_logs_is_not_a_deficit(monkeypatch, hours_ago, status):
    database = _database([], [])
    day = service.LocalDay(NOW.date(), NOW, NOW + timedelta(days=1))
    database.rows["meals"] = [{"calories": 300, "consumed_at": (NOW - timedelta(hours=hours_ago)).isoformat()}]
    prompts = _model(monkeypatch, {
        "routine_id": None, "workout_name": "Rest day", "rest_day": True, "adjusted": True,
        "reasoning": "Recover.", "exercises": [],
    })

    await service.plan_daily_workout(UUID(database.rows["users"][0]["id"]), database, day)

    assert f'"calorie_status": "{status}"' in prompts[0]


def test_lose_weight_gets_the_fat_loss_programme():
    assert objective_guidance("Lose Weight")["branch"] == "fat_loss"
    assert objective_guidance("Weight Loss")["branch"] == "fat_loss"
