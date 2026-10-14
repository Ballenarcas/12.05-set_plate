from fastapi import APIRouter, HTTPException, Query

from app.schemas.nutrition import (
    DailyNutritionResponse,
    FoodSearchItem,
    MealCreateRequest,
    MealItem,
)
from app.services.nutrition_service import (
    create_user_meal,
    delete_user_meal,
    get_user_nutrition_today,
    search_foods,
)

router = APIRouter(prefix="/nutrition", tags=["nutrition"])


@router.get("/", response_model=dict[str, list])
def get_nutrition_summary() -> dict[str, list]:
    return {"items": []}


@router.get("/search-foods", response_model=list[FoodSearchItem])
def search_food_items(
    q: str = Query("", description="Food name search query"),
) -> list[FoodSearchItem]:
    try:
        return search_foods(q)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to search foods: {err}")


@router.get("/today", response_model=DailyNutritionResponse)
def get_today_nutrition(
    user_id: str = Query(..., description="User ID"),
) -> DailyNutritionResponse:
    try:
        return get_user_nutrition_today(user_id)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to fetch nutrition data: {err}")


@router.post("/meals", response_model=MealItem)
def add_meal(payload: MealCreateRequest) -> MealItem:
    try:
        return create_user_meal(payload)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to save meal: {err}")


@router.delete("/meals/{meal_id}")
def remove_meal(meal_id: str) -> dict[str, str]:
    try:
        delete_user_meal(meal_id)
        return {"status": "success", "deleted_id": meal_id}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to delete meal: {err}")
