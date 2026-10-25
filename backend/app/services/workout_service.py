import logging
from datetime import datetime
from uuid import UUID, uuid4

from fastapi import HTTPException

from app.db.supabase_client import get_supabase
from app.schemas.exercise import Exercise
from app.schemas.workout import RoutineCreate, RoutineExerciseSummary, RoutineSummary, WorkoutSummary
from app.schemas.workout_log import (
    WorkoutHistoryEntry,
    WorkoutHistoryExercise,
    WorkoutHistoryResponse,
    WorkoutHistorySet,
    WorkoutLogCreate,
    WorkoutLogResponse,
    WorkoutLogUpdate,
)
from app.services.wger_importer import (
    get_cached_exercise,
    load_cached_exercises,
    muscle_group_for,
    resolve_exercise_log_id,
)

logger = logging.getLogger(__name__)


def get_programmed_workout() -> WorkoutSummary:
    return WorkoutSummary(title="Upper Body", exercise_count=4, duration_minutes=45)


def list_exercises(
    query: str | None = None,
    category: str | None = None,
    muscle_group: str | None = None,
    muscle: str | None = None,
    equipment: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[Exercise], int]:
    """Retrieves and filters exercises from catalog with pagination."""
    all_exercises = [
        exercise.model_copy(update={"muscle_group": muscle_group_for(exercise)})
        for exercise in load_cached_exercises()
    ]

    filtered = all_exercises
    if category:
        cat_lower = category.lower()
        filtered = [e for e in filtered if e.category and e.category.lower() == cat_lower]

    if muscle_group:
        group_lower = muscle_group.lower()
        filtered = [e for e in filtered if e.muscle_group.lower() == group_lower]

    if muscle:
        m_lower = muscle.lower()
        filtered = [
            e
            for e in filtered
            if any(m_lower in m.lower() for m in e.muscles + e.muscles_secondary)
        ]

    if equipment:
        eq_lower = equipment.lower()
        filtered = [
            e
            for e in filtered
            if any(eq_lower in eq.lower() for eq in e.equipment)
        ]

    if query:
        q_lower = query.lower().strip()
        filtered = [
            e
            for e in filtered
            if q_lower in e.name.lower()
            or (e.name_es and q_lower in e.name_es.lower())
            or any(q_lower in a.lower() for a in e.aliases)
            or (e.description and q_lower in e.description.lower())
        ]

    total = len(filtered)
    start_idx = max(0, (page - 1) * limit)
    end_idx = start_idx + limit
    return filtered[start_idx:end_idx], total


def get_exercise_by_id(exercise_id: str) -> Exercise | None:
    """Find an exercise by ID or wger_id using the in-memory catalog index."""
    return get_cached_exercise(exercise_id)


def get_exercise_categories() -> list[str]:
    """Returns unique list of exercise categories."""
    exercises = load_cached_exercises()
    categories = sorted({e.category for e in exercises if e.category})
    return categories


def get_exercise_muscle_groups() -> list[str]:
    return sorted({muscle_group_for(exercise) for exercise in load_cached_exercises()})


def _routine_reps_by_set(row: dict) -> list[int]:
    target_sets = int(row.get("target_sets") or 0)
    reps_by_set = row.get("reps_by_set")
    if isinstance(reps_by_set, list) and len(reps_by_set) == target_sets:
        return [int(reps) for reps in reps_by_set]
    return [int(row.get("target_reps") or 0)] * target_sets


def list_user_routines(user_id: UUID) -> list[RoutineSummary]:
    supabase = get_supabase(admin=True)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Supabase is not configured")

    routines = supabase.table("routines").select("id,name").eq("user_id", str(user_id)).execute().data or []
    if not routines:
        return []

    routine_ids = [routine["id"] for routine in routines]
    rows = (
        supabase.table("routine_exercises")
        .select("routine_id,exercise_id,target_sets,target_reps,reps_by_set,set_order,exercises(name)")
        .in_("routine_id", routine_ids)
        .order("set_order")
        .execute()
        .data or []
    )
    grouped: dict[str, list[RoutineExerciseSummary]] = {str(routine_id): [] for routine_id in routine_ids}
    for row in rows:
        exercise = row.get("exercises") or {}
        grouped.setdefault(str(row["routine_id"]), []).append(
            RoutineExerciseSummary(
                exercise_id=str(row["exercise_id"]),
                name=exercise.get("name", "Exercise"),
                target_sets=row.get("target_sets"),
                target_reps=row.get("target_reps"),
                reps_by_set=_routine_reps_by_set(row),
            )
        )
    return [
        RoutineSummary(id=str(routine["id"]), name=routine["name"], exercises=grouped.get(str(routine["id"]), []))
        for routine in routines
    ]


def create_user_routine(user_id: UUID, payload: RoutineCreate) -> RoutineSummary:
    supabase = get_supabase(admin=True)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Supabase is not configured")

    try:
        resolved_exercise_ids = [
            resolve_exercise_log_id(exercise.exercise_id)
            for exercise in payload.exercises
        ]
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err

    if len(set(resolved_exercise_ids)) != len(resolved_exercise_ids):
        raise HTTPException(status_code=400, detail="A routine cannot contain the same exercise more than once")

    routine_id = None
    exercise_names: dict[str, str] = {}
    try:
        available_exercises = (
            supabase.table("exercises")
            .select("id,name")
            .in_("id", resolved_exercise_ids)
            .execute()
            .data
            or []
        )
        available_ids = {str(row["id"]) for row in available_exercises}
        exercise_names = {
            str(row["id"]): str(row.get("name", "Exercise"))
            for row in available_exercises
        }
        unknown_ids = set(resolved_exercise_ids) - available_ids
        if unknown_ids:
            raise HTTPException(status_code=400, detail="One or more selected exercises are unavailable")

        routine_response = (
            supabase.table("routines")
            .insert({"user_id": str(user_id), "name": payload.name.strip()})
            .select("id")
            .execute()
        )
        routine_row = routine_response.data[0] if routine_response.data else None
        if not isinstance(routine_row, dict) or not routine_row.get("id"):
            raise RuntimeError("Supabase did not return the saved routine ID")
        routine_id = routine_row["id"]

        exercise_rows = [
            {
                "id": str(uuid4()),
                "routine_id": routine_id,
                "exercise_id": resolved_exercise_id,
                "set_order": index,
                "target_sets": exercise.target_sets,
                "target_reps": exercise.target_reps,
                "reps_by_set": exercise.reps_by_set or [exercise.target_reps] * exercise.target_sets,
            }
            for index, (exercise, resolved_exercise_id) in enumerate(
                zip(payload.exercises, resolved_exercise_ids),
                start=1,
            )
        ]
        supabase.table("routine_exercises").insert(exercise_rows).execute()
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("Failed to persist routine")
        if routine_id:
            try:
                supabase.table("routines").delete().eq("id", routine_id).execute()
            except Exception:
                logger.exception("Failed to clean up incomplete routine")
        raise HTTPException(status_code=502, detail=f"Could not save routine: {err}") from err

    return RoutineSummary(
        id=str(routine_id),
        name=payload.name.strip(),
        exercises=[
            RoutineExerciseSummary(
                exercise_id=resolved_exercise_id,
                name=exercise_names.get(resolved_exercise_id, "Exercise"),
                target_sets=exercise.target_sets,
                target_reps=exercise.target_reps,
                reps_by_set=exercise.reps_by_set or [exercise.target_reps] * exercise.target_sets,
            )
            for exercise, resolved_exercise_id in zip(payload.exercises, resolved_exercise_ids)
        ],
    )


def update_user_routine(user_id: UUID, routine_id: UUID, payload: RoutineCreate) -> RoutineSummary:
    supabase = get_supabase(admin=True)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Supabase is not configured")

    routine_rows = (
        supabase.table("routines")
        .select("id,name")
        .eq("id", str(routine_id))
        .eq("user_id", str(user_id))
        .execute()
        .data or []
    )
    if not routine_rows:
        raise HTTPException(status_code=404, detail="Routine not found")

    try:
        resolved_exercise_ids = [
            resolve_exercise_log_id(exercise.exercise_id)
            for exercise in payload.exercises
        ]
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err

    if len(set(resolved_exercise_ids)) != len(resolved_exercise_ids):
        raise HTTPException(status_code=400, detail="A routine cannot contain the same exercise more than once")

    exercise_rows = (
        supabase.table("exercises")
        .select("id,name")
        .in_("id", resolved_exercise_ids)
        .execute()
        .data or []
    )
    exercise_names = {str(row["id"]): str(row.get("name", "Exercise")) for row in exercise_rows}
    if set(resolved_exercise_ids) - exercise_names.keys():
        raise HTTPException(status_code=400, detail="One or more selected exercises are unavailable")

    existing_rows = (
        supabase.table("routine_exercises")
        .select("id,routine_id,exercise_id,target_sets,target_reps,reps_by_set,set_order")
        .eq("routine_id", str(routine_id))
        .execute()
        .data or []
    )
    replacement_rows = [
        {
            "id": str(uuid4()),
            "routine_id": str(routine_id),
            "exercise_id": exercise_id,
            "set_order": index,
            "target_sets": exercise.target_sets,
            "target_reps": exercise.target_reps,
            "reps_by_set": exercise.reps_by_set or [exercise.target_reps] * exercise.target_sets,
        }
        for index, (exercise, exercise_id) in enumerate(zip(payload.exercises, resolved_exercise_ids), start=1)
    ]

    try:
        supabase.table("routine_exercises").delete().eq("routine_id", str(routine_id)).execute()
        supabase.table("routine_exercises").insert(replacement_rows).execute()
        supabase.table("routines").update({"name": payload.name.strip()}).eq(
            "id", str(routine_id)
        ).eq("user_id", str(user_id)).execute()
    except Exception as err:
        logger.exception("Failed to update routine")
        try:
            supabase.table("routine_exercises").delete().eq("routine_id", str(routine_id)).execute()
            if existing_rows:
                supabase.table("routine_exercises").insert(existing_rows).execute()
        except Exception:
            logger.exception("Failed to restore routine exercises after update failure")
        raise HTTPException(status_code=502, detail=f"Could not update routine: {err}") from err

    return RoutineSummary(
        id=str(routine_id),
        name=payload.name.strip(),
        exercises=[
            RoutineExerciseSummary(
                exercise_id=exercise_id,
                name=exercise_names[exercise_id],
                target_sets=exercise.target_sets,
                target_reps=exercise.target_reps,
                reps_by_set=exercise.reps_by_set or [exercise.target_reps] * exercise.target_sets,
            )
            for exercise, exercise_id in zip(payload.exercises, resolved_exercise_ids)
        ],
    )


def delete_user_routine(user_id: UUID, routine_id: UUID) -> None:
    supabase = get_supabase(admin=True)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Supabase is not configured")

    routine = (
        supabase.table("routines")
        .select("id")
        .eq("id", str(routine_id))
        .eq("user_id", str(user_id))
        .execute()
        .data or []
    )
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found")

    try:
        supabase.table("workouts").update({"routine_id": None}).eq(
            "routine_id", str(routine_id)
        ).eq("user_id", str(user_id)).execute()
        supabase.table("routine_exercises").delete().eq(
            "routine_id", str(routine_id)
        ).execute()
        supabase.table("routines").delete().eq(
            "id", str(routine_id)
        ).eq("user_id", str(user_id)).execute()
    except Exception as err:
        logger.exception("Failed to delete routine")
        raise HTTPException(status_code=502, detail=f"Could not delete routine: {err}") from err


def save_workout_log(user_id: UUID, payload: WorkoutLogCreate) -> WorkoutLogResponse:
    supabase = get_supabase(admin=True)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Supabase is not configured")

    set_records = []
    for exercise in payload.exercises:
        try:
            resolved_id = resolve_exercise_log_id(exercise.exercise_id)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Unknown exercise '{exercise.exercise_id}'")
        set_records.extend(
            {
                "exercise_id": resolved_id,
                "set_number": set_item.set_number,
                "weight": set_item.weight_kg,
                "reps": set_item.reps,
                "rpe": set_item.rpe,
                "is_done": set_item.is_completed,
            }
            for set_item in exercise.sets
        )

    plan = None
    if payload.plan_id:
        plan_rows = (
            supabase.table("workout_plans")
            .select("id,routine_id,title,ai_adjusted,ai_reasoning")
            .eq("id", str(payload.plan_id))
            .eq("user_id", str(user_id))
            .limit(1)
            .execute()
            .data or []
        )
        if not plan_rows:
            raise HTTPException(status_code=404, detail="Workout plan not found")
        plan = plan_rows[0]

    routine_id = payload.routine_id or (plan.get("routine_id") if plan else None)
    workout_id = None
    try:
        record = {
            "user_id": str(user_id),
            "routine_id": str(routine_id) if routine_id else None,
            "name": payload.name.strip(),
            "start_time": payload.started_at.isoformat(),
            "end_time": payload.completed_at.isoformat(),
        }
        if plan is not None:
            record["ai_adjusted"] = bool(plan.get("ai_adjusted"))
            record["ai_reasoning"] = plan.get("ai_reasoning")
        response = (
            supabase.table("workouts")
            .insert(record)
            .select("id")
            .execute()
        )
        inserted = response.data
        workout_row = inserted[0] if isinstance(inserted, list) and inserted else inserted
        if not isinstance(workout_row, dict) or not workout_row.get("id"):
            raise RuntimeError("Supabase did not return the saved workout ID")
        workout_id = workout_row["id"]
        if set_records:
            for set_item in set_records:
                set_item["workout_id"] = workout_id
            supabase.table("workout_sets").insert(set_records).execute()
        if plan is not None:
            supabase.table("workout_plans").delete().eq("id", str(payload.plan_id)).eq("user_id", str(user_id)).execute()
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("Failed to persist workout and workout sets")
        if workout_id:
            try:
                supabase.table("workouts").delete().eq("id", workout_id).execute()
            except Exception:
                pass
        raise HTTPException(status_code=502, detail="Could not save workout history") from err

    return WorkoutLogResponse(id=workout_id, status="saved")


def list_workout_history(user_id: UUID, limit: int = 30) -> WorkoutHistoryResponse:
    supabase = get_supabase(admin=True)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Supabase is not configured")

    rows = (
        supabase.table("workouts")
        .select(
            "id,routine_id,name,start_time,end_time,routines(name),"
            "workout_sets(exercise_id,set_number,reps,weight,rpe,is_done,exercises(name))"
        )
        .eq("user_id", str(user_id))
        .not_.is_("end_time", "null")
        .order("start_time", desc=True)
        .limit(limit)
        .execute()
        .data or []
    )

    history = []
    for row in rows:
        started_at = datetime.fromisoformat(row["start_time"].replace("Z", "+00:00"))
        completed_at = datetime.fromisoformat(row["end_time"].replace("Z", "+00:00")) if row.get("end_time") else None
        exercises: dict[str, dict] = {}
        for set_row in row.get("workout_sets") or []:
            exercise_id = str(set_row["exercise_id"])
            exercise = set_row.get("exercises") or {}
            if isinstance(exercise, list):
                exercise = exercise[0] if exercise else {}
            item = exercises.setdefault(exercise_id, {
                "exercise_id": exercise_id,
                "name": exercise.get("name") or "Exercise",
                "sets": [],
            })
            item["sets"].append(WorkoutHistorySet(
                set_number=set_row["set_number"],
                reps=set_row["reps"],
                weight_kg=float(set_row.get("weight") or 0),
                rpe=set_row.get("rpe"),
                is_completed=bool(set_row.get("is_done")),
            ))

        routine = row.get("routines") or {}
        if isinstance(routine, list):
            routine = routine[0] if routine else {}
        history.append(WorkoutHistoryEntry(
            id=row["id"],
            routine_id=row.get("routine_id"),
            name=row.get("name") or routine.get("name") or "Custom workout",
            started_at=started_at,
            completed_at=completed_at,
            duration_seconds=max(0, int((completed_at - started_at).total_seconds())) if completed_at else 0,
            exercises=[WorkoutHistoryExercise(**exercise) for exercise in exercises.values()],
        ))
    return WorkoutHistoryResponse(items=history)


def update_workout_history_entry(
    user_id: UUID,
    workout_id: UUID,
    payload: WorkoutLogUpdate,
) -> WorkoutLogResponse:
    supabase = get_supabase(admin=True)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Supabase is not configured")

    workout_rows = (
        supabase.table("workouts")
        .select("id")
        .eq("id", str(workout_id))
        .eq("user_id", str(user_id))
        .limit(1)
        .execute()
        .data or []
    )
    if not workout_rows:
        raise HTTPException(status_code=404, detail="Workout history entry not found")

    set_records = []
    for exercise in payload.exercises:
        try:
            resolved_id = resolve_exercise_log_id(exercise.exercise_id)
        except ValueError as err:
            raise HTTPException(status_code=400, detail=f"Unknown exercise '{exercise.exercise_id}'") from err
        set_records.extend(
            {
                "workout_id": str(workout_id),
                "exercise_id": resolved_id,
                "set_number": set_item.set_number,
                "weight": set_item.weight_kg,
                "reps": set_item.reps,
                "rpe": set_item.rpe,
                "is_done": set_item.is_completed,
            }
            for set_item in exercise.sets
        )

    existing_sets = (
        supabase.table("workout_sets")
        .select("exercise_id,set_number,reps,weight,rpe,is_done")
        .eq("workout_id", str(workout_id))
        .execute()
        .data or []
    )
    updated_sets = False
    try:
        supabase.table("workout_sets").delete().eq("workout_id", str(workout_id)).execute()
        updated_sets = True
        if set_records:
            supabase.table("workout_sets").insert(set_records).execute()
        response = (
            supabase.table("workouts")
            .update({"name": payload.name.strip()})
            .eq("id", str(workout_id))
            .eq("user_id", str(user_id))
            .select("id")
            .execute()
        )
        if not response.data:
            raise RuntimeError("Workout history entry was not updated")
    except Exception as err:
        if updated_sets:
            try:
                supabase.table("workout_sets").delete().eq("workout_id", str(workout_id)).execute()
                if existing_sets:
                    restored_sets = [
                        {"workout_id": str(workout_id), **set_item}
                        for set_item in existing_sets
                    ]
                    supabase.table("workout_sets").insert(restored_sets).execute()
            except Exception:
                logger.exception("Could not restore workout sets after edit failed")
        logger.exception("Failed to update workout history entry")
        raise HTTPException(status_code=502, detail="Could not update workout history") from err

    return WorkoutLogResponse(id=workout_id, status="updated")


def delete_workout_history_entry(user_id: UUID, workout_id: UUID) -> None:
    supabase = get_supabase(admin=True)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Supabase is not configured")

    workout = (
        supabase.table("workouts")
        .select("id")
        .eq("id", str(workout_id))
        .eq("user_id", str(user_id))
        .execute()
        .data or []
    )
    if not workout:
        raise HTTPException(status_code=404, detail="Workout history entry not found")

    try:
        supabase.table("workout_sets").delete().eq("workout_id", str(workout_id)).execute()
        supabase.table("workouts").delete().eq("id", str(workout_id)).eq("user_id", str(user_id)).execute()
    except Exception as err:
        logger.exception("Failed to delete workout history entry")
        raise HTTPException(status_code=502, detail="Could not delete workout history entry") from err


def summarize_today_workouts(user_id: UUID | str, today_start: datetime, today_end: datetime) -> int:
    """Total completed-workout seconds whose end falls inside [today_start, today_end)."""
    supabase = get_supabase(admin=True)
    if supabase is None:
        return 0
    try:
        rows = (
            supabase.table("workouts")
            .select("start_time,end_time")
            .eq("user_id", str(user_id))
            .not_.is_("end_time", "null")
            .gte("end_time", today_start.isoformat())
            .lt("end_time", today_end.isoformat())
            .execute()
            .data or []
        )
        total = 0.0
        for row in rows:
            start = row.get("start_time")
            end = row.get("end_time")
            if not start or not end:
                continue
            started = datetime.fromisoformat(start.replace("Z", "+00:00"))
            completed = datetime.fromisoformat(end.replace("Z", "+00:00"))
            total += max(0.0, (completed - started).total_seconds())
        return int(total)
    except Exception as err:
        logger.warning("Could not summarize today's workouts: %s", err)
        return 0
