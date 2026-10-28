import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import current_user
from app.facades.settings_facade import settings_facade
from app.schemas.settings import UserSettingsUpdate

router = APIRouter(prefix="/settings", tags=["Settings"])
logger = logging.getLogger(__name__)


@router.put("/update")
def update_settings(
    settings: UserSettingsUpdate,
    user_id: UUID = Depends(current_user),
):
    try:
        settings_facade.update(str(user_id), settings)
    except Exception as err:
        logger.exception("Failed to update user settings")
        raise HTTPException(status_code=500, detail="Could not save your settings.") from err
    return {"status": "success", "message": "Settings saved."}
