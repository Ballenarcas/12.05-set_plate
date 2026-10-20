from app.schemas.settings import UserSettingsUpdate
from app.services.settings_service import update_user_settings_db


class SettingsFacade:
    def update(self, user_id: str, settings: UserSettingsUpdate):
        return update_user_settings_db(user_id, settings)


settings_facade = SettingsFacade()
