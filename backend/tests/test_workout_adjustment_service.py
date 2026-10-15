import json
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

    def select(self, columns):
        self.columns = columns
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def in_(self, column, values):
        self.filters[column] = values
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
        if self.table_name == "workout_sets" and self.filters.get("is_done") is True:
            rows = [row for row in rows if row.get("is_done")]
        elif self.table_name == "workout_sets" and self.columns != "id":
            rows = [row for row in rows if not row.get("is_done")]
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


@pytest.mark.asyncio
async def test_live_fatigue_returns_suggestions_without_database_writes(monkeypatch):
    database = FakeDatabase()
    database.rows["workout_sets"] = [
        {"exercise_id": database.exercise_id, "set_number": 1, "reps": 8, "is_done": False},
    ]
    suggestions = [{
        "action": "drop_set",
        "exercise_id": database.exercise_id,
        "reason": "High effort on the previous set.",
    }]

    async def recommend(*_):
        return suggestions

    monkeypatch.setattr(service, "_request_json", recommend)
    result = await service.evaluate_live_fatigue(
        UUID(database.workout_id), {"exercise_id": database.exercise_id, "rpe": 10}, database,
    )

    assert result == suggestions
    assert database.writes == []


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
