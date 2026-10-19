import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from app.schemas.nutrition import (
    DailyNutritionResponse,
    FoodSearchItem,
    MealCreateRequest,
    MealItem,
)
from app.facades.nutrition_facade import nutrition_facade

router = APIRouter(prefix="/nutrition", tags=["nutrition"])
logger = logging.getLogger(__name__)


@router.get("/", response_model=dict[str, list])
def get_nutrition_summary() -> dict[str, list]:
    return {"items": []}


@router.get("/search-foods", response_model=list[FoodSearchItem])
def search_food_items(
    q: str = Query("", description="Food name search query"),
) -> list[FoodSearchItem]:
    try:
        return nutrition_facade.search_foods(q)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to search foods: {err}")


@router.get("/today", response_model=DailyNutritionResponse)
def get_today_nutrition(
    user_id: str = Query(..., description="User ID"),
    today_start: datetime | None = Query(None, description="Local day start instant (inclusive ISO 8601)"),
    today_end: datetime | None = Query(None, description="Local day end instant (exclusive ISO 8601)"),
) -> DailyNutritionResponse:
    try:
        return nutrition_facade.get_today(user_id, today_start, today_end)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to fetch nutrition data: {err}")


@router.post("/meals", response_model=MealItem)
def add_meal(payload: MealCreateRequest) -> MealItem:
    try:
        return nutrition_facade.create_meal(payload)
    except Exception as err:
        logger.exception("Failed to save meal")
        raise HTTPException(status_code=500, detail=f"Failed to save meal: {err}")


@router.delete("/meals/{meal_id}")
def remove_meal(meal_id: str) -> dict[str, str]:
    try:
        nutrition_facade.delete_meal(meal_id)
        return {"status": "success", "deleted_id": meal_id}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to delete meal: {err}")
