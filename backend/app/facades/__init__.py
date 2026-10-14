__all__ = ["AIFacade", "DashboardFacade", "NutritionFacade", "OnboardingFacade", "SettingsFacade", "WorkoutFacade"]


def __getattr__(name):
    if name == "AIFacade":
        from app.facades.ai_facade import AIFacade
        return AIFacade
    if name == "DashboardFacade":
        from app.facades.dashboard_facade import DashboardFacade
        return DashboardFacade
    if name == "NutritionFacade":
        from app.facades.nutrition_facade import NutritionFacade
        return NutritionFacade
    if name == "OnboardingFacade":
        from app.facades.onboarding_facade import OnboardingFacade
        return OnboardingFacade
    if name == "SettingsFacade":
        from app.facades.settings_facade import SettingsFacade
        return SettingsFacade
    if name == "WorkoutFacade":
        from app.facades.workout_facade import WorkoutFacade
        return WorkoutFacade
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
