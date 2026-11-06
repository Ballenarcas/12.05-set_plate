from app.services.ai_tips_service import build_candidates, bump_exercise_sets, can_add_set

EXERCISES = [{"exercise_id": "a", "name": "Squat", "sets": 3, "reps": 8}, {"exercise_id": "b", "name": "Row", "sets": 3, "reps": 8}]


def _state(**overrides) -> dict:
    base = {
        "goal": 2200, "eaten_kcal": 0, "protein_eaten": 0, "protein_goal": 120, "meals_count": 0,
        "workouts_done_today": 0, "sets_last_7d": 0, "sets_prev_7d": 0, "planned_sets_today": 0, "plan": None,
    }
    return {**base, **overrides}


def _kinds(state: dict) -> list[str]:
    return [tip["kind"] for tip in build_candidates(state)]


def test_set_increase_stays_within_ten_percent_of_last_week():
    assert can_add_set(sets_last_7d=20, planned_today=6, sets_prev_7d=30)  # 27 <= 33
    assert can_add_set(sets_last_7d=26, planned_today=6, sets_prev_7d=30)  # 33 <= 33
    assert not can_add_set(sets_last_7d=27, planned_today=6, sets_prev_7d=30)  # 34 > 33


def test_no_set_is_offered_without_a_previous_week_to_compare():
    assert not can_add_set(sets_last_7d=0, planned_today=6, sets_prev_7d=0)


def test_finished_workout_offers_100_kcal_first():
    tips = build_candidates(_state(workouts_done_today=1, meals_count=1, eaten_kcal=600))
    assert tips[0]["kind"] == "workout_done_kcal"
    assert tips[0]["action"] == {"type": "add_kcal", "kcal": 100}
    assert "Good job in your training" in tips[0]["message"]


def test_add_set_is_offered_only_inside_the_weekly_limit():
    plan = {"is_rest_day": False, "exercises": EXERCISES}
    within = _state(plan=plan, planned_sets_today=6, sets_last_7d=20, sets_prev_7d=30)
    over = _state(plan=plan, planned_sets_today=6, sets_last_7d=30, sets_prev_7d=30)
    assert "add_set" in _kinds(within)
    assert "add_set" not in _kinds(over)
    assert build_candidates(within)[0]["action"] == {"type": "add_set", "exercise_id": "a", "name": "Squat"}


def test_no_set_on_a_rest_day_or_after_training():
    rest = {"is_rest_day": True, "exercises": []}
    assert "add_set" not in _kinds(_state(plan=rest, sets_last_7d=1, sets_prev_7d=30))
    trained = _state(workouts_done_today=1, plan={"is_rest_day": False, "exercises": EXERCISES}, sets_prev_7d=30)
    assert "add_set" not in _kinds(trained)


def test_tips_never_ask_the_user_to_eat_less():
    states = [
        _state(), _state(meals_count=2, eaten_kcal=3000), _state(workouts_done_today=1),
        _state(meals_count=1, eaten_kcal=1500, protein_eaten=10),
    ]
    for state in states:
        for tip in build_candidates(state):
            action = tip["action"] or {}
            assert action.get("kcal", 0) >= 0
            assert action.get("type") in (None, "add_kcal", "add_set")


def test_tip_text_changes_when_new_food_is_logged():
    before = build_candidates(_state(meals_count=1, eaten_kcal=500))[-1]
    after = build_candidates(_state(meals_count=2, eaten_kcal=1100))[-1]
    assert before["kind"] == after["kind"] == "on_track"
    assert (before["state_key"], before["message"]) != (after["state_key"], after["message"])


def test_on_track_only_appears_under_the_goal():
    assert "on_track" not in _kinds(_state(meals_count=2, eaten_kcal=2200))
    assert "goal_reached" in _kinds(_state(meals_count=2, eaten_kcal=2200))
    assert "goal_reached" not in _kinds(_state(meals_count=3, eaten_kcal=2600))
    assert "on_track" not in _kinds(_state(meals_count=3, eaten_kcal=2600))


def test_low_protein_and_over_target_tips():
    assert "protein_behind" in _kinds(_state(meals_count=2, eaten_kcal=1500, protein_eaten=20))
    assert "over_target" in _kinds(_state(meals_count=3, eaten_kcal=2600))


def test_empty_day_asks_for_the_first_meal():
    assert _kinds(_state()) == ["nothing_logged"]


def test_bump_adds_one_set_to_the_chosen_exercise_only():
    updated = bump_exercise_sets(EXERCISES, "b")
    assert [item["sets"] for item in updated] == [3, 4]
    assert [item["sets"] for item in EXERCISES] == [3, 3]
    assert bump_exercise_sets(EXERCISES, "missing") is None
