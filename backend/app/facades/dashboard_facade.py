from uuid import UUID

from app.core.local_day import LocalDay
from app.schemas.dashboard import DashboardSummary
from app.services.dashboard_service import get_dashboard_summary


class DashboardFacade:
    def get_summary(self, user_id: UUID, day: LocalDay | None = None) -> DashboardSummary:
        return get_dashboard_summary(user_id, day)


dashboard_facade = DashboardFacade()
