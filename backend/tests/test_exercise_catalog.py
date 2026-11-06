from fastapi.testclient import TestClient

from app.services.fuzzy_matcher import FuzzyEntityMatcher
from app.services.exercise_catalog import (
    load_cached_exercises,
    resolve_exercise_log_id,
    supabase_uuid_for,
)
from app.services.workout_program import FILL_ORDER, TEMPLATES, load_staples
from app.services.workout_service import (
    get_exercise_by_id,
    get_exercise_categories,
    list_exercises,
)
from main import app

client = TestClient(app)


def test_cached_catalog_loaded():
    exercises = load_cached_exercises()
    assert len(exercises) == 1324
    assert any("bench" in e.name.lower() or "press" in e.name.lower() for e in exercises)


def test_list_and_filter_exercises():
    # Filter by category
    chest_exercises, total_chest = list_exercises(category="Chest", limit=10)
    assert total_chest > 0
    assert all(e.category.lower() == "chest" for e in chest_exercises)

    # Search query in English or Spanish
    search_results, total_search = list_exercises(query="squat", limit=5)
    assert total_search > 0
    assert any("squat" in e.name.lower() for e in search_results)


def test_get_exercise_by_id():
    exercise = get_exercise_by_id("0025")
    assert exercise is not None
    assert exercise.name == "Barbell Bench Press"
    assert exercise.category == "Chest"


def test_resolve_exercise_log_id():
    import uuid

    exercise = get_exercise_by_id("0025")
    resolved = resolve_exercise_log_id("0025")
    assert resolved == supabase_uuid_for(exercise)
    assert resolve_exercise_log_id(str(uuid.uuid4())) is not None
    try:
        resolve_exercise_log_id("not_a_real_exercise")
        raise AssertionError("Expected ValueError for unknown exercise")
    except ValueError:
        pass


def test_get_exercise_categories():
    categories = get_exercise_categories()
    assert len(categories) > 0
    assert "Arms" in categories or "Chest" in categories or "Abs" in categories


def test_api_exercises_endpoints():
    response = client.get("/api/v1/workouts/exercises?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert len(data["items"]) == 5
    assert data["total"] == 1324

    # Categories endpoint
    cat_res = client.get("/api/v1/workouts/exercises/categories")
    assert cat_res.status_code == 200
    assert "categories" in cat_res.json()

    # Detail endpoint
    first_id = data["items"][0]["id"]
    detail_res = client.get(f"/api/v1/workouts/exercises/{first_id}")
    assert detail_res.status_code == 200
    assert detail_res.json()["id"] == first_id

    # 404 for unknown exercise
    unknown_res = client.get("/api/v1/workouts/exercises/non_existent_id_12345")
    assert unknown_res.status_code == 404

    compact_res = client.get("/api/v1/workouts/exercises?limit=5&compact=true")
    assert compact_res.status_code == 200
    compact_item = compact_res.json()["items"][0]
    assert compact_item["description"] is None
    assert compact_item["aliases"] == []
    assert len(compact_item["images"]) <= 1


def test_fuzzy_matcher_includes_imported_exercises():
    matcher = FuzzyEntityMatcher()
    catalog_ids = {exercise.id for exercise in load_cached_exercises()}
    assert catalog_ids <= {item.id for item in matcher.catalog}


def test_staples_exist_and_cover_every_movement():
    staples = load_staples()
    catalog_ids = {exercise.id for exercise in load_cached_exercises()}
    assert set(staples) <= catalog_ids
    movements = {staple["movement"] for staple in staples.values()}
    assert {movement for template in TEMPLATES.values() for movement in template} <= movements
    assert set(FILL_ORDER) <= movements
