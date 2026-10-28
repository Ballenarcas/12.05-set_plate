from fastapi.testclient import TestClient
from uuid import uuid4

from app.schemas.ai import EntityType
from app.services.fuzzy_matcher import FuzzyEntityMatcher, calculate_similarity, normalize_text
from main import app
from tests.auth_helpers import auth_headers

client = TestClient(app)


def test_normalize_text():
    assert normalize_text("  Chicken Breast! ") == "chicken breast"
    assert normalize_text("Incline-Dumbbell   Press??") == "incline-dumbbell press"


def test_calculate_similarity():
    # Exact match
    assert calculate_similarity("bench press", "bench press") == 1.0
    # Minor typo
    score_typo = calculate_similarity("incline dumbell", "incline dumbbell")
    assert score_typo > 0.85
    # Token reordering
    score_reorder = calculate_similarity("press bench barbell", "barbell bench press")
    assert score_reorder > 0.90
    # Dissimilar
    assert calculate_similarity("pizza pepperoni", "squat") < 0.40


def test_fuzzy_matcher_exercises():
    matcher = FuzzyEntityMatcher()

    # Typo on "incline dumbell pres"
    result = matcher.match("I want to do 4 sets of incline dumbell pres and squats")
    exercise_ids = [e.id for e in result.exercises]
    assert "ex_incline_dumbbell_press" in exercise_ids
    assert "ex_barbell_squat" in exercise_ids
    assert result.detected_intent in ["setup_routine", "general_fitness"]


def test_fuzzy_matcher_foods():
    matcher = FuzzyEntityMatcher()

    # Spanish alias / typos: "chiken" and "sweet potatos"
    result = matcher.match("Log 200g of chiken brest and sweet potatos for lunch")
    food_ids = [f.id for f in result.foods]
    meal_ids = [m.id for m in result.meals]

    assert "food_chicken_breast" in food_ids
    assert "food_sweet_potato" in food_ids
    assert "meal_lunch" in meal_ids
    assert result.detected_intent == "log_meal"


def test_fuzzy_matcher_routine_and_meal_hybrid():
    matcher = FuzzyEntityMatcher()
    result = matcher.match("Plan a leg day workout with rdl and then oatmeal for breakfast")

    assert any(r.id == "routine_legs" for r in result.routines)
    assert any(e.id == "ex_romanian_deadlift" for e in result.exercises)
    assert any(f.id == "food_oatmeal" for f in result.foods)
    assert any(m.id == "meal_breakfast" for m in result.meals)
    assert result.detected_intent == "setup_routine_and_meal"


def test_parse_intent_api_endpoint():
    response = client.post(
        "/api/v1/ai/parse-intent",
        json={"text": "Add 3 sets of bench press and 1 scoop of whey protein"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "exercises" in data
    assert "foods" in data
    assert any(e["id"] == "ex_bench_press" for e in data["exercises"])
    assert any(f["id"] == "food_whey_protein" for f in data["foods"])


def test_conversational_setup_api_endpoint():
    response = client.post(
        "/api/v1/ai/conversational-setup",
        json={"message": "Can you set up my upper body routine with bench and pullups?"},
        headers=auth_headers(uuid4()),
    )
    assert response.status_code == 200
    data = response.json()
    assert "reply" in data
    assert "matched_entities" in data
    matched = data["matched_entities"]
    assert any(e["id"] == "ex_bench_press" for e in matched["exercises"])
    assert any(e["id"] == "ex_pull_up" for e in matched["exercises"])
