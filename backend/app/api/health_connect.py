import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import current_user
from app.facades.health_facade import health_facade
from app.schemas.health import (
    HealthActivitySyncRequest,
    HealthConnectRequest,
    HealthConnectStatus,
)

router = APIRouter(prefix="/health-connect", tags=["health-connect"])
logger = logging.getLogger(__name__)


@router.get("/status", response_model=HealthConnectStatus)
def health_connect_status(user_id: UUID = Depends(current_user)) -> HealthConnectStatus:
    try:
        return health_facade.status(user_id)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:
        logger.exception("Could not read the Health Connect status")
        raise HTTPException(status_code=502, detail="Could not read the Health Connect status.") from error


@router.post("/connect", response_model=HealthConnectStatus)
def connect_health_connect(
    payload: HealthConnectRequest,
    user_id: UUID = Depends(current_user),
) -> HealthConnectStatus:
    try:
        return health_facade.connect(user_id, payload)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:
        logger.exception("Could not connect Health Connect")
        raise HTTPException(status_code=502, detail="Could not connect Health Connect.") from error


@router.post("/sync", response_model=HealthConnectStatus)
def sync_health_connect(
    payload: HealthActivitySyncRequest,
    user_id: UUID = Depends(current_user),
) -> HealthConnectStatus:
    try:
        return health_facade.sync(user_id, payload)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:
        logger.exception("Could not sync Health Connect activity")
        raise HTTPException(status_code=502, detail="Could not sync Health Connect activity.") from error


@router.post("/disconnect", response_model=HealthConnectStatus)
def disconnect_health_connect(user_id: UUID = Depends(current_user)) -> HealthConnectStatus:
    try:
        return health_facade.disconnect(user_id)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:
        logger.exception("Could not disconnect Health Connect")
        raise HTTPException(status_code=502, detail="Could not disconnect Health Connect.") from error
