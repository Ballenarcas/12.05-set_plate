import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from groq import AsyncGroq
from fastapi import HTTPException

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_DEFICIT_RATIO = 0.8
_SURPLUS_RATIO = 1.2


async def _request_json(prompt: str, schema: dict[str, Any]) -> Any:
    settings = get_settings()
    if not settings.groq_api_key:
        raise HTTPException(status_code=503, detail="Groq is not configured")

    is_array = schema.get("type") == "array"
    response_schema = (
        {"type": "object", "properties": {"suggestions": schema},
         "required": ["suggestions"], "additionalProperties": False}
        if is_array else schema
    )
    client = AsyncGroq(api_key=settings.groq_api_key)
    try:
        response = await client.chat.completions.create(
            model=settings.groq_model,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": (
                    "Use only supplied data. Return valid JSON matching this schema, with no additional claims: "
                    f"{json.dumps(response_schema)}"
                )},
                {"role": "user", "content": prompt},
            ],
        )
        content = response.choices[0].message.content
        value = json.loads(content or "")
        if is_array:
            value = value.get("suggestions") if isinstance(value, dict) else None
            if not isinstance(value, list):
                raise ValueError("Expected a suggestions array")
        elif not isinstance(value, dict):
            raise ValueError("Expected a JSON object")
        return value
    except Exception as err:
        logger.exception("Groq workout adjustment request failed")
        raise HTTPException(status_code=502, detail="Could not generate workout adjustment") from err
    finally:
        await client.close()


def _data(response: Any) -> list[dict[str, Any]]:
    rows = response.data or []
    return rows if isinstance(rows, list) else [rows]


def _today_window() -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


async def plan_daily_workout(user_id: UUID, db_session: Any) -> dict[str, Any]:
    """Plan today's workout and persist only its execution sets and AI metadata."""
    start, end = _today_window()
    since = datetime.now(timezone.utc) - timedelta(hours=48)
    try:
        users = _data(db_session.table("users").select("*").eq("id", str(user_id)).limit(1).execute())
        if not users:
            raise HTTPException(status_code=404, detail="User not found")
        user = users[0]
        meals = _data(
            db_session.table("meals").select("*").eq("user_id", str(user_id))
            .gte("consumed_at", since.isoformat()).lt("consumed_at", end.isoformat()).execute()
        )
        workouts = _data(
            db_session.table("workouts").select("*").eq("user_id", str(user_id))
            .gte("start_time", start.isoformat()).lt("start_time", end.isoformat()).execute()
        )
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("Could not load daily workout context")
        raise HTTPException(status_code=502, detail="Could not load workout context") from err

    workout = next((row for row in workouts if row.get("routine_id") and not row.get("end_time")), None)
    if workout is None:
        return {"workout_id": None, "ai_adjusted": False, "reasoning": None, "sets": []}

    routines = _data(db_session.table("routines").select("*").eq("id", str(workout["routine_id"])).limit(1).execute())
    routine = routines[0] if routines else {}
    routine_exercises = _data(
        db_session.table("routine_exercises").select("*")
        .eq("routine_id", str(workout["routine_id"])).order("set_order").execute()
    )
    totals = {
        key: sum(float(meal.get(field) or 0) for meal in meals)
        for key, field in (("calories", "calories"), ("protein", "proteins"), ("carbs", "carbs"), ("fat", "fats"))
    }
    calorie_target = user.get("calorie_goal")
    calorie_status = "unknown"
    if calorie_target is not None:
        target_48h = float(calorie_target) * 2
        if totals["calories"] < target_48h * _DEFICIT_RATIO:
            calorie_status = "severe_deficit"
        elif totals["calories"] > target_48h * _SURPLUS_RATIO:
            calorie_status = "severe_surplus"
        else:
            calorie_status = "near_target"

    schema = {
        "type": "object", "additionalProperties": False,
        "properties": {
            "adjusted": {"type": "boolean"}, "reasoning": {"type": "string"},
            "exercises": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                "properties": {"exercise_id": {"type": "string"}, "sets": {"type": "integer", "minimum": 0}, "reps": {"type": "integer", "minimum": 0}},
                "required": ["exercise_id", "sets", "reps"]}},
        }, "required": ["adjusted", "reasoning", "exercises"],
    }
    result = await _request_json(json.dumps({
        "user_targets": {key: user.get(key) for key in ("calorie_goal", "protein_goal", "carbs_goal", "fat_goal") if user.get(key) is not None},
        "last_48_hours_intake": totals, "calorie_status": calorie_status,
        "workout": {"name": workout.get("name") or routine.get("name"), "exercises": routine_exercises},
        "instruction": "Return one entry for every exercise, preserving its exercise_id. Adjust only today's planned set and rep counts. If no adjustment is warranted, set adjusted false and preserve the planned counts.",
    }), schema)

    by_id = {str(row.get("exercise_id")): row for row in routine_exercises}
    recommendations = {item["exercise_id"]: item for item in result["exercises"]}
    if set(recommendations) != set(by_id):
        raise HTTPException(status_code=502, detail="Groq returned an invalid exercise plan")

    existing = _data(db_session.table("workout_sets").select("id").eq("workout_id", str(workout["id"])).execute())
    if not existing:
        set_rows = []
        for exercise_id, source in by_id.items():
            recommendation = recommendations[exercise_id] if result["adjusted"] else {
                "sets": source.get("target_sets"), "reps": source.get("target_reps"),
            }
            count = int(recommendation.get("sets") or 0)
            reps = int(recommendation.get("reps") or 0)
            set_rows.extend({
                "workout_id": str(workout["id"]), "exercise_id": exercise_id,
                "set_number": number, "reps": reps, "weight": None, "rpe": None, "is_done": False,
            } for number in range(1, count + 1))
        if set_rows:
            db_session.table("workout_sets").insert(set_rows).execute()

    if result["adjusted"]:
        db_session.table("workouts").update({
            "ai_adjusted": True, "ai_reasoning": result["reasoning"],
        }).eq("id", str(workout["id"])).execute()

    return {"workout_id": workout["id"], "ai_adjusted": result["adjusted"],
            "reasoning": result["reasoning"], "sets_created": not existing}


async def evaluate_live_fatigue(workout_id: UUID, current_set_data: dict, db_session: Any) -> list[dict[str, str]]:
    """Return proposed changes for user confirmation without mutating persistence."""
    workouts = _data(db_session.table("workouts").select("*").eq("id", str(workout_id)).limit(1).execute())
    if not workouts:
        raise HTTPException(status_code=404, detail="Workout not found")
    workout = workouts[0]
    routine_exercises = _data(
        db_session.table("routine_exercises").select("*")
        .eq("routine_id", str(workout["routine_id"])).order("set_order").execute()
    ) if workout.get("routine_id") else []
    logged_sets = _data(
        db_session.table("workout_sets").select("*").eq("workout_id", str(workout_id))
        .eq("is_done", True).execute()
    )
    planned_sets = _data(
        db_session.table("workout_sets").select("exercise_id,set_number,reps,weight,is_done")
        .eq("workout_id", str(workout_id)).execute()
    )
    remaining_set_counts: dict[str, int] = {}
    for row in planned_sets:
        if not row.get("is_done"):
            exercise_id = str(row.get("exercise_id"))
            remaining_set_counts[exercise_id] = remaining_set_counts.get(exercise_id, 0) + 1
    remaining = [
        {**row, "remaining_sets": remaining_set_counts[str(row.get("exercise_id"))]}
        for row in routine_exercises if str(row.get("exercise_id")) in remaining_set_counts
    ]
    schema = {
        "type": "array", "items": {"type": "object", "additionalProperties": False,
            "properties": {"action": {"type": "string", "enum": ["drop_set", "reduce_load", "skip_exercise"]},
                "exercise_id": {"type": "string"}, "reason": {"type": "string"}},
            "required": ["action", "exercise_id", "reason"]},
    }
    result = await _request_json(json.dumps({
        "current_set": current_set_data, "completed_sets": logged_sets,
        "remaining_exercises": remaining,
        "instruction": "Return specific, conservative suggestions for remaining exercise IDs only. Return an empty list if no change is warranted.",
    }), schema)
    valid_ids = {str(row.get("exercise_id")) for row in remaining}
    suggestions = result
    if not isinstance(suggestions, list):
        raise HTTPException(status_code=502, detail="Groq returned invalid fatigue suggestions")
    if any(not isinstance(item, dict) or item.get("exercise_id") not in valid_ids for item in suggestions):
        raise HTTPException(status_code=502, detail="Groq returned an invalid fatigue suggestion")
    return suggestions
