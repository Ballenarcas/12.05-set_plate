"""Scaled workout bonus, rest-day and streak tips, and the limits on model-written wording."""

from datetime import timedelta
from types import SimpleNamespace

import pytest

from app.services import ai_tips_service as tips
from app.services.ai_tips_service import build_candidates, is_safe_wording, logging_streak, workout_kcal_bonus
from app.services.premium_service import has_active_premium
from tests.test_ai_tips import EXERCISES, _kinds, _state
from tests.test_ai_tips_api import (  # noqa: F401  (use_database is a fixture)
    USER,
    Database,
    _bonus,
    _current,
    _database,
    _decide,
    _now,
    _workout,
    use_database,
)

REST_PLAN = {"is_rest_day": True, "exercises": []}
SET_STATE = _state(
    plan={"is_rest_day": False, "exercises": EXERCISES}, planned_sets_today=6, sets_last_7d=20, sets_prev_7d=30,
)
KCAL_TIP = build_candidates(_state(workouts_done_today=1, workout_seconds=3600, weight_kg=75))[0]
SET_TIP = build_candidates(SET_STATE)[0]
INFO_TIP = build_candidates(_state(meals_count=2, eaten_kcal=1100, protein_eaten=100))[0]


def _wording(message, reasoning="You earned it with today's session."):
    return {"message": message, "reasoning": reasoning}


@pytest.mark.parametrize(("minutes", "expected"), [(20, 50), (60, 120), (90, 190), (480, 200)])
def test_workout_bonus_grows_with_the_session_and_stays_limited(minutes, expected):
    assert workout_kcal_bonus(75, minutes * 60) == expected


def test_workout_bonus_falls_back_when_length_or_weight_is_unknown():
    assert workout_kcal_bonus(75, 0) == 100
    assert workout_kcal_bonus(None, 3600) == 100


def test_workout_tip_offers_the_scaled_bonus():
    tip = build_candidates(_state(workouts_done_today=1, workout_seconds=5400, weight_kg=75))[0]
    assert tip["action"] == {"type": "add_kcal", "kcal": 190}
    assert "190 kcal" in tip["message"]


def test_streak_counts_back_from_today_or_yesterday():
    assert logging_streak({0, 1, 2}) == 3
    assert logging_streak({1, 2, 3, 4}) == 4
    assert logging_streak({0, 2, 3}) == 1
    assert logging_streak({2, 3}) == 0
    assert logging_streak(set()) == 0


def test_streak_tip_needs_three_days():
    assert "logging_streak" not in _kinds(_state(streak_days=2))
    assert "logging_streak" in _kinds(_state(streak_days=3))


def test_rest_day_tip_needs_a_rest_day_without_training():
    assert "rest_day" in _kinds(_state(plan=REST_PLAN))
    assert "rest_day" not in _kinds(_state(plan=REST_PLAN, workouts_done_today=1))
    assert "rest_day" not in _kinds(_state(plan={"is_rest_day": False, "exercises": EXERCISES}))


def test_logging_food_always_outranks_rest_day_and_streak_tips():
    assert _kinds(_state(plan=REST_PLAN, streak_days=4))[0] == "rest_day"
    assert _kinds(_state(plan=REST_PLAN, streak_days=4, meals_count=1, eaten_kcal=400))[0] == "on_track"


@pytest.mark.parametrize("state", [
    _state(), _state(workouts_done_today=1), _state(meals_count=2, eaten_kcal=1100),
    _state(meals_count=2, eaten_kcal=2200), _state(meals_count=3, eaten_kcal=2600),
    _state(meals_count=2, eaten_kcal=1500, protein_eaten=20), _state(streak_days=5),
    _state(plan=REST_PLAN), SET_STATE,
])
def test_every_template_passes_its_own_safety_check(state):
    for tip in build_candidates(state):
        assert is_safe_wording(tip, tip)


def test_good_rewording_is_accepted():
    assert is_safe_wording(KCAL_TIP, _wording("Great session! Want 120 kcal more on today's plan?"))
    assert is_safe_wording(SET_TIP, _wording("You're on a roll. Try one set more of Squat today?"))
    assert is_safe_wording(INFO_TIP, _wording("Good going: 2 meals in and 1100 kcal left today."))


@pytest.mark.parametrize("wording", [
    None, "text", {}, {"message": "Hi"}, {"message": 1, "reasoning": "x"}, _wording(""), _wording("Hi", ""),
    _wording("x" * 121), _wording("Hi", "x" * 261),
])
def test_malformed_wording_is_rejected(wording):
    assert not is_safe_wording(INFO_TIP, wording)


@pytest.mark.parametrize("message", [
    "Today you did 7526 kg, so add 4.3 g of protein.",  # invented numbers
    "This should help treat your fatigue.",
    "You may have a protein deficiency.",
    "Try to eat less tonight.",
    "Skip dinner and you will be fine.",
    "Lift twice as much next week.",
    "I added it to your plan.",
])
def test_unsafe_wording_is_rejected(message):
    assert not is_safe_wording(INFO_TIP, _wording(message))


@pytest.mark.parametrize("reasoning", [
    "Keeps the same meaning and is warm and simple.",
    "Rephrased warmly while keeping the numbers.",
    "The tip keeps the exact numbers and stays simple.",
    "I rewrote it with a friendly tone.",
])
def test_comments_about_the_rewriting_are_rejected(reasoning):
    assert not is_safe_wording(INFO_TIP, _wording("Good going: 2 meals in and 1100 kcal left today.", reasoning))


def test_action_wording_must_still_describe_what_accept_does():
    assert not is_safe_wording(KCAL_TIP, _wording("Great session! Add 120 kcal to today's plan."))  # not an offer
    assert not is_safe_wording(KCAL_TIP, _wording("Great session! Want some more food today?"))  # no amount
    assert not is_safe_wording(SET_TIP, _wording("Add one set of Bench Press today?"))  # wrong exercise
    assert not is_safe_wording(SET_TIP, _wording("Want to do more Squat today?"))  # no amount


@pytest.fixture
def model(monkeypatch):
    """Fake model with the switch on and a Premium user. Tests narrow these to each case."""
    state = SimpleNamespace(calls=[], premium=True, reply=None)

    def phrase(message, reasoning):
        state.calls.append(message)
        if isinstance(state.reply, Exception):
            raise state.reply
        return state.reply or {"message": f"Friendly: {message}", "reasoning": f"Friendly: {reasoning}"}

    monkeypatch.setattr(tips, "phrase_tip", phrase)
    monkeypatch.setattr(tips, "has_active_premium", lambda _user, _session: state.premium)
    monkeypatch.setattr(tips, "get_settings", lambda: SimpleNamespace(ai_tips_model_enabled=True, groq_api_key="key"))
    return state


def test_model_rewords_a_new_tip_once_for_premium_users(use_database, model):  # noqa: F811
    database = use_database(_database())
    first, second = _current().json()["tip"], _current().json()["tip"]
    assert first["message"].startswith("Friendly:")
    assert first["reasoning"].startswith("Friendly:")
    assert second["id"] == first["id"]
    assert len(model.calls) == 1  # a reload costs no tokens
    assert database.rows["ai_tips"][0]["source"] == "model"


def test_model_is_not_called_while_the_switch_is_off(use_database, model, monkeypatch):  # noqa: F811
    use_database(_database())
    monkeypatch.setattr(tips, "get_settings", lambda: SimpleNamespace(ai_tips_model_enabled=False, groq_api_key="key"))
    assert "Friendly" not in _current().json()["tip"]["message"]
    assert model.calls == []


def test_model_is_not_called_for_free_users(use_database, model):  # noqa: F811
    use_database(_database())
    model.premium = False
    assert _current().json()["tip"]["kind"] == "nothing_logged"
    assert model.calls == []


def test_model_is_not_called_without_an_api_key(use_database, model, monkeypatch):  # noqa: F811
    use_database(_database())
    monkeypatch.setattr(tips, "get_settings", lambda: SimpleNamespace(ai_tips_model_enabled=True, groq_api_key=""))
    _current()
    assert model.calls == []


def test_unsafe_model_wording_falls_back_to_the_template(use_database, model):  # noqa: F811
    database = use_database(_database())
    model.reply = {"message": "This will treat your condition.", "reasoning": "Trust me."}
    tip = _current().json()["tip"]
    assert tip["message"] == "Log your first meal so I can tailor today's tips."
    assert database.rows["ai_tips"][0].get("source") != "model"  # the column defaults to template


def test_model_failure_falls_back_to_the_template(use_database, model):  # noqa: F811
    use_database(_database())
    model.reply = TimeoutError("slow")
    response = _current()
    assert response.status_code == 200
    assert response.json()["tip"]["kind"] == "nothing_logged"


def test_model_is_limited_to_five_tips_a_day_even_when_answers_are_rejected(use_database, model):  # noqa: F811
    database = use_database(_database())
    model.reply = {"message": "Unsafe: treat this.", "reasoning": "No."}
    for _ in range(7):
        database.rows["meals"].append(
            {"user_id": USER, "calories": 100, "proteins": 30, "consumed_at": _now().isoformat()},
        )
        assert _current().status_code == 200
    assert len(model.calls) == 5
    assert len(database.rows["ai_tips"]) == 7


def test_model_wording_never_changes_what_accept_does(use_database, model):  # noqa: F811
    database = use_database(_database(workouts=[_workout(0, 5)]))
    model.reply = {"message": "Great work! Want 100 kcal more on today's plan?", "reasoning": "You trained today."}
    tip = _current().json()["tip"]
    assert tip["message"].startswith("Great work!")
    _decide(tip["id"], "accepted")
    assert _bonus(database) == 100


def test_streak_comes_from_meals_on_earlier_days(use_database):  # noqa: F811
    meals = [
        {"user_id": USER, "calories": 500, "proteins": 60, "consumed_at": (_now() - timedelta(days=days)).isoformat()}
        for days in (1, 2, 3, 4)
    ]
    use_database(_database(meals=meals))
    tip = _current().json()["tip"]
    assert tip["kind"] == "logging_streak"
    assert tip["message"].startswith("4 days")


def test_workout_length_sets_the_calorie_offer(use_database):  # noqa: F811
    started = _now() - timedelta(minutes=5)
    workout = {
        "user_id": USER, "start_time": started.isoformat(), "workout_sets": [{"is_done": True}],
        "end_time": (started + timedelta(minutes=60)).isoformat(),
    }
    use_database(_database(workouts=[workout]))
    assert "120 kcal" in _current().json()["tip"]["message"]


def test_premium_needs_a_running_paid_period():
    future = (_now() + timedelta(days=3)).isoformat()
    past = (_now() - timedelta(days=3)).isoformat()

    def has(*rows):
        return has_active_premium(USER, Database(subscriptions=list(rows)))

    assert has({"user_id": USER, "status": "active", "current_period_end": future})
    assert has({"user_id": USER, "status": "trialing", "current_period_end": future})
    assert not has()
    assert not has({"user_id": USER, "status": "active", "current_period_end": past})
    assert not has({"user_id": USER, "status": "expired", "current_period_end": future})
