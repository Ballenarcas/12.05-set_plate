from datetime import date
from uuid import UUID

from app.core.local_day import LocalDay
from app.schemas.hydration import HydrationHistoryWeek, HydrationLogCreate, HydrationToday
from app.services import hydration_service


class HydrationFacade:
    def get_today(self, user_id: UUID, day: LocalDay) -> HydrationToday:
        return hydration_service.get_today(user_id, day)

    def get_history(self, user_id: UUID, day: LocalDay, week_start: date | None = None) -> HydrationHistoryWeek:
        return hydration_service.get_history(user_id, day, week_start)

    def add_entry(self, user_id: UUID, day: LocalDay, payload: HydrationLogCreate) -> HydrationToday:
        return hydration_service.add_entry(user_id, day, payload)

    def set_goal(self, user_id: UUID, day: LocalDay, goal_ml: int | None) -> HydrationToday:
        return hydration_service.set_goal(user_id, day, goal_ml)

    def delete_entry(self, user_id: UUID, entry_id: UUID, day: LocalDay) -> HydrationToday:
        return hydration_service.delete_entry(user_id, entry_id, day)


hydration_facade = HydrationFacade()
