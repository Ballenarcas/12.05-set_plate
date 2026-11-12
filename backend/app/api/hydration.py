import logging
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import current_user
from app.core.local_day import LocalDay, local_day
from app.schemas.hydration import (
    HydrationGoalUpdate,
    HydrationHistoryWeek,
    HydrationLogCreate,
    HydrationToday,
)
from app.facades.hydration_facade import hydration_facade
from app.services.hydration_service import HydrationStorageUnavailable

router = APIRouter(prefix="/hydration", tags=["hydration"])
logger = logging.getLogger(__name__)


@router.get("/today", response_model=HydrationToday)
def hydration_today(
    user_id: UUID = Depends(current_user),
    day: LocalDay = Depends(local_day),
) -> HydrationToday:
    try:
        return hydration_facade.get_today(user_id, day)
    except HydrationStorageUnavailable as err:
        logger.exception("Hydration storage is unavailable")
        raise HTTPException(status_code=503, detail="Hydration can't be loaded right now.") from err
    except Exception as err:
        logger.exception("Failed to load today's hydration")
        raise HTTPException(status_code=500, detail="Could not load today's hydration.") from err


@router.get("/history", response_model=HydrationHistoryWeek)
def hydration_history(
    week_start: date | None = Query(
        None,
        description="Any date in the requested week; defaults to this week and future weeks are clamped",
    ),
    user_id: UUID = Depends(current_user),
    day: LocalDay = Depends(local_day),
) -> HydrationHistoryWeek:
    try:
        return hydration_facade.get_history(user_id, day, week_start)
    except HydrationStorageUnavailable as err:
        logger.exception("Hydration storage is unavailable")
        raise HTTPException(status_code=503, detail="Hydration history can't be loaded right now.") from err
    except Exception as err:
        logger.exception("Failed to load hydration history")
        raise HTTPException(status_code=500, detail="Could not load your hydration history.") from err


@router.post("/entries", response_model=HydrationToday)
def add_hydration_entry(
    payload: HydrationLogCreate,
    user_id: UUID = Depends(current_user),
    day: LocalDay = Depends(local_day),
) -> HydrationToday:
    try:
        # The owner always comes from the signed session, never from the body.
        return hydration_facade.add_entry(user_id, day, payload)
    except HydrationStorageUnavailable as err:
        logger.exception("Hydration storage is unavailable")
        raise HTTPException(status_code=503, detail="Hydration can't be saved right now.") from err
    except Exception as err:
        logger.exception("Failed to save hydration entry")
        raise HTTPException(status_code=500, detail="Could not save this drink.") from err


@router.put("/goal", response_model=HydrationToday)
def update_hydration_goal(
    payload: HydrationGoalUpdate,
    user_id: UUID = Depends(current_user),
    day: LocalDay = Depends(local_day),
) -> HydrationToday:
    try:
        return hydration_facade.set_goal(user_id, day, payload.goal_ml)
    except HydrationStorageUnavailable as err:
        logger.exception("Hydration storage is unavailable")
        raise HTTPException(status_code=503, detail="Hydration can't be saved right now.") from err
    except Exception as err:
        logger.exception("Failed to update the hydration goal")
        raise HTTPException(status_code=500, detail="Could not update your hydration goal.") from err


@router.delete("/entries/{entry_id}", response_model=HydrationToday)
def delete_hydration_entry(
    entry_id: UUID,
    user_id: UUID = Depends(current_user),
    day: LocalDay = Depends(local_day),
) -> HydrationToday:
    try:
        return hydration_facade.delete_entry(user_id, entry_id, day)
    except HydrationStorageUnavailable as err:
        logger.exception("Hydration storage is unavailable")
        raise HTTPException(status_code=503, detail="Hydration can't be updated right now.") from err
    except LookupError as err:
        raise HTTPException(status_code=404, detail="This drink entry no longer exists.") from err
    except Exception as err:
        logger.exception("Failed to delete hydration entry")
        raise HTTPException(status_code=500, detail="Could not remove this drink.") from err
