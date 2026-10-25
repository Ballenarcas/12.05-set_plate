import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import logging
from typing import Any

import httpx
from app.services.nutrition_math import compute_macro_targets
from app.services.user_profile_service import calculate_calorie_goal
from app.db.supabase_client import get_supabase
from app.schemas.nutrition import (
    DailyNutritionResponse,
    FoodSearchItem,
    MacroSummary,
    MealCreateRequest,
    MealIngredient,
    MealItem,
    MealUpdateRequest,
)

logger = logging.getLogger(__name__)


def get_daily_macros() -> MacroSummary:
    return MacroSummary(protein_grams=45, carbs_grams=120, fat_grams=30, calories_remaining=1420)


def infer_meal_type(timestamp_str: str | None) -> str:
    if not timestamp_str:
        return "Meal"
    try:
        dt = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
        hour = dt.hour
        if hour < 11:
            return "Breakfast"
        elif hour < 16:
            return "Lunch"
        elif hour < 19:
            return "Snack"
        else:
            return "Dinner"
    except Exception:
        return "Meal"


def _utc_day_start(now: datetime | None = None) -> datetime:
    return (now or datetime.now(timezone.utc)).astimezone(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )


def _load_user_target(supabase: Any, user_id: str) -> tuple[int | None, float | None]:
    """Read the saved goal and weight. Returns (None, None) when it cannot be read."""
    try:
        user_res = (
            supabase.table("users")
            .select("calorie_goal,weight,height,age,gender,objective")
            .eq("id", user_id)
            .single()
            .execute()
        )
        if not user_res.data:
            return None, None
        u = user_res.data
        try:
            weight = float(u.get("weight")) if u.get("weight") is not None else None
        except (ValueError, TypeError):
            weight = None
        if u.get("calorie_goal"):
            try:
                return int(float(u["calorie_goal"])), weight
            except (ValueError, TypeError):
                return 2200, weight
        return (
            calculate_calorie_goal(
                weight=u.get("weight"),
                height=u.get("height"),
                age=u.get("age"),
                gender=u.get("gender"),
                objective=u.get("objective"),
            ),
            weight,
        )
    except Exception as err:
        logger.warning(f"Could not retrieve user calorie_goal: {err}")
        return None, None


def _load_today_meals(
    supabase: Any,
    user_id: str,
    window_start: datetime,
    window_end: datetime,
) -> tuple[list[MealItem], int, float, float, float]:
    meals_data: list[MealItem] = []
    total_calories = 0
    total_carbs = 0.0
    total_proteins = 0.0
    total_fats = 0.0

    try:
        meals_res = (
            supabase.table("meals")
            .select("id,user_id,name,calories,proteins,carbs,fats,consumed_at,ingredients,quantity_g,meal_type")
            .eq("user_id", user_id)
            .gte("consumed_at", window_start.isoformat())
            .lt("consumed_at", window_end.isoformat())
            .order("consumed_at", desc=True)
            .execute()
        )
        for row in meals_res.data or []:
            cals = int(row.get("calories") or 0)
            proteins = float(row.get("proteins") or 0.0)
            carbs = float(row.get("carbs") or 0.0)
            fats = float(row.get("fats") or 0.0)
            consumed_at = row.get("consumed_at")

            total_calories += cals
            total_proteins += proteins
            total_carbs += carbs
            total_fats += fats

            meals_data.append(
                MealItem(
                    id=str(row.get("id")),
                    user_id=str(row.get("user_id")),
                    meal_name=row.get("name") or "Unnamed Meal",
                    meal_type=row.get("meal_type") or infer_meal_type(consumed_at),
                    portion_amount="1",
                    weight_g=str(row.get("quantity_g") or 100),
                    item_calories=cals,
                    consumed_at=consumed_at,
                    proteins_g=round(proteins, 1),
                    carbs_g=round(carbs, 1),
                    fats_g=round(fats, 1),
                    ingredients=row.get("ingredients") or [],
                )
            )
    except Exception as err:
        logger.error(f"Error fetching meals from Supabase: {err}")

    return meals_data, total_calories, total_proteins, total_carbs, total_fats


def get_user_nutrition_today(
    user_id: str,
    today_start: datetime | None = None,
    today_end: datetime | None = None,
) -> DailyNutritionResponse:
    supabase = get_supabase(admin=True)
    window_start = today_start or _utc_day_start()
    window_end = today_end or (window_start + timedelta(days=1))
    daily_goal = 2200
    user_weight_kg: float | None = None
    meals_data: list[MealItem] = []
    total_calories = 0
    total_proteins = 0.0
    total_carbs = 0.0
    total_fats = 0.0

    if not supabase:
        return DailyNutritionResponse(
            consumed_calories=0,
            daily_goal=daily_goal,
            calories_progress_percentage=0,
            carbs_g=0.0,
            proteins_g=0.0,
            fats_g=0.0,
            meals=[],
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        user_future = executor.submit(_load_user_target, supabase, user_id)
        meals_future = executor.submit(_load_today_meals, supabase, user_id, window_start, window_end)
        loaded_goal, user_weight_kg = user_future.result()
        meals_data, total_calories, total_proteins, total_carbs, total_fats = meals_future.result()

    if loaded_goal is not None:
        daily_goal = loaded_goal

    target_protein_g, target_fat_g, target_carbs_g = compute_macro_targets(daily_goal, user_weight_kg)
    remaining_calories = max(0, daily_goal - total_calories)
    progress = round((total_calories / daily_goal) * 100) if daily_goal > 0 else 0

    return DailyNutritionResponse(
        consumed_calories=total_calories,
        daily_goal=daily_goal,
        calories_progress_percentage=min(100, max(0, progress)),
        remaining_calories=remaining_calories,
        target_proteins_g=target_protein_g,
        target_carbs_g=target_carbs_g,
        target_fats_g=target_fat_g,
        remaining_proteins_g=round(max(0.0, target_protein_g - total_proteins), 1),
        remaining_carbs_g=round(max(0.0, target_carbs_g - total_carbs), 1),
        remaining_fats_g=round(max(0.0, target_fat_g - total_fats), 1),
        carbs_g=round(total_carbs, 1),
        proteins_g=round(total_proteins, 1),
        fats_g=round(total_fats, 1),
        meals=meals_data,
    )


FOOD_DATABASE: list[dict] = [
    {"id": "food_chicken_breast", "name": "Chicken Breast", "calories": 165, "protein": 31.0, "carbs": 0.0, "fat": 3.6, "aliases": ["pechuga", "pollo", "grilled chicken", "chicken"]},
    {"id": "food_brown_rice", "name": "Brown Rice", "calories": 120, "protein": 2.6, "carbs": 25.0, "fat": 1.0, "aliases": ["arroz integral", "rice", "arroz"]},
    {"id": "food_white_rice", "name": "White Rice", "calories": 130, "protein": 2.7, "carbs": 28.0, "fat": 0.3, "aliases": ["arroz blanco", "steamed rice"]},
    {"id": "food_salmon", "name": "Salmon Fillet", "calories": 208, "protein": 20.0, "carbs": 0.0, "fat": 13.0, "aliases": ["salmon", "pescado", "fish", "salmón"]},
    {"id": "food_eggs", "name": "Whole Eggs", "calories": 156, "protein": 12.6, "carbs": 1.2, "fat": 10.0, "aliases": ["egg", "huevos", "huevo", "scrambled eggs", "boiled egg"]},
    {"id": "food_egg_whites", "name": "Egg Whites", "calories": 52, "protein": 11.0, "carbs": 0.7, "fat": 0.2, "aliases": ["claras de huevo", "claras", "egg white"]},
    {"id": "food_oatmeal", "name": "Oatmeal / Rolled Oats", "calories": 389, "protein": 16.9, "carbs": 66.0, "fat": 6.9, "aliases": ["avena", "oats", "porridge"]},
    {"id": "food_greek_yogurt", "name": "Greek Yogurt (0%)", "calories": 59, "protein": 10.0, "carbs": 3.6, "fat": 0.4, "aliases": ["yogur griego", "yogurt", "skyr"]},
    {"id": "food_sweet_potato", "name": "Sweet Potato", "calories": 86, "protein": 1.6, "carbs": 20.0, "fat": 0.1, "aliases": ["batata", "boniato", "camote"]},
    {"id": "food_potato", "name": "Baked Potato", "calories": 77, "protein": 2.0, "carbs": 17.0, "fat": 0.1, "aliases": ["patata", "papa", "patatas"]},
    {"id": "food_banana", "name": "Banana", "calories": 89, "protein": 1.1, "carbs": 23.0, "fat": 0.3, "aliases": ["platano", "plátano", "bananas"]},
    {"id": "food_apple", "name": "Apple", "calories": 52, "protein": 0.3, "carbs": 14.0, "fat": 0.2, "aliases": ["manzana", "apples"]},
    {"id": "food_whey_protein", "name": "Whey Protein Powder", "calories": 375, "protein": 75.0, "carbs": 6.0, "fat": 4.5, "aliases": ["proteina", "batido", "protein shake", "whey"]},
    {"id": "food_broccoli", "name": "Steamed Broccoli", "calories": 35, "protein": 2.4, "carbs": 7.0, "fat": 0.4, "aliases": ["brocoli", "brócoli"]},
    {"id": "food_avocado", "name": "Avocado", "calories": 160, "protein": 2.0, "carbs": 9.0, "fat": 15.0, "aliases": ["aguacate", "palta"]},
    {"id": "food_olive_oil", "name": "Olive Oil", "calories": 884, "protein": 0.0, "carbs": 0.0, "fat": 100.0, "aliases": ["aceite de oliva", "aceite", "oil"]},
    {"id": "food_lean_beef", "name": "Lean Ground Beef (95/5)", "calories": 170, "protein": 26.0, "carbs": 0.0, "fat": 7.0, "aliases": ["carne picada", "ternera", "beef", "ground beef"]},
    {"id": "food_turkey_breast", "name": "Turkey Breast", "calories": 135, "protein": 30.0, "carbs": 0.0, "fat": 1.0, "aliases": ["pavo", "pechuga de pavo", "turkey"]},
    {"id": "food_tuna_canned", "name": "Canned Tuna in Water", "calories": 116, "protein": 26.0, "carbs": 0.0, "fat": 1.0, "aliases": ["atun", "atún", "tuna"]},
    {"id": "food_pasta", "name": "Cooked Pasta", "calories": 131, "protein": 5.0, "carbs": 25.0, "fat": 1.1, "aliases": ["pasta", "espaguetis", "macarrones", "spaghetti"]},
    {"id": "food_bread_whole_wheat", "name": "Whole Wheat Bread", "calories": 247, "protein": 13.0, "carbs": 41.0, "fat": 3.4, "aliases": ["pan integral", "bread", "pan"]},
    {"id": "food_cottage_cheese", "name": "Cottage Cheese (Low Fat)", "calories": 98, "protein": 11.0, "carbs": 3.4, "fat": 4.3, "aliases": ["queso cottage", "requeson", "requesón"]},
    {"id": "food_almonds", "name": "Almonds", "calories": 579, "protein": 21.0, "carbs": 22.0, "fat": 50.0, "aliases": ["almendras", "nuts", "frutos secos"]},
    {"id": "food_peanut_butter", "name": "Peanut Butter", "calories": 588, "protein": 25.0, "carbs": 20.0, "fat": 50.0, "aliases": ["crema de cacahuete", "mantequilla de mani"]},
    {"id": "food_milk", "name": "Whole Milk", "calories": 61, "protein": 3.2, "carbs": 4.8, "fat": 3.3, "aliases": ["leche", "leche entera"]},
    {"id": "food_almond_milk", "name": "Unsweetened Almond Milk", "calories": 15, "protein": 0.5, "carbs": 0.3, "fat": 1.1, "aliases": ["leche de almendras", "bebida de almendras"]},
    {"id": "food_spinach", "name": "Fresh Spinach", "calories": 23, "protein": 2.9, "carbs": 3.6, "fat": 0.4, "aliases": ["espinacas", "espinaca"]},
    {"id": "food_lentils", "name": "Cooked Lentils", "calories": 116, "protein": 9.0, "carbs": 20.0, "fat": 0.4, "aliases": ["lentejas"]},
    {"id": "food_tofu", "name": "Firm Tofu", "calories": 83, "protein": 10.0, "carbs": 1.9, "fat": 5.3, "aliases": ["tofu"]},
    {"id": "food_blueberries", "name": "Blueberries", "calories": 57, "protein": 0.7, "carbs": 14.0, "fat": 0.3, "aliases": ["arandanos", "arándanos"]},
]


def search_foods(query: str) -> list[FoodSearchItem]:
    """Searches food database locally with Open Food Facts API fallback."""
    q = (query or "").strip().lower()
    results: list[FoodSearchItem] = []
    seen_names: set[str] = set()

    # 1. Local catalog fuzzy / substring match
    if q:
        for item in FOOD_DATABASE:
            matched = q in item["name"].lower() or any(q in alias.lower() for alias in item.get("aliases", []))
            if matched:
                results.append(
                    FoodSearchItem(
                        id=item["id"],
                        name=item["name"],
                        calories_per_100g=item["calories"],
                        proteins_per_100g=item["protein"],
                        carbs_per_100g=item["carbs"],
                        fats_per_100g=item["fat"],
                    )
                )
                seen_names.add(item["name"].lower())
    else:
        # Default top staple recommendations
        for item in FOOD_DATABASE[:12]:
            results.append(
                FoodSearchItem(
                    id=item["id"],
                    name=item["name"],
                    calories_per_100g=item["calories"],
                    proteins_per_100g=item["protein"],
                    carbs_per_100g=item["carbs"],
                    fats_per_100g=item["fat"],
                )
            )
        return results

    # 2. If fewer than 4 matches and query has 2+ characters, query Open Food Facts API
    if len(results) < 4 and len(q) >= 2:
        try:
            with httpx.Client(timeout=2.5) as client:
                resp = client.get(
                    "https://world.openfoodfacts.org/cgi/search.pl",
                    params={
                        "search_terms": q,
                        "search_simple": 1,
                        "action": "process",
                        "json": 1,
                        "page_size": 5,
                    },
                    headers={"User-Agent": "SetAndPlateApp/1.0 (fitness-assistant)"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    for prod in data.get("products", []):
                        name = (prod.get("product_name") or prod.get("product_name_en") or "").strip()
                        if not name or name.lower() in seen_names:
                            continue
                        nutriments = prod.get("nutriments", {})
                        cals = nutriments.get("energy-kcal_100g") or nutriments.get("energy-kcal")
                        if cals is None:
                            continue
                        try:
                            cals_int = round(float(cals))
                        except (ValueError, TypeError):
                            continue

                        p = float(nutriments.get("proteins_100g") or 0.0)
                        c = float(nutriments.get("carbohydrates_100g") or 0.0)
                        f = float(nutriments.get("fat_100g") or 0.0)

                        results.append(
                            FoodSearchItem(
                                id=f"off_{prod.get('code', name)}",
                                name=name,
                                calories_per_100g=cals_int,
                                proteins_per_100g=round(p, 1),
                                carbs_per_100g=round(c, 1),
                                fats_per_100g=round(f, 1),
                                category="open_food_facts",
                            )
                        )
                        seen_names.add(name.lower())
                        if len(results) >= 8:
                            break
        except Exception as err:
            logger.debug(f"Open Food Facts lookup skipped or timed out: {err}")

    return results


def calculate_meal_nutrition(food_name: str, quantity_g: float) -> tuple[int, float, float, float]:
    """Calculates (calories, protein, carbs, fat) dynamically based on quantity in grams."""
    q = (food_name or "").strip().lower()
    qty = max(1.0, quantity_g)
    ratio = qty / 100.0

    # Best match from catalog
    best_item = None
    for item in FOOD_DATABASE:
        if q == item["name"].lower() or any(q == alias.lower() for alias in item.get("aliases", [])):
            best_item = item
            break
        elif q in item["name"].lower() or any(q in alias.lower() for alias in item.get("aliases", [])):
            best_item = item

    if best_item:
        cals = round(best_item["calories"] * ratio)
        prot = round(best_item["protein"] * ratio, 1)
        carbs = round(best_item["carbs"] * ratio, 1)
        fats = round(best_item["fat"] * ratio, 1)
        return cals, prot, carbs, fats

    # Default baseline for generic foods (~130 kcal/100g)
    return round(130 * ratio), round(8.0 * ratio, 1), round(15.0 * ratio, 1), round(3.5 * ratio, 1)


def create_user_meal(payload: MealCreateRequest) -> MealItem:
    supabase = get_supabase(admin=True)
    if not supabase:
        raise RuntimeError("Database connection unavailable")

    ingredients = payload.ingredients
    if ingredients:
        qty, cals, proteins, carbs, fats = _summarize_ingredients(ingredients)
    else:
        qty = float(payload.quantity_g if payload.quantity_g and payload.quantity_g > 0 else 100.0)
        cals = payload.calories
        proteins = payload.proteins
        carbs = payload.carbs
        fats = payload.fats

        # Automatically calculate calories and macros if not explicitly provided
        if cals is None or cals <= 0:
            cals, calc_p, calc_c, calc_f = calculate_meal_nutrition(payload.name, qty)
            if proteins is None or proteins == 0.0:
                proteins = calc_p
            if carbs is None or carbs == 0.0:
                carbs = calc_c
            if fats is None or fats == 0.0:
                fats = calc_f

    meal_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    record = {
        "id": meal_id,
        "user_id": payload.user_id,
        "name": payload.name,
        "calories": cals,
        "proteins": proteins or 0.0,
        "carbs": carbs or 0.0,
        "fats": fats or 0.0,
        "consumed_at": now_iso,
        "quantity_g": qty,
        "meal_type": payload.meal_type or infer_meal_type(now_iso),
        "ingredients": [ingredient.model_dump() for ingredient in ingredients],
    }

    supabase.table("meals").insert(record).execute()

    return MealItem(
        id=meal_id,
        user_id=payload.user_id,
        meal_name=payload.name,
        meal_type=payload.meal_type or infer_meal_type(now_iso),
        portion_amount="1",
        weight_g=str(round(qty)),
        item_calories=cals,
        consumed_at=now_iso,
        proteins_g=round(proteins or 0.0, 1),
        carbs_g=round(carbs or 0.0, 1),
        fats_g=round(fats or 0.0, 1),
        ingredients=ingredients,
    )


def _summarize_ingredients(
    ingredients: list[MealIngredient],
) -> tuple[float, int, float, float, float]:
    quantity = sum(ingredient.quantity_g for ingredient in ingredients)
    calories = 0.0
    proteins = 0.0
    carbs = 0.0
    fats = 0.0
    for ingredient in ingredients:
        ratio = ingredient.quantity_g / 100
        calories += ingredient.calories_per_100g * ratio
        proteins += ingredient.proteins_per_100g * ratio
        carbs += ingredient.carbs_per_100g * ratio
        fats += ingredient.fats_per_100g * ratio
    return (
        quantity,
        round(calories),
        round(proteins, 1),
        round(carbs, 1),
        round(fats, 1),
    )


def update_user_meal(user_id: str, meal_id: str, payload: MealUpdateRequest) -> MealItem:
    supabase = get_supabase(admin=True)
    if not supabase:
        raise RuntimeError("Database connection unavailable")

    quantity, calories, proteins, carbs, fats = _summarize_ingredients(payload.ingredients)
    record = {
        "name": payload.name,
        "meal_type": payload.meal_type,
        "quantity_g": quantity,
        "calories": calories,
        "proteins": proteins,
        "carbs": carbs,
        "fats": fats,
        "ingredients": [ingredient.model_dump() for ingredient in payload.ingredients],
    }
    response = (
        supabase.table("meals")
        .update(record)
        .eq("id", meal_id)
        .eq("user_id", user_id)
        .select("id,user_id,name,calories,proteins,carbs,fats,consumed_at,ingredients,quantity_g,meal_type")
        .execute()
    )
    if not response.data:
        raise LookupError("Meal not found")
    row = response.data[0]
    return MealItem(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        meal_name=row["name"],
        meal_type=row.get("meal_type") or payload.meal_type,
        portion_amount="1",
        weight_g=str(round(float(row.get("quantity_g") or 0))),
        item_calories=int(row.get("calories") or 0),
        consumed_at=row.get("consumed_at"),
        proteins_g=round(float(row.get("proteins") or 0), 1),
        carbs_g=round(float(row.get("carbs") or 0), 1),
        fats_g=round(float(row.get("fats") or 0), 1),
        ingredients=row.get("ingredients") or [],
    )


def delete_user_meal(meal_id: str) -> bool:
    supabase = get_supabase(admin=True)
    if not supabase:
        raise RuntimeError("Database connection unavailable")

    supabase.table("meals").delete().eq("id", meal_id).execute()
    return True
