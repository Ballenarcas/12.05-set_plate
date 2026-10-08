from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.schemas.exercise import Exercise, ExerciseListResponse, WgerImportResponse
from app.services.wger_importer import run_import
from app.services.workout_service import (
    get_exercise_by_id,
    get_exercise_categories,
    get_programmed_workout,
    list_exercises,
    save_workout_log,
)
from app.schemas.workout_log import WorkoutLogCreate, WorkoutLogResponse

router = APIRouter(prefix="/workouts", tags=["workouts"])


@router.post("/logs", response_model=WorkoutLogResponse)
def create_workout_log(
    payload: WorkoutLogCreate,
    user_id: UUID = Query(..., description="Supabase users.id"),
) -> WorkoutLogResponse:
    return save_workout_log(user_id, payload)


@router.get("/")
def list_workouts() -> dict[str, list]:
    return {"items": []}


@router.get("/programmed")
def programmed_workout():
    return get_programmed_workout()


@router.get("/exercises", response_model=ExerciseListResponse)
def get_exercises(
    q: str | None = Query(None, description="Search term for exercise name or aliases"),
    category: str | None = Query(None, description="Filter by body part category"),
    muscle: str | None = Query(None, description="Filter by targeted muscle"),
    equipment: str | None = Query(None, description="Filter by required equipment"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
) -> ExerciseListResponse:
    """Retrieve exercises with search and filtering support."""
    items, total = list_exercises(
        query=q,
        category=category,
        muscle=muscle,
        equipment=equipment,
        page=page,
        limit=limit,
    )
    return ExerciseListResponse(items=items, total=total, page=page, limit=limit)


@router.get("/exercises/categories")
def get_categories() -> dict[str, list[str]]:
    """Retrieve all available exercise categories."""
    return {"categories": get_exercise_categories()}


@router.get("/exercises/{exercise_id}", response_model=Exercise)
def get_exercise(exercise_id: str) -> Exercise:
    """Retrieve a single exercise by ID or wger_id."""
    exercise = get_exercise_by_id(exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail=f"Exercise '{exercise_id}' not found")
    return exercise


@router.post("/exercises/import-wger", response_model=WgerImportResponse)
def trigger_wger_import(
    max_items: int | None = Query(None, ge=1, description="Optional cap on number of exercises to import"),
    sync_supabase: bool = Query(True, description="Sync imported exercises to Supabase if configured"),
) -> WgerImportResponse:
    """Import or refresh exercises from the wger REST API."""
    result = run_import(max_items=max_items, sync_supabase=sync_supabase)
    return WgerImportResponse(**result)

