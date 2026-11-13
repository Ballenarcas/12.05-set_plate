from time import monotonic
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from app.core.ai_quota import use_ai_call
from app.core.auth import current_user
from app.core.local_day import LocalDay, local_day
from app.facades.workout_facade import workout_facade
from app.schemas.exercise import Exercise, ExerciseListResponse
from app.schemas.workout import (
    CustomExerciseCreate,
    LiveWorkoutAdjustmentRequest,
    LiveWorkoutAdjustmentResponse,
    LiveWorkoutAdjustmentSuggestion,
)
from app.schemas.workout_log import WorkoutHistoryResponse, WorkoutLogCreate, WorkoutLogResponse, WorkoutLogUpdate
from app.schemas.workout_statistics import WorkoutStatisticsRange, WorkoutStatisticsResponse

router = APIRouter(prefix="/workouts", tags=["workouts"])

_ADJUSTMENT_COOLDOWN_SECONDS = 60
_last_adjustment_request: dict[str, float] = {}


def _optional_user(
    request: Request,
    user_id: UUID | None = Query(default=None),
) -> UUID | None:
    """Resolve the current user if credentials or user_id are provided, or None for public catalog requests."""
    if user_id is not None:
        return user_id
    auth_header = request.headers.get("authorization") or ""
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        try:
            return current_user(user_id=None, authorization=f"Bearer {token}")
        except Exception:
            try:
                return current_user(token)  # type: ignore[arg-type]
            except Exception:
                return None
    return None


@router.post("/plan-today")
async def plan_todays_workout(
    user_id: UUID = Depends(current_user),
    day: LocalDay = Depends(local_day),
) -> dict:
    return await workout_facade.plan_today(user_id, day)


@router.post("/adjust", response_model=LiveWorkoutAdjustmentResponse)
async def suggest_live_adjustment(
    payload: LiveWorkoutAdjustmentRequest,
    response: Response,
    user_id: UUID = Depends(current_user),
) -> LiveWorkoutAdjustmentResponse:
    """Ask the AI trainer for conservative adjustments to the workout in progress."""
    response.headers["Cache-Control"] = "no-store"
    last_request = _last_adjustment_request.get(str(user_id))
    if last_request is not None and monotonic() - last_request < _ADJUSTMENT_COOLDOWN_SECONDS:
        raise HTTPException(status_code=429, detail="Wait a moment before asking for another adjustment")
    use_ai_call(user_id)
    _last_adjustment_request[str(user_id)] = monotonic()
    try:
        suggestions = await workout_facade.suggest_adjustment(payload)
    except Exception:
        _last_adjustment_request.pop(str(user_id), None)
        raise
    return LiveWorkoutAdjustmentResponse(suggestions=[
        LiveWorkoutAdjustmentSuggestion.model_validate(suggestion) for suggestion in suggestions
    ])


@router.post("/logs", response_model=WorkoutLogResponse)
def create_workout_log(
    payload: WorkoutLogCreate,
    user_id: UUID = Depends(current_user),
) -> WorkoutLogResponse:
    return workout_facade.save_log(user_id, payload)


@router.get("/history", response_model=WorkoutHistoryResponse)
def get_workout_history(
    user_id: UUID = Depends(current_user),
    limit: int = Query(30, ge=1, le=100),
) -> WorkoutHistoryResponse:
    return workout_facade.list_history(user_id, limit)


@router.get("/statistics", response_model=WorkoutStatisticsResponse)
def get_workout_statistics(
    user_id: UUID = Depends(current_user),
    range_key: WorkoutStatisticsRange = Query("1M", alias="range"),
    timezone_offset_minutes: int = Query(
        0,
        ge=-840,
        le=840,
        description="Client getTimezoneOffset() value used for local date buckets",
    ),
) -> WorkoutStatisticsResponse:
    return workout_facade.get_statistics(user_id, range_key, timezone_offset_minutes)


@router.put("/history/{workout_id}", response_model=WorkoutLogResponse)
def update_workout_history(
    workout_id: UUID,
    payload: WorkoutLogUpdate,
    user_id: UUID = Depends(current_user),
) -> WorkoutLogResponse:
    return workout_facade.update_history_entry(user_id, workout_id, payload)


@router.delete("/history/{workout_id}")
def delete_workout_history(
    workout_id: UUID,
    user_id: UUID = Depends(current_user),
) -> dict[str, str]:
    workout_facade.delete_history_entry(user_id, workout_id)
    return {"status": "deleted"}


@router.get("/exercises", response_model=ExerciseListResponse)
def get_exercises(
    response: Response,
    user_id: UUID | None = Depends(_optional_user),
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
        user_id=user_id,
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


@router.post("/exercises/custom", response_model=Exercise)
def create_custom_exercise(
    payload: CustomExerciseCreate,
    user_id: UUID = Depends(current_user),
) -> Exercise:
    """Create a private custom exercise for a premium member."""
    return workout_facade.create_custom_exercise(user_id, payload)


@router.put("/exercises/custom/{exercise_id}", response_model=Exercise)
def update_custom_exercise(
    exercise_id: str,
    payload: CustomExerciseCreate,
    user_id: UUID = Depends(current_user),
) -> Exercise:
    """Update a custom exercise."""
    return workout_facade.update_custom_exercise(user_id, exercise_id, payload)


@router.delete("/exercises/custom/{exercise_id}")
def delete_custom_exercise(
    exercise_id: str,
    user_id: UUID = Depends(current_user),
) -> dict[str, str]:
    """Delete (soft-delete) a custom exercise."""
    workout_facade.delete_custom_exercise(user_id, exercise_id)
    return {"status": "deleted"}


@router.get("/exercises/{exercise_id}", response_model=Exercise)
def get_exercise(
    exercise_id: str,
    user_id: UUID | None = Depends(_optional_user),
) -> Exercise:
    """Retrieve a single exercise by ID."""
    exercise = workout_facade.get_exercise_by_id(exercise_id, user_id=user_id)
    if not exercise:
        raise HTTPException(status_code=404, detail=f"Exercise '{exercise_id}' not found")
    return exercise