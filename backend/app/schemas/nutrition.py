from pydantic import BaseModel, Field


class MacroSummary(BaseModel):
    protein_grams: int = Field(ge=0)
    carbs_grams: int = Field(ge=0)
    fat_grams: int = Field(ge=0)
    calories_remaining: int = Field(ge=0)


class MealItem(BaseModel):
    id: str
    user_id: str
    meal_name: str
    meal_type: str = "Meal"
    portion_amount: str = "1"
    weight_g: str = "100"
    item_calories: int
    consumed_at: str | None = None
    proteins_g: float = 0.0
    carbs_g: float = 0.0
    fats_g: float = 0.0


class FoodSearchItem(BaseModel):
    id: str
    name: str
    calories_per_100g: int
    proteins_per_100g: float = 0.0
    carbs_per_100g: float = 0.0
    fats_per_100g: float = 0.0
    category: str = "general"


class MealCreateRequest(BaseModel):
    user_id: str
    name: str = Field(..., min_length=1)
    calories: int | None = Field(default=None, ge=0)
    quantity_g: float | None = Field(default=100.0, ge=0)
    meal_type: str | None = Field(default="Meal")
    proteins: float | None = Field(default=0.0, ge=0)
    carbs: float | None = Field(default=0.0, ge=0)
    fats: float | None = Field(default=0.0, ge=0)


class DailyNutritionResponse(BaseModel):
    consumed_calories: int
    daily_goal: int
    active_calories: int
    calories_progress_percentage: int
    carbs_g: float
    proteins_g: float
    fats_g: float
    meals: list[MealItem]
