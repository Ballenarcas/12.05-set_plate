from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class CustomExerciseCreate(BaseModel):
    name: str = Field(min_length=2, max_length=50)
    muscle_group: str = Field(min_length=1)
    muscles: list[str] = Field(default_factory=list)
    muscles_secondary: list[str] = Field(default_factory=list)
    equipment: list[str] = Field(default_factory=list)
    description: str | None = Field(default=None, max_length=500)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class RoutineExerciseSummary(BaseModel):
    exercise_id: str
    name: str
    target_sets: int | None = Field(default=None, ge=0)
    target_reps: int | None = Field(default=None, ge=0)
    reps_by_set: list[int] | None = None


class RoutineSummary(BaseModel):
    id: str
    name: str
    exercises: list[RoutineExerciseSummary]
    estimated_duration_minutes: int | None = Field(default=None, ge=0)


class RoutineExerciseCreate(BaseModel):
    exercise_id: str = Field(min_length=1)
    target_sets: int = Field(ge=1, le=30)
    target_reps: int = Field(ge=1, le=30)
    reps_by_set: list[int] | None = Field(default=None, min_length=1, max_length=30)

    @field_validator("reps_by_set")
    @classmethod
    def validate_reps_by_set(cls, values: list[int] | None) -> list[int] | None:
        if values is not None and any(value < 1 or value > 30 for value in values):
            raise ValueError("Each set must have between 1 and 30 reps")
        return values

    @model_validator(mode="after")
    def validate_set_reps_count(self) -> "RoutineExerciseCreate":
        if self.reps_by_set is not None and len(self.reps_by_set) != self.target_sets:
            raise ValueError("Reps count must match target_sets")
        return self


class RoutineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    exercises: list[RoutineExerciseCreate] = Field(min_length=1)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class LiveWorkoutSet(BaseModel):
    set_number: int = Field(ge=1)
    weight_kg: float = Field(ge=0)
    reps: int = Field(ge=0)
    rpe: float | None = Field(default=None, ge=1, le=10)
    is_completed: bool = False
    kind: Literal["normal", "warmup", "drop", "failure"] = "normal"


class LiveWorkoutExercise(BaseModel):
    exercise_id: str = Field(max_length=64)
    name: str = Field(max_length=120)
    previous_weight_kg: float | None = Field(default=None, ge=0)
    previous_reps: int | None = Field(default=None, ge=0)
    rest_seconds: int | None = Field(default=None, ge=1)
    target_sets: int | None = Field(default=None, ge=0)
    target_reps: int | None = Field(default=None, ge=0)
    sets: list[LiveWorkoutSet] = Field(default_factory=list, max_length=30)


class LiveWorkoutAdjustmentRequest(BaseModel):
    name: str = Field(max_length=120)
    duration_seconds: int = Field(ge=0)
    user_goal: str | None = Field(default=None, max_length=200)
    exercises: list[LiveWorkoutExercise] = Field(min_length=1, max_length=30)


class LiveWorkoutAdjustmentSuggestion(BaseModel):
    exercise_id: str
    action: Literal["reduce_load", "reduce_reps", "drop_set", "stop_exercise"]
    reason: str
    new_weight_kg: float | None = Field(default=None, ge=0)
    new_reps: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def check_action_payload(self) -> "LiveWorkoutAdjustmentSuggestion":
        if self.action == "reduce_load" and not self.new_weight_kg:
            raise ValueError("reduce_load requires new_weight_kg")
        if self.action == "reduce_reps" and not self.new_reps:
            raise ValueError("reduce_reps requires new_reps")
        if self.action in ("drop_set", "stop_exercise") and (self.new_weight_kg is not None or self.new_reps is not None):
            raise ValueError(f"{self.action} must not carry values")
        return self


class LiveWorkoutAdjustmentResponse(BaseModel):
    suggestions: list[LiveWorkoutAdjustmentSuggestion];