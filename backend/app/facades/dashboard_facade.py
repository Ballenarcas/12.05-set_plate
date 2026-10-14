from uuid import UUID

from app.schemas.dashboard import DashboardSummary
from app.services.dashboard_service import get_dashboard_summary


class DashboardFacade:
    def get_summary(self, user_id: UUID) -> DashboardSummary:
        return get_dashboard_summary(user_id)


dashboard_facade = DashboardFacade()
