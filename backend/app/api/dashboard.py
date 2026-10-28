from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.auth import current_user
from app.schemas.dashboard import DashboardSummary
from app.facades.dashboard_facade import dashboard_facade

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(user_id: UUID = Depends(current_user)) -> DashboardSummary:
    return dashboard_facade.get_summary(user_id)
