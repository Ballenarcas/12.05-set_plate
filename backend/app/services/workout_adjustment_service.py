import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from groq import AsyncGroq

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


def _exercise_name(row: dict[str, Any]) -> str:
    exercise = row.get("exercises")
    if isinstance(exercise, list):
        exercise = exercise[0] if exercise else {}
    return (exercise or {}).get("name") or row.get("name") or "Exercise"


async def plan_daily_workout(user_id: UUID, db_session: Any) -> dict[str, Any]:
    """Build today's training plan and store it as a document, apart from completed workouts."""
    start, end = _today_window()
    today = start.date().isoformat()
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
            db_session.table("workouts").select("id,end_time").eq("user_id", str(user_id))
            .gte("start_time", start.isoformat()).lt("start_time", end.isoformat()).execute()
        )
        routines = _data(
            db_session.table("routines").select("id,name").eq("user_id", str(user_id)).execute()
        )
        existing_plans = _data(
            db_session.table("workout_plans").select("id,is_rest_day,ai_adjusted,ai_reasoning")
            .eq("user_id", str(user_id)).eq("plan_date", today).limit(1).execute()
        )
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("Could not load daily workout context")
        raise HTTPException(status_code=502, detail="Could not load workout context") from err

    if existing_plans:
        plan = existing_plans[0]
        return {"plan_id": plan["id"], "ai_adjusted": bool(plan.get("ai_adjusted")),
                "reasoning": plan.get("ai_reasoning"), "rest_day": bool(plan.get("is_rest_day")),
                "sets_created": False}
    if any(row.get("end_time") for row in workouts):
        return {"plan_id": None, "ai_adjusted": False, "reasoning": None, "rest_day": False,
                "sets_created": False}

    available_routines: list[dict[str, Any]] = []
    available_exercises: list[dict[str, Any]] = []
    if routines:
        routine_ids = [str(row["id"]) for row in routines]
        routine_rows = _data(
            db_session.table("routine_exercises")
            .select("routine_id,exercise_id,target_sets,target_reps,set_order,exercises(name)")
            .in_("routine_id", routine_ids).order("set_order").execute()
        )
        exercises_by_routine: dict[str, list[dict[str, Any]]] = {routine_id: [] for routine_id in routine_ids}
        for exercise in routine_rows:
            exercises_by_routine.setdefault(str(exercise["routine_id"]), []).append(exercise)
        available_routines = [
            {**routine, "exercises": exercises_by_routine.get(str(routine["id"]), [])}
            for routine in routines if exercises_by_routine.get(str(routine["id"]))
        ]
    if not available_routines:
        available_exercises = _data(
            db_session.table("exercises").select("id,name,muscle_group,muscles,equipment").limit(200).execute()
        )
        available_exercises = [
            {**exercise, "exercise_id": str(exercise["id"])}
            for exercise in available_exercises
            if exercise.get("id") and exercise.get("name")
        ]
        if not available_exercises:
            return {"plan_id": None, "ai_adjusted": False, "reasoning": None, "rest_day": False,
                    "sets_created": False}
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
            "routine_id": {"type": ["string", "null"]},
            "workout_name": {"type": "string"},
            "rest_day": {"type": "boolean"},
            "adjusted": {"type": "boolean"}, "reasoning": {"type": "string"},
            "exercises": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                "properties": {"exercise_id": {"type": "string"}, "sets": {"type": "integer", "minimum": 0}, "reps": {"type": "integer", "minimum": 0}},
                "required": ["exercise_id", "sets", "reps"]}},
        }, "required": ["routine_id", "workout_name", "rest_day", "adjusted", "reasoning", "exercises"],
    }
    if available_routines:
        plan_instruction = "Choose one supplied routine and return its id. Return every exercise in that routine, preserving exercise_id. Adjust set and rep counts based on the nutrition context."
        routine_context = available_routines
    else:
        plan_instruction = "Build a complete workout from the supplied exercise catalog only. Select a balanced group of exercises for one training session and choose practical sets and reps for each. Return routine_id as null and provide a concise workout_name. Do not invent exercise IDs or names."
        routine_context = []

    result = await _request_json(json.dumps({
        "user_targets": {key: user.get(key) for key in ("calorie_goal", "protein_goal", "carbs_goal", "fat_goal") if user.get(key) is not None},
        "last_48_hours_intake": totals, "calorie_status": calorie_status,
        "available_routines": routine_context,
        "available_exercises": available_exercises if not routine_context else [],
        "instruction": plan_instruction + " Set adjusted true if you changed a saved routine or created a new workout; otherwise use false."
            + " If recovery is the better choice today, set rest_day true, return routine_id null, workout_name \"Rest day\", an empty exercises array, and a short reasoning.",
    }), schema)
    if (
        not isinstance(result, dict)
        or not isinstance(result.get("rest_day"), bool)
        or not isinstance(result.get("adjusted"), bool)
        or not isinstance(result.get("reasoning"), str)
        or not isinstance(result.get("exercises"), list)
        or any(not isinstance(item, dict) or not isinstance(item.get("exercise_id"), str) for item in result["exercises"])
    ):
        raise HTTPException(status_code=502, detail="Groq returned an invalid workout plan")

    if result["rest_day"]:
        try:
            saved = _data(db_session.table("workout_plans").upsert({
                "user_id": str(user_id), "plan_date": today, "routine_id": None,
                "title": "Rest day", "exercises": [], "is_rest_day": True,
                "ai_adjusted": bool(result["adjusted"]), "ai_reasoning": result["reasoning"],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }, on_conflict="user_id,plan_date").select("id").execute())
            if not saved:
                raise RuntimeError("Supabase did not return the workout plan ID")
            plan_id = saved[0]["id"]
        except Exception as err:
            logger.exception("Could not save daily workout plan")
            raise HTTPException(status_code=502, detail="Could not save daily workout plan") from err
        return {"plan_id": plan_id, "ai_adjusted": result["adjusted"],
                "reasoning": result["reasoning"], "rest_day": True, "sets_created": True}

    selected_routine_id = str(result["routine_id"]) if result.get("routine_id") else None
    if available_routines:
        selected_routine = next((row for row in available_routines if str(row["id"]) == selected_routine_id), None)
        if selected_routine is None:
            raise HTTPException(status_code=502, detail="Groq selected an unavailable routine")
        routine_exercises = selected_routine["exercises"]
        workout_name = selected_routine["name"]
    else:
        catalog_by_id = {row["exercise_id"]: row for row in available_exercises}
        generated_exercises = result.get("exercises") or []
        if not isinstance(generated_exercises, list) or any(not isinstance(item, dict) for item in generated_exercises):
            raise HTTPException(status_code=502, detail="Groq returned an invalid generated workout")
        generated_ids = [str(item.get("exercise_id")) for item in generated_exercises]
        if (
            selected_routine_id is not None
            or not generated_exercises
            or any(not item.get("exercise_id") for item in generated_exercises)
            or len(set(generated_ids)) != len(generated_ids)
            or any(exercise_id not in catalog_by_id for exercise_id in generated_ids)
        ):
            raise HTTPException(status_code=502, detail="Groq returned exercises outside the available catalog")
        if any(
            not isinstance(item.get("sets"), int) or item["sets"] < 1
            or not isinstance(item.get("reps"), int) or item["reps"] < 1
            for item in generated_exercises
        ):
            raise HTTPException(status_code=502, detail="Groq returned invalid generated set targets")
        routine_exercises = [
            {**catalog_by_id[item["exercise_id"]], "target_sets": item["sets"], "target_reps": item["reps"]}
            for item in generated_exercises
        ]
        workout_name = result.get("workout_name")
        if not isinstance(workout_name, str) or not workout_name.strip():
            raise HTTPException(status_code=502, detail="Groq returned a workout without a name")
        workout_name = workout_name.strip()
        result["adjusted"] = True

    by_id = {str(row.get("exercise_id")): row for row in routine_exercises}
    recommendations = {item["exercise_id"]: item for item in result["exercises"]}
    if set(recommendations) != set(by_id):
        raise HTTPException(status_code=502, detail="Groq returned an invalid exercise plan")

    plan_exercises = []
    for exercise_id, source in by_id.items():
        recommendation = recommendations[exercise_id] if result["adjusted"] else {
            "sets": source.get("target_sets"), "reps": source.get("target_reps"),
        }
        plan_exercises.append({
            "exercise_id": exercise_id,
            "name": _exercise_name(source),
            "sets": int(recommendation.get("sets") or 0),
            "reps": int(recommendation.get("reps") or 0),
        })

    try:
        saved = _data(db_session.table("workout_plans").upsert({
            "user_id": str(user_id), "plan_date": today, "routine_id": selected_routine_id,
            "title": workout_name, "exercises": plan_exercises, "is_rest_day": False,
            "ai_adjusted": bool(result["adjusted"]),
            "ai_reasoning": result["reasoning"] if result["adjusted"] else None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="user_id,plan_date").select("id").execute())
        if not saved:
            raise RuntimeError("Supabase did not return the workout plan ID")
        plan_id = saved[0]["id"]
    except Exception as err:
        logger.exception("Could not save daily workout plan")
        raise HTTPException(status_code=502, detail="Could not save daily workout plan") from err

    return {"plan_id": plan_id, "ai_adjusted": result["adjusted"],
            "reasoning": result["reasoning"], "rest_day": False, "sets_created": True}


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
