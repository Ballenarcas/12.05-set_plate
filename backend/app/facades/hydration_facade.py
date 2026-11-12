from uuid import UUID

from app.core.local_day import LocalDay
from app.schemas.hydration import HydrationLogCreate, HydrationToday
from app.services import hydration_service


class HydrationFacade:
    def get_today(self, user_id: UUID, day: LocalDay) -> HydrationToday:
        return hydration_service.get_today(user_id, day)

    def add_entry(self, user_id: UUID, day: LocalDay, payload: HydrationLogCreate) -> HydrationToday:
        return hydration_service.add_entry(user_id, day, payload)

    def delete_entry(self, user_id: UUID, entry_id: UUID, day: LocalDay) -> HydrationToday:
        return hydration_service.delete_entry(user_id, entry_id, day)


hydration_facade = HydrationFacade()
