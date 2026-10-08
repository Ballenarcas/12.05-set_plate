from uuid import UUID

from fastapi import APIRouter, Query

from app.schemas.dashboard import DashboardSummary
from app.services.dashboard_service import get_dashboard_summary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(user_id: UUID = Query(..., description="Supabase users.id")) -> DashboardSummary:
    return get_dashboard_summary(user_id)
