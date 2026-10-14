import os
from supabase_client import get_supabase
from app.schemas.settings import UserSettingsUpdate

TABLE_NAME = os.getenv("USERS_TABLE_NAME", "users")

async def update_user_settings_db(user_id: str, settings: UserSettingsUpdate):
    # Récupère les données validées
    update_data = settings.model_dump(exclude={"notifications_enabled", "health_data_integration"})    
    # Initialise le client Supabase avec ta fonction
    client = get_supabase()
    
    try:
        # Mise à jour dans la table ciblée
        response = client.table(TABLE_NAME).update(update_data).eq("id", user_id).execute()
        return response.data
    except Exception as e:
        print(f"Erreur Supabase sur la table '{TABLE_NAME}' : {str(e)}")
        raise Exception(f"Erreur avec la base de données. Vérifie que la table '{TABLE_NAME}' existe.")