"""Tip endpoints over an in-memory database, so the accept, dismiss and undo flows are covered."""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from main import app

from app.core.local_day import LocalDay, local_day, utc_day
from app.services import ai_tips_service as tips
from app.services import dashboard_service
from tests.auth_helpers import auth_headers

client = TestClient(app)
USER = "11111111-1111-1111-1111-111111111111"
OTHER_USER = "22222222-2222-2222-2222-222222222222"


class Query:
    def __init__(self, database, table):
        self.database, self.table, self.filters, self.change, self.new_row = database, table, [], None, None

    def select(self, *_):
        return self

    def limit(self, _):
        return self

    def eq(self, field, value):
        self.filters.append(lambda row: str(row.get(field)) == str(value))
        return self

    def gte(self, field, value):
        self.filters.append(lambda row: _when(row[field]) >= _when(value))
        return self

    def lt(self, field, value):
        self.filters.append(lambda row: _when(row[field]) < _when(value))
        return self

    def insert(self, row):
        self.new_row = row
        return self

    def update(self, change):
        self.change = change
        return self

    def execute(self):
        rows = self.database.rows.setdefault(self.table, [])
        if self.new_row is not None:
            row = {"id": str(uuid4()), "status": "pending", "created_at": _now().isoformat(), **self.new_row}
            rows.append(row)
            return SimpleNamespace(data=[deepcopy(row)])
        matched = [row for row in rows if all(check(row) for check in self.filters)]
        if self.change is not None:
            for row in matched:
                row.update(self.change)
        return SimpleNamespace(data=deepcopy(matched))


class Database:
    def __init__(self, **rows):
        self.rows = rows

    def table(self, name):
        return Query(self, name)


def _now():
    return datetime.now(timezone.utc)


def _when(value):
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _workout(days_ago, sets, finished=True):
    started = _now() - timedelta(days=days_ago)
    return {
        "user_id": USER, "start_time": started.isoformat(),
        "end_time": started.isoformat() if finished else None,
        "workout_sets": [{"is_done": True}] * sets,
    }


def _plan(sets=3):
    return {
        "user_id": USER, "plan_date": utc_day().local_date.isoformat(), "is_rest_day": False,
        "exercises": [{"exercise_id": "squat", "name": "Squat", "sets": sets, "reps": 8}],
    }


def _database(**rows):
    base = {"users": [{"id": USER, "calorie_goal": 2000, "weight": 75}], "meals": [], "workouts": [], "workout_plans": []}
    return Database(**{**base, **rows})


@pytest.fixture
def use_database(monkeypatch):
    def install(database):
        monkeypatch.setattr(tips, "get_supabase", lambda admin=False: database)
        return database
    return install


def _current():
    return client.get("/api/v1/ai/tips/current", headers=auth_headers(USER))


def _decide(tip_id, status, user=USER):
    return client.post(f"/api/v1/ai/tips/{tip_id}/decision", json={"status": status}, headers=auth_headers(user))


def _undo(tip_id):
    return client.post(f"/api/v1/ai/tips/{tip_id}/undo", headers=auth_headers(USER))


def _bonus(database):
    return tips.kcal_bonus(USER, utc_day(), database)


def test_tip_is_stored_once_and_reused(use_database):
    database = use_database(_database())
    first, second = _current().json()["tip"], _current().json()["tip"]
    assert first["kind"] == "nothing_logged"
    assert first["id"] == second["id"]
    assert len(database.rows["ai_tips"]) == 1


def test_dismiss_shows_the_next_tip_then_encouragement(use_database):
    use_database(_database(workouts=[_workout(0, 5)]))
    tip = _current().json()["tip"]
    assert tip["kind"] == "workout_done_kcal"
    after_first = _decide(tip["id"], "dismissed").json()
    assert after_first["tip"]["kind"] == "nothing_logged"
    after_second = _decide(after_first["tip"]["id"], "dismissed").json()
    assert after_second["tip"] is None  # the card then shows the encouragement message


def test_accepting_calories_raises_todays_goal_once(use_database):
    database = use_database(_database(workouts=[_workout(0, 5)]))
    tip = _current().json()["tip"]
    accepted = _decide(tip["id"], "accepted").json()
    assert accepted["applied"] is True
    assert accepted["confirmation"] == "Added 100 kcal to today's goal."
    assert _decide(tip["id"], "accepted").json()["applied"] is False  # a double tap adds nothing
    assert _bonus(database) == 100


def test_undo_removes_the_calories_and_offers_the_tip_again(use_database):
    database = use_database(_database(workouts=[_workout(0, 5)]))
    tip = _current().json()["tip"]
    _decide(tip["id"], "accepted")
    undone = _undo(tip["id"]).json()
    assert undone["applied"] is True
    assert undone["tip"]["id"] == tip["id"]
    assert _bonus(database) == 0
    assert _undo(tip["id"]).json()["applied"] is False  # repeating an undo changes nothing


def test_a_tip_without_a_change_can_be_accepted_and_undone(use_database):
    database = use_database(_database())
    tip = _current().json()["tip"]
    assert tip["kind"] == "nothing_logged"
    accepted = _decide(tip["id"], "accepted").json()
    assert accepted["applied"] is True
    assert accepted["confirmation"] == "Got it, I'll follow up on this."
    assert database.rows["ai_tips"][0]["status"] == "accepted"
    assert _bonus(database) == 0  # choosing to follow a tip never changes the goal
    assert _undo(tip["id"]).json()["tip"]["id"] == tip["id"]


def test_accepting_and_undoing_a_set_changes_the_plan(use_database):
    database = use_database(_database(workouts=[_workout(9, 30)], workout_plans=[_plan()]))
    tip = _current().json()["tip"]
    assert tip["kind"] == "add_set"
    accepted = _decide(tip["id"], "accepted").json()
    assert accepted["confirmation"] == "Added one set to today's workout."
    assert database.rows["workout_plans"][0]["exercises"][0]["sets"] == 4
    _decide(tip["id"], "accepted")
    assert database.rows["workout_plans"][0]["exercises"][0]["sets"] == 4
    assert _undo(tip["id"]).json()["applied"] is True
    assert database.rows["workout_plans"][0]["exercises"][0]["sets"] == 3


def test_set_is_refused_if_the_weekly_limit_was_passed_after_the_tip_appeared(use_database):
    database = use_database(_database(workouts=[_workout(9, 30)], workout_plans=[_plan()]))
    tip = _current().json()["tip"]
    database.rows["workouts"].append(_workout(1, 30))
    result = _decide(tip["id"], "accepted").json()
    assert result["applied"] is False
    assert "no longer available" in result["notice"]
    assert database.rows["workout_plans"][0]["exercises"][0]["sets"] == 3


def test_undoing_a_set_is_refused_after_the_workout_is_finished(use_database):
    database = use_database(_database(workouts=[_workout(9, 30)], workout_plans=[_plan()]))
    tip = _current().json()["tip"]
    _decide(tip["id"], "accepted")
    database.rows["workouts"].append(_workout(0, 4))
    assert _undo(tip["id"]).json()["applied"] is False
    assert database.rows["ai_tips"][0]["status"] == "accepted"


def test_new_food_changes_the_tip(use_database):
    now = _now().isoformat()
    database = use_database(_database(meals=[{"user_id": USER, "calories": 500, "proteins": 60, "consumed_at": now}]))
    before = _current().json()["tip"]
    database.rows["meals"].append({"user_id": USER, "calories": 300, "proteins": 40, "consumed_at": now})
    after = _current().json()["tip"]
    assert before["id"] != after["id"]
    assert before["message"] != after["message"]


def test_dismissing_over_target_never_shows_zero_kcal_left(use_database):
    now = _now().isoformat()
    use_database(_database(meals=[{"user_id": USER, "calories": 2600, "proteins": 150, "consumed_at": now}]))
    tip = _current().json()["tip"]
    assert tip["kind"] == "over_target"
    assert _decide(tip["id"], "dismissed").json()["tip"] is None


def test_another_users_tip_cannot_be_decided_or_undone(use_database):
    use_database(_database())
    tip = _current().json()["tip"]
    assert _decide(tip["id"], "dismissed", user=OTHER_USER).status_code == 404
    response = client.post(f"/api/v1/ai/tips/{tip['id']}/undo", headers=auth_headers(OTHER_USER))
    assert response.status_code == 404


def test_tips_require_a_signed_in_user():
    assert client.get("/api/v1/ai/tips/current").status_code == 401


def test_tip_from_an_earlier_day_cannot_be_accepted(use_database):
    database = use_database(_database(workouts=[_workout(0, 5)]))
    tip = _current().json()["tip"]
    database.rows["ai_tips"][0]["tip_date"] = (utc_day().local_date - timedelta(days=1)).isoformat()
    result = _decide(tip["id"], "accepted").json()
    assert result["applied"] is False
    assert database.rows["ai_tips"][0]["status"] == "dismissed"


def test_dashboard_target_includes_accepted_calories_for_the_local_day(monkeypatch):
    seen = {}

    def query_meals(_user, day):
        seen["day"] = day
        return {"calories": 500, "protein": 0, "carbs": 0, "fat": 0}

    monkeypatch.setattr(dashboard_service, "get_supabase", lambda admin=False: object())
    monkeypatch.setattr(dashboard_service, "_query_user", lambda _user: {"calorie_goal": 2000, "weight": 75, "Name": "A"})
    monkeypatch.setattr(dashboard_service, "_query_today_meals", query_meals)
    monkeypatch.setattr(dashboard_service, "_query_workout", lambda _user: None)
    monkeypatch.setattr(dashboard_service, "_query_todays_plan", lambda _user, _day: None)
    monkeypatch.setattr(dashboard_service, "_query_completed_workout_today", lambda _user, _day: None)
    monkeypatch.setattr(dashboard_service, "kcal_bonus", lambda _user, _day: 100)

    day = utc_day()
    summary = dashboard_service.get_dashboard_summary(uuid4(), day)

    assert summary.nutrition.target_kcals == 2100
    assert summary.nutrition.remaining_kcals == 1600
    assert seen["day"] == day


def test_local_day_uses_the_browser_day_around_utc_midnight():
    now = _now()
    start, end = now - timedelta(hours=1), now + timedelta(hours=23)
    day = local_day(now.date(), start, end)
    assert day == LocalDay(now.date(), start, end)


def test_local_day_falls_back_to_utc_for_a_wrong_or_missing_day():
    now = _now()
    assert local_day(None, None, None) == utc_day()
    last_week = now - timedelta(days=7)
    assert local_day(last_week.date(), last_week, last_week + timedelta(days=1)) == utc_day()
    assert local_day(now.date(), now - timedelta(days=3), now + timedelta(days=3)) == utc_day()
    assert local_day(now.date(), now.replace(tzinfo=None), now.replace(tzinfo=None)) == utc_day()
