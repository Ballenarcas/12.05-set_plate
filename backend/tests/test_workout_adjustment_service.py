from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

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
        return self

    def execute(self):
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
        self.exercise_id = str(uuid4())
        self.rows = {
            "users": [{"id": str(uuid4()), "calorie_goal": 2000}],
            "meals": [{"calories": 1800, "proteins": 100, "carbs": 200, "fats": 60}],
            "workouts": [{"id": self.workout_id, "routine_id": str(uuid4()), "name": "Session", "end_time": None}],
            "routines": [{"id": str(uuid4()), "name": "Routine"}],
            "routine_exercises": [{"exercise_id": self.exercise_id, "target_sets": 2, "target_reps": 8}],
            "workout_sets": [],
        }
        self.writes = []

    def table(self, name):
        return FakeQuery(self, name)


@pytest.mark.asyncio
async def test_daily_plan_creates_session_sets_and_saves_ai_reasoning(monkeypatch):
    database = FakeDatabase()
    planned_user_id = database.rows["users"][0]["id"]
    recommendation = {
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
    inserted = next(rows for table, rows in database.writes if table == "workout_sets")
    assert inserted == [{
        "workout_id": database.workout_id,
        "exercise_id": database.exercise_id,
        "set_number": 1,
        "reps": 6,
        "weight": None,
        "rpe": None,
        "is_done": False,
    }]
    assert any(table == "workouts" and row["ai_adjusted"] for table, row in database.writes)
    assert all(table not in {"routines", "routine_exercises"} for table, _ in database.writes)


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
