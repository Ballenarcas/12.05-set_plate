import logging
from datetime import datetime

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import current_user
from app.schemas.nutrition import (
    DailyNutritionResponse,
    FoodSearchItem,
    MealCreateRequest,
    MealItem,
    MealUpdateRequest,
)
from app.facades.nutrition_facade import nutrition_facade
from app.services.nutrition_service import MealIngredientStorageUnavailable

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
        logger.exception("Failed to search foods")
        raise HTTPException(status_code=500, detail="Could not search foods right now.") from err


@router.get("/today", response_model=DailyNutritionResponse)
def get_today_nutrition(
    user_id: UUID = Depends(current_user),
    today_start: datetime | None = Query(None, description="Local day start instant (inclusive ISO 8601)"),
    today_end: datetime | None = Query(None, description="Local day end instant (exclusive ISO 8601)"),
) -> DailyNutritionResponse:
    try:
        return nutrition_facade.get_today(str(user_id), today_start, today_end)
    except Exception as err:
        logger.exception("Failed to load today's nutrition")
        raise HTTPException(status_code=500, detail="Could not load today's nutrition.") from err


@router.post("/meals", response_model=MealItem)
def add_meal(
    payload: MealCreateRequest,
    user_id: UUID = Depends(current_user),
) -> MealItem:
    try:
        # The owner always comes from the signed session, never from the body.
        payload = payload.model_copy(update={"user_id": str(user_id)})
        return nutrition_facade.create_meal(payload)
    except MealIngredientStorageUnavailable as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
    except Exception as err:
        logger.exception("Failed to save meal")
        raise HTTPException(status_code=500, detail="Could not save this meal.") from err


@router.put("/meals/{meal_id}", response_model=MealItem)
def update_meal(
    meal_id: str,
    payload: MealUpdateRequest,
    user_id: UUID = Depends(current_user),
) -> MealItem:
    try:
        return nutrition_facade.update_meal(str(user_id), meal_id, payload)
    except MealIngredientStorageUnavailable as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
    except LookupError as err:
        raise HTTPException(status_code=404, detail="Meal not found.") from err
    except Exception as err:
        logger.exception("Failed to update meal")
        raise HTTPException(status_code=500, detail="Could not update this meal.") from err


@router.delete("/meals/{meal_id}")
def remove_meal(
    meal_id: str,
    user_id: UUID = Depends(current_user),
) -> dict[str, str]:
    try:
        nutrition_facade.delete_meal(str(user_id), meal_id)
        return {"status": "success", "deleted_id": meal_id}
    except LookupError as err:
        raise HTTPException(status_code=404, detail="Meal not found.") from err
    except Exception as err:
        logger.exception("Failed to delete meal")
        raise HTTPException(status_code=500, detail="Could not remove this meal.") from err
