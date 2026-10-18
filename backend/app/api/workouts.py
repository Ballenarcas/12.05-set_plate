from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response

from app.schemas.exercise import Exercise, ExerciseListResponse, WgerImportResponse
from app.facades.workout_facade import workout_facade
from app.schemas.workout_log import WorkoutHistoryResponse, WorkoutLogCreate, WorkoutLogResponse

router = APIRouter(prefix="/workouts", tags=["workouts"])


@router.post("/logs", response_model=WorkoutLogResponse)
def create_workout_log(
    payload: WorkoutLogCreate,
    user_id: UUID = Query(..., description="Supabase users.id"),
) -> WorkoutLogResponse:
    return workout_facade.save_log(user_id, payload)


@router.get("/history", response_model=WorkoutHistoryResponse)
def get_workout_history(
    user_id: UUID = Query(..., description="Supabase users.id"),
    limit: int = Query(30, ge=1, le=100),
) -> WorkoutHistoryResponse:
    return workout_facade.list_history(user_id, limit)


@router.delete("/history/{workout_id}")
def delete_workout_history(
    workout_id: UUID,
    user_id: UUID = Query(..., description="Supabase users.id"),
) -> dict[str, str]:
    workout_facade.delete_history_entry(user_id, workout_id)
    return {"status": "deleted"}


@router.get("/")
def list_workouts() -> dict[str, list]:
    return {"items": []}


@router.get("/programmed")
def programmed_workout():
    return workout_facade.programmed_workout()


@router.get("/exercises", response_model=ExerciseListResponse)
def get_exercises(
    response: Response,
    q: str | None = Query(None, description="Search term for exercise name or aliases"),
    category: str | None = Query(None, description="Filter by body part category"),
    muscle_group: str | None = Query(None, description="Filter by database muscle group"),
    muscle: str | None = Query(None, description="Filter by targeted muscle"),
    equipment: str | None = Query(None, description="Filter by required equipment"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    compact: bool = Query(False, description="Omit descriptions and extra images for faster payloads"),
) -> ExerciseListResponse:
    """Retrieve exercises with search and filtering support."""
    items, total = workout_facade.list_exercises(
        query=q,
        category=category,
        muscle_group=muscle_group,
        muscle=muscle,
        equipment=equipment,
        page=page,
        limit=limit,
    )
    if compact:
        items = [
            item.model_copy(
                update={
                    "description": None,
                    "aliases": [],
                    "muscle_images": [],
                    "images": item.images[:1],
                }
            )
            for item in items
        ]
    response.headers["Cache-Control"] = "private, max-age=30"
    return ExerciseListResponse(items=items, total=total, page=page, limit=limit)


@router.get("/exercises/categories")
def get_categories() -> dict[str, list[str]]:
    """Retrieve all available exercise categories."""
    return {"categories": workout_facade.get_exercise_categories()}


@router.get("/exercises/muscle-groups")
def get_muscle_groups() -> dict[str, list[str]]:
    """Return the muscle groups assigned to exercises during Supabase sync."""
    return {"muscle_groups": workout_facade.get_exercise_muscle_groups()}


@router.get("/exercises/{exercise_id}", response_model=Exercise)
def get_exercise(exercise_id: str) -> Exercise:
    """Retrieve a single exercise by ID or wger_id."""
    exercise = workout_facade.get_exercise_by_id(exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail=f"Exercise '{exercise_id}' not found")
    return exercise


@router.post("/exercises/import-wger", response_model=WgerImportResponse)
def trigger_wger_import(
    max_items: int | None = Query(None, ge=1, description="Optional cap on number of exercises to import"),
    sync_supabase: bool = Query(True, description="Sync imported exercises to Supabase if configured"),
) -> WgerImportResponse:
    """Import or refresh exercises from the wger REST API."""
    result = workout_facade.import_wger(max_items=max_items, sync_supabase=sync_supabase)
    return WgerImportResponse(**result)
