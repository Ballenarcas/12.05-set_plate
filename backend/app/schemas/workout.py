from pydantic import BaseModel, Field


class WorkoutSummary(BaseModel):
    title: str
    exercise_count: int = Field(ge=0)
    duration_minutes: int = Field(ge=0)


class RoutineExerciseSummary(BaseModel):
    exercise_id: str
    name: str
    target_sets: int | None = Field(default=None, ge=0)
    target_reps: int | None = Field(default=None, ge=0)


class RoutineSummary(BaseModel):
    id: str
    name: str
    exercises: list[RoutineExerciseSummary]
    estimated_duration_minutes: int | None = Field(default=None, ge=0)
