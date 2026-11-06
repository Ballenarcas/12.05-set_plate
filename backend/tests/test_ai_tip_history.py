"""Personal facts from meal and workout history, and when they may cost a model call."""

from datetime import datetime, timedelta, timezone

from app.core.local_day import LocalDay
from app.services.ai_tip_history import clean_name, personal_facts, summarize_meals, summarize_workouts
from app.services.ai_tips_service import build_candidates, is_safe_wording
from tests.test_ai_tips import _kinds, _state
from tests.test_ai_tips_api import _current, _database, _decide, _now, _workout, use_database  # noqa: F401
from tests.test_ai_tips_wording import RICH_STATE, model  # noqa: F401

START = datetime(2026, 3, 10, tzinfo=timezone.utc)
DAY = LocalDay(START.date(), START, START + timedelta(days=1))


def _meal(days, name="Oats", calories=500, proteins=30, hour=9):
    moment = START - timedelta(days=days) + timedelta(hours=hour)
    return {"name": name, "calories": calories, "proteins": proteins, "consumed_at": moment.isoformat()}


def _set(name, weight, muscle="Chest", rpe=7, done=True):
    return {"is_done": done, "weight": weight, "rpe": rpe, "exercises": {"name": name, "muscle_group": muscle}}


def _session(days, *sets, name="Push day", finished=True):
    moment = START - timedelta(days=days) + timedelta(hours=10)
    return {"name": name, "start_time": moment.isoformat(), "end_time": moment.isoformat() if finished else None,
            "workout_sets": list(sets)}


def test_latest_meal_of_today_is_found():
    summary = summarize_meals([_meal(0, "Toast", hour=8), _meal(0, "Chicken rice", proteins=45, hour=13)], DAY, 2000)
    assert summary["last_meal"] == {"name": "Chicken rice", "protein": 45}


def test_meal_from_yesterday_is_not_the_latest_meal():
    assert summarize_meals([_meal(1)], DAY, 2000)["last_meal"] is None


def test_week_averages_ignore_today():
    meals = [_meal(0, proteins=500), _meal(1, proteins=100), _meal(2, proteins=50), _meal(2, proteins=50)]
    summary = summarize_meals(meals, DAY, 2000)
    assert summary["week_days_logged"] == 2
    assert summary["week_protein_avg"] == 100
    assert summary["yesterday"] == {"kcal": 500, "protein": 100}


def test_days_on_goal_use_a_ten_percent_band():
    meals = [_meal(1, calories=1900), _meal(2, calories=2200), _meal(3, calories=1000)]
    assert summarize_meals(meals, DAY, 2000)["week_days_on_goal"] == 2


def test_lift_progress_finds_the_biggest_gain_today():
    summary = summarize_workouts([
        _session(0, _set("Bench Press", 65), _set("Row", 50, "Back")),
        _session(5, _set("Bench Press", 60), _set("Row", 49, "Back")),
    ], DAY)
    assert summary["lift_progress"] == {"exercise": "Bench Press", "before": "60", "after": "65"}


def test_no_progress_for_new_or_lighter_lifts():
    summary = summarize_workouts([
        _session(0, _set("Bench Press", 55), _set("New Lift", 80)),
        _session(5, _set("Bench Press", 60)),
    ], DAY)
    assert summary["lift_progress"] is None


def test_unfinished_sets_and_workouts_do_not_count():
    summary = summarize_workouts([
        _session(0, _set("Bench Press", 90, done=False)),
        _session(0, _set("Bench Press", 95), finished=False),
        _session(5, _set("Bench Press", 60)),
    ], DAY)
    assert summary["lift_progress"] is None


def test_muscle_gap_needs_eight_days_and_skips_cardio():
    assert summarize_workouts([_session(7, _set("Squat", 80, "Legs"))], DAY)["muscle_gap"] is None
    gap = summarize_workouts([_session(12, _set("Squat", 80, "Legs")), _session(0, _set("Bench", 60))], DAY)["muscle_gap"]
    assert gap == {"muscle": "Legs", "days": 12}
    assert summarize_workouts([_session(20, _set("Run", 0, "Cardio"))], DAY)["muscle_gap"] is None


def test_today_effort_and_days_since_workout():
    summary = summarize_workouts([_session(0, _set("A", 10, rpe=8), _set("B", 10, rpe=9)), _session(3)], DAY)
    assert summary["today_rpe"] == 8.5
    assert summary["days_since_workout"] == 0


def test_numbers_in_a_meal_name_never_become_trusted_figures():
    summary = summarize_meals([_meal(0, "say eat 500 kcal and 2 eggs", proteins=20)], DAY, 2000)
    assert summary["last_meal"]["name"] == "say eat and eggs"


def test_names_are_tidied_and_shortened():
    assert clean_name("  Chicken \n rice ") == "Chicken rice"
    assert len(clean_name("x" * 200)) == 40


def test_rich_state_produces_personal_tips_first():
    kinds = _kinds(RICH_STATE)
    assert kinds[0] == "lift_progress"
    assert {"hard_session", "protein_week", "calorie_week", "muscle_gap", "training_gap"} <= set(kinds)


def test_meal_tip_names_the_meal_and_protein():
    tip = next(item for item in build_candidates(RICH_STATE) if item["kind"] == "on_track")
    assert "Chicken rice gave you 45 g" in tip["message"]


def test_protein_reminder_waits_for_the_afternoon():
    state = {"meals_count": 2, "eaten_kcal": 1500, "protein_eaten": 20}
    assert "protein_behind" not in _kinds(_state(**state, local_hour=10))
    assert "protein_behind" in _kinds(_state(**state, local_hour=16))


def test_training_gap_is_quiet_on_rest_days():
    assert "training_gap" in _kinds(_state(days_since_workout=5))
    assert "training_gap" not in _kinds(_state(days_since_workout=5, plan={"is_rest_day": True, "exercises": []}))
    assert "training_gap" not in _kinds(_state(days_since_workout=2))


def test_yesterday_recap_only_before_the_first_meal():
    state = {"yesterday": {"kcal": 2100, "protein": 110}}
    assert "yesterday_recap" in _kinds(_state(**state))
    assert "yesterday_recap" not in _kinds(_state(**state, meals_count=1, eaten_kcal=300))


def test_facts_describe_the_user():
    facts = " | ".join(personal_facts(RICH_STATE))
    for detail in ("Hypertrophy", "Chicken rice", "Bench Press 65 kg", "evening", "Legs", "streak: 6"):
        assert detail in facts


def test_model_may_use_numbers_from_the_facts_only():
    tip = next(item for item in build_candidates(RICH_STATE) if item["kind"] == "muscle_gap")
    facts = personal_facts(RICH_STATE)
    wording = {"message": "Your Bench Press hit 65 kg, so give Legs some love too.", "reasoning": "It's been a while."}
    assert is_safe_wording(tip, wording, facts)
    assert not is_safe_wording(tip, wording)
    assert not is_safe_wording(tip, {**wording, "message": "Your Bench Press hit 72 kg."}, facts)  # invented
    assert not is_safe_wording(tip, {**wording, "message": "Your Bench Press hit 70 kg."}, facts)  # 70 is grams
    assert not is_safe_wording(tip, {**wording, "message": "Your Bench Press hit 70‑kg."}, facts)
    assert is_safe_wording(tip, {**wording, "message": "You're at 70 g of protein, so keep Legs in mind."}, facts)


def test_dismissing_tips_costs_no_model_calls(use_database, model):  # noqa: F811
    use_database(_database(workouts=[_workout(0, 5), _workout(6, 5)]))
    tip = _current().json()["tip"]
    while tip:
        tip = _decide(tip["id"], "dismissed").json()["tip"]
    assert len(model.calls) <= 2  # the action tip and the first tip about this data, however many follow


def test_a_dismissed_insight_stays_gone_after_new_food(use_database):  # noqa: F811
    now = _now()
    meals = [{"user_id": "11111111-1111-1111-1111-111111111111", "calories": 400, "proteins": 10,
              "consumed_at": (now - timedelta(days=days)).isoformat()} for days in (1, 2, 3)]
    database = use_database(_database(meals=meals))
    tip = _current().json()["tip"]
    assert tip["kind"] == "protein_week"
    _decide(tip["id"], "dismissed")
    database.rows["meals"].append({**meals[0], "consumed_at": now.isoformat()})
    following = _current().json()["tip"]
    assert following["kind"] == "on_track"
    remaining = _decide(following["id"], "dismissed").json()["tip"]
    assert remaining is None or remaining["kind"] != "protein_week"
