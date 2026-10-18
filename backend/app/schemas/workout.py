from typing import Any

from pydantic import BaseModel, Field, field_validator


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


class RoutineExerciseCreate(BaseModel):
    exercise_id: str = Field(min_length=1)
    target_sets: int = Field(ge=1, le=30)
    target_reps: int = Field(ge=1, le=30)


class RoutineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    exercises: list[RoutineExerciseCreate] = Field(min_length=1)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value
