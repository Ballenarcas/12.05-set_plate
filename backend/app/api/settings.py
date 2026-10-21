import logging

from fastapi import APIRouter, HTTPException, Query

from app.facades.settings_facade import settings_facade
from app.schemas.settings import UserSettingsUpdate

router = APIRouter(prefix="/settings", tags=["Settings"])
logger = logging.getLogger(__name__)


@router.put("/update")
def update_settings(
    settings: UserSettingsUpdate,
    user_id: str = Query(..., description="User ID to update"),
):
    try:
        settings_facade.update(user_id, settings)
    except Exception as err:
        logger.exception("Failed to update user settings")
        raise HTTPException(status_code=500, detail="Could not save your settings.") from err
    return {"status": "success", "message": "Settings saved."}
