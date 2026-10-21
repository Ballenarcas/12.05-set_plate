from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from statistics import mean
from uuid import UUID

from fastapi import HTTPException

from app.db.supabase_client import get_supabase
from app.schemas.dashboard import CompletedWorkoutToday, DashboardSummary, NutritionDashboard, PlanExercise, WorkoutDashboard, WorkoutPlanSummary
from app.services.user_profile_service import calculate_calorie_goal


def _query_user(user_id: UUID) -> dict:
    response = (
        get_supabase(admin=True)
        .table("users")
        .select("calorie_goal,Name,Surname,weight,height,age,gender,objective")
        .eq("id", str(user_id))
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="User not found")
    return response.data[0]


def _calculate_target_calories(user: dict) -> int:
    if user.get("calorie_goal") is not None:
        try:
            return int(float(user["calorie_goal"]))
        except (ValueError, TypeError):
            pass

    missing_fields = [field for field in ("weight", "height", "age") if user.get(field) is None]
    if missing_fields:
        raise HTTPException(status_code=422, detail=f"User profile is missing: {', '.join(missing_fields)}")

    return calculate_calorie_goal(
        weight=user.get("weight"),
        height=user.get("height"),
        age=user.get("age"),
        gender=user.get("gender"),
        objective=user.get("objective"),
    )


def _query_today_meals(user_id: UUID) -> dict[str, float]:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    response = (
        get_supabase(admin=True)
        .table("meals")
        .select("calories,proteins,carbs,fats")
        .eq("user_id", str(user_id))
        .gte("consumed_at", start.isoformat())
        .lt("consumed_at", (start + timedelta(days=1)).isoformat())
        .execute()
    )
    return {
        "calories": sum(float(meal.get("calories") or 0) for meal in response.data or []),
        "protein": sum(float(meal.get("proteins") or 0) for meal in response.data or []),
        "carbs": sum(float(meal.get("carbs") or 0) for meal in response.data or []),
        "fat": sum(float(meal.get("fats") or 0) for meal in response.data or []),
    }


def _query_workout(user_id: UUID) -> WorkoutDashboard | None:
    routines = (
        get_supabase(admin=True)
        .table("routines")
        .select("id,name,routine_exercises(id),workouts(start_time,end_time)")
        .eq("user_id", str(user_id))
        .eq("workouts.user_id", str(user_id))
        .not_.is_("workouts.end_time", "null")
        .limit(1)
        .execute()
    ).data or []
    if not routines:
        return None

    routine = routines[0]
    exercise_rows = routine.get("routine_exercises") or []
    workouts = routine.get("workouts") or []

    durations = []
    for workout in workouts:
        if workout.get("start_time") and workout.get("end_time"):
            start = datetime.fromisoformat(workout["start_time"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(workout["end_time"].replace("Z", "+00:00"))
            durations.append((end - start).total_seconds() / 60)
    if not durations:
        return None

    return WorkoutDashboard(
        title=routine["name"],
        exercise_count=len(exercise_rows),
        estimated_duration_minutes=round(mean(durations)),
    )


def _query_todays_plan(user_id: UUID) -> WorkoutPlanSummary | None:
    today = datetime.now(timezone.utc).date()
    rows = (
        get_supabase(admin=True)
        .table("workout_plans")
        .select("id,routine_id,title,plan_date,is_rest_day,ai_adjusted,ai_reasoning,exercises")
        .eq("user_id", str(user_id))
        .eq("plan_date", today.isoformat())
        .limit(1)
        .execute()
    ).data or []
    if not rows:
        return None
    row = rows[0]
    return WorkoutPlanSummary(
        id=str(row["id"]),
        routine_id=str(row["routine_id"]) if row.get("routine_id") else None,
        title=row.get("title") or "Today's workout",
        plan_date=row["plan_date"],
        is_rest_day=bool(row.get("is_rest_day")),
        ai_adjusted=bool(row.get("ai_adjusted")),
        ai_reasoning=row.get("ai_reasoning"),
        exercises=[PlanExercise(**exercise) for exercise in row.get("exercises") or []],
    )


def _query_completed_workout_today(user_id: UUID) -> CompletedWorkoutToday | None:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = (
        get_supabase(admin=True)
        .table("workouts")
        .select("id,name")
        .eq("user_id", str(user_id))
        .gte("start_time", start.isoformat())
        .lt("start_time", (start + timedelta(days=1)).isoformat())
        .not_.is_("end_time", "null")
        .order("end_time", desc=True)
        .limit(1)
        .execute()
    ).data or []
    if not rows:
        return None
    return CompletedWorkoutToday(id=str(rows[0]["id"]), name=rows[0].get("name") or "Workout")


def get_dashboard_summary(user_id: UUID) -> DashboardSummary:
    client = get_supabase(admin=True)
    if client is None:
        raise HTTPException(status_code=503, detail="Supabase is not configured")

    with ThreadPoolExecutor(max_workers=5) as executor:
        user_future = executor.submit(_query_user, user_id)
        meals_future = executor.submit(_query_today_meals, user_id)
        workout_future = executor.submit(_query_workout, user_id)
        plan_future = executor.submit(_query_todays_plan, user_id)
        completed_future = executor.submit(_query_completed_workout_today, user_id)
        user = user_future.result()
        meals = meals_future.result()
        workout = workout_future.result()
        plan = plan_future.result()
        completed_workout = completed_future.result()

    target_kcals = _calculate_target_calories(user)
    target_protein = round(float(user["weight"]) * 1.6, 1)
    target_fat = round(target_kcals * 0.25 / 9, 1)
    target_carbs = round((target_kcals - target_protein * 4 - target_fat * 9) / 4, 1)
    nutrition = NutritionDashboard(
        remaining_kcals=max(0, round(target_kcals - meals["calories"])),
        target_kcals=target_kcals,
        current_protein=round(meals["protein"], 1),
        target_protein=target_protein,
        current_carbs=round(meals["carbs"], 1),
        target_carbs=max(0, target_carbs),
        current_fat=round(meals["fat"], 1),
        target_fat=target_fat,
    )
    full_name = " ".join(part for part in (user.get("Name"), user.get("Surname")) if part)
    return DashboardSummary(
        user_name=full_name,
        current_date_formatted=datetime.now().strftime("%a, %b %d"),
        ai_notification=None,
        nutrition=nutrition,
        workout=workout,
        plan=plan,
        completed_workout_today=completed_workout,
    )
