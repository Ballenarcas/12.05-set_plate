from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SetLogItem(BaseModel):
    set_number: int = Field(ge=1)
    weight_kg: float = Field(ge=0)
    reps: int = Field(ge=0)
    rpe: float | None = Field(default=None, ge=1, le=10)
    is_completed: bool = False


class ExerciseLogItem(BaseModel):
    exercise_id: str = Field(min_length=1)
    sets: list[SetLogItem] = Field(default_factory=list)


class WorkoutLogCreate(BaseModel):
    plan_id: UUID | None = None
    routine_id: UUID | None = None
    name: str = Field(min_length=1, max_length=120)
    duration_seconds: int = Field(ge=0)
    started_at: datetime
    completed_at: datetime
    exercises: list[ExerciseLogItem] = Field(default_factory=list)


class WorkoutLogResponse(BaseModel):
    id: UUID | None = None
    status: str


class WorkoutHistorySet(BaseModel):
    set_number: int
    reps: int
    weight_kg: float
    rpe: float | None = None
    is_completed: bool


class WorkoutHistoryExercise(BaseModel):
    exercise_id: UUID
    name: str
    sets: list[WorkoutHistorySet]


class WorkoutHistoryEntry(BaseModel):
    id: UUID
    routine_id: UUID | None = None
    name: str
    started_at: datetime
    completed_at: datetime | None = None
    duration_seconds: int
    exercises: list[WorkoutHistoryExercise]


class WorkoutHistoryResponse(BaseModel):
    items: list[WorkoutHistoryEntry]
