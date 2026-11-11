from pydantic import BaseModel, Field


class MealScanItem(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    grams: float = Field(gt=0, le=5000)
    calories: float = Field(ge=0, le=10000)
    protein_g: float = Field(default=0.0, ge=0, le=1000)
    carbs_g: float = Field(default=0.0, ge=0, le=1000)
    fat_g: float = Field(default=0.0, ge=0, le=1000)


class MealScanResult(BaseModel):
    items: list[MealScanItem] = Field(min_length=1, max_length=12)
    total_calories: float = Field(ge=0)
    notes: str | None = Field(default=None, max_length=300)
