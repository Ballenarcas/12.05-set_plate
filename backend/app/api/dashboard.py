from uuid import UUID

from fastapi import APIRouter, Query

from app.schemas.dashboard import DashboardSummary
from app.facades.dashboard_facade import dashboard_facade

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(user_id: UUID = Query(..., description="Supabase users.id")) -> DashboardSummary:
    return dashboard_facade.get_summary(user_id)
