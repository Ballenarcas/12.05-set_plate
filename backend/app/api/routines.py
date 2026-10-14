from uuid import UUID

from fastapi import APIRouter, Query

from app.schemas.workout import RoutineSummary
from app.facades.workout_facade import workout_facade

router = APIRouter(prefix="/routines", tags=["routines"])


@router.get("", response_model=list[RoutineSummary])
def list_routines(user_id: UUID = Query(..., description="Supabase users.id")) -> list[RoutineSummary]:
    return workout_facade.list_routines(user_id)
