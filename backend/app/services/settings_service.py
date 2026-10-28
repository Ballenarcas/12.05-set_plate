import os
from app.db.supabase_client import get_supabase
from app.schemas.settings import UserSettingsUpdate

TABLE_NAME = os.getenv("USERS_TABLE_NAME", "users")

def update_user_settings_db(user_id: str, settings: UserSettingsUpdate):
    update_data = settings.model_dump(exclude={"notifications_enabled", "health_data_integration"})
    client = get_supabase(admin=True)
    if client is None:
        raise RuntimeError("Database connection unavailable")

    try:
        response = (
            client.table(TABLE_NAME)
            .update(update_data)
            .eq("id", user_id)
            .select("id")
            .execute()
        )
        if not response.data:
            raise LookupError("User profile was not found")
        return response.data
    except Exception as e:
        raise RuntimeError(f"Could not update user settings in '{TABLE_NAME}'") from e
