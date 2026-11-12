from typing import Literal

from pydantic import BaseModel, Field, model_validator

MAX_ML_PER_ENTRY = 5000
MAX_GLASSES_PER_ENTRY = 20
CUSTOM_GOAL_MIN_ML = 500
CUSTOM_GOAL_MAX_ML = 10000


class HydrationLogCreate(BaseModel):
    amount: int = Field(..., gt=0, le=MAX_ML_PER_ENTRY, description="Amount in the given unit")
    unit: Literal["ml", "glass"] = Field(default="ml", description="Unit the amount was entered in")

    @model_validator(mode="after")
    def limit_amount_for_unit(self) -> "HydrationLogCreate":
        limit = MAX_ML_PER_ENTRY if self.unit == "ml" else MAX_GLASSES_PER_ENTRY
        if self.amount > limit:
            raise ValueError(f"A single entry can't exceed {limit} {self.unit}.")
        return self


class HydrationGoalUpdate(BaseModel):
    goal_ml: int | None = Field(
        default=None,
        ge=CUSTOM_GOAL_MIN_ML,
        le=CUSTOM_GOAL_MAX_ML,
        description="Custom daily goal in ml; null restores the recommended goal",
    )


class HydrationEntry(BaseModel):
    id: str
    amount_ml: int
    unit: Literal["ml", "glass"] = "ml"
    created_at: str | None = None


class HydrationToday(BaseModel):
    total_ml: int
    goal_ml: int
    default_goal_ml: int
    progress_percentage: int
    remaining_ml: int
    entries: list[HydrationEntry] = Field(default_factory=list)
