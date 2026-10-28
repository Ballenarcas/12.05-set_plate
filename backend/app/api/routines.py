from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.auth import current_user
from app.schemas.workout import RoutineCreate, RoutineSummary
from app.facades.workout_facade import workout_facade

router = APIRouter(prefix="/routines", tags=["routines"])


@router.get("", response_model=list[RoutineSummary])
def list_routines(user_id: UUID = Depends(current_user)) -> list[RoutineSummary]:
    return workout_facade.list_routines(user_id)


@router.post("", response_model=RoutineSummary)
def create_routine(
    payload: RoutineCreate,
    user_id: UUID = Depends(current_user),
) -> RoutineSummary:
    return workout_facade.create_routine(user_id, payload)


@router.put("/{routine_id}", response_model=RoutineSummary)
def update_routine(
    routine_id: UUID,
    payload: RoutineCreate,
    user_id: UUID = Depends(current_user),
) -> RoutineSummary:
    return workout_facade.update_routine(user_id, routine_id, payload)


@router.delete("/{routine_id}")
def delete_routine(
    routine_id: UUID,
    user_id: UUID = Depends(current_user),
) -> dict[str, str]:
    workout_facade.delete_routine(user_id, routine_id)
    return {"status": "deleted"}
