import os
from app.db.supabase_client import get_supabase
from app.schemas.settings import UserSettingsUpdate
from app.services.user_profile_service import calculate_calorie_goal

TABLE_NAME = os.getenv("USERS_TABLE_NAME", "users")

def update_user_settings_db(user_id: str, settings: UserSettingsUpdate):
    update_data = settings.model_dump(exclude={"notifications_enabled", "health_data_integration"})

    # ``calorie_goal`` is a stored column read by the dashboard, the nutrition
    # endpoints and the workout adjustment, so it has to follow the body data.
    # Saving the profile is the only place weight, height, age, gender or
    # objective change after onboarding: without this recalculation the goal
    # stayed frozen at the signup value and a lighter user kept the old target.
    update_data["calorie_goal"] = calculate_calorie_goal(
        weight=settings.weight,
        height=settings.height,
        age=settings.age,
        gender=settings.gender,
        objective=settings.objective,
    )

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
