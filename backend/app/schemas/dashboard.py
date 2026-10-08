from pydantic import BaseModel, Field


class NutritionDashboard(BaseModel):
    remaining_kcals: int = Field(ge=0)
    target_kcals: int = Field(ge=0)
    current_protein: float = Field(ge=0)
    target_protein: float = Field(ge=0)
    current_carbs: float = Field(ge=0)
    target_carbs: float = Field(ge=0)
    current_fat: float = Field(ge=0)
    target_fat: float = Field(ge=0)


class WorkoutDashboard(BaseModel):
    title: str
    exercise_count: int = Field(ge=0)
    estimated_duration_minutes: int = Field(ge=0)


class DashboardSummary(BaseModel):
    user_name: str
    current_date_formatted: str
    ai_notification: str | None
    nutrition: NutritionDashboard
    workout: WorkoutDashboard | None
