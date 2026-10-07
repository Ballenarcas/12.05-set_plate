from fastapi.testclient import TestClient

from app.schemas.exercise import Exercise
from app.services.fuzzy_matcher import FuzzyEntityMatcher
from app.services.wger_importer import clean_html, load_cached_exercises, parse_wger_exercise
from app.services.workout_service import (
    get_exercise_by_id,
    get_exercise_categories,
    list_exercises,
)
from main import app

client = TestClient(app)


def test_clean_html():
    assert clean_html("<p>Hello <b>World</b>!</p>") == "Hello World!"
    assert clean_html(None) == ""
    assert clean_html("&amp; test") == "& test"


def test_parse_wger_exercise():
    raw_wger = {
        "id": 101,
        "category": {"id": 1, "name": "Chest"},
        "muscles": [{"name": "Pectoralis major", "name_en": "Chest"}],
        "muscles_secondary": [],
        "equipment": [{"name": "Barbell"}],
        "images": [{"image": "https://example.com/bench.jpg"}],
        "translations": [
            {
                "language": 2,
                "name": "Barbell Flat Bench Press",
                "description": "<p>Lie on bench and press.</p>",
                "aliases": ["flat bench"],
            },
            {
                "language": 4,
                "name": "Press de Banca Plano",
                "description": "<p>Acuéstese en el banco.</p>",
                "aliases": [],
            },
        ],
    }

    exercise = parse_wger_exercise(raw_wger)
    assert exercise is not None
    assert exercise.id == "wger_101"
    assert exercise.wger_id == 101
    assert exercise.name == "Barbell Flat Bench Press"
    assert exercise.name_es == "Press de Banca Plano"
    assert exercise.category == "Chest"
    assert "Chest" in exercise.muscles
    assert "Barbell" in exercise.equipment
    assert exercise.description == "Lie on bench and press."
    assert "press de banca plano" in exercise.aliases
    assert "flat bench" in exercise.aliases


def test_cached_catalog_loaded():
    exercises = load_cached_exercises()
    assert len(exercises) >= 900
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
    exercise = get_exercise_by_id("wger_9")
    assert exercise is not None
    assert exercise.wger_id == 9
    assert "Kettlebell" in exercise.name


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
    assert data["total"] >= 900

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


def test_fuzzy_matcher_includes_imported_exercises():
    matcher = FuzzyEntityMatcher()
    # Check that wger exercise IDs are present in catalog
    wger_items = [item for item in matcher.catalog if item.id.startswith("wger_")]
    assert len(wger_items) >= 900
