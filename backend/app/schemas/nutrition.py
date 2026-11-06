from pydantic import BaseModel, Field


class MealIngredient(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    quantity_g: float = Field(..., gt=0, le=10000)
    calories_per_100g: float = Field(..., ge=0, le=1000)
    proteins_per_100g: float = Field(default=0.0, ge=0, le=100)
    carbs_per_100g: float = Field(default=0.0, ge=0, le=100)
    fats_per_100g: float = Field(default=0.0, ge=0, le=100)


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
    ingredients: list[MealIngredient] = Field(default_factory=list)
    ingredient_details_saved: bool = True


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
    name: str = Field(..., min_length=1, max_length=120)
    calories: int | None = Field(default=None, ge=0, le=20000)
    quantity_g: float | None = Field(default=100.0, ge=0, le=10000)
    meal_type: str | None = Field(default="Meal", max_length=30)
    proteins: float | None = Field(default=0.0, ge=0, le=2000)
    carbs: float | None = Field(default=0.0, ge=0, le=2000)
    fats: float | None = Field(default=0.0, ge=0, le=2000)
    ingredients: list[MealIngredient] = Field(default_factory=list, max_length=50)


class MealUpdateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    meal_type: str = Field(..., min_length=1, max_length=30)
    ingredients: list[MealIngredient] = Field(..., min_length=1, max_length=50)


class DailyNutritionResponse(BaseModel):
    consumed_calories: int
    daily_goal: int
    calories_progress_percentage: int
    remaining_calories: int = 0
    target_proteins_g: float = 0.0
    target_carbs_g: float = 0.0
    target_fats_g: float = 0.0
    remaining_proteins_g: float = 0.0
    remaining_carbs_g: float = 0.0
    remaining_fats_g: float = 0.0
    carbs_g: float
    proteins_g: float
    fats_g: float
    meals: list[MealItem]
