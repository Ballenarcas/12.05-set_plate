from datetime import datetime, timedelta, timezone
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

MAX_WORKOUT_AGE = timedelta(days=365)
CLOCK_TOLERANCE = timedelta(days=1)  # a phone's clock or time zone can be slightly off


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class SetLogItem(BaseModel):
    set_number: int = Field(ge=1, le=100)
    weight_kg: float = Field(ge=0, le=1000)
    reps: int = Field(ge=0, le=1000)
    rpe: float | None = Field(default=None, ge=1, le=10)
    is_completed: bool = False


class ExerciseLogItem(BaseModel):
    exercise_id: str = Field(min_length=1, max_length=64)
    sets: list[SetLogItem] = Field(default_factory=list, max_length=50)


class WorkoutLogCreate(BaseModel):
    plan_id: UUID | None = None
    routine_id: UUID | None = None
    name: str = Field(min_length=1, max_length=120)
    duration_seconds: int = Field(ge=0)
    started_at: datetime
    completed_at: datetime
    exercises: list[ExerciseLogItem] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def check_dates(self) -> "WorkoutLogCreate":
        started, completed, now = _as_utc(self.started_at), _as_utc(self.completed_at), datetime.now(timezone.utc)
        if completed < started:
            raise ValueError("A workout cannot end before it starts")
        if completed > now + CLOCK_TOLERANCE or started < now - MAX_WORKOUT_AGE:
            raise ValueError("Workout dates are out of range")
        return self


class WorkoutLogUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    exercises: list[ExerciseLogItem] = Field(default_factory=list, max_length=50)


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
