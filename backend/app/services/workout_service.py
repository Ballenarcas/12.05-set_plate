from datetime import datetime
from uuid import UUID

from fastapi import HTTPException

from app.db.supabase_client import get_supabase
from app.schemas.exercise import Exercise
from app.schemas.workout import RoutineExerciseSummary, RoutineSummary, WorkoutSummary
from app.schemas.workout_log import WorkoutLogCreate, WorkoutLogResponse
from app.services.wger_importer import get_cached_exercise, load_cached_exercises, resolve_exercise_log_id


def get_programmed_workout() -> WorkoutSummary:
    return WorkoutSummary(title="Upper Body", exercise_count=4, duration_minutes=45)


def list_exercises(
    query: str | None = None,
    category: str | None = None,
    muscle: str | None = None,
    equipment: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[Exercise], int]:
    """Retrieves and filters exercises from catalog with pagination."""
    all_exercises = load_cached_exercises()

    filtered = all_exercises
    if category:
        cat_lower = category.lower()
        filtered = [e for e in filtered if e.category and e.category.lower() == cat_lower]

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
        .select("routine_id,exercise_id,target_sets,target_reps,set_order,exercises(name)")
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
            )
        )
    return [
        RoutineSummary(id=str(routine["id"]), name=routine["name"], exercises=grouped.get(str(routine["id"]), []))
        for routine in routines
    ]


def save_workout_log(user_id: UUID, payload: WorkoutLogCreate) -> WorkoutLogResponse:
    supabase = get_supabase(admin=True)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Supabase is not configured")

    workout_record = {
        "user_id": str(user_id),
        "routine_id": str(payload.routine_id) if payload.routine_id else None,
        "name": payload.name,
        "duration_seconds": payload.duration_seconds,
        "started_at": payload.started_at.isoformat(),
        "completed_at": payload.completed_at.isoformat(),
    }
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
                "weight_kg": set_item.weight_kg,
                "reps": set_item.reps,
                "is_completed": set_item.is_completed,
            }
            for set_item in exercise.sets
        )
    response = supabase.rpc(
        "log_workout_transaction",
        {"p_user_id": str(user_id), "p_workout": workout_record, "p_sets": set_records},
    ).execute()
    data = response.data
    log_id = data.get("id") if isinstance(data, dict) else data
    return WorkoutLogResponse(id=log_id, status="saved")

