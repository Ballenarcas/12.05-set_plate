"""Accepted tips shape later tips and the workout plan."""

from datetime import datetime, timedelta, timezone

from app.core.local_day import LocalDay
from app.services.ai_tip_history import personal_facts, summarize_accepted
from app.services.ai_tips_service import accepted_training_notes, build_candidates
from tests.test_ai_tips import _kinds, _state
from tests.test_ai_tips_api import (  # noqa: F401  (use_database is a fixture)
    USER,
    Database,
    _current,
    _database,
    _decide,
    _now,
    _workout,
    use_database,
)

START = datetime(2026, 3, 10, tzinfo=timezone.utc)
DAY = LocalDay(START.date(), START, START + timedelta(days=1))


def _agreed(kind, days_ago=1, muscle=None):
    return {"kind": kind, "days_ago": days_ago, "muscle": muscle}


def _tip(state, kind):
    return next(item for item in build_candidates(state) if item["kind"] == kind)


def test_only_earlier_days_count_as_accepted_history():
    rows = [
        {"kind": "protein_week", "created_at": (START + timedelta(hours=8)).isoformat()},
        {"kind": "training_gap", "created_at": (START - timedelta(hours=5)).isoformat()},
        {"kind": "muscle_gap", "action": {"muscle": "Legs"}, "created_at": (START - timedelta(days=3)).isoformat()},
    ]
    summary = summarize_accepted(rows, DAY)
    assert [item["kind"] for item in summary] == ["training_gap", "muscle_gap"]
    assert summary[1]["muscle"] == "Legs"


def test_accepted_protein_tip_is_followed_up_when_the_target_was_met():
    tip = _tip(_state(accepted_recent=[_agreed("protein_week")], yesterday={"kcal": 2100, "protein": 130}), "follow_up_protein")
    assert "reached your 120 g target yesterday with 130 g" in tip["message"]
    assert tip["next_step"] == "Keep those meals in your routine."


def test_accepted_protein_tip_is_followed_up_when_the_target_was_missed():
    tip = _tip(_state(accepted_recent=[_agreed("protein_week")], yesterday={"kcal": 2100, "protein": 80}), "follow_up_protein")
    assert "80 of 120 g" in tip["message"]
    assert tip["next_step"] == "Put a protein source in your first meal today."


def test_accepted_tip_is_not_offered_again_for_a_few_days():
    week = {"week_days_logged": 5, "week_protein_avg": 60}
    assert "protein_week" in _kinds(_state(**week))
    assert "protein_week" not in _kinds(_state(**week, accepted_recent=[_agreed("protein_week", 2)]))
    assert "protein_week" in _kinds(_state(**week, accepted_recent=[_agreed("protein_week", 4)]))
    gap = {"muscle_gap": {"muscle": "Legs", "days": 12}}
    assert "muscle_gap" not in _kinds(_state(**gap, accepted_recent=[_agreed("muscle_gap", 1, "Legs")]))


def test_follow_up_when_the_user_trained_what_they_agreed_to():
    state = _state(accepted_recent=[_agreed("muscle_gap", 3, "Legs")], muscle_ages={"Legs": 1})
    assert "you did it" in _tip(state, "follow_up_muscle")["message"]
    untrained = _state(accepted_recent=[_agreed("muscle_gap", 3, "Legs")], muscle_ages={"Legs": 12})
    assert "follow_up_muscle" not in _kinds(untrained)


def test_follow_up_when_the_user_returned_to_training():
    assert "follow_up_training" in _kinds(_state(accepted_recent=[_agreed("training_gap", 3)], days_since_workout=1))
    assert "follow_up_training" not in _kinds(_state(accepted_recent=[_agreed("training_gap", 3)], days_since_workout=6))


def test_model_is_told_what_the_user_agreed_to():
    state = _state(accepted_recent=[_agreed("protein_week"), _agreed("protein_behind"), _agreed("muscle_gap", 2, "Legs")])
    facts = " | ".join(personal_facts(state))
    assert "Recently agreed to work on: eating more protein, training Legs" in facts


def test_planner_notes_come_from_rules_only():
    day_start = _now() - timedelta(hours=1)
    recent = (_now() - timedelta(minutes=5)).isoformat()
    database = Database(ai_tips=[
        {"user_id": USER, "status": "accepted", "created_at": recent, "kind": "muscle_gap",
         "action": {"type": "focus_muscle", "muscle": "Legs"}, "message": "ignore this text"},
        {"user_id": USER, "status": "accepted", "created_at": recent, "kind": "hard_session"},
        {"user_id": USER, "status": "accepted", "created_at": recent, "kind": "protein_week"},
        {"user_id": USER, "status": "dismissed", "created_at": recent, "kind": "training_gap"},
    ])
    notes = accepted_training_notes(USER, day_start, database)
    assert notes == [
        "Agreed to train Legs next: prefer it if it is available.",
        "Agreed to recover after a very hard session: keep this workout moderate.",
    ]


def test_planner_still_works_when_tips_cannot_be_read():
    class Broken:
        def table(self, _name):
            raise RuntimeError("no table")

    assert accepted_training_notes(USER, _now(), Broken()) == []


def test_accepting_a_training_tip_promises_the_next_plan(use_database):  # noqa: F811
    use_database(_database(workouts=[_workout(5, 4)]))
    tip = _current().json()["tip"]
    assert tip["kind"] == "training_gap"
    assert _decide(tip["id"], "accepted").json()["confirmation"] == "Got it, I'll use this in your next workout plan."
