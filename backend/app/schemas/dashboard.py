from datetime import date

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


class PlanExercise(BaseModel):
    exercise_id: str
    name: str
    sets: int = Field(ge=0)
    reps: int = Field(ge=0)


class WorkoutPlanSummary(BaseModel):
    id: str
    routine_id: str | None = None
    title: str
    plan_date: date
    is_rest_day: bool = False
    ai_adjusted: bool = False
    ai_reasoning: str | None = None
    exercises: list[PlanExercise] = Field(default_factory=list)


class CompletedWorkoutToday(BaseModel):
    id: str
    name: str


class DashboardSummary(BaseModel):
    user_name: str
    current_date_formatted: str
    ai_notification: str | None
    nutrition: NutritionDashboard
    workout: WorkoutDashboard | None
    plan: WorkoutPlanSummary | None = None
    completed_workout_today: CompletedWorkoutToday | None = None
