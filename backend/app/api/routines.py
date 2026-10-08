from uuid import UUID

from fastapi import APIRouter, Query

from app.schemas.workout import RoutineSummary
from app.services.workout_service import list_user_routines

router = APIRouter(prefix="/routines", tags=["routines"])


@router.get("", response_model=list[RoutineSummary])
def list_routines(user_id: UUID = Query(..., description="Supabase users.id")) -> list[RoutineSummary]:
    return list_user_routines(user_id)
