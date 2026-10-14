from fastapi import APIRouter, HTTPException, Query
from app.schemas.settings import UserSettingsUpdate
from app.facades.settings_facade import settings_facade

# C'est CETTE variable 'router' que main.py cherche !
router = APIRouter(prefix="/settings", tags=["Settings"])

@router.put("/update")
async def update_settings(
    settings: UserSettingsUpdate,
    user_id: str = Query(..., description="ID de l'utilisateur à mettre à jour")
):
    try:
        # Appel à Supabase via le service
        await settings_facade.update(user_id, settings)
        
        # Retourne la confirmation exacte
        return {
            "status": "success", 
            "message": "Changes have been successfully saved in the database."
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
