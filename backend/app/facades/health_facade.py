from uuid import UUID

from app.schemas.health import (
    HealthActivitySyncRequest,
    HealthConnectRequest,
    HealthConnectStatus,
)
from app.services import health_service


class HealthFacade:
    def status(self, user_id: UUID) -> HealthConnectStatus:
        return health_service.get_status(user_id)

    def connect(self, user_id: UUID, payload: HealthConnectRequest) -> HealthConnectStatus:
        return health_service.connect(user_id, payload)

    def sync(self, user_id: UUID, payload: HealthActivitySyncRequest) -> HealthConnectStatus:
        return health_service.sync_activity(user_id, payload)

    def disconnect(self, user_id: UUID) -> HealthConnectStatus:
        return health_service.disconnect(user_id)


health_facade = HealthFacade()
