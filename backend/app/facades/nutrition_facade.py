from app.schemas.nutrition import FoodSearchItem, MealCreateRequest, MealItem, DailyNutritionResponse
from app.services import nutrition_service


class NutritionFacade:
    def search_foods(self, query: str) -> list[FoodSearchItem]:
        return nutrition_service.search_foods(query)

    def get_today(self, user_id: str) -> DailyNutritionResponse:
        return nutrition_service.get_user_nutrition_today(user_id)

    def create_meal(self, payload: MealCreateRequest) -> MealItem:
        return nutrition_service.create_user_meal(payload)

    def delete_meal(self, meal_id: str) -> bool:
        return nutrition_service.delete_user_meal(meal_id)


nutrition_facade = NutritionFacade()
