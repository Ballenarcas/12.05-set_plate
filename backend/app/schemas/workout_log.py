from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SetLogItem(BaseModel):
    set_number: int = Field(ge=1)
    weight_kg: float = Field(ge=0)
    reps: int = Field(ge=0)
    is_completed: bool = False


class ExerciseLogItem(BaseModel):
    exercise_id: UUID
    sets: list[SetLogItem] = Field(default_factory=list)


class WorkoutLogCreate(BaseModel):
    routine_id: UUID | None = None
    name: str = Field(min_length=1, max_length=120)
    duration_seconds: int = Field(ge=0)
    started_at: datetime
    completed_at: datetime
    exercises: list[ExerciseLogItem] = Field(default_factory=list)


class WorkoutLogResponse(BaseModel):
    id: UUID | None = None
    status: str
