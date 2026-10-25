from time import monotonic
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response

from app.schemas.exercise import Exercise, ExerciseListResponse, WgerImportResponse
from app.facades.workout_facade import workout_facade
from app.schemas.workout import (
    LiveWorkoutAdjustmentRequest,
    LiveWorkoutAdjustmentResponse,
    LiveWorkoutAdjustmentSuggestion,
)
from app.schemas.workout_log import WorkoutHistoryResponse, WorkoutLogCreate, WorkoutLogResponse
from app.schemas.workout_statistics import WorkoutStatisticsRange, WorkoutStatisticsResponse

router = APIRouter(prefix="/workouts", tags=["workouts"])

_ADJUSTMENT_COOLDOWN_SECONDS = 60
_last_adjustment_request: dict[str, float] = {}


@router.post("/plan-today")
async def plan_todays_workout(
    user_id: UUID = Query(..., description="Supabase users.id"),
) -> dict:
    return await workout_facade.plan_today(user_id)


@router.post("/adjust", response_model=LiveWorkoutAdjustmentResponse)
async def suggest_live_adjustment(
    payload: LiveWorkoutAdjustmentRequest,
    response: Response,
    user_id: UUID = Query(..., description="Supabase users.id"),
) -> LiveWorkoutAdjustmentResponse:
    """Ask the AI trainer for conservative adjustments to the workout in progress."""
    response.headers["Cache-Control"] = "no-store"
    last_request = _last_adjustment_request.get(str(user_id))
    if last_request is not None and monotonic() - last_request < _ADJUSTMENT_COOLDOWN_SECONDS:
        raise HTTPException(status_code=429, detail="Wait a moment before asking for another adjustment")
    suggestions = await workout_facade.suggest_adjustment(payload)
    _last_adjustment_request[str(user_id)] = monotonic()
    return LiveWorkoutAdjustmentResponse(suggestions=[
        LiveWorkoutAdjustmentSuggestion.model_validate(suggestion) for suggestion in suggestions
    ])


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


@router.get("/statistics", response_model=WorkoutStatisticsResponse)
def get_workout_statistics(
    user_id: UUID = Query(..., description="Supabase users.id"),
    range_key: WorkoutStatisticsRange = Query("1M", alias="range"),
    timezone_offset_minutes: int = Query(
        0,
        ge=-840,
        le=840,
        description="Client getTimezoneOffset() value used for local date buckets",
    ),
) -> WorkoutStatisticsResponse:
    return workout_facade.get_statistics(user_id, range_key, timezone_offset_minutes)


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

