from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from main import app

from app.services.calorie_adjustment_service import classify_objective, propose_adjustment
from tests.auth_helpers import auth_headers

client = TestClient(app)

USER_ID = "11111111-1111-1111-1111-111111111111"
ADJUSTMENT_ID = "33333333-3333-3333-3333-333333333333"

PENDING_ROW = {
    "id": ADJUSTMENT_ID,
    "user_id": USER_ID,
    "previous_goal": 2200,
    "proposed_goal": 2050,
    "reason": "Your average intake is 2280 kcal against a 2200 kcal goal, so the deficit is not happening.",
    "status": "pending",
    "created_at": "2099-01-01T00:00:00+00:00",
}

REJECTED_ROW = {
    **PENDING_ROW,
    "status": "rejected",
    "created_at": "2099-01-01T00:00:00+00:00",
}

ACCEPTED_ROW = {
    **PENDING_ROW,
    "status": "accepted",
    "created_at": "2099-01-01T00:00:00+00:00",
}


def _metrics(**overrides) -> dict:
    base = {
        "goal": 2200,
        "objective": "lose weight",
        "avg_intake": 2280,
        "days_logged": 7,
        "days_within": 6,
        "compliance": 0.86,
        "volume_this_week": 12000,
        "volume_prev_week": 9000,
    }
    return {**base, **overrides}


def test_objectives_map_to_the_three_rule_branches():
    assert classify_objective("lose weight") == "fat_loss"
    assert classify_objective("Hypertrophy") == "muscle_gain"
    assert classify_objective("strength") == "muscle_gain"
    assert classify_objective("maintain") == "maintenance"
    assert classify_objective(None) == "maintenance"


def test_fat_loss_with_high_compliance_lowers_the_goal():
    result = propose_adjustment(_metrics())

    assert result["has_change"] is True
    assert result["proposed_goal"] == 2050
    assert "deficit is not happening" in result["reason"]


def test_fat_loss_never_goes_below_the_safety_floor():
    result = propose_adjustment(_metrics(goal=1250, avg_intake=1300))

    assert result["proposed_goal"] == 1250
    assert result["has_change"] is False
    assert "floor" in result["reason"]


def test_fat_loss_holds_when_the_deficit_is_already_working():
    result = propose_adjustment(_metrics(avg_intake=1800))

    assert result["has_change"] is False
    assert "deficit is working" in result["reason"]


def test_low_compliance_returns_logging_advice_and_no_change():
    result = propose_adjustment(_metrics(objective="lose weight", days_within=3, compliance=0.43))

    assert result["has_change"] is False
    assert result["proposed_goal"] == 2200
    assert "Consistency first" in result["reason"]


def test_muscle_gain_raises_the_goal_when_volume_rises():
    result = propose_adjustment(_metrics(objective="hypertrophy"))

    assert result["has_change"] is True
    assert result["proposed_goal"] == 2400
    assert "volume rose from 9000 kg to 12000 kg" in result["reason"]


def test_muscle_gain_holds_when_volume_flat_or_unknown():
    flat = propose_adjustment(_metrics(objective="hypertrophy", volume_this_week=9000))
    first_week = propose_adjustment(_metrics(objective="hypertrophy", volume_prev_week=0))

    assert flat["has_change"] is False
    assert first_week["has_change"] is False
    assert "not rising" in flat["reason"]


def _supabase(pending: list[dict], metrics_overrides: dict | None = None) -> MagicMock:
    users = MagicMock()
    users.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{"calorie_goal": 2200, "objective": "lose weight"}]
    )
    users.update.return_value.eq.return_value.select.return_value.execute.return_value = MagicMock(
        data=[{"calorie_goal": 2050}]
    )
    meals = MagicMock()
    meals.select.return_value.eq.return_value.gte.return_value.execute.return_value = MagicMock(
        data=[{"calories": 2200, "consumed_at": f"2026-10-{day:02d}T12:00:00Z"} for day in range(8, 15)]
    )
    workouts = MagicMock()
    workouts.select.return_value.eq.return_value.gte.return_value.execute.return_value = MagicMock(data=[])
    adjustments = MagicMock()
    adjustments.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
        data=pending
    )
    adjustments.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=pending
    )
    adjustments.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
        data=pending
    )
    adjustments.insert.return_value.select.return_value.execute.return_value = MagicMock(data=[PENDING_ROW])
    flip = {"status": "pending"}
    adjustments.update.return_value.eq.return_value.eq.return_value.select.return_value.execute.side_effect = (
        lambda: MagicMock(data=[{**PENDING_ROW, "status": flip["status"]}])
    )
    supabase = MagicMock()
    supabase.table.side_effect = lambda name: {
        "users": users, "meals": meals, "workouts": workouts, "ai_calorie_adjustments": adjustments,
    }[name]
    supabase._users = users
    supabase._adjustments = adjustments
    supabase._flip = flip
    return supabase


def test_endpoint_returns_the_pending_proposal():
    supabase = _supabase([PENDING_ROW])
    with patch("app.services.calorie_adjustment_service.get_supabase", return_value=supabase):
        response = client.get("/api/v1/ai/calorie-adjustment", params={"user_id": USER_ID}, headers=auth_headers(USER_ID))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["adjustment_id"] == ADJUSTMENT_ID
    assert body["has_change"] is True
    assert body["proposed_goal"] == 2050
    assert body["reason"] == PENDING_ROW["reason"]


def test_endpoint_stores_the_proposal_once_when_none_is_pending():
    supabase = _supabase([])
    with patch("app.services.calorie_adjustment_service.get_supabase", return_value=supabase):
        response = client.get("/api/v1/ai/calorie-adjustment", params={"user_id": USER_ID}, headers=auth_headers(USER_ID))
        inserted = supabase._adjustments.insert.call_args[0][0]

    assert response.status_code == 200, response.text
    assert inserted["previous_goal"] == 2200
    assert inserted["proposed_goal"] == 2050
    assert inserted["status"] == "pending"


def test_endpoint_returns_advice_without_storing_when_compliance_is_low():
    supabase = _supabase([])
    supabase.table.side_effect = lambda name: {
        "users": supabase._users,
        "meals": _low_compliance_meals(),
        "workouts": _no_workouts(),
        "ai_calorie_adjustments": supabase._adjustments,
    }[name]
    with patch("app.services.calorie_adjustment_service.get_supabase", return_value=supabase):
        response = client.get("/api/v1/ai/calorie-adjustment", params={"user_id": USER_ID}, headers=auth_headers(USER_ID))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["has_change"] is False
    assert body["adjustment_id"] is None
    assert "Consistency first" in body["reason"]
    assert not supabase._adjustments.insert.called


def test_rejected_proposal_is_not_recomputed_inside_the_cooldown():
    supabase = _supabase([REJECTED_ROW])
    with patch("app.services.calorie_adjustment_service.get_supabase", return_value=supabase):
        response = client.get("/api/v1/ai/calorie-adjustment", params={"user_id": USER_ID}, headers=auth_headers(USER_ID))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["adjustment_id"] == ADJUSTMENT_ID
    assert body["status"] == "rejected"
    assert not supabase._adjustments.insert.called


def test_accepting_the_proposal_updates_the_saved_goal():
    supabase = _supabase([PENDING_ROW])
    supabase._flip["status"] = "accepted"
    with patch("app.services.calorie_adjustment_service.get_supabase", return_value=supabase):
        response = client.post(
            "/api/v1/ai/calorie-adjustment/decision",
            json={"user_id": USER_ID, "adjustment_id": ADJUSTMENT_ID, "status": "accepted"},
            headers=auth_headers(USER_ID),
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["calorie_goal"] == 2050
    assert body["status"] == "accepted"
    assert supabase._users.update.call_args[0][0] == {"calorie_goal": 2050}
    assert supabase._adjustments.update.call_args[0][0] == {"status": "accepted"}


def test_rejecting_leaves_the_saved_goal_alone():
    supabase = _supabase([PENDING_ROW])
    supabase._flip["status"] = "rejected"
    with patch("app.services.calorie_adjustment_service.get_supabase", return_value=supabase):
        response = client.post(
            "/api/v1/ai/calorie-adjustment/decision",
            json={"user_id": USER_ID, "adjustment_id": ADJUSTMENT_ID, "status": "rejected"},
            headers=auth_headers(USER_ID),
        )

    assert response.status_code == 200
    body = response.json()
    assert body["calorie_goal"] == 2200
    assert body["status"] == "rejected"
    assert not supabase._users.update.called
    assert supabase._adjustments.update.call_args[0][0] == {"status": "rejected"}


def test_deciding_an_already_decided_proposal_changes_nothing():
    supabase = _supabase([ACCEPTED_ROW])
    with patch("app.services.calorie_adjustment_service.get_supabase", return_value=supabase):
        response = client.post(
            "/api/v1/ai/calorie-adjustment/decision",
            json={"user_id": USER_ID, "adjustment_id": ADJUSTMENT_ID, "status": "rejected"},
            headers=auth_headers(USER_ID),
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "accepted"
    assert body["calorie_goal"] == 2050
    assert not supabase._users.update.called
    assert not supabase._adjustments.update.called


def test_lost_race_on_insert_returns_the_existing_pending_proposal():
    supabase = _supabase([])
    supabase._adjustments.insert.return_value.select.return_value.execute.side_effect = Exception(
        'APIError: 23505 duplicate key value violates unique constraint "ai_calorie_adjustments_one_pending_idx"'
    )
    supabase._adjustments.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[PENDING_ROW]
    )
    with patch("app.services.calorie_adjustment_service.get_supabase", return_value=supabase):
        response = client.get("/api/v1/ai/calorie-adjustment", params={"user_id": USER_ID}, headers=auth_headers(USER_ID))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["adjustment_id"] == ADJUSTMENT_ID
    assert body["status"] == "pending"


def test_unexpected_read_errors_are_not_reported_as_a_missing_table():
    supabase = _supabase([])
    supabase._adjustments.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.side_effect = Exception(
        "connection reset by peer"
    )
    with patch("app.services.calorie_adjustment_service.get_supabase", return_value=supabase):
        response = client.get("/api/v1/ai/calorie-adjustment", params={"user_id": USER_ID}, headers=auth_headers(USER_ID))

    assert response.status_code == 502
    assert "table is missing" not in response.json()["detail"]


def _low_compliance_meals() -> MagicMock:
    meals = MagicMock()
    meals.select.return_value.eq.return_value.gte.return_value.execute.return_value = MagicMock(
        data=[{"calories": 3000, "consumed_at": "2026-10-14T12:00:00Z"}]
    )
    return meals


def _no_workouts() -> MagicMock:
    workouts = MagicMock()
    workouts.select.return_value.eq.return_value.gte.return_value.execute.return_value = MagicMock(data=[])
    return workouts
