import json
from collections import Counter
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from app.services import workout_adjustment_service as service


class FakeQuery:
    def __init__(self, database, table):
        self.database = database
        self.table_name = table
        self.operation = "select"
        self.columns = "*"
        self.filters = {}
        self.in_filters = {}
        self.range_bounds = None

    def select(self, columns):
        self.columns = columns
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def in_(self, column, values):
        self.filters[column] = values
        self.in_filters[column] = values
        return self

    def is_(self, column, value):
        self.filters[column] = value
        return self

    def gte(self, *_):
        return self

    def lt(self, *_):
        return self

    def order(self, *_):
        return self

    def limit(self, *_):
        return self

    def range(self, start, end):
        self.range_bounds = (start, end)
        return self

    def update(self, row):
        self.operation = "update"
        self.database.writes.append((self.table_name, row))
        return self

    def insert(self, rows):
        self.operation = "insert"
        self.database.writes.append((self.table_name, rows))
        self.database.last_insert = rows
        return self

    def upsert(self, row, on_conflict=None):
        self.operation = "upsert"
        self.database.writes.append((self.table_name, row))
        self.database.last_insert = row
        return self

    def execute(self):
        if self.operation == "insert":
            if isinstance(self.database.last_insert, dict):
                inserted = {**self.database.last_insert, "id": self.database.workout_id}
                self.database.rows.setdefault(self.table_name, []).append(inserted)
                return SimpleNamespace(data=[{"id": inserted["id"]}])
            self.database.rows.setdefault(self.table_name, []).extend(self.database.last_insert)
            return SimpleNamespace(data=self.database.last_insert)
        if self.operation == "upsert":
            saved = {**self.database.last_insert, "id": self.database.plan_id}
            self.database.rows.setdefault(self.table_name, []).append(saved)
            return SimpleNamespace(data=[{"id": saved["id"]}])
        if self.operation != "select":
            return SimpleNamespace(data=[])
        rows = self.database.rows.get(self.table_name, [])
        for column, values in self.in_filters.items():
            allowed = {str(value) for value in values}
            rows = [row for row in rows if str(row.get(column)) in allowed]
        if self.table_name == "workout_sets" and self.filters.get("is_done") is True:
            rows = [row for row in rows if row.get("is_done")]
        elif self.table_name == "workout_sets" and self.columns != "id":
            rows = [row for row in rows if not row.get("is_done")]
        if self.range_bounds is not None:
            start, end = self.range_bounds
            rows = rows[start:end + 1]
        return SimpleNamespace(data=rows)


class FakeDatabase:
    def __init__(self):
        self.workout_id = str(uuid4())
        self.plan_id = str(uuid4())
        self.routine_id = str(uuid4())
        self.exercise_id = str(uuid4())
        self.rows = {
            "users": [{"id": str(uuid4()), "calorie_goal": 2000}],
            "meals": [{"calories": 1800, "proteins": 100, "carbs": 200, "fats": 60}],
            "workouts": [{"id": self.workout_id, "routine_id": self.routine_id, "name": "Session", "end_time": None}],
            "routines": [{"id": self.routine_id, "name": "Routine"}],
            "routine_exercises": [{
                "routine_id": self.routine_id,
                "exercise_id": self.exercise_id,
                "target_sets": 2,
                "target_reps": 8,
                "set_order": 1,
                "exercises": {"name": "Catalog press"},
            }],
            "exercises": [
                {"id": self.exercise_id, "name": "Catalog press", "muscle_group": "Upper body", "muscles": ["chest"], "equipment": ["barbell"]},
                {"id": str(uuid4()), "name": "Catalog row", "muscle_group": "Upper body", "muscles": ["back"], "equipment": ["cable"]},
            ],
            "workout_sets": [],
            "workout_plans": [],
        }
        self.writes = []
        self.last_insert = None

    def table(self, name):
        return FakeQuery(self, name)


@pytest.mark.asyncio
async def test_daily_plan_persists_ai_reasoning_in_the_plan_document(monkeypatch):
    database = FakeDatabase()
    planned_user_id = database.rows["users"][0]["id"]
    recommendation = {
        "routine_id": database.routine_id,
        "workout_name": "Routine",
        "rest_day": False,
        "adjusted": True,
        "reasoning": "Reduce volume after low recent intake.",
        "exercises": [{"exercise_id": database.exercise_id, "sets": 1, "reps": 6}],
    }

    async def recommend(*_):
        return recommendation

    monkeypatch.setattr(service, "_request_json", recommend)
    result = await service.plan_daily_workout(UUID(planned_user_id), database)

    assert result["ai_adjusted"] is True
    assert result["reasoning"] == recommendation["reasoning"]
    assert result["plan_id"] == database.plan_id
    plan = next(row for table, row in database.writes if table == "workout_plans")
    assert plan["ai_adjusted"] is True
    assert plan["ai_reasoning"] == recommendation["reasoning"]
    assert plan["routine_id"] == database.routine_id
    assert plan["title"] == "Routine"
    assert plan["exercises"] == [{
        "exercise_id": database.exercise_id,
        "name": "Catalog press",
        "sets": 1,
        "reps": 6,
    }]
    assert all(table not in {"workouts", "workout_sets"} for table, _ in database.writes)


@pytest.mark.asyncio
async def test_daily_plan_generates_a_plan_without_a_saved_routine(monkeypatch):
    database = FakeDatabase()
    database.rows["workouts"] = []
    database.rows["routines"] = []
    planned_user_id = database.rows["users"][0]["id"]
    catalog_ids = {exercise["id"] for exercise in database.rows["exercises"]}
    recommendation = {
        "routine_id": None,
        "workout_name": "Balanced session",
        "rest_day": False,
        "adjusted": True,
        "reasoning": "Built from the available exercise catalog.",
        "exercises": [
            {"exercise_id": exercise_id, "sets": 3, "reps": 8}
            for exercise_id in catalog_ids
        ],
    }
    prompts = []

    async def recommend(prompt, _schema):
        prompts.append(prompt)
        return recommendation

    monkeypatch.setattr(service, "_request_json", recommend)
    result = await service.plan_daily_workout(UUID(planned_user_id), database)

    assert result["ai_adjusted"] is True
    assert result["plan_id"] == database.plan_id
    plan = next(row for table, row in database.writes if table == "workout_plans")
    assert plan["routine_id"] is None
    assert plan["title"] == "Balanced session"
    assert len(plan["exercises"]) == len(catalog_ids)
    assert {row["exercise_id"] for row in plan["exercises"]} == catalog_ids
    assert all(row["sets"] == 3 and row["reps"] == 8 for row in plan["exercises"])
    assert all(table not in {"workouts", "workout_sets"} for table, _ in database.writes)
    prompt_data = json.loads(prompts[0])
    assert {row["id"] for row in prompt_data["available_exercises"]} == catalog_ids


@pytest.mark.asyncio
async def test_generated_plan_rejects_exercise_ids_outside_the_catalog(monkeypatch):
    database = FakeDatabase()
    database.rows["workouts"] = []
    database.rows["routines"] = []
    planned_user_id = database.rows["users"][0]["id"]

    async def recommend(*_):
        return {
            "routine_id": None,
            "workout_name": "Invented session",
            "rest_day": False,
            "adjusted": True,
            "reasoning": "Invalid candidate.",
            "exercises": [{"exercise_id": "not-in-catalog", "sets": 2, "reps": 10}],
        }

    monkeypatch.setattr(service, "_request_json", recommend)
    with pytest.raises(HTTPException) as error:
        await service.plan_daily_workout(UUID(planned_user_id), database)

    assert error.value.status_code == 502
    assert database.writes == []


def recent_set(database, exercise_id):
    database.rows["workout_sets"] = [{
        "workout_id": database.workout_id,
        "exercise_id": exercise_id,
        "is_done": False,
    }]


def set_routine_muscle_group(database, group):
    database.rows["routine_exercises"][0]["exercises"]["muscle_group"] = group


@pytest.mark.asyncio
async def test_daily_plan_replaces_a_recently_trained_routine_with_other_muscles(monkeypatch):
    database = FakeDatabase()
    set_routine_muscle_group(database, "Chest")
    database.rows["exercises"][0]["muscle_group"] = "Chest"
    database.rows["exercises"][1]["muscle_group"] = "Chest"
    safe_exercise_id = str(uuid4())
    database.rows["exercises"].append({
        "id": safe_exercise_id, "name": "Leg press", "muscle_group": "Legs",
        "muscles": ["quadriceps"], "equipment": ["machine"],
    })
    recent_set(database, database.exercise_id)
    recommendation = {
        "routine_id": None,
        "workout_name": "Legs",
        "rest_day": False,
        "adjusted": True,
        "reasoning": "Chest was trained in the last two days.",
        "exercises": [{"exercise_id": safe_exercise_id, "sets": 3, "reps": 10}],
    }
    prompts = []

    async def recommend(prompt, _schema):
        prompts.append(prompt)
        return recommendation

    monkeypatch.setattr(service, "_request_json", recommend)
    result = await service.plan_daily_workout(UUID(database.rows["users"][0]["id"]), database)

    assert result["rest_day"] is False
    prompt_data = json.loads(prompts[0])
    assert prompt_data["available_routines"] == []
    assert prompt_data["recent_muscle_groups"] == ["Chest"]
    assert [row["id"] for row in prompt_data["available_exercises"]] == [safe_exercise_id]
    plan = next(row for table, row in database.writes if table == "workout_plans")
    assert [row["exercise_id"] for row in plan["exercises"]] == [safe_exercise_id]


@pytest.mark.asyncio
async def test_daily_plan_rests_when_every_muscle_group_was_recently_trained(monkeypatch):
    database = FakeDatabase()
    set_routine_muscle_group(database, "Chest")
    database.rows["exercises"][0]["muscle_group"] = "Chest"
    database.rows["exercises"][1]["muscle_group"] = "Chest"
    recent_set(database, database.exercise_id)
    prompts = []

    async def recommend(prompt, _schema):
        prompts.append(prompt)
        return {}

    monkeypatch.setattr(service, "_request_json", recommend)
    result = await service.plan_daily_workout(UUID(database.rows["users"][0]["id"]), database)

    assert result["rest_day"] is True
    assert prompts == []
    plan = next(row for table, row in database.writes if table == "workout_plans")
    assert plan["is_rest_day"] is True
    assert plan["ai_adjusted"] is True
    assert "48 hours" in plan["ai_reasoning"]


@pytest.mark.asyncio
async def test_daily_plan_keeps_a_routine_that_avoids_recent_muscles(monkeypatch):
    database = FakeDatabase()
    set_routine_muscle_group(database, "Chest")
    legs_exercise_id = str(uuid4())
    database.rows["exercises"].append({
        "id": legs_exercise_id, "name": "Leg press", "muscle_group": "Legs",
        "muscles": ["quadriceps"], "equipment": ["machine"],
    })
    recent_set(database, legs_exercise_id)
    recommendation = {
        "routine_id": database.routine_id,
        "workout_name": "Routine",
        "rest_day": False,
        "adjusted": True,
        "reasoning": "Chest is fresh.",
        "exercises": [{"exercise_id": database.exercise_id, "sets": 2, "reps": 8}],
    }
    prompts = []

    async def recommend(prompt, _schema):
        prompts.append(prompt)
        return recommendation

    monkeypatch.setattr(service, "_request_json", recommend)
    await service.plan_daily_workout(UUID(database.rows["users"][0]["id"]), database)

    prompt_data = json.loads(prompts[0])
    assert [row["id"] for row in prompt_data["available_routines"]] == [database.routine_id]
    assert prompt_data["available_exercises"] == []
    assert prompt_data["recent_muscle_groups"] == ["Legs"]


def test_exercise_pool_skips_blocked_muscles_and_recent_exercises():
    catalog = [
        {"id": f"chest-{index}", "muscle_group": "Chest"} for index in range(3)
    ] + [
        {"id": f"legs-{index}", "muscle_group": "Legs"} for index in range(3)
    ]

    first = service._sample_exercise_pool(catalog, {"Chest"}, {"legs-0"}, "user:2026-10-20")
    second = service._sample_exercise_pool(catalog, {"Chest"}, {"legs-0"}, "user:2026-10-20")

    assert {row["id"] for row in first} == {"legs-1", "legs-2"}
    assert [row["id"] for row in first] == [row["id"] for row in second]


def test_exercise_pool_covers_groups_before_doubling_up():
    catalog = [
        {"id": f"g{group}-{index}", "muscle_group": f"G{group}"}
        for group in range(4) for index in range(10)
    ]

    pool = service._sample_exercise_pool(catalog, set(), set(), "seed", limit=8)

    counts = Counter(row["muscle_group"] for row in pool)
    assert set(counts) == {"G0", "G1", "G2", "G3"}
    assert set(counts.values()) == {2}


@pytest.mark.asyncio
def live_workout(**overrides):
    workout = {
        "name": "Push day",
        "duration_seconds": 900,
        "user_goal": "Hypertrophy",
        "exercises": [{
            "exercise_id": "bench",
            "name": "Bench press",
            "sets": [
                {"set_number": 1, "weight_kg": 80, "reps": 8, "is_completed": True, "kind": "normal"},
                {"set_number": 2, "weight_kg": 80, "reps": 8, "is_completed": False, "kind": "normal"},
            ],
        }],
    }
    workout.update(overrides)
    return workout


@pytest.mark.asyncio
async def test_live_adjustment_accepts_a_lower_load(monkeypatch):
    suggestions = [{"action": "reduce_load", "exercise_id": "bench", "reason": "RPE 9 on set one.", "new_weight_kg": 72.5}]

    async def recommend(*_):
        return suggestions

    monkeypatch.setattr(service, "_request_json", recommend)
    assert await service.suggest_live_adjustment(live_workout()) == suggestions


@pytest.mark.asyncio
async def test_live_adjustment_rejects_a_load_that_is_not_a_reduction(monkeypatch):
    suggestions = [{"action": "reduce_load", "exercise_id": "bench", "reason": "Heavier.", "new_weight_kg": 90}]

    async def recommend(*_):
        return suggestions

    monkeypatch.setattr(service, "_request_json", recommend)
    with pytest.raises(HTTPException) as error:
        await service.suggest_live_adjustment(live_workout())
    assert error.value.status_code == 502


@pytest.mark.asyncio
async def test_live_adjustment_skips_exercises_without_remaining_sets(monkeypatch):
    workout = live_workout()
    workout["exercises"][0]["sets"] = workout["exercises"][0]["sets"][:1]
    suggestions = [{"action": "stop_exercise", "exercise_id": "bench", "reason": "Done already."}]

    async def recommend(*_):
        return suggestions

    monkeypatch.setattr(service, "_request_json", recommend)
    assert await service.suggest_live_adjustment(workout) == []


@pytest.mark.asyncio
async def test_live_adjustment_strips_values_from_actions_that_take_none(monkeypatch):
    suggestions = [{
        "action": "drop_set",
        "exercise_id": "bench",
        "reason": "Finish with a drop set.",
        "new_weight_kg": 60,
    }]

    async def recommend(*_):
        return suggestions

    monkeypatch.setattr(service, "_request_json", recommend)
    result = await service.suggest_live_adjustment(live_workout())
    assert result == [{"action": "drop_set", "exercise_id": "bench", "reason": "Finish with a drop set."}]


@pytest.mark.asyncio
async def test_groq_request_uses_example_model_and_unwraps_suggestion_array(monkeypatch):
    calls = {}

    class FakeCompletions:
        async def create(self, **kwargs):
            calls.update(kwargs)
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
                content='{"suggestions": [{"action": "drop_set", "exercise_id": "ex-1", "reason": "High RPE."}]}'
            ))])

    class FakeClient:
        def __init__(self, api_key):
            calls["api_key"] = api_key
            self.chat = SimpleNamespace(completions=FakeCompletions())

        async def close(self):
            calls["closed"] = True

    monkeypatch.setattr(service, "AsyncGroq", FakeClient)
    monkeypatch.setattr(service, "get_settings", lambda: SimpleNamespace(
        groq_api_key="test-key", groq_model="llama-3.3-70b-versatile",
    ))

    result = await service._request_json("context", {
        "type": "array", "items": {"type": "object"},
    })

    assert result == [{"action": "drop_set", "exercise_id": "ex-1", "reason": "High RPE."}]
    assert calls["api_key"] == "test-key"
    assert calls["model"] == "llama-3.3-70b-versatile"
    assert calls["response_format"] == {"type": "json_object"}
    assert calls["closed"] is True
